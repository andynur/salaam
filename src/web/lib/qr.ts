// Minimal QR encoder for the short check-in codes only: version 1 (21x21), error
// correction M, alphanumeric mode. That is everything a 10-character code needs, and it
// keeps the SPA free of a QR dependency. Longer or non-alphanumeric text is rejected.
const alphanumeric = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
export const qrSize = 21;
const dataCodewords = 16;
const eccCodewords = 10;
const maxCharacters = 20;
function multiply(x: number, y: number) {
  let result = 0;
  for (let i = 7; i >= 0; i--) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((y >>> i) & 1) * x;
  }
  return result & 0xff;
}
export function divisor(degree: number) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j]!, root);
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = multiply(root, 2);
  }
  return result;
}
export function remainder(data: Uint8Array, generator: Uint8Array) {
  const result = new Uint8Array(generator.length);
  for (const byte of data) {
    const factor = byte ^ result[0]!;
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < generator.length; i++) result[i] = result[i]! ^ multiply(generator[i]!, factor);
  }
  return result;
}
// Mode 0010, a 9-bit character count, then 11 bits per pair and 6 bits for an odd tail.
export function codewords(text: string) {
  if (text.length > maxCharacters) throw new Error("Kode terlalu panjang untuk QR.");
  const values = [...text].map(character => {
    const value = alphanumeric.indexOf(character);
    if (value < 0) throw new Error("Kode memuat karakter di luar mode alfanumerik.");
    return value;
  });
  const bits: number[] = [];
  const push = (value: number, width: number) => { for (let i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(0b0010, 4);
  push(values.length, 9);
  for (let i = 0; i + 1 < values.length; i += 2) push(values[i]! * 45 + values[i + 1]!, 11);
  if (values.length % 2) push(values[values.length - 1]!, 6);
  const capacity = dataCodewords * 8;
  if (bits.length > capacity) throw new Error("Kode terlalu panjang untuk QR.");
  push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = new Uint8Array(dataCodewords);
  for (let i = 0; i < bits.length; i++) data[i >>> 3]! |= bits[i]! << (7 - (i & 7));
  for (let i = bits.length / 8, pad = 0; i < dataCodewords; i++, pad++) data[i] = pad % 2 ? 0x11 : 0xec;
  const all = new Uint8Array(dataCodewords + eccCodewords);
  all.set(data);
  all.set(remainder(data, divisor(eccCodewords)), dataCodewords);
  return all;
}
type Grid = boolean[][];
const blank = (): Grid => Array.from({ length: qrSize }, () => Array<boolean>(qrSize).fill(false));
function drawFunctionPatterns(modules: Grid, reserved: Grid) {
  const set = (x: number, y: number, dark: boolean) => { modules[y]![x] = dark; reserved[y]![x] = true; };
  for (let i = 0; i < qrSize; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [qrSize - 4, 3], [3, qrSize - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < qrSize && y >= 0 && y < qrSize) set(x, y, distance !== 2 && distance !== 4);
    }
  }
  // Reserve the format-information modules; drawFormat fills them once a mask is chosen.
  for (let i = 0; i < 9; i++) { reserved[i]![8] = true; reserved[8]![i] = true; }
  for (let i = 0; i < 8; i++) { reserved[qrSize - 1 - i]![8] = true; reserved[8]![qrSize - 1 - i] = true; }
  set(8, qrSize - 8, true);
}
function drawFormat(modules: Grid, mask: number) {
  let rest = mask;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  const bits = ((mask << 10) | rest) ^ 0x5412;
  const bit = (index: number) => ((bits >>> index) & 1) === 1;
  for (let i = 0; i <= 5; i++) modules[i]![8] = bit(i);
  modules[7]![8] = bit(6);
  modules[8]![8] = bit(7);
  modules[8]![7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8]![14 - i] = bit(i);
  for (let i = 0; i < 8; i++) modules[8]![qrSize - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[qrSize - 15 + i]![8] = bit(i);
}
export function drawCodewords(modules: Grid, reserved: Grid, all: Uint8Array) {
  let index = 0;
  for (let right = qrSize - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < qrSize; vertical++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? qrSize - 1 - vertical : vertical;
      if (reserved[y]![x] || index >= all.length * 8) continue;
      modules[y]![x] = ((all[index >>> 3]! >>> (7 - (index & 7))) & 1) === 1;
      index++;
    }
  }
}
export function maskCondition(mask: number, x: number, y: number) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}
// The four penalty rules of the specification, used to pick the most scannable mask.
function penalty(modules: Grid) {
  let score = 0;
  for (const axis of [0, 1]) {
    for (let a = 0; a < qrSize; a++) {
      let run = 0;
      let previous = false;
      for (let b = 0; b < qrSize; b++) {
        const dark = axis ? modules[b]![a]! : modules[a]![b]!;
        if (b && dark === previous) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else run = 1;
        previous = dark;
      }
    }
  }
  for (let y = 0; y + 1 < qrSize; y++) for (let x = 0; x + 1 < qrSize; x++) {
    const dark = modules[y]![x]!;
    if (dark === modules[y]![x + 1] && dark === modules[y + 1]![x] && dark === modules[y + 1]![x + 1]) score += 3;
  }
  const finder = [true, false, true, true, true, false, true, false, false, false, false];
  for (const axis of [0, 1]) for (let a = 0; a < qrSize; a++) for (let b = 0; b + 11 <= qrSize; b++) {
    const at = (offset: number) => (axis ? modules[b + offset]![a]! : modules[a]![b + offset]!);
    if (finder.every((value, offset) => at(offset) === value)) score += 40;
    if (finder.every((value, offset) => at(10 - offset) === value)) score += 40;
  }
  let dark = 0;
  for (const row of modules) for (const module of row) if (module) dark++;
  score += Math.floor(Math.abs(dark * 20 - qrSize * qrSize * 10) / (qrSize * qrSize)) * 10;
  return score;
}
/** Returns a 21x21 grid of modules; `true` is a dark module. */
export function encodeQr(text: string): Grid {
  const all = codewords(text.toUpperCase());
  const reserved = blank();
  const base = blank();
  drawFunctionPatterns(base, reserved);
  drawCodewords(base, reserved, all);
  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const modules = base.map(row => [...row]);
    for (let y = 0; y < qrSize; y++) for (let x = 0; x < qrSize; x++) {
      if (!reserved[y]![x] && maskCondition(mask, x, y)) modules[y]![x] = !modules[y]![x];
    }
    drawFormat(modules, mask);
    const score = penalty(modules);
    if (score < bestScore) { bestScore = score; best = modules; }
  }
  return best!;
}
/** An SVG path covering every dark module, for a 21-unit viewBox with a 2-unit quiet zone. */
export function qrPath(modules: Grid) {
  const parts: string[] = [];
  for (let y = 0; y < qrSize; y++) for (let x = 0; x < qrSize; x++) if (modules[y]![x]) parts.push(`M${x + 2} ${y + 2}h1v1h-1z`);
  return parts.join("");
}
