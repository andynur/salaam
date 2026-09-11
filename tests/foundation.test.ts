import { expect, test } from "bun:test";
import { dates, idField, jsonObject, listInput } from "../src/core/validation";

test("date validation rejects overflow, malformed dates and reversed intervals", () => {
  expect(dates({ startsOn: "2028-02-29", endsOn: "2028-02-29" })).toEqual({ startsOn: "2028-02-29", endsOn: "2028-02-29" });
  for (const startsOn of ["2027-02-29", "2026-04-31", "2026-00-10", "2026-1-01", "2201-01-01"]) {
    expect(() => dates({ startsOn, endsOn: "2028-12-31" })).toThrow();
  }
  expect(() => dates({ startsOn: "2026-02-01", endsOn: "2026-01-01" })).toThrow();
});
test("list pagination and identifiers reject malformed input; search treats wildcard text literally", () => {
  const url = (query: string) => new URL(`http://localhost/?${query}`);
  for (const value of ["-1", "1.5", "NaN", "1000001"]) expect(() => listInput(url(`offset=${value}`))).toThrow();
  expect(listInput(url("q=100%25_test"))).toEqual({ offset: 0, pattern: "%100\\%\\_test%" });
  expect(() => idField({ id: "fake" }, "id")).toThrow();
  const id = crypto.randomUUID();
  expect(idField({ id }, "id")).toBe(id);
});
test("admin body accepts JSON objects only", async () => {
  for (const value of ["null", "[]", "true", "invalid"]) await expect(jsonObject(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: value }))).rejects.toThrow();
});
