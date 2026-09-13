import { idField, invalid, textField } from "../../core/validation";
import { httpUrlInput } from "../learning/input";

function optionalText(body: Record<string, unknown>, key: string, max: number, label: string) {
  const value = body[key] ?? "";
  if (typeof value !== "string" || value.trim().length > max) invalid(`${label} maksimal ${max} karakter.`);
  return value.trim();
}
export function collectionInput(body: Record<string, unknown>) {
  return { title: textField(body, "title", 120), description: optionalText(body, "description", 1000, "Deskripsi") };
}
export function collectionCreateInput(body: Record<string, unknown>) {
  const scope = body.scope;
  if (scope !== "school" && scope !== "personal") invalid("Lingkup koleksi tidak valid.");
  return { ...collectionInput(body), scope };
}
export function linkItemInput(body: Record<string, unknown>) {
  const url = textField(body, "url", 2000);
  httpUrlInput(url);
  return { collectionId: idField(body, "collectionId"), title: textField(body, "title", 150), url, description: optionalText(body, "description", 10000, "Deskripsi") };
}
export function linkItemUpdateInput(body: Record<string, unknown>) {
  const version = body.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) invalid("Versi tautan tidak valid. Muat ulang halaman.");
  return { ...linkItemInput(body), version };
}
