import type { SQL } from "bun";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HttpError } from "../errors";
import { invalid } from "../validation";
import { maxUploadBytes, uploadTypes, type StoredFile } from "../../shared/learning";

export interface Upload extends StoredFile { sha256: string; bytes: Uint8Array }

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
const ascii = (text: string) => [...text].map(character => character.charCodeAt(0));
// Browser-supplied media types are ignored; the extension must agree with the leading bytes.
function contentMatches(mediaType: string, bytes: Uint8Array) {
  switch (mediaType) {
    case "application/pdf": return startsWith(bytes, ascii("%PDF-"));
    case "image/png": return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg": return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/webp": return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8);
    case "text/plain":
      if (bytes.includes(0)) return false;
      try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); return true; } catch { return false; }
    default: return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]); // ZIP and Office Open XML
  }
}

export async function uploadInput(file: File): Promise<Upload> {
  const name = (file.name.split(/[\\/]/).pop() ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const mediaType: string | undefined = uploadTypes[extension as keyof typeof uploadTypes];
  if (!name || name.length > 180 || !mediaType) invalid("Berkas harus PDF, PNG, JPG, WebP, TXT, DOCX, XLSX, PPTX, atau ZIP dengan nama maksimal 180 karakter.");
  if (file.size < 1 || file.size > maxUploadBytes) invalid("Ukuran berkas harus 1 byte hingga 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!contentMatches(mediaType, bytes)) invalid("Isi berkas tidak sesuai dengan jenis berkasnya.");
  return { id: crypto.randomUUID(), name, mediaType, sizeBytes: bytes.byteLength, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), bytes };
}

export function storedFilePath(root: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error("Invalid stored file ID");
  return join(root, "learning-files", id.slice(0, 2), id);
}

export async function recordStoredFile(db: SQL, courseId: string, actorId: string, upload: Upload) {
  await db`INSERT INTO stored_files (id, course_id, uploaded_by, original_name, media_type, size_bytes, sha256)
    VALUES (${upload.id}, ${courseId}, ${actorId}, ${upload.name}, ${upload.mediaType}, ${upload.sizeBytes}, ${upload.sha256})`;
}

// `store` must be the last step inside the transaction. If anything fails afterwards,
// including COMMIT, the written bytes are removed so no file outlives its database row.
export async function withFileCleanup<T>(root: string, upload: Upload | null, run: (store: () => Promise<void>) => Promise<T>): Promise<T> {
  let written = false;
  try {
    return await run(async () => {
      if (!upload) return;
      const path = storedFilePath(root, upload.id);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await Bun.write(path, upload.bytes);
      written = true;
    });
  } catch (error) {
    if (written && upload) await rm(storedFilePath(root, upload.id), { force: true });
    throw error;
  }
}

// Uploads download by default. `inline` is for a lesson cover image and nothing else: the
// bytes were verified against an image signature, and the response still carries a sandbox
// and nosniff so the browser can only treat it as a picture.
export async function fileResponse(root: string, file: StoredFile, disposition: "attachment" | "inline" = "attachment") {
  const handle = Bun.file(storedFilePath(root, file.id));
  if (!(await handle.exists())) throw new HttpError(404, "FILE_MISSING", "Berkas tidak ditemukan di penyimpanan.");
  const inline = disposition === "inline" && file.mediaType.startsWith("image/");
  const fallback = file.name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(file.name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(handle, { headers: {
    "Content-Type": file.mediaType === "text/plain" ? "text/plain; charset=utf-8" : file.mediaType,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    "Content-Security-Policy": "sandbox; default-src 'none'",
  } });
}
