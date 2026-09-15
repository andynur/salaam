import { divisor, maskCondition, remainder } from "./qr";

// Version 5-L uses one Reed-Solomon block and holds up to 106 UTF-8 bytes. This covers
// the configured public origin plus the compact opaque certificate path without a package.
export const certificateQrSize = 37;
const dataCodewords = 108;
const eccCodewords = 26;
type Grid = boolean[][];
const blank = (): Grid => Array.from({ length: certificateQrSize }, () => Array<boolean>(certificateQrSize).fill(false));

export function certificateQrCodewords(text: string) {
  const input = new TextEncoder().encode(text);
  if (input.length > 106) throw new Error("URL sertifikat terlalu panjang untuk QR.");
  const bits: number[] = [];
  const push = (value: number, width: number) => { for (let i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0100, 4); push(input.length, 8);
  for (const byte of input) push(byte, 8);
  const capacity = dataCodewords * 8;
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = new Uint8Array(dataCodewords);
  for (let i = 0; i < bits.length; i++) data[i >>> 3]! |= bits[i]! << (7 - (i & 7));
  for (let i = bits.length / 8, pad = 0; i < data.length; i++, pad++) data[i] = pad % 2 ? 0x11 : 0xec;
  const all = new Uint8Array(dataCodewords + eccCodewords);
  all.set(data); all.set(remainder(data, divisor(eccCodewords)), dataCodewords);
  return all;
}

function patterns(modules: Grid, reserved: Grid) {
  const size = certificateQrSize;
  const set = (x: number, y: number, dark: boolean) => { modules[y]![x] = dark; reserved[y]![x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, distance = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, distance !== 2 && distance !== 4);
    }
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(30 + dx, 30 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  for (let i = 0; i < 9; i++) { reserved[i]![8] = true; reserved[8]![i] = true; }
  for (let i = 0; i < 8; i++) { reserved[size - 1 - i]![8] = true; reserved[8]![size - 1 - i] = true; }
  set(8, size - 8, true);
}

function format(modules: Grid, mask: number) {
  const size = certificateQrSize;
  const data = 0b01000 | mask; // error correction L (01), then the mask number
  let rest = data;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  const bits = ((data << 10) | rest) ^ 0x5412;
  const bit = (index: number) => ((bits >>> index) & 1) === 1;
  for (let i = 0; i <= 5; i++) modules[i]![8] = bit(i);
  modules[7]![8] = bit(6); modules[8]![8] = bit(7); modules[8]![7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8]![14 - i] = bit(i);
  for (let i = 0; i < 8; i++) modules[8]![size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i]![8] = bit(i);
}

function draw(modules: Grid, reserved: Grid, all: Uint8Array) {
  let index = 0;
  for (let right = certificateQrSize - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < certificateQrSize; vertical++) for (let side = 0; side < 2; side++) {
      const x = right - side;
      const y = ((right + 1) & 2) === 0 ? certificateQrSize - 1 - vertical : vertical;
      if (reserved[y]![x]) continue;
      if (index < all.length * 8) modules[y]![x] = ((all[index >>> 3]! >>> (7 - (index & 7))) & 1) === 1;
      index++;
    }
  }
}

function penalty(modules: Grid) {
  const size = modules.length;
  let score = 0;
  for (const axis of [0, 1]) for (let a = 0; a < size; a++) {
    let run = 0, previous = false;
    for (let b = 0; b < size; b++) {
      const dark = axis ? modules[b]![a]! : modules[a]![b]!;
      if (b && dark === previous) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
      previous = dark;
    }
  }
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const dark = modules[y]![x]!;
    if (dark === modules[y]![x + 1] && dark === modules[y + 1]![x] && dark === modules[y + 1]![x + 1]) score += 3;
  }
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  return score + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
}

export function encodeCertificateQr(text: string): Grid {
  const all = certificateQrCodewords(text);
  const reserved = blank(), base = blank();
  patterns(base, reserved); draw(base, reserved, all);
  let best: Grid | null = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const modules = base.map(row => [...row]);
    for (let y = 0; y < certificateQrSize; y++) for (let x = 0; x < certificateQrSize; x++) {
      if (!reserved[y]![x] && maskCondition(mask, x, y)) modules[y]![x] = !modules[y]![x];
    }
    format(modules, mask);
    const score = penalty(modules);
    if (score < bestScore) { best = modules; bestScore = score; }
  }
  return best!;
}
