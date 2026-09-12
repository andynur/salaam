import { describe, expect, test } from "bun:test";
import { csvCell, toCsv } from "../src/modules/reporting/csv";
import { auditFilters, optionalDate, optionalId, reportScope } from "../src/modules/reporting/input";
import { reportKinds, reportLabels } from "../src/shared/reporting";

const query = (search: string) => new URL(`http://localhost:3000/api/reports/courses${search}`);
const id = "9c1f6e3a-5b2d-4c8e-9f10-2a3b4c5d6e7f";

describe("Phase 9 report filters", () => {
  test("scope accepts empty, lowercased and rejects malformed identifiers", () => {
    expect(reportScope(query(""))).toEqual({ yearId: null, termId: null, classId: null, courseId: null });
    expect(reportScope(query(`?courseId=${id.toUpperCase()}&classId=${id}`))).toMatchObject({ courseId: id, classId: id });
    expect(() => reportScope(query("?termId=bukan-uuid"))).toThrow("Semester: pilihan tidak valid.");
    expect(optionalId(query("?yearId=%20%20"), "yearId")).toBeNull();
  });
  test("dates must be real calendar days inside the supported range", () => {
    expect(optionalDate(query("?from=2026-09-12"), "from")).toBe("2026-09-12");
    expect(optionalDate(query(""), "from")).toBeNull();
    for (const value of ["2026-02-30", "12-09-2026", "1899-12-31", "2201-01-01"]) {
      expect(() => optionalDate(query(`?from=${value}`), "from")).toThrow("Tanggal tidak valid (1900–2200).");
    }
  });
  test("audit filters constrain the event key and the date order", () => {
    expect(auditFilters(query("?event=user.created&from=2026-01-01&to=2026-01-31"))).toEqual({ event: "user.created", actorId: null, from: "2026-01-01", to: "2026-01-31" });
    expect(() => auditFilters(query("?event=user%20created"))).toThrow("Peristiwa: pilihan tidak valid.");
    expect(() => auditFilters(query(`?event=${"a".repeat(101)}`))).toThrow("Peristiwa maksimal 100 karakter.");
    expect(() => auditFilters(query("?from=2026-02-01&to=2026-01-01"))).toThrow("Tanggal selesai harus setelah atau sama dengan tanggal mulai.");
  });
  test("every report kind has a label", () => {
    expect(reportKinds.every(kind => reportLabels[kind].length > 0)).toBe(true);
  });
});

describe("Phase 9 CSV encoding", () => {
  test("quotes separators, doubles quotes and keeps blanks empty", () => {
    expect(csvCell("Kelas X, A")).toBe('"Kelas X, A"');
    expect(csvCell('Ujian "Akhir"')).toBe('"Ujian ""Akhir"""');
    expect(csvCell("baris\nbaru")).toBe('"baris\nbaru"');
    expect(csvCell(" spasi ")).toBe('" spasi "');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(true)).toBe("ya");
    expect(csvCell(false)).toBe("tidak");
  });
  // A spreadsheet must never execute an exported cell.
  test("neutralizes formula triggers without losing the original text", () => {
    for (const value of ["=1+1", "+62", "-2", "@here", "\tsisip"]) {
      const cell = csvCell(value);
      expect(cell.replace(/^"|"$/g, "")).toBe(`'${value}`);
    }
    expect(csvCell("=SUM(A1,A2)")).toBe(`"'=SUM(A1,A2)"`);
  });
  test("rows are CRLF separated with a trailing newline", () => {
    expect(toCsv(["Santri", "XP"], [["Ali", 30], ["Budi", null]])).toBe("Santri,XP\r\nAli,30\r\nBudi,\r\n");
  });
});
