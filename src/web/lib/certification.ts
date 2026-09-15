import logo from "../../../assets/logo-white.png";
import type { Certification } from "../../shared/certification";
import { imagePdf } from "../../shared/image-pdf";
import { encodeCertificateQr } from "./certificate-qr";
import { BRAND } from "./brand";

const certificateUrl = (data: Certification) => data.verificationPath ? new URL(data.verificationPath, location.origin).href : null;

export async function certificateImage(data: Certification, preview = true): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 1684; canvas.height = 1190;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Pratinjau sertifikat tidak dapat dibuat.");
  const tokens = getComputedStyle(document.documentElement);
  const color = (name: string) => tokens.getPropertyValue(`--color-${name}`).trim();
  const mono = '"Courier New", ui-monospace, monospace';
  ctx.fillStyle = color("navy"); ctx.fillRect(0, 0, 1684, 1190);
  ctx.fillStyle = color("surface"); ctx.fillRect(18, 18, 1648, 1154);
  ctx.strokeStyle = color("navy"); ctx.lineWidth = 5; ctx.strokeRect(42, 42, 1600, 1106);
  ctx.fillStyle = color("surface"); ctx.fillRect(58, 58, 1568, 1074);
  ctx.save(); ctx.beginPath(); ctx.rect(58, 238, 1568, 894); ctx.clip();
  ctx.strokeStyle = color("border"); ctx.globalAlpha = 0.38; ctx.lineWidth = 2;
  for (let y = 245; y < 1120; y += 92) for (let x = 14; x < 1630; x += 92) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 46, y + 27); ctx.lineTo(x + 92, y); ctx.lineTo(x + 92, y + 54);
    ctx.lineTo(x + 46, y + 81); ctx.lineTo(x + 46, y + 27); ctx.lineTo(x, y + 54); ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = color("navy"); ctx.fillRect(58, 58, 1568, 180);
  const mark = new Image(); mark.src = logo; await mark.decode();
  const markHeight = 112, markWidth = mark.width * (markHeight / mark.height);
  const groupWidth = markWidth + 34 + 420, groupX = (1684 - groupWidth) / 2;
  ctx.drawImage(mark, groupX, 92, markWidth, markHeight);
  ctx.fillStyle = color("surface"); ctx.textAlign = "left"; ctx.font = `bold 40px ${mono}`;
  ctx.fillText(BRAND.organization, groupX + markWidth + 34, 162, 420);
  ctx.textAlign = "center"; ctx.fillStyle = color("navy");
  const line = (text: string, y: number, size = 30, bold = false, maxWidth = 1390) => {
    ctx.font = `${bold ? "bold " : ""}${size}px ${mono}`; ctx.fillText(text, 842, y, maxWidth);
  };
  const date = new Date(data.issuedAt ?? data.generatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
  line("Dokumen ini menyatakan bahwa", 344, 28);
  line(data.studentName, 428, 54, true);
  line("telah menyelesaikan", 493, 28);
  line(data.courseName, 576, 48, true);
  line(`Program penyelesaian pada ${date}`, 638, 27);
  line(`${data.className} · ${data.term} · ${data.year}`, 684, 23);
  const publicUrl = certificateUrl(data);
  if (publicUrl) {
    const modules = encodeCertificateQr(publicUrl), moduleSize = 4, quiet = 4, qrX = 112, qrY = 824;
    ctx.fillStyle = color("surface"); ctx.fillRect(qrX, qrY, (modules.length + quiet * 2) * moduleSize, (modules.length + quiet * 2) * moduleSize);
    ctx.fillStyle = color("navy");
    for (let y = 0; y < modules.length; y++) for (let x = 0; x < modules.length; x++) if (modules[y]![x]) {
      ctx.fillRect(qrX + (x + quiet) * moduleSize, qrY + (y + quiet) * moduleSize, moduleSize, moduleSize);
    }
  } else {
    ctx.fillStyle = color("surface"); ctx.fillRect(112, 824, 180, 180);
    ctx.strokeStyle = color("border-input"); ctx.lineWidth = 2; ctx.setLineDash([8, 7]); ctx.strokeRect(112, 824, 180, 180); ctx.setLineDash([]);
    ctx.fillStyle = color("muted"); ctx.font = `18px ${mono}`; ctx.fillText("QR tersedia", 202, 905); ctx.fillText("setelah diterbitkan", 202, 933);
  }
  ctx.strokeStyle = color("border-input"); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(586, 946); ctx.lineTo(1098, 946); ctx.stroke();
  if (data.eligible && preview) {
    ctx.save(); ctx.fillStyle = color("navy"); ctx.font = "italic 58px cursive"; ctx.textAlign = "center";
    ctx.rotate(-0.035); ctx.fillText(data.teachers[0] ?? "Guru Pengajar", 812, 916, 430); ctx.restore();
    line("Contoh tanda tangan pratinjau", 976, 15);
  }
  line(data.teachers.join(" · ") || "Guru pengajar belum ditetapkan", 1012, 24, true, 520);
  line("Guru Pengajar", 1045, 19);
  ctx.strokeStyle = color("navy"); ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(1450, 914, 76, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1450, 914, 60, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color("navy"); ctx.font = `bold 30px ${mono}`; ctx.fillText("HSI", 1450, 906);
  ctx.font = `16px ${mono}`; ctx.fillText("BOARDING SCHOOL", 1450, 936, 112);
  line("Verifikasi sertifikat:", 1082, 17);
  line(publicUrl ?? "Tautan publik tersedia setelah sertifikat diterbitkan", 1110, 16, false, 1120);
  return canvas;
}

export async function downloadCertificate(data: Certification) {
  const canvas = await certificateImage(data, false);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("PDF tidak dapat dibuat.")), "image/jpeg", 0.96));
  const bytes = imagePdf(new Uint8Array(await blob.arrayBuffer()), canvas.width, canvas.height);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a"); link.href = url;
  link.download = `sertifikat-${data.studentName.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 80)}.pdf`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
