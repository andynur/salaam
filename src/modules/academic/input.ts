import { idField, invalid, textField } from "../../core/validation";

export function transferInput(body: Record<string, unknown>) {
  const reason = textField(body, "reason", 500);
  return { studentId: idField(body, "studentId").toLowerCase(), toClassId: idField(body, "toClassId").toLowerCase(), reason };
}
export function archiveInput(body: Record<string, unknown>) {
  if (typeof body.archived !== "boolean") invalid("Status arsip tidak valid.");
  return body.archived;
}
