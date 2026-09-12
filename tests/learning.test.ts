import { afterAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { activityInput, archivedInput, assessmentAccommodationInput, deadlineExceptionInput, gradeInput, materialInput, positionInput, publishedInput, returnInput, submissionContentInput } from "../src/modules/learning/input";
import { jsonObject, multipartInput } from "../src/core/validation";
import { loginInput } from "../src/core/http";
import { fileResponse, storedFilePath, uploadInput, withFileCleanup } from "../src/core/storage/files";
import { maxUploadBytes } from "../src/shared/learning";

const storage = `.test-artifacts/learning-unit-${crypto.randomUUID()}`;
afterAll(() => rm(storage, { recursive: true, force: true }));

test("materials accept text, HTTP links and file descriptions, never script or credential URLs", () => {
  expect(materialInput({ title: " Materi ", kind: "text", content: " <script>literal</script> " })).toEqual({ title: "Materi", kind: "text", content: "<script>literal</script>" });
  expect(materialInput({ title: "Link", kind: "link", content: "https://example.org/lesson" }).kind).toBe("link");
  for (const content of ["javascript:alert(1)", "data:text/html,hi", "//example.org", "https://user:secret@example.org", "https:example.org", "ftp://example.org", "https://"]) {
    expect(() => materialInput({ title: "Bad", kind: "link", content })).toThrow();
  }
  expect(materialInput({ title: "Berkas", kind: "file" }, true)).toEqual({ title: "Berkas", kind: "file", content: "" });
  expect(() => materialInput({ title: "Berkas", kind: "file", content: "a".repeat(2001) }, true)).toThrow();
  expect(() => materialInput({ title: "Bad", kind: "text", content: "Teks" }, true)).toThrow();
  expect(() => materialInput({ title: "Bad", kind: "script", content: "../../private" })).toThrow();
});
test("authoring validates order, boolean publishing/archiving and strict server timestamps", () => {
  for (const position of [-1, 10001, 1.5, "1", null]) expect(() => positionInput({ position })).toThrow();
  expect(positionInput({ position: 0 })).toBe(0);
  expect(publishedInput({ published: false })).toBe(false);
  expect(archivedInput({ archived: true })).toBe(true);
  for (const value of ["false", 1, null]) {
    expect(() => publishedInput({ published: value })).toThrow();
    expect(() => archivedInput({ archived: value })).toThrow();
  }
  const task = { title: "Tugas", instructions: "Tulis jawaban", kind: "assignment" };
  expect(activityInput(task).dueAt).toBeNull();
  expect(activityInput({ ...task, dueAt: "2026-09-11T12:00:00Z" }).dueAt).toBe("2026-09-11T12:00:00.000Z");
  for (const dueAt of ["2026-02-30T12:00:00Z", "2026-09-11", "tomorrow", 0]) expect(() => activityInput({ ...task, dueAt })).toThrow();
  for (const kind of ["exam", "quiz", "challenge", "survey"]) expect(() => activityInput({ ...task, kind })).toThrow();
});
test("grades require bounded precision and meaningful feedback; submission text is optional but bounded", () => {
  expect(gradeInput({ score: 0, feedback: "Perlu diperbaiki" }).score).toBe(0);
  expect(gradeInput({ score: 99.99, feedback: "Bagus" }).score).toBe(99.99);
  for (const score of [NaN, Infinity, -1, 100.01, 1.001, "90", null]) expect(() => gradeInput({ score, feedback: "Feedback" })).toThrow();
  expect(() => gradeInput({ score: 100, feedback: " " })).toThrow();
  expect(submissionContentInput({})).toBe("");
  expect(submissionContentInput({ content: " Jawaban " })).toBe("Jawaban");
  for (const content of [42, "a".repeat(20001)]) expect(() => submissionContentInput({ content })).toThrow();
});
test("submission returns and deadline exceptions require bounded operator input", () => {
  expect(returnInput({ reason: "Perbaiki referensi." }).reason).toBe("Perbaiki referensi.");
  expect(deadlineExceptionInput({ dueAt: "2026-09-15T12:00:00Z", reason: "Sakit." }).dueAt).toBe("2026-09-15T12:00:00.000Z");
  for (const reason of ["", "a".repeat(5001)]) expect(() => returnInput({ reason })).toThrow();
  for (const value of [null, "2026-09-15", "tomorrow"]) expect(() => deadlineExceptionInput({ dueAt: value, reason: "Alasan" })).toThrow();
  expect(assessmentAccommodationInput({ extraMinutes: 30, reason: "Kebutuhan belajar" })).toEqual({ extraMinutes: 30, reason: "Kebutuhan belajar" });
  for (const value of [0, 1.5, 121]) expect(() => assessmentAccommodationInput({ extraMinutes: value, reason: "Alasan" })).toThrow();
});
test("learning JSON has a byte limit while login and administration retain 4 KiB", async () => {
  const request = (body: unknown) => new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await expect(jsonObject(request({ content: "a".repeat(5000) }))).rejects.toThrow("besar");
  expect((await jsonObject(request({ content: "a".repeat(20000) }), 65536)).content).toHaveLength(20000);
  await expect(jsonObject(request({ content: "ع".repeat(40000) }), 65536)).rejects.toThrow("besar");
  await expect(loginInput(request({ email: "test@example.org", password: "password", extra: "a".repeat(5000) }))).rejects.toThrow("besar");
});
test("multipart accepts text fields and one optional file only", async () => {
  const request = (form: FormData) => new Request("http://localhost", { method: "POST", body: form });
  const valid = new FormData();
  valid.append("title", "Materi");
  valid.append("file", new File(["%PDF-1.7"], "Materi.pdf"));
  const parsed = await multipartInput(request(valid), 1024 * 1024);
  expect(parsed.body).toEqual({ title: "Materi" });
  expect(parsed.file?.name).toBe("Materi.pdf");
  const empty = new FormData();
  empty.append("content", "Jawaban");
  empty.append("file", new File([], ""));
  expect(await multipartInput(request(empty), 1024 * 1024)).toEqual({ body: { content: "Jawaban" }, file: null });
  const duplicate = new FormData();
  duplicate.append("file", new File(["%PDF-1"], "a.pdf"));
  duplicate.append("file", new File(["%PDF-2"], "b.pdf"));
  await expect(multipartInput(request(duplicate), 1024 * 1024)).rejects.toThrow();
  const unexpected = new FormData();
  unexpected.append("avatar", new File(["%PDF-1"], "a.pdf"));
  await expect(multipartInput(request(unexpected), 1024 * 1024)).rejects.toThrow();
  await expect(multipartInput(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), 1024)).rejects.toThrow();
});
test("uploads accept allowlisted types whose bytes match, with sanitized display names", async () => {
  const upload = await uploadInput(new File(["%PDF-1.7 test"], "..\\..\\etc/Rencana Belajar.PDF"));
  expect(upload).toMatchObject({ name: "Rencana Belajar.PDF", mediaType: "application/pdf", sizeBytes: 13 });
  expect(upload.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(storedFilePath("/srv/storage", upload.id)).toBe(`/srv/storage/learning-files/${upload.id.slice(0, 2)}/${upload.id}`);
  expect((await uploadInput(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1])], "tugas.docx"))).mediaType).toContain("wordprocessingml");
  expect((await uploadInput(new File(["catatan santri"], "catatan.txt"))).mediaType).toBe("text/plain");
  expect((await uploadInput(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "foto.JPG"))).mediaType).toBe("image/jpeg");
  for (const file of [
    new File(["<script>alert(1)</script>"], "halaman.html"),
    new File(["<svg onload=alert(1)>"], "gambar.svg"),
    new File(["<html>not pdf</html>"], "palsu.pdf"),
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "gambar.jpg"),
    new File([new Uint8Array([0x61, 0x00, 0x62])], "biner.txt"),
    new File([new Uint8Array([0xc3, 0x28])], "rusak.txt"),
    new File([""], "kosong.pdf"),
    new File(["%PDF-"], "tanpa-ekstensi"),
    new File(["%PDF-"], `${"a".repeat(177)}.pdf`),
  ]) await expect(uploadInput(file)).rejects.toThrow();
  await expect(uploadInput(new File([new Uint8Array(maxUploadBytes + 1)], "besar.pdf"))).rejects.toThrow("10 MB");
  expect(() => storedFilePath("/srv/storage", "../../etc/passwd")).toThrow();
});
test("files written before a failed commit are removed; downloads are sandboxed attachments", async () => {
  const failed = await uploadInput(new File(["%PDF-1.7 rollback"], "rollback.pdf"));
  await expect(withFileCleanup(storage, failed, async store => { await store(); throw new Error("commit failed"); })).rejects.toThrow("commit failed");
  expect(await Bun.file(storedFilePath(storage, failed.id)).exists()).toBe(false);
  const kept = await uploadInput(new File(["%PDF-1.7 kept"], "Laporan \"akhir\" (v2).pdf"));
  expect(await withFileCleanup(storage, kept, async store => { await store(); return "ok"; })).toBe("ok");
  const file = { id: kept.id, name: kept.name, mediaType: kept.mediaType, sizeBytes: kept.sizeBytes };
  const response = await fileResponse(storage, file);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toBe(`attachment; filename="Laporan _akhir_ (v2).pdf"; filename*=UTF-8''Laporan%20%22akhir%22%20%28v2%29.pdf`);
  expect(response.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
  expect(await response.text()).toBe("%PDF-1.7 kept");
  await expect(fileResponse(storage, { ...file, id: crypto.randomUUID() })).rejects.toThrow();
});
