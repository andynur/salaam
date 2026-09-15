import { expect, test } from "bun:test";
import { certificationProgress } from "../src/shared/certification";
import { imagePdf } from "../src/shared/image-pdf";
import { certificateQrCodewords, certificateQrSize, encodeCertificateQr } from "../src/web/lib/certificate-qr";
import { divisor, remainder } from "../src/web/lib/qr";
const base = { studentId: "id", studentName: "Santri", lessons: 4, completed: 4, activities: 2, submitted: 1, graded: 0 };
test("certification weighs lessons and activities equally and never rounds incomplete work to 100", () => {
  expect(certificationProgress(base)).toMatchObject({ percent: 83, eligible: false });
  expect(certificationProgress({ ...base, submitted: 2 })).toMatchObject({ percent: 100, eligible: true });
  expect(certificationProgress({ ...base, lessons: 0, completed: 0, activities: 0, submitted: 0 })).toMatchObject({ percent: 0, eligible: false });
  expect(certificationProgress({ ...base, lessons: 1000, completed: 999, activities: 0, submitted: 0 })).toMatchObject({ percent: 99, eligible: false });
});
test("image PDF byte offsets resolve every object across binary image bytes", () => {
  const bytes = imagePdf(new Uint8Array([255, 216, 0, 128, 255, 217]), 1684, 1190);
  const text = new TextDecoder("latin1").decode(bytes);
  const xref = Number(text.match(/startxref\n(\d+)/)![1]);
  expect(new TextDecoder().decode(bytes.slice(xref, xref + 4))).toBe("xref");
  const rows = text.slice(text.indexOf("0000000000 65535 f")).split("\n");
  for (let id = 1; id <= 5; id++) {
    const offset = Number(rows[id]!.slice(0, 10));
    expect(new TextDecoder().decode(bytes.slice(offset, offset + 7))).toBe(`${id} 0 obj`);
  }
  expect(text).toContain("/Filter /DCTDecode");
  expect(text).toContain("/Count 1");
});
test("certificate verification URLs produce a version 5 QR with valid error correction", () => {
  const url = "https://salaam.hsibs.my.id/share/certificates/AbCdEfGhIjKlMnOpQrStUv";
  const words = certificateQrCodewords(url);
  expect(words).toHaveLength(134);
  expect([...remainder(words, divisor(26))].every(byte => byte === 0)).toBe(true);
  const modules = encodeCertificateQr(url);
  expect(modules).toHaveLength(certificateQrSize);
  expect(modules.every(row => row.length === certificateQrSize)).toBe(true);
  expect(() => certificateQrCodewords(`https://example.test/${"a".repeat(90)}`)).toThrow();
});
