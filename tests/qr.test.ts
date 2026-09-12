import { describe, expect, test } from "bun:test";
import { codewords, divisor, drawCodewords, encodeQr, maskCondition, qrPath, qrSize, remainder } from "../src/web/lib/qr";
import { checkinAlphabet, checkinCodeLength } from "../src/shared/attendance";

const sample = "H7K2QM9XZ4";
const reserved = () => {
  const grid = Array.from({ length: qrSize }, () => Array<boolean>(qrSize).fill(false));
  for (let i = 0; i < qrSize; i++) { grid[6]![i] = true; grid[i]![6] = true; }
  for (const [cx, cy] of [[3, 3], [qrSize - 4, 3], [3, qrSize - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < qrSize && y >= 0 && y < qrSize) grid[y]![x] = true;
    }
  }
  for (let i = 0; i < 9; i++) { grid[i]![8] = true; grid[8]![i] = true; }
  for (let i = 0; i < 8; i++) { grid[qrSize - 1 - i]![8] = true; grid[8]![qrSize - 1 - i] = true; }
  grid[qrSize - 8]![8] = true;
  return grid;
};

describe("check-in QR encoding", () => {
  test("every check-in alphabet character stays inside version 1 alphanumeric mode", () => {
    expect(checkinAlphabet).toHaveLength(32);
    const all = checkinAlphabet.repeat(checkinCodeLength).slice(0, checkinCodeLength);
    expect(() => codewords(all)).not.toThrow();
    expect(codewords(sample)).toHaveLength(26);
    expect(() => codewords("ABCDEFGHIJKLMNOPQRSTU")).toThrow();
    expect(() => codewords("abc-lower")).toThrow();
  });

  test("codewords carry a valid Reed-Solomon block", () => {
    const all = codewords(sample);
    expect(all[0]! >>> 4).toBe(0b0010);
    expect([...remainder(all, divisor(10))].every(byte => byte === 0)).toBe(true);
  });

  test("function patterns, timing, and the dark module are placed", () => {
    const modules = encodeQr(sample);
    expect(modules).toHaveLength(qrSize);
    for (const [cx, cy] of [[3, 3], [qrSize - 4, 3], [3, qrSize - 4]] as const) {
      expect(modules[cy]![cx]).toBe(true);
      expect(modules[cy - 1]![cx - 1]).toBe(true);
      expect(modules[cy - 2]![cx - 2]).toBe(false);
      expect(modules[cy - 3]![cx - 3]).toBe(true);
    }
    for (let i = 8; i < qrSize - 8; i++) { expect(modules[6]![i]).toBe(i % 2 === 0); expect(modules[i]![6]).toBe(i % 2 === 0); }
    expect(modules[qrSize - 8]![8]).toBe(true);
  });

  test("format information decodes to level M and the chosen mask, and the data reads back", () => {
    const modules = encodeQr(sample);
    let bits = 0;
    for (let i = 0; i <= 5; i++) bits |= Number(modules[i]![8]) << i;
    bits |= Number(modules[7]![8]) << 6;
    bits |= Number(modules[8]![8]) << 7;
    bits |= Number(modules[8]![7]) << 8;
    for (let i = 9; i < 15; i++) bits |= Number(modules[8]![14 - i]) << i;
    const data = (bits ^ 0x5412) >>> 10;
    expect(data >>> 3).toBe(0); // error correction level M
    const mask = data & 7;
    // Both format copies must agree.
    for (let i = 0; i < 8; i++) expect(modules[8]![qrSize - 1 - i]).toBe(((bits >>> i) & 1) === 1);
    for (let i = 8; i < 15; i++) expect(modules[qrSize - 15 + i]![8]).toBe(((bits >>> i) & 1) === 1);
    const skip = reserved();
    const unmasked = modules.map((row, y) => row.map((value, x) => (!skip[y]![x] && maskCondition(mask, x, y) ? !value : value)));
    const expected = Array.from({ length: qrSize }, () => Array<boolean>(qrSize).fill(false));
    drawCodewords(expected, skip, codewords(sample));
    for (let y = 0; y < qrSize; y++) for (let x = 0; x < qrSize; x++) if (!skip[y]![x]) expect(unmasked[y]![x]).toBe(expected[y]![x]!);
  });

  test("different codes produce different matrices and a drawable path", () => {
    expect(qrPath(encodeQr(sample))).not.toBe(qrPath(encodeQr("H7K2QM9XZ5")));
    expect(qrPath(encodeQr(sample))).toMatch(/^M\d+ \d+h1v1h-1z/);
  });
});
