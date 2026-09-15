import logo from "../../../assets/logo-white.png";
import type { Certification } from "../../shared/certification";
import { imagePdf } from "../../shared/image-pdf";
import { BRAND } from "./brand";

export async function certificateImage(data: Certification): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 1684; canvas.height = 1190;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Pratinjau sertifikat tidak dapat dibuat.");
  const tokens = getComputedStyle(document.documentElement);
  const color = (name: string) => tokens.getPropertyValue(`--color-${name}`).trim();
  ctx.fillStyle = color("navy"); ctx.fillRect(0, 0, 1684, 1190);
  ctx.fillStyle = color("surface"); ctx.fillRect(22, 22, 1640, 1146);
  ctx.fillStyle = color("background"); ctx.fillRect(58, 58, 1568, 1074);
  ctx.fillStyle = color("navy"); ctx.fillRect(58, 58, 1568, 210);
  const mark = new Image(); mark.src = logo; await mark.decode();
  const scale = Math.min(130 / mark.width, 140 / mark.height);
  ctx.drawImage(mark, 108, 93, mark.width * scale, mark.height * scale);
  ctx.fillStyle = color("surface"); ctx.textAlign = "left";
  ctx.font = "bold 32px sans-serif"; ctx.fillText(BRAND.organization, 270, 165);
  ctx.font = "20px monospace"; ctx.textAlign = "right";
  ctx.fillText(new Date(data.generatedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }), 1570, 165);
  ctx.textAlign = "center"; ctx.fillStyle = color("navy");
  const line = (text: string, y: number, size = 30, bold = false) => {
    ctx.font = `${bold ? "bold " : ""}${size}px monospace`;
    ctx.fillText(text, 842, y, 1390);
  };
  line("SERTIFIKAT PENYELESAIAN", 360, 26);
  line("Diberikan kepada", 426, 26);
  line(data.studentName, 500, 52, true);
  line("atas penyelesaian seluruh materi dan aktivitas", 567, 26);
  line(data.courseName, 646, 44, true);
  line(`${data.className} · ${data.term} · ${data.year}`, 710, 24);
  ctx.strokeStyle = color("border-input"); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(540, 928); ctx.lineTo(1144, 928); ctx.stroke();
  line(data.teachers.join(" · ") || "Guru pengajar belum ditetapkan", 968, 25, true);
  line("Guru Pengajar", 1008, 22);
  line(`${BRAND.organization} · Seluruh pembelajaran selesai (100%)`, 1090, 19);
  return canvas;
}

export async function downloadCertificate(data: Certification) {
  const canvas = await certificateImage(data);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("PDF tidak dapat dibuat.")), "image/jpeg", 0.96));
  const bytes = imagePdf(new Uint8Array(await blob.arrayBuffer()), canvas.width, canvas.height);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a"); link.href = url;
  link.download = `sertifikat-${data.studentName.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 80)}.pdf`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
