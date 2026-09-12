export type CsvValue = string | number | boolean | null | undefined;

// A cell that begins with a formula trigger is prefixed with an apostrophe: spreadsheets
// must show exported school data as text, never evaluate it.
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "boolean" ? (value ? "ya" : "tidak") : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) || guarded !== guarded.trim() ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
// The BOM makes Excel read UTF-8 names correctly; the attachment is never rendered inline.
export function csvResponse(filename: string, headers: string[], rows: CsvValue[][]): Response {
  const safe = filename.replace(/[^a-z0-9._-]/gi, "-").slice(0, 80) || "laporan.csv";
  return new Response(`﻿${toCsv(headers, rows)}`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${safe}"` },
  });
}
