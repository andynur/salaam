// Realistic demo dataset for local development and product walkthroughs. It fills every
// table delivered through Phase 9 (identity, academic foundation, learning core, assessment
// engine, project learning, gamification, attendance, QR check-in, calendar and
// notifications; reporting derives from all of them) with data shaped like a real HSI
// Boarding School term in progress: semester-1 courses underway, semester-2 courses planned
// but nonaktif, a closed exam, an open quiz, an overdue assignment, one due tomorrow,
// capstone projects at every review stage, weekday attendance history, Saturday club sessions,
// a school calendar, and an inbox produced by the real notification worker.
//
// Every walkthrough role has something to look at: an administrator sees accounts, academic
// structure, reward rules, the audit log and the cross-course reports; a teacher sees
// grading, attendance, QR, the leaderboard and their own course reports; a santri sees
// lessons, an open quiz, a deadline due tomorrow, XP, badges, attendance and notifications.
//
// Synthetic history is audited under `demo_seed.*` event names so the audit log never claims
// that a real request happened; events written by the application's own code paths, such as
// badge awards, keep their real names.
//
// The demo curriculum is kept in database/seed/data/curriculum.csv so the walkthrough
// follows the school's roadmap without duplicating syllabus content in this seed script.
//
// Usage: bun database/seed/demo.ts (development only; refuses if demo data already exists).
import type { SQL } from "bun";
import { loadConfig } from "../../src/core/config";
import { connectDatabase } from "../../src/core/database/connection";
import { hashPassword } from "../../src/core/auth/password";
import { recordAudit } from "../../src/core/audit/repository";
import { awardProjectApproval, awardXp } from "../../src/modules/gamification/awards";
import { enqueueCheckin } from "../../src/modules/calendar/notifications";
import { notificationTick } from "../../src/modules/calendar/worker";

const config = loadConfig();
if (config.environment !== "development") throw new Error("Demo seed is development-only.");

const DEMO_ACADEMIC_YEAR = "2026/2027";
const DEMO_PASSWORD = "SalaamDemo2026!";

// Deterministic RNG so re-seeding a reset database reproduces the same demo story.
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(20260913);
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (probability: number) => random() < probability;
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

const NOW = new Date();
const days = (offset: number) => new Date(NOW.getTime() + offset * 86400000);
const hours = (offset: number) => new Date(NOW.getTime() + offset * 3600000);
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
// School hours are quoted in WIB (UTC+7); everything stored stays a UTC instant.
function wib(dayOffset: number, hour: number, minute = 0) {
  const at = days(dayOffset);
  at.setUTCHours(hour - 7, minute, 0, 0);
  return at;
}
function wibDayOfWeek(date: Date) {
  return new Date(date.getTime() + 7 * 3600000).getUTCDay();
}
function isWeekday(date: Date) {
  const day = wibDayOfWeek(date);
  return day >= 1 && day <= 5;
}
function previousWeekday(index: number, hour: number) {
  let offset = -1;
  let found = 0;
  while (true) {
    const at = wib(offset, hour);
    if (isWeekday(at) && found++ === index) return at;
    offset--;
  }
}
function nextWeekday(hour: number) {
  for (let offset = 0; ; offset++) {
    const at = wib(offset, hour);
    if (isWeekday(at) && at.getTime() > NOW.getTime()) return at;
  }
}
function previousSaturday(index: number, hour: number) {
  let offset = -1;
  let found = 0;
  while (true) {
    const at = wib(offset, hour);
    if (wibDayOfWeek(at) === 6 && found++ === index) return at;
    offset--;
  }
}
function nextSaturday(hour: number) {
  for (let offset = 0; ; offset++) {
    const at = wib(offset, hour);
    if (wibDayOfWeek(at) === 6 && at.getTime() > NOW.getTime()) return at;
  }
}
// A plausible school hour that still falls inside the notification worker's 24-hour reminder
// window, whichever time of day the seed happens to run. Falls back to a bare offset so the
// reminder demo never depends on the wall clock.
function withinReminderWindow(...hoursOfDay: number[]) {
  for (const day of [0, 1]) {
    for (const hour of hoursOfDay) {
      const at = wib(day, hour);
      const ahead = at.getTime() - NOW.getTime();
      if (ahead > 2 * 3600000 && ahead < 23 * 3600000) return at;
    }
  }
  return hours(12);
}
// Attendance mix for one santri: the more diligent, the more often present.
function attendanceStatus(skill: number) {
  const roll = random();
  if (roll < 0.78 + skill * 0.17) return "present";
  if (roll < 0.90 + skill * 0.06) return "late";
  if (roll < 0.95) return "sick";
  if (roll < 0.98) return "excused";
  return "absent";
}
const sha256 = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");

// ---------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------
const TEACHERS = [
  { name: "Andy Nur", email: "andynur@hsibs.my.id", identifier: "GRU2026001" },
  { name: "Ari Heru", email: "ariheru@hsibs.my.id", identifier: "GRU2026002" },
];
const ASSISTANT_MENTORS = [
  { name: "Bariq", email: "bariq@hsibs.my.id", identifier: "ASM2026001" },
  { name: "Dafa Al Fatih", email: "dafa.alfatih@hsibs.my.id", identifier: "ASM2026002" },
];
const CLASS_NAMES = ["X-A", "X-B", "XI-A", "XI-B", "XI-C"];
interface DemoStudent { name: string; email: string; identifier: string; classIndex: number; skill: number }
let STUDENTS: DemoStudent[] = [];

async function loadStudentsFromCsv() {
  const path = new URL("data/students.csv", import.meta.url);
  const students: DemoStudent[] = [];
  const rows = (await Bun.file(path).text()).trim().split(/\r?\n/).slice(1);
  for (const row of rows) {
    const [name, , identifier, rombel] = row.split(",");
    if (!name || !identifier || !rombel) throw new Error(`Invalid demo student row: ${row}`);
    const classIndex = CLASS_NAMES.indexOf(rombel);
    if (classIndex < 0) throw new Error(`Unknown demo class "${rombel}"`);
    const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
    students.push({
      name,
      email: `${slug}${students.length + 1}@hsibs.my.id`,
      identifier,
      classIndex,
      skill: 0.4 + random() * 0.55,
    });
  }
  return students;
}

// ---------------------------------------------------------------------------------------
// Curriculum: "Modern JavaScript Programming" handbook table of contents
// ---------------------------------------------------------------------------------------
interface CurriculumRow {
  grade: "X" | "XI";
  semester: "1" | "2";
  phase: string;
  week: number;
  title: string;
  objectives: string;
  content: string;
  practice: string;
  assessment: string;
  source: string;
}
const CURRICULUM_PATH = new URL("data/curriculum.csv", import.meta.url);

function parseCsvRow(row: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < row.length; index++) {
    const character = row[index]!;
    if (character === '"' && row[index + 1] === '"') { cell += '"'; index++; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { cells.push(cell); cell = ""; continue; }
    cell += character;
  }
  cells.push(cell);
  return cells;
}

async function loadCurriculum() {
  const rows = (await Bun.file(CURRICULUM_PATH).text()).trim().split(/\r?\n/).slice(1);
  return rows.map(row => {
    const [grade, semester, phase, week, title, objectives, content, practice, assessment, source] = parseCsvRow(row);
    if (!grade || !semester || !phase || !week || !title) throw new Error(`Invalid curriculum row: ${row}`);
    if (grade !== "X" && grade !== "XI") throw new Error(`Unknown curriculum grade "${grade}"`);
    return { grade, semester, phase, week: Number(week), title, objectives, content, practice, assessment, source: source ?? "" } as CurriculumRow;
  });
}

function curriculumBody(row: CurriculumRow) {
  return `## Tujuan Pembelajaran\n- ${row.objectives}\n\n## Materi\n${row.content}\n\n## Praktik\n${row.practice}\n\n## Asesmen\n${row.assessment}`;
}

let CURRICULUM: CurriculumRow[] = [];

async function seedCurriculum(tx: SQL) {
  const rows = CURRICULUM.map(row => ({
    ...row,
    semester: Number(row.semester),
    content: row.content.split(/[;\n]/).map(item => item.trim()).filter(Boolean),
    assessment: row.assessment.split(/[;\n]/).map(item => item.trim()).filter(Boolean),
  }));

  for (const row of rows) {
    await tx`INSERT INTO curriculum_weeks
        (grade, semester, week, phase, title, objective, content, practice, assessment, source)
      VALUES (${row.grade}, ${row.semester}, ${row.week}, ${row.phase}, ${row.title}, ${row.objectives},
        ${JSON.stringify(row.content)}::text::jsonb, ${row.practice}, ${JSON.stringify(row.assessment)}::text::jsonb, ${row.source})
      ON CONFLICT (grade, semester, week) DO UPDATE SET
        phase = EXCLUDED.phase, title = EXCLUDED.title, objective = EXCLUDED.objective,
        content = EXCLUDED.content, practice = EXCLUDED.practice, assessment = EXCLUDED.assessment,
        source = EXCLUDED.source, version = curriculum_weeks.version + 1, updated_at = clock_timestamp()`;
  }
  if (rows.length) await recordAudit(tx, null, "demo_seed.curriculum_imported", "curriculum_weeks", null, crypto.randomUUID());
}

interface Chapter { number: number; title: string; objectives: string[]; summary: string }
const CHAPTERS: Chapter[] = [
  { number: 1, title: "Mengenal JavaScript", objectives: [
    "Menjelaskan pengertian pemrograman dan posisi coding sebagai tahap akhir dari sebuah solusi.",
    "Menjelaskan sejarah JavaScript, ECMAScript, dan hubungan JavaScript dengan Java.",
    "Membedakan JavaScript di browser dan di Node.js.",
  ], summary:
`Pemrograman adalah proses merancang, menulis, menguji, memperbaiki, dan memelihara instruksi
agar komputer dapat menyelesaikan suatu tugas: Masalah → Analisis → Solusi → Algoritma →
Bahasa Pemrograman → Komputer → Hasil. Coding bukan langkah pertama, melainkan tahap setelah
solusi dirancang.

JavaScript lahir tahun 1995 ketika Netscape Communications meminta Brendan Eich membuat bahasa
yang berjalan di dalam browser Netscape Navigator. Ia menyelesaikannya dalam sekitar 10 hari,
dengan nama yang berubah dari Mocha, ke LiveScript, lalu JavaScript — nama yang dipilih karena
Java sedang populer, meskipun keduanya tidak berkerabat.

Untuk menyeragamkan implementasi antarbrowser, ECMA International menetapkan standar
ECMAScript (ES) pada 1997. ECMAScript adalah spesifikasi; JavaScript adalah implementasinya.
ES6 (2015) adalah pembaruan terbesar: let/const, arrow function, class, module, template
literal, Promise, default parameter, destructuring, dan spread operator — fondasi JavaScript
modern yang dipakai di seluruh handbook ini.

JavaScript Engine (V8 di Chrome dan Node.js, SpiderMonkey di Firefox, JavaScriptCore di
Safari) menerjemahkan kode JavaScript menjadi instruksi yang dipahami prosesor. Browser
memiliki DOM dan window; Node.js tidak — Node.js berinteraksi dengan file system dan cocok
untuk backend. Handbook ini memulai dari Node.js agar fokus pada logika pemrograman sebelum
masuk ke DOM dan pengembangan web.

JavaScript populer karena mudah dipelajari, gratis, open source, bisa dipakai full-stack
(frontend, backend, mobile, desktop), banyak lowongan kerja, dan berekosistem sangat besar
lewat npm. Trade-off-nya: dynamic typing membuat sebagian kesalahan baru terlihat saat
program berjalan, sehingga disiplin menulis kode tetap penting sejak awal.` },
  { number: 2, title: "Persiapan Lingkungan Pengembangan", objectives: [
    "Menyiapkan development environment: VS Code, Node.js LTS, Git, dan terminal.",
    "Membedakan text editor, code editor, dan IDE.",
    "Menjalankan program JavaScript pertama melalui Node.js.",
  ], summary:
`Development environment adalah tempat kerja digital programmer: menulis kode, menjalankan
program, mencari bug, dan mengelola project — seperti dapur bagi seorang koki. Toolbox yang
dipakai di handbook ini: VS Code untuk menulis kode, Node.js untuk menjalankan JavaScript,
Git untuk version control, terminal untuk berinteraksi dengan sistem, dan npm untuk mengelola
package. Semuanya gratis.

VS Code dipilih karena ringan, cepat, gratis, memiliki banyak extension, dan dipakai luas oleh
industri. Saat instalasi, aktifkan opsi "Add to PATH" agar perintah \`code .\` bisa dijalankan
langsung dari terminal. Extension yang disarankan untuk tahap awal secukupnya saja: Prettier,
ESLint, Error Lens, Material Icon Theme, GitLens, Path Intellisense, Code Spell Checker, dan
Markdown All in One — supaya siswa fokus pada konsep, bukan bergantung pada alat bantu.

Selalu instal Node.js versi LTS (Long Term Support), bukan Current, karena lebih stabil dan
lebih sedikit bug. Cek instalasi dengan \`node -v\` dan \`npm -v\` di terminal. npm bukan lagi
akronim resmi menurut dokumentasi terbaru; ia adalah sistem untuk install, update, dan publish
package serta mengelola dependency.

Konfigurasi VS Code yang disepakati untuk seluruh kelas: Auto Save aktif, Format On Save
menggunakan Prettier, ukuran font 16px, indentasi 2 spasi, Word Wrap aktif, dan Minimap
dimatikan di layar kecil — agar hasil kode siswa seragam dan mudah dibahas bersama.

Struktur folder belajar konsisten sepanjang tahun (01-introduction, 02-variable,
03-data-type, ... 12-project). Program pertama: buat folder \`01-introduction\`, buat file
\`hello.js\` berisi \`console.log("Assalamu'alaikum, dunia!");\`, lalu jalankan dengan
\`node hello.js\` dari terminal.` },
  { number: 3, title: "Cara Belajar Programming Secara Efektif", objectives: [
    "Menerapkan siklus belajar aktif: baca, coba, salah, perbaiki, ulangi.",
    "Membiasakan membaca dokumentasi resmi sebelum bertanya.",
  ], summary: "Belajar programming paling efektif lewat latihan aktif dan konsisten, bukan menonton tutorial pasif. Bab ini menekankan siklus baca-coba-debug-ulangi, membaca error message dengan teliti, dan membangun kebiasaan mencari jawaban di dokumentasi resmi sebelum bertanya ke guru atau forum." },
  { number: 4, title: "Berpikir Komputasional", objectives: [
    "Menguraikan masalah besar menjadi bagian-bagian kecil (decomposition).",
    "Mengenali pola dan melakukan abstraksi sebelum menulis kode.",
  ], summary: "Computational thinking adalah kemampuan memecah masalah kompleks menjadi langkah-langkah kecil yang bisa dieksekusi komputer, melalui empat pilar: dekomposisi, pengenalan pola, abstraksi, dan penyusunan algoritma. Kemampuan ini dilatih lewat studi kasus sehari-hari sebelum siswa menyentuh sintaks." },
  { number: 5, title: "Algoritma", objectives: [
    "Menulis algoritma langkah demi langkah untuk masalah sederhana.",
    "Menilai efisiensi sebuah algoritma secara intuitif.",
  ], summary: "Algoritma adalah urutan langkah sistematis untuk menyelesaikan masalah, tidak ambigu dan pasti berhenti. Bab ini melatih siswa menulis algoritma dalam bahasa natural untuk kasus seperti mengurutkan angka atau mencari nilai tertinggi, sebelum diterjemahkan ke kode." },
  { number: 6, title: "Flowchart", objectives: [
    "Menggambar flowchart menggunakan simbol standar (mulai/selesai, proses, keputusan, input/output).",
    "Menelusuri alur logika sebuah flowchart secara manual.",
  ], summary: "Flowchart memvisualkan algoritma menggunakan simbol standar sehingga alur logika program mudah dibaca sebelum ditulis sebagai kode. Bab ini melatih siswa menggambar flowchart untuk kasus percabangan dan perulangan sederhana." },
  { number: 7, title: "Pseudocode", objectives: [
    "Menulis pseudocode yang mendekati struktur bahasa pemrograman nyata.",
    "Menerjemahkan pseudocode menjadi kerangka kode JavaScript.",
  ], summary: "Pseudocode adalah notasi informal yang meniru struktur bahasa pemrograman tanpa terikat sintaks tertentu, menjadi jembatan antara algoritma dan kode JavaScript yang akan ditulis mulai bab berikutnya." },
  { number: 8, title: "Program Pertama", objectives: [
    "Menjalankan file JavaScript melalui Node.js dari terminal.",
    "Menggunakan console.log untuk menampilkan keluaran program.",
  ], summary: "Bab praktik: membuat, menyimpan, dan menjalankan file .js pertama menggunakan node dari terminal, memahami peran console.log sebagai jendela utama untuk melihat apa yang terjadi di dalam program selama belajar." },
  { number: 9, title: "Variabel", objectives: [
    "Membedakan let, const, dan var serta memilih yang tepat.",
    "Menerapkan konvensi penamaan variabel yang jelas.",
  ], summary: "Variabel menyimpan nilai yang dapat dipakai ulang. Bab ini membahas perbedaan let (dapat diubah), const (tidak dapat diubah ulang), dan var (peninggalan lama yang sebaiknya dihindari), beserta konvensi penamaan camelCase yang deskriptif." },
  { number: 10, title: "Tipe Data", objectives: [
    "Mengenali tipe data primitif: string, number, boolean, null, undefined.",
    "Menggunakan typeof untuk memeriksa tipe sebuah nilai.",
  ], summary: "JavaScript memiliki tipe data primitif (string, number, boolean, null, undefined, symbol, bigint) dan tipe objek. Bab ini melatih penggunaan operator typeof serta memahami dynamic typing: variabel dapat berganti tipe saat program berjalan." },
  { number: 11, title: "Operator", objectives: [
    "Menggunakan operator aritmatika, perbandingan, dan logika dengan tepat.",
    "Membedakan == dan === beserta risikonya.",
  ], summary: "Operator aritmatika (+ - * / % **), perbandingan (== === != !== > < >= <=), logika (&& || !), dan assignment (= += -=) adalah alat dasar menyusun ekspresi. Bab ini menekankan mengapa === lebih aman daripada == karena tidak melakukan konversi tipe otomatis." },
  { number: 12, title: "Percabangan", objectives: [
    "Menulis if, else if, else, dan switch untuk mengambil keputusan.",
    "Menyederhanakan percabangan dengan ternary operator.",
  ], summary: "Percabangan mengarahkan program mengambil jalur berbeda berdasarkan kondisi, menggunakan if/else if/else, switch untuk banyak kasus diskrit, dan ternary operator untuk kondisi ringkas satu baris." },
  { number: 13, title: "Perulangan", objectives: [
    "Menggunakan for, while, dan do-while sesuai kasus.",
    "Menghindari infinite loop dan memahami break serta continue.",
  ], summary: "Perulangan mengeksekusi blok kode berulang kali: for cocok saat jumlah pengulangan diketahui, while dan do-while saat bergantung pada kondisi. Bab ini juga membahas break, continue, dan jebakan infinite loop." },
  { number: 14, title: "Function", objectives: [
    "Menulis function declaration, function expression, dan arrow function.",
    "Menerapkan default parameter dan return value.",
  ], summary: "Function membungkus logika agar dapat dipakai ulang. Bab ini membandingkan function declaration, function expression, dan arrow function (ES6), serta parameter default dan pentingnya return value dibanding sekadar console.log di dalam function." },
  { number: 15, title: "Scope", objectives: [
    "Membedakan global scope, function scope, dan block scope.",
    "Menjelaskan konsep closure secara intuitif.",
  ], summary: "Scope menentukan di mana sebuah variabel dapat diakses: global, function, atau block (khusus let/const). Bab ini memperkenalkan closure — function yang mengingat variabel dari scope tempat ia dibuat — sebagai fondasi pola-pola JavaScript lanjutan." },
  { number: 16, title: "Array", objectives: [
    "Membuat dan memanipulasi array dengan method modern (map, filter, reduce, forEach).",
    "Menggunakan destructuring dan spread operator pada array.",
  ], summary: "Array menyimpan kumpulan data berurutan. Bab ini melatih method penting: push/pop, map, filter, reduce, forEach, find, serta destructuring dan spread operator ES6 untuk menyalin dan menggabungkan array secara ringkas." },
  { number: 17, title: "Object", objectives: [
    "Membuat object literal dan mengakses propertinya.",
    "Menggunakan destructuring object dan shorthand property.",
  ], summary: "Object menyimpan data sebagai pasangan key-value untuk memodelkan entitas dunia nyata seperti siswa atau produk. Bab ini membahas dot notation vs bracket notation, method di dalam object, serta destructuring dan shorthand property ES6." },
  { number: 18, title: "String", objectives: [
    "Memanipulasi string dengan method bawaan (slice, split, replace, trim).",
    "Menggunakan template literal untuk interpolasi string.",
  ], summary: "String adalah tipe data yang paling sering dimanipulasi: penggabungan, slice, split, replace, trim, dan pencarian substring. Template literal ES6 (backtick dan \\${}) menggantikan penggabungan string manual agar kode lebih terbaca." },
  { number: 19, title: "Number", objectives: [
    "Menggunakan Math dan method Number untuk pembulatan serta validasi angka.",
    "Menghindari kesalahan umum akibat floating point.",
  ], summary: "Bab ini membahas objek Math (round, floor, ceil, random, max, min), parsing angka dari string (parseInt, parseFloat, Number), serta jebakan umum floating point seperti 0.1 + 0.2 yang tidak sama persis dengan 0.3." },
  { number: 20, title: "Date", objectives: [
    "Membuat dan memformat objek Date.",
    "Menghitung selisih waktu antara dua tanggal.",
  ], summary: "Objek Date menangani tanggal dan waktu: pembuatan, pengambilan komponen (getFullYear, getMonth, getDate), serta perhitungan selisih waktu antar tanggal — kemampuan dasar sebelum membangun fitur seperti pengingat atau jadwal." },
  { number: 21, title: "DOM", objectives: [
    "Memilih dan memodifikasi elemen HTML dengan document.querySelector.",
    "Mengubah teks, atribut, dan class sebuah elemen secara dinamis.",
  ], summary: "Document Object Model (DOM) merepresentasikan halaman HTML sebagai pohon objek yang dapat dibaca dan diubah JavaScript. Bab ini melatih querySelector, textContent, classList, dan pembuatan elemen baru secara dinamis." },
  { number: 22, title: "Event", objectives: [
    "Menambahkan event listener untuk klik, input, dan submit.",
    "Menjelaskan event bubbling secara dasar.",
  ], summary: "Event membuat halaman bereaksi terhadap tindakan pengguna. Bab ini membahas addEventListener untuk click, input, dan submit, objek event, preventDefault, serta pengenalan event bubbling." },
  { number: 23, title: "Module", objectives: [
    "Memisahkan kode menjadi module menggunakan import/export.",
    "Menjelaskan manfaat modularisasi untuk project besar.",
  ], summary: "Module (ES Module) memungkinkan kode dipecah menjadi berkas-berkas kecil yang saling terhubung lewat import dan export, menjaga project tetap terorganisir seiring bertambahnya fitur." },
  { number: 24, title: "JSON", objectives: [
    "Mengonversi objek JavaScript ke JSON dan sebaliknya.",
    "Membaca struktur data JSON dari API.",
  ], summary: "JSON (JavaScript Object Notation) adalah format pertukaran data standar di web. Bab ini melatih JSON.stringify dan JSON.parse, serta membaca struktur data bersarang yang lazim dikembalikan oleh API." },
  { number: 25, title: "Error Handling", objectives: [
    "Menangani error dengan try/catch/finally.",
    "Melempar error kustom yang informatif.",
  ], summary: "Program yang baik mengantisipasi kegagalan. Bab ini membahas try/catch/finally, objek Error, serta praktik melempar dan menangani error secara eksplisit alih-alih membiarkan program berhenti tanpa penjelasan." },
  { number: 26, title: "Async JavaScript", objectives: [
    "Menjelaskan perbedaan kode sinkron dan asinkron.",
    "Memahami peran event loop dan callback queue.",
  ], summary: "JavaScript bersifat single-threaded namun mampu menangani operasi yang lama (seperti mengambil data dari server) tanpa memblokir program lain berkat event loop dan callback queue. Bab ini menjadi fondasi sebelum Promise dan async/await." },
  { number: 27, title: "Promise", objectives: [
    "Membuat dan mengonsumsi Promise dengan then/catch.",
    "Menulis kode asinkron yang lebih rapi dengan async/await.",
  ], summary: "Promise merepresentasikan hasil operasi asinkron yang belum tentu selesai: pending, fulfilled, atau rejected. Bab ini melatih then/catch serta async/await sebagai sintaks yang lebih mudah dibaca di atas Promise." },
  { number: 28, title: "Fetch API", objectives: [
    "Mengambil data dari API menggunakan fetch.",
    "Menangani response, status, dan error jaringan.",
  ], summary: "Fetch API digunakan untuk berkomunikasi dengan server dari browser. Bab ini melatih pengambilan data JSON dari API publik, pemeriksaan response.ok, dan penanganan kegagalan jaringan." },
  { number: 29, title: "Local Storage", objectives: [
    "Menyimpan dan membaca data sederhana di localStorage.",
    "Menjelaskan batasan dan risiko privasi localStorage.",
  ], summary: "localStorage menyimpan data di browser pengguna secara persisten antar sesi, cocok untuk preferensi ringan seperti tema atau daftar tugas lokal. Bab ini membahas API-nya serta batasan ukuran dan keamanannya." },
  { number: 30, title: "Session Storage", objectives: [
    "Membedakan sessionStorage dari localStorage.",
    "Memilih storage yang tepat sesuai kebutuhan aplikasi.",
  ], summary: "sessionStorage mirip localStorage namun data hilang saat tab ditutup, cocok untuk data sementara seperti progres formulir dalam satu kunjungan." },
  { number: 31, title: "Debugging", objectives: [
    "Membaca stack trace dan pesan error secara sistematis.",
    "Menggunakan breakpoint dan console methods untuk melacak bug.",
  ], summary: "Debugging adalah keterampilan inti seorang software engineer: membaca error message, menelusuri stack trace, memasang breakpoint di DevTools, dan memakai console.table/console.error secara strategis." },
  { number: 32, title: "Clean Code", objectives: [
    "Menulis nama variabel dan function yang deskriptif.",
    "Menjaga function tetap kecil dan fokus pada satu tanggung jawab.",
  ], summary: "Clean code mudah dibaca orang lain, bukan hanya berjalan benar: penamaan deskriptif, function kecil dengan satu tanggung jawab, serta menghindari duplikasi dan komentar yang tidak perlu." },
  { number: 33, title: "Git", objectives: [
    "Menggunakan git init, add, commit, dan git log.",
    "Menulis pesan commit yang jelas.",
  ], summary: "Git mencatat riwayat perubahan kode sehingga pekerjaan dapat dikembalikan ke versi sebelumnya dan dikolaborasikan. Bab ini melatih alur kerja dasar: init, add, commit, log, dan branch sederhana." },
  { number: 34, title: "NPM", objectives: [
    "Menginisialisasi project dengan npm init dan package.json.",
    "Menginstal serta mengelola dependency pihak ketiga.",
  ], summary: "npm mengelola dependency sebuah project JavaScript lewat package.json dan package-lock.json. Bab ini melatih npm init, npm install, serta membaca versi semantik sebuah package." },
  { number: 35, title: "Code Quality", objectives: [
    "Menjalankan linter untuk menjaga konsistensi kode.",
    "Menerapkan format otomatis lewat Prettier.",
  ], summary: "Code quality dijaga lewat alat otomatis: linter (ESLint) menemukan potensi kesalahan, formatter (Prettier) menjaga gaya penulisan tetap konsisten di seluruh tim." },
  { number: 36, title: "Refactoring", objectives: [
    "Menyederhanakan kode yang berjalan tanpa mengubah perilakunya.",
    "Mengenali kode duplikat yang layak diekstrak menjadi function.",
  ], summary: "Refactoring memperbaiki struktur internal kode tanpa mengubah perilaku eksternalnya, biasanya dilakukan setelah kode berjalan benar dan ditutupi test atau pemeriksaan manual yang memadai." },
  { number: 37, title: "Mini Project", objectives: [
    "Menggabungkan variabel, function, array, dan DOM dalam satu aplikasi kecil.",
    "Mempresentasikan hasil kerja di depan kelas.",
  ], summary: "Mini project menggabungkan seluruh materi Bagian II dan III menjadi aplikasi kecil yang utuh, seperti kalkulator atau daftar tugas sederhana, sebagai latihan sebelum capstone project." },
  { number: 38, title: "Capstone Project", objectives: [
    "Merancang dan membangun aplikasi web interaktif secara berkelompok.",
    "Mengelola pekerjaan tim menggunakan papan Kanban dan menerima review pembimbing.",
  ], summary: "Capstone project adalah puncak pembelajaran satu tahun: siswa bekerja dalam tim membangun aplikasi web interaktif yang bermanfaat, mengelola tugas lewat papan Kanban, dan melalui proses review oleh guru pembimbing sebelum ditampilkan di showcase kelas." },
];
const chaptersOfPart = (part: number) => CHAPTERS.filter(c =>
  (part === 0 && c.number <= 7) || (part === 1 && c.number >= 8 && c.number <= 20) ||
  (part === 2 && c.number >= 21 && c.number <= 30) || (part === 3 && c.number >= 31));

function lessonContent(chapter: Chapter): string {
  const objectives = chapter.objectives.map(o => `- ${o}`).join("\n");
  return `## Tujuan Pembelajaran\n${objectives}\n\n## Ringkasan\n${chapter.summary}`;
}
void chaptersOfPart;
void lessonContent;

// ---------------------------------------------------------------------------------------
// Question bank: 16 questions covering Bagian I-II, reused per course
// ---------------------------------------------------------------------------------------
interface QuestionSeed { type: "single_choice" | "multiple_choice" | "true_false"; prompt: string; options: string[]; correctIndexes: number[]; explanation: string }
const OPTION_IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const QUESTION_BANK: QuestionSeed[] = [
  { type: "single_choice", prompt: "Standar resmi yang mendefinisikan spesifikasi JavaScript disebut...", options: ["ECMAScript", "TypeScript", "WebAssembly", "JSON Schema"], correctIndexes: [0], explanation: "ECMAScript adalah standar; JavaScript adalah implementasinya." },
  { type: "true_false", prompt: "JavaScript adalah turunan langsung dari bahasa pemrograman Java.", options: ["Benar", "Salah"], correctIndexes: [1], explanation: "Namanya mirip untuk alasan pemasaran, tetapi keduanya bahasa yang berbeda." },
  { type: "single_choice", prompt: "Runtime yang memungkinkan JavaScript berjalan di luar browser adalah...", options: ["Node.js", "jQuery", "Bootstrap", "Webpack"], correctIndexes: [0], explanation: "Node.js menjalankan JavaScript di sisi server menggunakan V8 engine." },
  { type: "multiple_choice", prompt: "Manakah yang termasuk tipe data primitif di JavaScript?", options: ["string", "number", "boolean", "Array"], correctIndexes: [0, 1, 2], explanation: "Array adalah tipe objek, bukan primitif." },
  { type: "single_choice", prompt: "Keyword mana yang digunakan untuk mendeklarasikan variabel yang nilainya tidak dapat diubah?", options: ["var", "let", "const", "static"], correctIndexes: [2], explanation: "const mencegah penugasan ulang terhadap variabel yang sama." },
  { type: "true_false", prompt: "Operator === melakukan konversi tipe sebelum membandingkan dua nilai.", options: ["Benar", "Salah"], correctIndexes: [1], explanation: "=== membandingkan nilai dan tipe tanpa konversi; == yang melakukan konversi." },
  { type: "single_choice", prompt: "Struktur kontrol yang paling tepat untuk memilih satu dari banyak kasus diskrit adalah...", options: ["for", "switch", "while", "try/catch"], correctIndexes: [1], explanation: "switch dirancang untuk banyak kasus nilai yang diketahui." },
  { type: "single_choice", prompt: "Perulangan yang mengeksekusi blok kode minimal satu kali sebelum mengecek kondisi adalah...", options: ["for", "while", "do-while", "forEach"], correctIndexes: [2], explanation: "do-while mengecek kondisi setelah blok kode dijalankan sekali." },
  { type: "multiple_choice", prompt: "Manakah cara yang valid untuk menulis function di JavaScript modern?", options: ["function tambah() {}", "const tambah = () => {}", "const tambah = function() {}", "def tambah():"], correctIndexes: [0, 1, 2], explanation: "def adalah sintaks Python, bukan JavaScript." },
  { type: "true_false", prompt: "Variabel yang dideklarasikan dengan let di dalam blok {} hanya dapat diakses di dalam blok tersebut.", options: ["Benar", "Salah"], correctIndexes: [0], explanation: "let dan const memiliki block scope." },
  { type: "single_choice", prompt: "Method array yang mengembalikan array baru berisi hasil transformasi setiap elemen adalah...", options: ["forEach", "map", "filter", "reduce"], correctIndexes: [1], explanation: "map mentransformasi setiap elemen dan mengembalikan array baru." },
  { type: "single_choice", prompt: "Method array yang menyaring elemen berdasarkan kondisi tertentu adalah...", options: ["map", "filter", "push", "sort"], correctIndexes: [1], explanation: "filter mengembalikan elemen yang memenuhi kondisi callback." },
  { type: "true_false", prompt: "Object di JavaScript menyimpan data sebagai pasangan key-value.", options: ["Benar", "Salah"], correctIndexes: [0], explanation: "Object adalah struktur data key-value." },
  { type: "single_choice", prompt: "Sintaks yang memungkinkan interpolasi variabel langsung di dalam string menggunakan backtick disebut...", options: ["Template literal", "JSON string", "Regular expression", "String concatenation"], correctIndexes: [0], explanation: "Template literal menggunakan backtick dan \\${} untuk interpolasi." },
  { type: "single_choice", prompt: "Method Math yang membulatkan angka ke bawah adalah...", options: ["Math.round", "Math.ceil", "Math.floor", "Math.abs"], correctIndexes: [2], explanation: "Math.floor selalu membulatkan ke bawah." },
  { type: "true_false", prompt: "Objek Date dapat digunakan untuk menghitung selisih waktu antara dua tanggal.", options: ["Benar", "Salah"], correctIndexes: [0], explanation: "Selisih dua objek Date dalam milidetik dapat dihitung dan dikonversi ke satuan waktu lain." },
];

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------
const db = connectDatabase(config.databaseUrl);
async function main() {
  const existing = await db`SELECT 1 FROM academic_years WHERE name = ${DEMO_ACADEMIC_YEAR} LIMIT 1`;
  if (existing.length) throw new Error(`Demo data already present (academic year "${DEMO_ACADEMIC_YEAR}" exists). Reset the database before reseeding.`);

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const requestId = () => crypto.randomUUID();
  STUDENTS = await loadStudentsFromCsv();
  CURRICULUM = await loadCurriculum();

  await db.begin(async tx => {
    // --- Roles -----------------------------------------------------------------------
    const roleRows = await tx<{ id: string; key: string }[]>`SELECT id, key FROM roles`;
    const roleId = (key: string) => roleRows.find(r => r.key === key)!.id;

    async function createPerson(person: { name: string; email: string; identifier: string }, role: "teacher" | "asmen" | "student") {
      const [user] = await tx<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash)
        VALUES (${person.email}, ${person.name}, ${passwordHash}) RETURNING id`;
      const userId = user!.id;
      await tx`INSERT INTO user_roles (user_id, role_id) VALUES (${userId}, ${roleId(role)})`;
      await tx`INSERT INTO user_profiles (user_id, role_id, identifier) VALUES (${userId}, ${roleId(role)}, ${person.identifier})`;
      await recordAudit(tx, null, "demo_seed.user_created", "users", userId, requestId());
      return userId;
    }

    const teacherIds: string[] = [];
    for (const teacher of TEACHERS) teacherIds.push(await createPerson(teacher, "teacher"));
    const [mainTeacherId, coTeacherId] = teacherIds as [string, string];
    const assistantMentorIds: string[] = [];
    for (const assistant of ASSISTANT_MENTORS) assistantMentorIds.push(await createPerson(assistant, "asmen"));

    const studentIds: string[] = [];
    for (const student of STUDENTS) studentIds.push(await createPerson(student, "student"));

    // --- Academic foundation -----------------------------------------------------------
    const [year] = await tx<{ id: string }[]>`INSERT INTO academic_years (name, starts_on, ends_on)
      VALUES (${DEMO_ACADEMIC_YEAR}, ${dateOnly(days(-60))}, ${dateOnly(days(305))}) RETURNING id`;
    const yearId = year!.id;
    const [termGanjil] = await tx<{ id: string }[]>`INSERT INTO terms (academic_year_id, name, starts_on, ends_on)
      VALUES (${yearId}, ${`Semester Ganjil ${DEMO_ACADEMIC_YEAR}`}, ${dateOnly(days(-60))}, ${dateOnly(days(100))}) RETURNING id`;
    const [termGenap] = await tx<{ id: string }[]>`INSERT INTO terms (academic_year_id, name, starts_on, ends_on)
      VALUES (${yearId}, ${`Semester Genap ${DEMO_ACADEMIC_YEAR}`}, ${dateOnly(days(120))}, ${dateOnly(days(305))}) RETURNING id`;
    const termId = termGanjil!.id;

    const classIds: string[] = [];
    for (const name of CLASS_NAMES) {
      const [cls] = await tx<{ id: string }[]>`INSERT INTO classes (academic_year_id, name) VALUES (${yearId}, ${name}) RETURNING id`;
      classIds.push(cls!.id);
    }
    for (const student of STUDENTS) {
      const studentId = studentIds[STUDENTS.indexOf(student)]!;
      await tx`INSERT INTO class_members (class_id, academic_year_id, student_id) VALUES (${classIds[student.classIndex]}, ${yearId}, ${studentId})`;
    }

    // The curriculum screen reads school-wide roadmap rows, not course lessons. Seed both
    // published grades here so a database reset immediately has the same roadmap as demo data.
    await seedCurriculum(tx);

    const [subjectXGanjil] = await tx<{ id: string }[]>`INSERT INTO subjects (code, name) VALUES ('X101', 'Digital Creator Foundation') RETURNING id`;
    const [subjectXGenap] = await tx<{ id: string }[]>`INSERT INTO subjects (code, name) VALUES ('X102', 'Digital Portfolio') RETURNING id`;
    const [subjectXIGanjil] = await tx<{ id: string }[]>`INSERT INTO subjects (code, name) VALUES ('XI101', 'Modern Frontend Development') RETURNING id`;
    const [subjectXIGenap] = await tx<{ id: string }[]>`INSERT INTO subjects (code, name) VALUES ('XI102', 'Fullstack Development') RETURNING id`;

    // --- One active and one planned course per class -----------------------------------
    // Semester genap is deliberately seeded as unpublished: its roadmap is ready, but it
    // must remain nonaktif until the term starts. Ari Heru teaches kelas X; Andy Nur XI.
    const courses: { id: string; classIndex: number; teacherId: string; studentIds: string[] }[] = [];
    const futureCourses: { id: string; classIndex: number; teacherId: string }[] = [];
    for (let classIndex = 0; classIndex < CLASS_NAMES.length; classIndex++) {
      const isXI = CLASS_NAMES[classIndex]!.startsWith("XI");
      const [course] = await tx<{ id: string }[]>`INSERT INTO courses (name, academic_year_id, term_id, class_id, subject_id, published)
        VALUES (${`${isXI ? "Modern Frontend Development" : "Digital Creator Foundation"} – ${CLASS_NAMES[classIndex]}`}, ${yearId}, ${termId}, ${classIds[classIndex]}, ${isXI ? subjectXIGanjil!.id : subjectXGanjil!.id}, true) RETURNING id`;
      const teacherId = CLASS_NAMES[classIndex]!.startsWith("XI") ? mainTeacherId : coTeacherId;
      await tx`INSERT INTO teaching_assignments (course_id, teacher_id) VALUES (${course!.id}, ${teacherId})`;
      for (const assistantId of assistantMentorIds) await tx`INSERT INTO teaching_assignments (course_id, teacher_id) VALUES (${course!.id}, ${assistantId})`;
      const classStudentIds = STUDENTS.filter(s => s.classIndex === classIndex).map(s => studentIds[STUDENTS.indexOf(s)]!);
      courses.push({ id: course!.id, classIndex, teacherId, studentIds: classStudentIds });
      await recordAudit(tx, teacherId, "demo_seed.course_created", "courses", course!.id, requestId());

      const [futureCourse] = await tx<{ id: string }[]>`INSERT INTO courses (name, academic_year_id, term_id, class_id, subject_id, published)
        VALUES (${`${isXI ? "Fullstack Development" : "Digital Portfolio"} – ${CLASS_NAMES[classIndex]}`}, ${yearId}, ${termGenap!.id}, ${classIds[classIndex]}, ${isXI ? subjectXIGenap!.id : subjectXGenap!.id}, false) RETURNING id`;
      await tx`INSERT INTO teaching_assignments (course_id, teacher_id) VALUES (${futureCourse!.id}, ${teacherId})`;
      for (const assistantId of assistantMentorIds) await tx`INSERT INTO teaching_assignments (course_id, teacher_id) VALUES (${futureCourse!.id}, ${assistantId})`;
      futureCourses.push({ id: futureCourse!.id, classIndex, teacherId });
      await recordAudit(tx, teacherId, "demo_seed.course_planned", "courses", futureCourse!.id, requestId());
    }

    // Planned semester-2 courses carry their complete roadmap as unpublished material;
    // this makes the plan visible to staff without exposing it to students prematurely.
    for (const course of futureCourses) {
      const grade = CLASS_NAMES[course.classIndex]!.startsWith("XI") ? "XI" : "X";
      const curriculum = CURRICULUM.filter(row => row.grade === grade && row.semester === "2");
      const phases = [...new Set(curriculum.map(row => row.phase))];
      for (const [position, phase] of phases.entries()) {
        const [module] = await tx<{ id: string }[]>`INSERT INTO course_modules (course_id, title, position, published)
          VALUES (${course.id}, ${`Semester 2 · ${phase}`}, ${position}, false) RETURNING id`;
        for (const row of curriculum.filter(item => item.phase === phase)) {
          const [lesson] = await tx<{ id: string }[]>`INSERT INTO lessons (course_id, module_id, title, content, position, published)
            VALUES (${course.id}, ${module!.id}, ${`Pekan ${row.week} – ${row.title}`}, ${curriculumBody(row)}, ${row.week - 1}, false) RETURNING id`;
          await tx`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content)
            VALUES (${course.id}, ${lesson!.id}, 'Ringkasan roadmap', 'text', ${curriculumBody(row).slice(0, 4000)})`;
        }
      }
    }

    // --- Modules, lessons, materials, activities, assessments, projects, per course ----
    // Published lessons per course, in chapter order, kept for the XP tie-breaking pass below.
    const courseLessons = new Map<string, string[]>();
    for (const course of courses) {
      const teacherId = course.teacherId;
      const grade = CLASS_NAMES[course.classIndex]!.startsWith("XI") ? "XI" : "X";
      const curriculum = CURRICULUM.filter(row => row.grade === grade && row.semester === "1");
      const phases = [...new Set(curriculum.map(row => row.phase))];
      const moduleIds: string[] = [];
      for (let part = 0; part < phases.length; part++) {
        const [module] = await tx<{ id: string }[]>`INSERT INTO course_modules (course_id, title, position, published)
          VALUES (${course.id}, ${phases[part]}, ${part}, true)
          RETURNING id`;
        moduleIds.push(module!.id);
      }

      const lessonByChapter = new Map<number, { id: string; published: boolean }>();
      for (let index = 0; index < curriculum.length; index++) {
          const row = curriculum[index]!;
          const moduleIndex = phases.indexOf(row.phase);
          const content = curriculumBody(row);
          const published = row.semester === "1";
          const [lesson] = await tx<{ id: string }[]>`INSERT INTO lessons (course_id, module_id, title, content, position, published)
            VALUES (${course.id}, ${moduleIds[moduleIndex]}, ${`Pekan ${row.week} – ${row.title}`}, ${content}, ${row.week - 1}, ${published})
            RETURNING id`;
          lessonByChapter.set(index + 1, { id: lesson!.id, published });
          await tx`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content)
            VALUES (${course.id}, ${lesson!.id}, 'Ringkasan pekan', 'text', ${content.slice(0, 4000)})`;
          if (index % 4 === 0 && row.source.startsWith("http")) {
            await tx`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content)
              VALUES (${course.id}, ${lesson!.id}, 'Referensi roadmap', 'link', ${row.source})`;
          }
      }
      courseLessons.set(course.id, [...lessonByChapter.values()].filter(l => l.published).map(l => l.id));

      // Lesson completions: earlier chapters completed by more students; per-student skill drives pace.
      for (const studentId of course.studentIds) {
        const student = STUDENTS[studentIds.indexOf(studentId)]!;
        for (const [chapterNumber, lesson] of lessonByChapter) {
          if (!lesson.published) continue;
          const recency = 1 - chapterNumber / (curriculum.length + 1); // later lessons completed less often
          if (chance(Math.min(0.97, Math.max(0.15, recency * (0.5 + student.skill))))) {
            const completedAt = wib(-int(1, 55), int(8, 20), int(0, 59));
            await tx`INSERT INTO lesson_completions (lesson_id, student_id, completed_at) VALUES (${lesson.id}, ${studentId}, ${completedAt})`;
          }
        }
      }

      // --- Activities --------------------------------------------------------------
      const semesterOne = curriculum.filter(row => row.semester === "1");
      const lessonNumber = (row: CurriculumRow) => curriculum.indexOf(row) + 1;
      const anchor = (row: CurriculumRow) => lessonByChapter.get(lessonNumber(row))!.id;
      const semesterOneRow = (index: number): CurriculumRow => {
        const row = semesterOne[Math.min(index, semesterOne.length - 1)];
        if (!row) throw new Error(`Curriculum for ${grade} semester 1 is empty`);
        return row;
      };
      const assignment1Row = semesterOneRow(6);
      const assignment2Row = semesterOneRow(11);
      const quizRow = semesterOneRow(7);
      const examRow = semesterOneRow(semesterOne.length - 1);
      const [assignment1] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, due_at, published)
        VALUES (${course.id}, ${anchor(assignment1Row)}, 'assignment', ${`Tugas: ${assignment1Row.title}`},
          ${`Kerjakan praktik "${assignment1Row.practice}" dan kumpulkan bukti kerja sesuai asesmen: ${assignment1Row.assessment}.`},
          ${days(-20)}, true) RETURNING id`;
      // Due tonight and closing tomorrow: both land inside the reminder window, so santri who
      // have not finished get a notice and those who have do not.
      const dueSoon = withinReminderWindow(21, 23);
      const closesSoon = withinReminderWindow(22, 20);
      const [assignment2] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, due_at, published)
        VALUES (${course.id}, ${anchor(assignment2Row)}, 'assignment', ${`Tugas: ${assignment2Row.title}`},
          ${`Bangun output praktik "${assignment2Row.practice}" dengan menerapkan materi ${assignment2Row.content}.`},
          ${dueSoon}, true) RETURNING id`;
      const [quiz] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, published)
        VALUES (${course.id}, ${anchor(quizRow)}, 'quiz', ${`Kuis: ${quizRow.title}`},
          ${`Kerjakan kuis berdasarkan fase ${quizRow.phase}: ${quizRow.content}.`}, true) RETURNING id`;
      await tx`INSERT INTO assessment_settings (activity_id, kind, opens_at, closes_at, time_limit_minutes, max_attempts, shuffle_questions, shuffle_options, results_visibility)
        VALUES (${quiz!.id}, 'quiz', ${days(-20)}, ${closesSoon}, 20, 2, true, true, 'after_submit')`;
      const [exam] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, published)
        VALUES (${course.id}, ${anchor(examRow)}, 'exam', ${`Evaluasi Semester 1: ${examRow.title}`},
          ${`Evaluasi mencakup roadmap semester 1 sampai ${examRow.title}. Kerjakan dalam satu kali kesempatan sebelum waktu habis.`}, true) RETURNING id`;
      await tx`INSERT INTO assessment_settings (activity_id, kind, opens_at, closes_at, time_limit_minutes, max_attempts, shuffle_questions, shuffle_options, results_visibility)
        VALUES (${exam!.id}, 'exam', ${days(-25)}, ${days(-24)}, 60, 1, true, true, 'after_close')`;
      const [challenge] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, published)
        VALUES (${course.id}, ${anchor(examRow)}, 'challenge', ${`Capstone: ${examRow.title}`},
          ${`Kerjakan project akhir semester berdasarkan output "${examRow.practice}". Kelola pekerjaan tim melalui papan Kanban, kumpulkan deliverable, dan ajukan untuk direview.`}, true) RETURNING id`;
      await tx`INSERT INTO challenge_settings (activity_id, team_mode, max_team_size) VALUES (${challenge!.id}, 'team', 3)`;
      await recordAudit(tx, teacherId, "demo_seed.activity_published", "activities", challenge!.id, requestId());

      // --- Question bank -------------------------------------------------------------
      const questionIds: { id: string; correctIds: string[] }[] = [];
      for (const q of QUESTION_BANK) {
        const options = q.options.map((text, i) => ({ id: OPTION_IDS[i]!, text }));
        const correct = q.correctIndexes.map(i => OPTION_IDS[i]!).sort();
        const [row] = await tx<{ id: string }[]>`INSERT INTO questions (course_id, type, prompt, options, correct, explanation, created_by)
          VALUES (${course.id}, ${q.type}, ${q.prompt}, ${JSON.stringify(options)}::text::jsonb, ${JSON.stringify(correct)}::text::jsonb, ${q.explanation}, ${teacherId})
          RETURNING id`;
        questionIds.push({ id: row!.id, correctIds: correct });
      }
      const quizQuestions = questionIds.slice(0, 8);
      const examQuestions = questionIds.slice(4, 14);
      for (let i = 0; i < quizQuestions.length; i++) {
        await tx`INSERT INTO assessment_questions (activity_id, course_id, question_id, position, points) VALUES (${quiz!.id}, ${course.id}, ${quizQuestions[i]!.id}, ${i}, 10)`;
      }
      for (let i = 0; i < examQuestions.length; i++) {
        await tx`INSERT INTO assessment_questions (activity_id, course_id, question_id, position, points) VALUES (${exam!.id}, ${course.id}, ${examQuestions[i]!.id}, ${i}, 10)`;
      }

      // Fetch full question rows (options/correct/prompt) for attempt snapshots.
      const bankRows = await tx<{ id: string; type: string; prompt: string; options: { id: string; text: string }[]; correct: string[]; explanation: string }[]>
        `SELECT id, type, prompt, options, correct, explanation FROM questions WHERE course_id = ${course.id}`;
      const byId = new Map(bankRows.map(r => [r.id, r]));

      async function runAttempt(activityId: string, chosen: { id: string }[], student: { id: string; skill: number },
        opensAt: Date, timeLimitMinutes: number, closesAt: Date, allowExpired: boolean) {
        const maxScore = chosen.length * 10;
        const startedAt = new Date(opensAt.getTime() + int(0, Math.max(1, (closesAt.getTime() - opensAt.getTime()) / 2)));
        const deadlineAt = new Date(Math.min(startedAt.getTime() + timeLimitMinutes * 60000, closesAt.getTime()));
        const expired = allowExpired && chance(0.08);
        const submittedAt = expired ? deadlineAt : new Date(startedAt.getTime() + int(3, timeLimitMinutes - 1) * 60000);
        const [attempt] = await tx<{ id: string }[]>`INSERT INTO attempts (activity_id, student_id, number, started_at, deadline_at, submitted_at, submission_reason, score, max_score)
          VALUES (${activityId}, ${student.id}, 1, ${startedAt}, ${deadlineAt}, ${submittedAt}, ${expired ? "expired" : "student"}, 0, ${maxScore}) RETURNING id`;
        let score = 0;
        for (let position = 0; position < chosen.length; position++) {
          const question = byId.get(chosen[position]!.id)!;
          await tx`INSERT INTO attempt_questions (attempt_id, question_id, position, type, prompt, options, correct, explanation, points)
            VALUES (${attempt!.id}, ${question.id}, ${position}, ${question.type}, ${question.prompt}, ${JSON.stringify(question.options)}::text::jsonb,
              ${JSON.stringify(question.correct)}::text::jsonb, ${question.explanation}, 10)`;
          const correct = chance(student.skill);
          const wrongPool = question.options.map(o => o.id).filter(id => !question.correct.includes(id));
          const selected = correct || !wrongPool.length ? question.correct : shuffle(wrongPool).slice(0, question.correct.length);
          const awarded = correct ? 10 : 0;
          score += awarded;
          await tx`INSERT INTO attempt_answers (attempt_id, question_id, selected, revision, awarded)
            VALUES (${attempt!.id}, ${question.id}, ${JSON.stringify(selected)}::text::jsonb, 1, ${awarded})`;
        }
        await tx`UPDATE attempts SET score = ${score} WHERE id = ${attempt!.id}`;
      }

      for (const studentId of course.studentIds) {
        const student = STUDENTS[studentIds.indexOf(studentId)]!;
        // Seeded attempts sit in the first weeks of the still-open quiz window; each santri
        // keeps one of the two allowed attempts for a live walkthrough.
        if (chance(0.8)) await runAttempt(quiz!.id, quizQuestions, { id: studentId, skill: student.skill }, days(-20), 20, days(-6), true);
        if (chance(0.9)) await runAttempt(exam!.id, examQuestions, { id: studentId, skill: student.skill * 0.95 }, days(-25), 60, days(-24), true);
      }

      // --- Submissions & grades for the two assignments -------------------------------
      const feedbackPool = [
        grade === "X" ? "Kerja bagus, keputusan desain dan dokumentasi prosesnya sudah jelas." : "Kerja bagus, logika sudah tepat dan kode mudah dibaca.",
        grade === "X" ? "Sudah baik, tetapi perjelas alasan pemilihan warna, tipografi, atau alur pengguna." : "Sudah benar, tetapi perhatikan penamaan variabel agar lebih deskriptif.",
        grade === "X" ? "Output sudah berjalan. Tambahkan bukti uji dengan pengguna dan catatan revisinya." : "Fungsi berjalan dengan baik. Coba tambahkan komentar singkat pada bagian penting.",
        grade === "X" ? "Hampir sempurna, masih ada detail pada hierarchy atau respons pengalaman pengguna yang perlu diperbaiki." : "Hampir sempurna, ada satu kasus tepi yang belum ditangani.",
        grade === "X" ? "Baik. Rapikan presentasi artefak dan susun refleksi proses secara runtut." : "Baik. Lanjutkan konsistensi indentasi 2 spasi seperti standar kelas.",
      ];
      const submissionContent = grade === "X"
        ? "Berikut artefak desain dan catatan proses saya, termasuk keputusan visual, alur pengguna, serta revisi berdasarkan feedback."
        : "Berikut jawaban tugas saya beserta kode, hasil pengujian, dan catatan proses pengerjaannya.";
      for (const [activity, submitRate, gradeRate, dueAt] of [
        [assignment1!, 0.85, 0.9, days(-20)],
        [assignment2!, 0.3, 0.15, dueSoon],
      ] as const) {
        for (const studentId of course.studentIds) {
          if (!chance(submitRate)) continue;
          const raw = dueAt.getTime() + (chance(0.75) ? -int(1, 10) : int(1, 3)) * 86400000;
          const submittedAt = new Date(Math.min(raw, days(-1).getTime()));
          const [submission] = await tx<{ id: string }[]>`INSERT INTO submissions (activity_id, student_id, content, submitted_at)
            VALUES (${activity.id}, ${studentId}, ${submissionContent}, ${submittedAt})
            RETURNING id`;
          if (chance(gradeRate)) {
            const score = int(65, 100);
            const gradedAt = new Date(Math.min(submittedAt.getTime() + int(1, 5) * 86400000, hours(-2).getTime()));
            await tx`INSERT INTO submission_grades (submission_id, grader_id, score, feedback, created_at)
              VALUES (${submission!.id}, ${teacherId}, ${score}, ${pick(feedbackPool)}, ${gradedAt})`;
            await recordAudit(tx, teacherId, "demo_seed.submission_graded", "submissions", submission!.id, requestId());
          }
        }
      }

      // --- Capstone projects: teams, kanban boards, reviews, portfolio ----------------
      const projectTitles = grade === "X"
        ? ["Portfolio Digital Santri", "Website Kegiatan Asrama", "Produk Digital untuk Kelas", "Landing Page Club"]
        : ["School Data Dashboard", "HSI LMS Mini", "Student Management API", "Fullstack Portfolio Showcase"];
      const projectTheme = grade === "X"
        ? "Produk digital yang dirancang dari riset, brand, alur pengguna, dan prototype untuk kebutuhan sekolah."
        : "Aplikasi fullstack yang dikembangkan dengan JavaScript modern, React, Bun, REST API, database, dan deployment.";
      const teamRoster = shuffle(course.studentIds);
      const teamSize = 3;
      const teamCount = course.classIndex === 1 ? 4 : 3; // one class forms a team for every student, others leave a few unassigned
      const statusCycle: ("in_progress" | "submitted" | "changes_requested" | "approved")[] = ["approved", "changes_requested", "submitted", "in_progress"];
      for (let t = 0; t < teamCount; t++) {
        const members = teamRoster.slice(t * teamSize, t * teamSize + teamSize);
        if (!members.length) break;
        const status = statusCycle[t % statusCycle.length]!;
        const submitted = status !== "in_progress";
        const firstSubmittedAt = submitted ? days(-int(15, 30)) : null;
        const submittedAt = submitted ? days(-int(1, 14)) : null;
        const showcase = status === "approved" && t === 0;
        const [project] = await tx<{ id: string }[]>`INSERT INTO projects
            (activity_id, course_id, title, summary, deliverable_url, status, first_submitted_at, submitted_at, showcased_at, showcased_by, created_by)
          VALUES (${challenge!.id}, ${course.id}, ${pick(projectTitles)},
            ${projectTheme},
            ${submitted ? "https://github.com/hsi-santri/capstone-demo" : null}, ${status}, ${firstSubmittedAt}, ${submittedAt},
            ${showcase ? days(-2) : null}, ${showcase ? teacherId : null}, ${members[0]}) RETURNING id`;
        for (const memberId of members) await tx`INSERT INTO project_members (project_id, activity_id, student_id) VALUES (${project!.id}, ${challenge!.id}, ${memberId})`;

        const cardDefs: { title: string; status: "todo" | "in_progress" | "review" | "done" }[] = grade === "X"
          ? [
            { title: "Riset masalah dan pengguna", status: "done" },
            { title: "Susun brand kit dan visual", status: "done" },
            { title: "Bangun prototype produk", status: status === "in_progress" ? "in_progress" : "done" },
            { title: "Uji alur dan pengalaman pengguna", status: status === "approved" ? "done" : "review" },
            { title: "Susun portfolio dan presentasi", status: status === "approved" ? "done" : "todo" },
          ]
          : [
            { title: "Susun arsitektur aplikasi", status: "done" },
            { title: "Bangun frontend React", status: "done" },
            { title: "Implementasikan backend dan API", status: status === "in_progress" ? "in_progress" : "done" },
            { title: "Hubungkan database dan autentikasi", status: status === "approved" ? "done" : "review" },
            { title: "Deploy dan dokumentasikan aplikasi", status: status === "approved" ? "done" : "todo" },
          ];
        for (let i = 0; i < cardDefs.length; i++) {
          await tx`INSERT INTO project_tasks (project_id, title, status, position, assignee_id, created_by)
            VALUES (${project!.id}, ${cardDefs[i]!.title}, ${cardDefs[i]!.status}, ${i}, ${pick(members)}, ${members[0]})`;
        }

        const reviewedAt = submittedAt ? new Date(Math.min(submittedAt.getTime() + int(1, 4) * 86400000, hours(-3).getTime())) : null;
        if (status === "changes_requested") {
          await tx`INSERT INTO project_reviews (project_id, reviewer_id, decision, feedback, created_at)
            VALUES (${project!.id}, ${teacherId}, 'changes_requested', 'Sudah bagus, tetapi mohon perbaiki responsivitas tampilan pada layar kecil dan tambahkan validasi input sebelum diajukan ulang.', ${reviewedAt})`;
        } else if (status === "approved") {
          const score = int(78, 96);
          await tx`INSERT INTO project_reviews (project_id, reviewer_id, decision, score, feedback, created_at)
            VALUES (${project!.id}, ${teacherId}, 'approved', ${score}, 'Project selesai dengan baik, fungsional, dan bermanfaat. Selamat!', ${reviewedAt})`;
          for (const memberId of members) {
            await tx`INSERT INTO portfolio_entries (project_id, student_id, reflection)
              VALUES (${project!.id}, ${memberId}, 'Project ini mengajarkan saya cara bekerja sama dalam tim, membagi tugas lewat papan Kanban, dan menyelesaikan aplikasi nyata dari awal hingga direview oleh pembimbing.')`;
          }
          if (showcase) await recordAudit(tx, teacherId, "demo_seed.project_showcased", "projects", project!.id, requestId());
        }
      }

      // --- Classroom sessions, attendance, and QR check-in -----------------------------
      // Written the way the application writes it: a roster snapshot per session, an
      // append-only attendance chain whose newest row wins, lifecycle events carrying the
      // version they produced, and historical QR check-in windows for completed sessions.
      const roster = await tx<{ id: string; name: string; identifier: string | null }[]>`SELECT u.id, u.display_name AS name,
          (SELECT p.identifier FROM user_profiles p JOIN roles r ON r.id = p.role_id WHERE p.user_id = u.id AND r.key = 'student') AS identifier
        FROM class_members m JOIN users u ON u.id = m.student_id
        WHERE m.class_id = ${classIds[course.classIndex]} AND u.is_active ORDER BY u.id`;
      interface SeededRecord { studentId: string; recordId: string; status: string }
      async function seedSession(title: string, startsAt: Date, endsAt: Date, kind: "closed" | "cancelled" | "open" | "scheduled", note: string) {
        const requestKey = crypto.randomUUID();
        const payload = JSON.stringify({ courseId: course.id, title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), requestKey, note });
        const reason = kind === "cancelled" ? "Guru berhalangan hadir; materi digabungkan ke pertemuan berikutnya." : "";
        const [session] = await tx<{ id: string }[]>`INSERT INTO classroom_sessions
            (course_id, title, starts_at, ends_at, status, note, reason, created_by, request_key, creation_payload, created_at, updated_at)
          VALUES (${course.id}, ${title}, ${startsAt}, ${endsAt}, ${kind}, ${note}, ${reason}, ${teacherId}, ${requestKey},
            ${payload}::text::jsonb, ${new Date(startsAt.getTime() - 7 * 86400000)}, ${startsAt}) RETURNING id`;
        const sessionId = session!.id;
        for (const student of roster) {
          await tx`INSERT INTO classroom_roster (session_id, student_id, student_name, identifier)
            VALUES (${sessionId}, ${student.id}, ${student.name}, ${student.identifier})`;
        }
        // The session version counts every change: each lifecycle action and each recorded
        // or corrected attendance row, exactly as the routes increment it.
        let version = 1;
        const records: SeededRecord[] = [];
        const lifecycle = async (action: string, at: Date, why: string) => {
          version += 1;
          await tx`INSERT INTO classroom_session_events (session_id, actor_id, version, action, reason, note, created_at)
            VALUES (${sessionId}, ${teacherId}, ${version}, ${action}, ${why}, ${note}, ${at})`;
        };
        if (kind === "cancelled") await lifecycle("cancel", new Date(startsAt.getTime() - 86400000), reason);
        if (kind === "closed" || kind === "open") {
          await lifecycle("open", startsAt, "");
          for (const student of roster) {
            // A session still running is only partly filled in, like a real classroom.
            if (kind === "open" && chance(0.3)) continue;
            const status = attendanceStatus(STUDENTS[studentIds.indexOf(student.id)]!.skill);
            const recordedAt = new Date(Math.min(startsAt.getTime() + int(2, 25) * 60000, NOW.getTime()));
            const note = status === "sick" ? "Ada surat izin sakit dari musyrif asrama."
              : status === "excused" ? "Izin mengikuti kegiatan organisasi santri." : "";
            version += 1;
            const [record] = await tx<{ id: string }[]>`INSERT INTO attendance_records (session_id, student_id, status, note, recorded_by, previous_id, created_at)
              VALUES (${sessionId}, ${student.id}, ${status}, ${note}, ${teacherId}, NULL, ${recordedAt}) RETURNING id`;
            let recordId = record!.id, latest = status;
            if (kind === "closed" && status === "absent" && chance(0.45)) {
              version += 1;
              const [correction] = await tx<{ id: string }[]>`INSERT INTO attendance_records (session_id, student_id, status, note, recorded_by, previous_id, created_at)
                VALUES (${sessionId}, ${student.id}, 'excused', 'Koreksi: santri mewakili sekolah pada lomba tingkat kabupaten.', ${teacherId}, ${recordId},
                  ${new Date(recordedAt.getTime() + 3 * 3600000)}) RETURNING id`;
              recordId = correction!.id;
              latest = "excused";
              await recordAudit(tx, teacherId, "demo_seed.attendance_corrected", "attendance_records", recordId, requestId());
            }
            records.push({ studentId: student.id, recordId, status: latest });
          }
          if (kind === "closed") {
            await lifecycle("close", endsAt, "");
            await recordAudit(tx, teacherId, "demo_seed.session_closed", "classroom_sessions", sessionId, requestId());
          }
        }
        await tx`UPDATE classroom_sessions SET version = ${version} WHERE id = ${sessionId}`;
        return { id: sessionId, startsAt, records };
      }

      // Only code digests are stored, so a seeded code can never be presented: the live
      // window issues a fresh code as soon as a teacher opens the QR display.
      async function seedCheckins(session: { id: string; records: SeededRecord[] }, status: "open" | "stopped", openedAt: Date, lateAfter: Date) {
        const operation = JSON.stringify({ action: status === "open" ? "start" : "stop", rotateSeconds: 30, lateAfter: lateAfter.toISOString() });
        await tx`INSERT INTO attendance_checkin_windows (session_id, status, rotate_seconds, late_after, opened_by, last_operation, created_at, updated_at)
          VALUES (${session.id}, ${status}, 30, ${lateAfter}, ${teacherId}, ${operation}::text::jsonb, ${openedAt}, ${openedAt})`;
        const [code] = await tx<{ id: string }[]>`INSERT INTO attendance_checkin_codes (session_id, code_hash, issued_by, issued_at, expires_at)
          VALUES (${session.id}, ${sha256(crypto.randomUUID())}, ${teacherId}, ${openedAt}, ${new Date(openedAt.getTime() + 30000)}) RETURNING id`;
        for (const record of session.records.filter(r => r.status === "present" || r.status === "late").slice(0, 6)) {
          await tx`INSERT INTO attendance_checkins (session_id, student_id, code_id, record_id, status, created_at)
            VALUES (${session.id}, ${record.studentId}, ${code!.id}, ${record.recordId}, ${record.status}, ${new Date(openedAt.getTime() + int(10, 240) * 1000)})`;
        }
        if (status === "open") await enqueueCheckin(tx, session.id);
      }

      const meetHour = grade === "X" ? 13 : 20;
      const closed: { id: string; startsAt: Date; records: SeededRecord[] }[] = [];
      for (let week = 0; week < 8; week++) {
        const startsAt = previousWeekday(7 - week, meetHour);
        const roadmapRow = curriculum[Math.min(week, curriculum.length - 1)]!;
        closed.push(await seedSession(`Pertemuan ${week + 1} – ${roadmapRow.title}`, startsAt, new Date(startsAt.getTime() + 90 * 60000),
          "closed", "Materi tersampaikan sesuai rencana pembelajaran."));
      }
      const cancelledAt = previousWeekday(0, meetHour);
      await seedSession("Pertemuan 9 – Praktik Mandiri", cancelledAt, new Date(cancelledAt.getTime() + 90 * 60000), "cancelled", "");
      // Do not manufacture an open class outside its real timetable. The next weekday session
      // remains available for the schedule and reminder walkthrough.
      const nextAt = nextWeekday(meetHour);
      const nextRow = curriculum[Math.min(9, curriculum.length - 1)]!;
      await seedSession(`Pertemuan 10 – ${nextRow.title}`, nextAt, new Date(nextAt.getTime() + 90 * 60000), "scheduled", "");
      for (const session of closed.slice(-2)) {
        await seedCheckins(session, "stopped", new Date(session.startsAt.getTime() + 2 * 60000), new Date(session.startsAt.getTime() + 15 * 60000));
      }
      await recordAudit(tx, teacherId, "demo_seed.checkin_history_created", "attendance_checkin_windows", closed[closed.length - 1]!.id, requestId());
    }

    // --- Clubs: directory, own courses, and membership across clubs ---------------------
    // A club orchestrates rows that already exist, so each club needs real learning data
    // behind it. Each club receives its own focused course so its Saturday extracurricular
    // timetable never becomes entangled with the weekday curriculum. Membership then decides
    // who sees what: several santri join two clubs, which is what the progress, challenge,
    // and project tabs are meant to show.
    interface ClubCourseSeed {
      subjectCode: string; subjectName: string; courseName: string; classIndex: number; teacherId: string;
      moduleTitle: string;
      lessons: [string, string][]; assignment: [string, string]; challenge: [string, string];
      projects: string[]; meetingHour: number;
    }
    async function seedClubCourse(seed: ClubCourseSeed) {
      const [subjectRow] = await tx<{ id: string }[]>`INSERT INTO subjects (code, name) VALUES (${seed.subjectCode}, ${seed.subjectName}) RETURNING id`;
      const [courseRow] = await tx<{ id: string }[]>`INSERT INTO courses (name, academic_year_id, term_id, class_id, subject_id, published)
        VALUES (${seed.courseName}, ${yearId}, ${termId}, ${classIds[seed.classIndex]}, ${subjectRow!.id}, true) RETURNING id`;
      const courseId = courseRow!.id;
      const teacherId = seed.teacherId;
      await tx`INSERT INTO teaching_assignments (course_id, teacher_id) VALUES (${courseId}, ${teacherId})`;
      await recordAudit(tx, teacherId, "demo_seed.course_created", "courses", courseId, requestId());
      const [moduleRow] = await tx<{ id: string }[]>`INSERT INTO course_modules (course_id, title, position, published)
        VALUES (${courseId}, ${seed.moduleTitle}, 0, true) RETURNING id`;
      const classStudentIds = STUDENTS.filter(s => s.classIndex === seed.classIndex).map(s => studentIds[STUDENTS.indexOf(s)]!);

      const lessonIds: string[] = [];
      for (let index = 0; index < seed.lessons.length; index++) {
        const [title, body] = seed.lessons[index]!;
        const [lesson] = await tx<{ id: string }[]>`INSERT INTO lessons (course_id, module_id, title, content, position, published)
          VALUES (${courseId}, ${moduleRow!.id}, ${title}, ${body}, ${index}, true) RETURNING id`;
        lessonIds.push(lesson!.id);
        await tx`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content)
          VALUES (${courseId}, ${lesson!.id}, 'Ringkasan roadmap', 'text', ${body})`;
      }
      for (const studentId of classStudentIds) {
        const student = STUDENTS[studentIds.indexOf(studentId)]!;
        for (let index = 0; index < lessonIds.length; index++) {
          if (!chance(Math.max(0.2, student.skill - index * 0.12))) continue;
          await tx`INSERT INTO lesson_completions (lesson_id, student_id, completed_at) VALUES (${lessonIds[index]}, ${studentId}, ${wib(-int(1, 40), int(9, 20), int(0, 59))})`;
        }
      }

      const [assignment] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, due_at, published)
        VALUES (${courseId}, ${lessonIds[1]}, 'assignment', ${seed.assignment[0]}, ${seed.assignment[1]}, ${wib(4, 21)}, true) RETURNING id`;
      await recordAudit(tx, teacherId, "demo_seed.activity_published", "activities", assignment!.id, requestId());
      for (const studentId of classStudentIds) {
        const student = STUDENTS[studentIds.indexOf(studentId)]!;
        if (!chance(0.2 + student.skill * 0.6)) continue;
        const submittedAt = days(-int(1, 10));
        const [submission] = await tx<{ id: string }[]>`INSERT INTO submissions (activity_id, student_id, content, submitted_at)
          VALUES (${assignment!.id}, ${studentId}, 'Berikut hasil pekerjaan saya beserta catatan proses pengerjaannya.', ${submittedAt}) RETURNING id`;
        if (!chance(0.7)) continue;
        const gradedAt = new Date(Math.min(submittedAt.getTime() + int(1, 4) * 86400000, hours(-2).getTime()));
        await tx`INSERT INTO submission_grades (submission_id, grader_id, score, feedback, created_at)
          VALUES (${submission!.id}, ${teacherId}, ${int(70, 98)}, 'Kerja bagus. Lanjutkan dengan memperhatikan detail pada bagian akhir.', ${gradedAt})`;
        await recordAudit(tx, teacherId, "demo_seed.submission_graded", "submissions", submission!.id, requestId());
      }

      const [challenge] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, published)
        VALUES (${courseId}, ${lessonIds[lessonIds.length - 1]}, 'challenge', ${seed.challenge[0]}, ${seed.challenge[1]}, true) RETURNING id`;
      await tx`INSERT INTO challenge_settings (activity_id, team_mode, max_team_size) VALUES (${challenge!.id}, 'team', 3)`;
      await recordAudit(tx, teacherId, "demo_seed.activity_published", "activities", challenge!.id, requestId());

      const roster = shuffle(classStudentIds);
      for (let index = 0; index < seed.projects.length; index++) {
        const members = roster.slice(index * 3, index * 3 + 3);
        if (!members.length) break;
        const approved = index === 0;
        const submittedAt = days(-int(2, 12));
        const [project] = await tx<{ id: string }[]>`INSERT INTO projects
            (activity_id, course_id, title, summary, deliverable_url, status, first_submitted_at, submitted_at, showcased_at, showcased_by, created_by)
          VALUES (${challenge!.id}, ${courseId}, ${seed.projects[index]},
            'Karya klub yang dikerjakan satu tim dari ide, pengerjaan, sampai review mentor.',
            'https://github.com/hsi-santri/klub-demo', ${approved ? "approved" : "submitted"}, ${days(-int(14, 28))}, ${submittedAt},
            ${approved ? days(-3) : null}, ${approved ? teacherId : null}, ${members[0]}) RETURNING id`;
        for (const memberId of members) await tx`INSERT INTO project_members (project_id, activity_id, student_id) VALUES (${project!.id}, ${challenge!.id}, ${memberId})`;
        const cards: [string, "todo" | "in_progress" | "review" | "done"][] = [
          ["Kumpulkan referensi dan kebutuhan", "done"], ["Kerjakan bagian utama", "done"],
          ["Uji hasil bersama tim", approved ? "done" : "review"], ["Susun dokumentasi karya", approved ? "done" : "todo"],
        ];
        for (let position = 0; position < cards.length; position++) {
          await tx`INSERT INTO project_tasks (project_id, title, status, position, assignee_id, created_by)
            VALUES (${project!.id}, ${cards[position]![0]}, ${cards[position]![1]}, ${position}, ${pick(members)}, ${members[0]})`;
        }
        if (!approved) continue;
        const reviewedAt = new Date(Math.min(submittedAt.getTime() + 2 * 86400000, hours(-3).getTime()));
        await tx`INSERT INTO project_reviews (project_id, reviewer_id, decision, score, feedback, created_at)
          VALUES (${project!.id}, ${teacherId}, 'approved', ${int(80, 96)}, 'Karya selesai dengan rapi dan bermanfaat untuk sekolah. Selamat!', ${reviewedAt})`;
        for (const memberId of members) {
          await tx`INSERT INTO portfolio_entries (project_id, student_id, reflection)
            VALUES (${project!.id}, ${memberId}, 'Lewat karya klub ini saya belajar bekerja sama dalam tim dan menyelesaikan karya nyata sampai direview mentor.')`;
        }
        await recordAudit(tx, teacherId, "demo_seed.project_showcased", "projects", project!.id, requestId());
      }

      // Club meetings are ordinary classroom sessions on the club's course, written the way
      // the attendance routes write them: a roster snapshot, then attendance rows.
      const rosterRows = await tx<{ id: string; name: string; identifier: string | null }[]>`SELECT u.id, u.display_name AS name,
          (SELECT p.identifier FROM user_profiles p JOIN roles r ON r.id = p.role_id WHERE p.user_id = u.id AND r.key = 'student') AS identifier
        FROM class_members m JOIN users u ON u.id = m.student_id
        WHERE m.class_id = ${classIds[seed.classIndex]} AND u.is_active ORDER BY u.id`;
      for (let week = 0; week < 5; week++) {
        const scheduled = week === 4;
        const startsAt = scheduled ? nextSaturday(seed.meetingHour) : previousSaturday(3 - week, seed.meetingHour);
        const endsAt = new Date(startsAt.getTime() + 90 * 60000);
        const requestKey = crypto.randomUUID();
        const title = scheduled ? "Pertemuan klub – Review karya" : `Pertemuan klub ${week + 1}`;
        const payload = JSON.stringify({ courseId, title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), requestKey, note: "" });
        const [session] = await tx<{ id: string }[]>`INSERT INTO classroom_sessions
            (course_id, title, starts_at, ends_at, status, note, reason, created_by, request_key, creation_payload, created_at, updated_at)
          VALUES (${courseId}, ${title}, ${startsAt}, ${endsAt}, ${scheduled ? "scheduled" : "closed"}, '', '', ${teacherId}, ${requestKey},
            ${payload}::text::jsonb, ${new Date(startsAt.getTime() - 7 * 86400000)}, ${startsAt}) RETURNING id`;
        for (const student of rosterRows) {
          await tx`INSERT INTO classroom_roster (session_id, student_id, student_name, identifier)
            VALUES (${session!.id}, ${student.id}, ${student.name}, ${student.identifier})`;
        }
        if (scheduled) { await tx`UPDATE classroom_sessions SET version = 1 WHERE id = ${session!.id}`; continue; }
        let version = 2;
        await tx`INSERT INTO classroom_session_events (session_id, actor_id, version, action, reason, note, created_at)
          VALUES (${session!.id}, ${teacherId}, ${version}, 'open', '', '', ${startsAt})`;
        for (const student of rosterRows) {
          const status = attendanceStatus(STUDENTS[studentIds.indexOf(student.id)]!.skill);
          version += 1;
          await tx`INSERT INTO attendance_records (session_id, student_id, status, note, recorded_by, previous_id, created_at)
            VALUES (${session!.id}, ${student.id}, ${status}, '', ${teacherId}, NULL, ${new Date(startsAt.getTime() + int(2, 20) * 60000)})`;
        }
        version += 1;
        await tx`INSERT INTO classroom_session_events (session_id, actor_id, version, action, reason, note, created_at)
          VALUES (${session!.id}, ${teacherId}, ${version}, 'close', '', '', ${endsAt})`;
        await tx`UPDATE classroom_sessions SET version = ${version} WHERE id = ${session!.id}`;
        await recordAudit(tx, teacherId, "demo_seed.session_closed", "classroom_sessions", session!.id, requestId());
      }
      return courseId;
    }

    const clubLessons = (grade: "X" | "XI", phases: string[]) => CURRICULUM
      .filter(row => row.grade === grade && phases.includes(row.phase))
      .slice(0, 4)
      .map(row => [`Pekan ${row.week} – ${row.title}`, curriculumBody(row)] as [string, string]);

    const codersCourseId = await seedClubCourse({
      subjectCode: "CC101", subjectName: "Pemrograman Kompetitif dan Produk",
      courseName: `Coders Club – ${CLASS_NAMES[2]}`, classIndex: 2, teacherId: mainTeacherId, meetingHour: 9,
      moduleTitle: "Ekstrakurikuler Sabtu · JavaScript dan Problem Solving",
      lessons: clubLessons("XI", ["Programming Foundation", "Modern JavaScript Application"]),
      assignment: ["Latihan Problem Solving", "Selesaikan satu masalah algoritma dan dokumentasikan strategi, kasus uji, serta refleksi perbaikannya."],
      challenge: ["Produk Mini Coders Club", "Bangun produk web kecil atau solusi algoritma secara berpasangan, uji bersama, lalu presentasikan proses dan hasilnya."],
      projects: ["Dashboard Jadwal Club", "Bank Soal Algoritma Santri"],
    });
    const buildersCourseId = await seedClubCourse({
      subjectCode: "DPD101", subjectName: "Desain Produk Digital",
      courseName: `Desain Produk Digital – ${CLASS_NAMES[0]}`, classIndex: 0, teacherId: coTeacherId, meetingHour: 13,
      moduleTitle: "Semester 1 · Digital Product dan UI/UX Design",
      lessons: clubLessons("X", ["Digital Product", "UI/UX Design"]),
      assignment: ["Digital Product Blueprint", "Rumuskan masalah pengguna, target pengguna, nilai utama, dan batasan scope untuk satu produk digital yang bermanfaat bagi lingkungan sekolah."],
      challenge: ["Build My Digital Product MVP", "Bangun prototype MVP berdasarkan blueprint, brand, dan user flow. Uji dengan pengguna, catat feedback, lalu presentasikan revisinya."],
      projects: ["Portfolio Digital Santri", "Prototype Sistem Informasi Asrama"],
    });
    const multimediaCourseId = await seedClubCourse({
      subjectCode: "MMK101", subjectName: "Multimedia dan Konten Kreatif",
      courseName: `Multimedia dan Konten Kreatif – ${CLASS_NAMES[0]}`, classIndex: 0, teacherId: coTeacherId, meetingHour: 15,
      moduleTitle: "Semester 1 · Brand Design dan Capstone",
      lessons: clubLessons("X", ["Brand Design", "Capstone"]),
      assignment: ["Brand Discovery", "Lakukan riset audience, positioning, dan referensi visual untuk satu kegiatan atau produk sekolah; rangkum insight menjadi moodboard."],
      challenge: ["Brand My Product", "Terapkan brand voice dan visual language pada produk digital, susun brand kit, lalu siapkan portfolio showcase yang menjaga privasi dan adab liputan."],
      projects: ["Brand Kit Kegiatan Asrama", "Portfolio Visual Club"],
    });

    const clubRows = await tx<{ id: string; slug: string }[]>`SELECT id, slug FROM clubs`;
    const clubId = (slug: string) => clubRows.find(row => row.slug === slug)!.id;
    async function linkClubCourse(slug: string, courseId: string, teacherId: string) {
      await tx`INSERT INTO club_courses (club_id, course_id, linked_by) VALUES (${clubId(slug)}, ${courseId}, ${teacherId})`;
      await recordAudit(tx, teacherId, "demo_seed.club_course_linked", "club_courses", courseId, requestId());
    }
    await linkClubCourse("coders-club", codersCourseId, mainTeacherId);
    await linkClubCourse("builders-club", buildersCourseId, coTeacherId);
    await linkClubCourse("multimedia-club", multimediaCourseId, coTeacherId);

    async function joinClub(slug: string, userId: string, role: "mentor" | "member", joinedAt: Date) {
      await tx`INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (${clubId(slug)}, ${userId}, ${role}, ${joinedAt})
        ON CONFLICT (club_id, user_id) DO NOTHING`;
      await recordAudit(tx, role === "mentor" ? mainTeacherId : null, "demo_seed.club_member_added", "club_members", userId, requestId());
    }
    await joinClub("coders-club", mainTeacherId, "mentor", days(-50));
    await joinClub("builders-club", coTeacherId, "mentor", days(-45));
    await joinClub("multimedia-club", coTeacherId, "mentor", days(-45));
    // Membership follows the class a club's courses belong to, so a santri only ever sees
    // club content they are already enrolled in. The overlaps are deliberate: four santri of
    // X-A and four of XI-A belong to two clubs at once.
    const byClass = (classIndex: number) => STUDENTS.filter(s => s.classIndex === classIndex).map(s => studentIds[STUDENTS.indexOf(s)]!);
    const [first, second, third] = [byClass(0), byClass(1), byClass(2)];
    const coders = [...first!.slice(0, 6), ...second!.slice(0, 6), ...third!.slice(0, 4)];
    const builders = first!.slice(2, 9);      // four of them also code
    const multimedia = first!.slice(9, 16);   // further kelas X santri join Multimedia Club
    for (const studentId of coders) await joinClub("coders-club", studentId, "member", days(-int(20, 44)));
    for (const studentId of builders) await joinClub("builders-club", studentId, "member", days(-int(15, 40)));
    for (const studentId of multimedia) await joinClub("multimedia-club", studentId, "member", days(-int(15, 40)));

    // --- Coders Club: learning tracks and small mentoring groups ------------------------
    // The two tracks come from the migration; the groups are the club's real shape. Santri
    // of kelas X learn HTML and CSS in circles guided by kelas XI, while those same kelas XI
    // santri are themselves guided by a teacher on harder material. That double role is the
    // point: a santri may mentor one group while being a member of another.
    const trackRows = await tx<{ id: string; slug: string }[]>`SELECT id, slug FROM club_tracks WHERE club_id = ${clubId("coders-club")}`;
    const trackId = (slug: string) => trackRows.find(row => row.slug === slug)!.id;
    const seniors = third!.slice(0, 4);                       // four XI-A santri in the club
    const [seniorA, seniorB, seniorC, seniorD] = seniors;
    const groupSeeds: { name: string; topic: string; track: string; level: number; capacity: number; schedule: string; note: string; mentorId: string; members: string[] }[] = [
      {
        name: "Kelompok HTML & CSS Dasar A", topic: "HTML, CSS, dan tata letak halaman", track: "product", level: 1, capacity: 8,
        schedule: "Sabtu, 09.00–10.30", mentorId: seniorA!, members: first!.slice(0, 6),
        note: "Kelompok pemula kelas X yang didampingi santri kelas XI. Fokus pada struktur halaman dan latihan membangun halaman profil sederhana.",
      },
      {
        name: "Kelompok HTML & CSS Dasar B", topic: "HTML, CSS, dan tata letak halaman", track: "product", level: 1, capacity: 8,
        schedule: "Sabtu, 10.45–12.15", mentorId: seniorB!, members: second!.slice(0, 6),
        note: "Kelompok pemula kelas X dengan materi yang sama, dijadwalkan setelah kelompok A agar mentornya dapat saling bergantian.",
      },
      {
        name: "Kelompok Proyek JavaScript", topic: "JavaScript, DOM, dan proyek web", track: "product", level: 3, capacity: 8,
        schedule: "Sabtu, 13.00–15.00", mentorId: mainTeacherId, members: [seniorC!, seniorD!],
        note: "Kelompok kelas XI yang didampingi guru langsung. Materinya proyek web dengan JavaScript sampai siap ditampilkan di showcase.",
      },
      {
        name: "Kelompok Algoritma & C++", topic: "Algoritma, struktur data, dan C++", track: "olympiad", level: 3, capacity: 8,
        schedule: "Sabtu, 15.15–17.15", mentorId: mainTeacherId, members: [seniorA!, seniorB!],
        note: "Persiapan OSN Informatika bagi santri kelas XI, termasuk dua santri yang juga mendampingi kelompok pemula.",
      },
    ];
    for (const seed of groupSeeds) {
      const [group] = await tx<{ id: string }[]>`INSERT INTO club_groups (club_id, track_id, name, topic, level, capacity, schedule, note, mentor_id, created_at)
        VALUES (${clubId("coders-club")}, ${trackId(seed.track)}, ${seed.name}, ${seed.topic}, ${seed.level}, ${seed.capacity},
          ${seed.schedule}, ${seed.note}, ${seed.mentorId}, ${days(-int(25, 40))}) RETURNING id`;
      await recordAudit(tx, mainTeacherId, "demo_seed.club_group_created", "club_groups", group!.id, requestId());
      for (const studentId of seed.members) {
        await tx`INSERT INTO club_group_members (group_id, club_id, user_id, joined_at)
          VALUES (${group!.id}, ${clubId("coders-club")}, ${studentId}, ${days(-int(10, 24))})`;
        await recordAudit(tx, mainTeacherId, "demo_seed.club_group_member_added", "club_group_members", studentId, requestId());
      }
    }

    // --- Gamification: XP and badges through the application's own award path -----------
    // Calling awardXp keeps the ledger, the badge thresholds, and the level-up notices
    // identical to what a real term would have produced, including its idempotency: a
    // repeated attempt or a regrade adds nothing. Awards run oldest first so levels rise in
    // order, then every entry is moved back to the event that earned it.
    const awardRequest = requestId();
    const awards: { at: string; run: () => Promise<unknown> }[] = [];
    for (const row of await tx<{ studentId: string; lessonId: string; courseId: string; at: string }[]>`
      SELECT lc.student_id AS "studentId", lc.lesson_id AS "lessonId", l.course_id AS "courseId",
        to_char(lc.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
      FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id`) {
      awards.push({ at: row.at, run: () => awardXp(tx, row.studentId, "lesson.completed", "lessons", row.lessonId, row.courseId, awardRequest) });
    }
    for (const row of await tx<{ studentId: string; submissionId: string; courseId: string; at: string }[]>`
      SELECT s.student_id AS "studentId", s.id AS "submissionId", a.course_id AS "courseId",
        to_char(g.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
      FROM submissions s JOIN activities a ON a.id = s.activity_id
      JOIN LATERAL (SELECT sg.created_at FROM submission_grades sg WHERE sg.submission_id = s.id ORDER BY sg.created_at DESC, sg.id DESC LIMIT 1) g ON true`) {
      awards.push({ at: row.at, run: () => awardXp(tx, row.studentId, "assignment.graded", "submissions", row.submissionId, row.courseId, awardRequest) });
    }
    for (const row of await tx<{ studentId: string; activityId: string; courseId: string; at: string }[]>`
      SELECT t.student_id AS "studentId", t.activity_id AS "activityId", a.course_id AS "courseId",
        to_char(min(t.submitted_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
      FROM attempts t JOIN activities a ON a.id = t.activity_id WHERE t.submitted_at IS NOT NULL
      GROUP BY t.student_id, t.activity_id, a.course_id`) {
      awards.push({ at: row.at, run: () => awardXp(tx, row.studentId, "assessment.completed", "activities", row.activityId, row.courseId, awardRequest) });
    }
    for (const row of await tx<{ projectId: string; courseId: string; at: string }[]>`
      SELECT p.id AS "projectId", p.course_id AS "courseId",
        to_char(max(r.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
      FROM projects p JOIN project_reviews r ON r.project_id = p.id AND r.decision = 'approved'
      WHERE p.status = 'approved' GROUP BY p.id, p.course_id`) {
      awards.push({ at: row.at, run: () => awardProjectApproval(tx, row.projectId, row.courseId, awardRequest) });
    }
    awards.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    for (const award of awards) await award.run();

    // Break XP ties: reward points are coarse and discrete, so distinct students often land
    // on the same total, which looks wrong on a leaderboard. Give every tied student past the
    // first one more lesson completion through the normal award path; a student who has
    // already finished every lesson instead gives back their most recent one. Runs to a
    // fixed point since nudging one student can create a new collision with someone else.
    const studentCourse = new Map(courses.flatMap(course => course.studentIds.map(studentId => [studentId, course] as const)));
    async function revalidateBadges(studentId: string) {
      await tx`WITH counters AS (
          SELECT COALESCE(sum(points), 0)::int AS xp_total,
            count(*) FILTER (WHERE rule_key = 'lesson.completed')::int AS lessons_completed,
            count(*) FILTER (WHERE rule_key = 'assignment.graded')::int AS assignments_graded,
            count(*) FILTER (WHERE rule_key = 'assessment.completed')::int AS assessments_completed,
            count(*) FILTER (WHERE rule_key = 'project.approved')::int AS projects_approved
          FROM xp_entries WHERE student_id = ${studentId}
        )
        DELETE FROM badge_awards ba USING badges b, counters c
        WHERE ba.student_id = ${studentId} AND ba.badge_id = b.id AND b.threshold > CASE b.criterion
          WHEN 'xp_total' THEN c.xp_total WHEN 'lessons_completed' THEN c.lessons_completed
          WHEN 'assignments_graded' THEN c.assignments_graded WHEN 'assessments_completed' THEN c.assessments_completed
          ELSE c.projects_approved END`;
    }
    // A tied cohort usually shares the same completion pattern (often "finished every
    // lesson"), so nudging everyone by the same one lesson just moves the whole group to a
    // new, equally shared total. Instead, the k-th member of a tied group is nudged k lessons
    // deep, spreading the whole group across k distinct totals in one pass.
    // A member commits to one direction for its whole nudge: switching mid-way (add until
    // full, then start removing) would walk back through totals it already passed, colliding
    // with a sibling nudged by the mirror step count. Capacity limits how far a member can
    // move, so very large tied cohorts may not fully separate in one pass.
    async function nudge(studentId: string, steps: number) {
      const course = studentCourse.get(studentId);
      const lessons = course ? courseLessons.get(course.id) ?? [] : [];
      const done = new Set((await tx<{ lessonId: string }[]>`
        SELECT lesson_id AS "lessonId" FROM lesson_completions WHERE student_id = ${studentId}`).map(r => r.lessonId));
      const adding = lessons.some(id => !done.has(id));
      for (let step = 0; step < steps; step++) {
        if (adding) {
          const next = lessons.find(id => !done.has(id));
          if (!next) return; // ran out of room to add: stop rather than switch direction
          const completedAt = wib(-int(1, 10), int(8, 20), int(0, 59));
          await tx`INSERT INTO lesson_completions (lesson_id, student_id, completed_at) VALUES (${next}, ${studentId}, ${completedAt})`;
          await awardXp(tx, studentId, "lesson.completed", "lessons", next, course!.id, awardRequest);
          done.add(next);
        } else {
          const latest = [...lessons].reverse().find(id => done.has(id));
          if (!latest) return; // ran out of room to remove: stop rather than switch direction
          await tx`DELETE FROM lesson_completions WHERE lesson_id = ${latest} AND student_id = ${studentId}`;
          await tx`DELETE FROM xp_entries WHERE source_type = 'lessons' AND source_id = ${latest} AND student_id = ${studentId}`;
          await revalidateBadges(studentId);
          done.delete(latest);
        }
      }
    }
    for (let round = 0; round < 8; round++) {
      const totals = new Map(studentIds.map(id => [id, 0]));
      for (const row of await tx<{ studentId: string; total: number }[]>`
        SELECT student_id AS "studentId", sum(points)::int AS total FROM xp_entries GROUP BY student_id`)
        totals.set(row.studentId, row.total);
      const groups = new Map<number, string[]>();
      for (const studentId of studentIds) {
        const total = totals.get(studentId)!;
        (groups.get(total) ?? groups.set(total, []).get(total)!).push(studentId);
      }
      let changed = false;
      for (const group of groups.values()) {
        for (let index = 1; index < group.length; index++) { await nudge(group[index]!, index); changed = true; }
      }
      if (!changed) break;
    }

    // Backdate the ledger to its sources. Levels and badges are derived from totals, so
    // moving the dates changes only the story the growth timeline tells.
    await tx`UPDATE xp_entries x SET awarded_at = lc.completed_at FROM lesson_completions lc
      WHERE x.source_type = 'lessons' AND lc.lesson_id = x.source_id AND lc.student_id = x.student_id`;
    await tx`UPDATE xp_entries x SET awarded_at = g.created_at
      FROM (SELECT DISTINCT ON (submission_id) submission_id, created_at FROM submission_grades ORDER BY submission_id, created_at DESC, id DESC) g
      WHERE x.source_type = 'submissions' AND g.submission_id = x.source_id`;
    await tx`UPDATE xp_entries x SET awarded_at = t.at
      FROM (SELECT student_id, activity_id, min(submitted_at) AS at FROM attempts WHERE submitted_at IS NOT NULL GROUP BY student_id, activity_id) t
      WHERE x.source_type = 'activities' AND t.activity_id = x.source_id AND t.student_id = x.student_id`;
    await tx`UPDATE xp_entries x SET awarded_at = r.at
      FROM (SELECT project_id, max(created_at) AS at FROM project_reviews WHERE decision = 'approved' GROUP BY project_id) r
      WHERE x.source_type = 'projects' AND r.project_id = x.source_id`;
    // A badge was earned at the entry that first met its threshold, not at the end of seeding.
    await tx`WITH ledger AS (
        SELECT student_id, awarded_at, sum(points) OVER w AS xp_total,
          count(*) FILTER (WHERE rule_key = 'lesson.completed') OVER w AS lessons_completed,
          count(*) FILTER (WHERE rule_key = 'assignment.graded') OVER w AS assignments_graded,
          count(*) FILTER (WHERE rule_key = 'assessment.completed') OVER w AS assessments_completed,
          count(*) FILTER (WHERE rule_key = 'project.approved') OVER w AS projects_approved
        FROM xp_entries WINDOW w AS (PARTITION BY student_id ORDER BY awarded_at, id)
      )
      UPDATE badge_awards ba SET awarded_at = COALESCE((SELECT min(l.awarded_at) FROM ledger l JOIN badges b ON b.id = ba.badge_id
        WHERE l.student_id = ba.student_id AND b.threshold <= CASE b.criterion
          WHEN 'xp_total' THEN l.xp_total WHEN 'lessons_completed' THEN l.lessons_completed
          WHEN 'assignments_graded' THEN l.assignments_graded WHEN 'assessments_completed' THEN l.assessments_completed
          ELSE l.projects_approved END), ba.awarded_at)`;

    // --- Links -----------------------------------------------------------------------
    // Real bookmarks the school actually shares in group chats: official channels, the
    // apps staff use daily, and the Google Sheets that track class progress. The links
    // migration already seeds an empty "Tautan Sekolah" collection; fill it in and group
    // the rest into a few more school-wide collections, plus one personal collection so
    // both the school and personal scopes have something to show.
    async function seedLinkCollection(ownerId: string | null, title: string, description: string, position: number) {
      const [row] = await tx<{ id: string }[]>`INSERT INTO link_collections (owner_id, title, description, position)
        VALUES (${ownerId}, ${title}, ${description}, ${position}) RETURNING id`;
      await recordAudit(tx, ownerId ?? mainTeacherId, `demo_seed.links.collection.${ownerId ? "personal" : "school"}.created`, "link_collections", row!.id, requestId());
      return row!.id;
    }
    async function seedLinkItems(collectionId: string, items: readonly (readonly [string, string, string])[]) {
      for (const [index, [title, url, description]] of items.entries()) {
        const [row] = await tx<{ id: string }[]>`INSERT INTO link_items (collection_id, title, url, description, position)
          VALUES (${collectionId}, ${title}, ${url}, ${description}, ${index}) RETURNING id`;
        await recordAudit(tx, mainTeacherId, "demo_seed.links.item.created", "link_items", row!.id, requestId());
      }
    }
    const [schoolCollection] = await tx<{ id: string }[]>`SELECT id FROM link_collections WHERE owner_id IS NULL AND title = 'Tautan Sekolah'`;
    await seedLinkItems(schoolCollection!.id, [
      ["Web Official", "https://hsiboardingschool.sch.id/home", "Situs resmi sekolah."],
      ["Instagram", "https://www.instagram.com/hsiboardingschool", "Akun Instagram resmi sekolah."],
      ["Youtube", "https://www.youtube.com/@hsiboardingschool/featured", "Kanal Youtube resmi sekolah."],
      ["Facebook Page", "https://web.facebook.com/people/HSI-Boarding-School/61586171438715", "Halaman Facebook resmi sekolah."],
      ["Info PSB (Penerimaan Santri Baru)", "https://app.hsiboardingschool.id/public/smart-link", "Informasi dan jalur pendaftaran santri baru."],
      ["Panduan Spek Laptop Calon Santri", "https://taap.it/y-dev", "Spesifikasi laptop yang disarankan untuk calon santri."],
      ["Akses HiBro App", "https://app.hsiboardingschool.id/", "Aplikasi HiBro untuk operasional sekolah sehari-hari."],
    ]);
    const systemCollectionId = await seedLinkCollection(null, "Sistem Pembelajaran IT", "Aplikasi yang dipakai sehari-hari untuk mengajar dan belajar IT.", 1);
    await seedLinkItems(systemCollectionId, [
      ["Journal Mengajar Sekolah via HiBro App", "https://app.hsiboardingschool.id/jurnal/input/56EReIm0e0W5IOcz37tHVXAEqm0rwKeQ", "Input jurnal mengajar harian."],
      ["Yahoot Quiz (Kahoot Clone)", "https://yahoot.hsibs.my.id/", "Kuis interaktif ala Kahoot untuk kelas."],
      ["NotebookLM Pemrograman Javascript", "https://notebook.google.com/notebook/1b241e53-286c-4230-bb23-2e6d2f37664f?authuser=0&pli=1", "Catatan belajar NotebookLM untuk materi Javascript."],
    ]);
    // Coders Club's own sheets live here too rather than in a separate collection — one
    // less near-empty collection to scroll past.
    const progressCollectionId = await seedLinkCollection(null, "Progress & Laporan Kelas", "Rekap nilai, progres, dan hasil survei tiap kelas, termasuk Coders Club.", 2);
    await seedLinkItems(progressCollectionId, [
      ["Progress HSIBS Kelas X", "https://docs.google.com/spreadsheets/d/10SFPDdycA030t7dCMJGXDP99bS115aGH/edit?gid=2037254346#gid=2037254346", "Rekap progres belajar kelas X."],
      ["Penilaian Tugas Liburan Kelas XI", "https://docs.google.com/spreadsheets/d/1MLiZoBhJzutEUNnYMldblDpzIC07j2LO/edit?usp=sharing&ouid=107408502617997640762&rtpof=true&sd=true", "Penilaian tugas liburan kelas XI."],
      ["Response Feedback Pembelajaran IT - Kelas XI", "https://docs.google.com/spreadsheets/d/1dC9u9ZyQPUehOHjix2eXHn6fLBpnHJ_3duN47L8mM2g/edit?usp=sharing", "Hasil umpan balik pembelajaran IT kelas XI."],
      ["Responses Profiling Kompetensi IT Santri Kelas XI", "https://docs.google.com/spreadsheets/d/1f_8_zGk13JHS1K-OqbZfwV2GM75ZWCBuT3pF6DUH90I/edit?usp=sharing", "Hasil profiling kompetensi IT santri kelas XI."],
      ["Responses Profiling Kompetensi IT Santri Kelas X", "https://docs.google.com/spreadsheets/d/1q2Kl0-Ajfk1EdYr-kB01gPHtnMwMO-ayEquXkoB5AQs/edit?usp=sharing", "Hasil profiling kompetensi IT santri kelas X."],
      ["Response Survei Coders Club", "https://docs.google.com/spreadsheets/d/16fyfvFTpWGDMFOY9D_HfYpAPl4_7etLWz2LzQhRzJW8/edit?usp=sharing", "Hasil survei anggota Coders Club."],
      ["Response JS Weekly Challenge 1", "https://docs.google.com/spreadsheets/d/1qTR8WcaF0HwBVU0SXIx33x-HXEM-bO7PVB1dmUrJ_w4/edit?usp=sharing", "Jawaban tantangan mingguan Javascript pekan 1."],
      ["Response JS Weekly Challenge 2", "https://docs.google.com/spreadsheets/d/1afcD6Eka0ChjUcs37XvEz36q1P77AWyR3Jk_FhmpP5E/edit?usp=sharing", "Jawaban tantangan mingguan Javascript pekan 2."],
      ["Response JS Monthly Challenge 1", "https://docs.google.com/spreadsheets/d/1zL1MRmzcNSGlVfiBRuJxy2QXqn9L_OB5cNvW7SS8-qo/edit?usp=sharing", "Jawaban tantangan bulanan Javascript ke-1."],
    ]);
    // A personal collection owned by a teacher shows the personal scope working, not just school-wide data.
    const personalCollectionId = await seedLinkCollection(mainTeacherId, "Favorit Saya", "Akses cepat pribadi yang paling sering saya buka.", 0);
    await seedLinkItems(personalCollectionId, [
      ["Akses HiBro App", "https://app.hsiboardingschool.id/", "Pintasan pribadi ke aplikasi HiBro."],
      ["Yahoot Quiz (Kahoot Clone)", "https://yahoot.hsibs.my.id/", "Pintasan pribadi ke kuis interaktif kelas."],
      ["NotebookLM Pemrograman Javascript", "https://notebook.google.com/notebook/1b241e53-286c-4230-bb23-2e6d2f37664f?authuser=0&pli=1", "Catatan belajar pribadi untuk materi Javascript."],
    ]);

    // --- Academic calendar ---------------------------------------------------------------
    // The demo seeds no administrator, so school-wide events are attributed to a teacher.
    // Only capabilities decide who may edit them, so an administrator still gets the full
    // manage flow and a santri still sees them read-only.
    async function seedEvent(title: string, description: string, startsAt: Date, endsAt: Date, courseId: string | null, archived = false) {
      const operation = JSON.stringify({ title, description, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), courseId });
      const [row] = await tx<{ id: string }[]>`INSERT INTO academic_events
          (course_id, title, description, starts_at, ends_at, created_by, request_key, last_operation, archived_at, created_at)
        VALUES (${courseId}, ${title}, ${description}, ${startsAt}, ${endsAt}, ${mainTeacherId}, ${crypto.randomUUID()}, ${operation}::text::jsonb,
          ${archived ? days(-3) : null}, ${new Date(Math.min(startsAt.getTime() - 10 * 86400000, days(-1).getTime()))}) RETURNING id`;
      await recordAudit(tx, mainTeacherId, "demo_seed.event_created", "academic_events", row!.id, requestId());
    }
    await seedEvent("Upacara Pembukaan Semester Ganjil", "Seluruh santri dan guru berkumpul di lapangan utama pukul 07.00 WIB.", wib(-55, 7), wib(-55, 9), null);
    await seedEvent("Pekan Olahraga Santri", "Pertandingan antarkelas sepanjang pekan; kegiatan belajar diliburkan.", wib(-20, 7), wib(-16, 17), null);
    await seedEvent("Studi Banding ke Kampus IT", "Diarsipkan sementara sambil menunggu jadwal baru dari yayasan.", wib(-10, 7), wib(-10, 15), null, true);
    // Starts inside the reminder window, so every role receives an event reminder.
    const meetingAt = withinReminderWindow(19, 9);
    await seedEvent("Rapat Wali Santri Semester Ganjil", "Penyampaian laporan perkembangan santri kepada wali santri di aula.",
      meetingAt, new Date(meetingAt.getTime() + 2 * 3600000), null);
    const nextXClassAt = nextWeekday(13);
    await seedEvent("Praktikum Bersama: Digital Creator Foundation", "Praktikum tambahan kelas X pada jadwal belajar reguler, pukul 13.00–14.30 WIB.", nextXClassAt, new Date(nextXClassAt.getTime() + 90 * 60000), courses[0]!.id);
    await seedEvent("Libur Maulid Nabi", "Tidak ada kegiatan belajar mengajar.", wib(30, 0), wib(30, 23), null);
    await seedEvent("Ujian Akhir Semester Ganjil", "Pekan ujian akhir semester untuk seluruh tingkat.", wib(80, 7), wib(87, 12), null);

    // The annual academic calendar is date-based and remains separate from the live agenda.
    async function seedAcademicCalendarEvent(title: string, description: string, startsOn: string, endsOn: string, category: string, classId: string | null = null) {
      const [row] = await tx<{ id: string }[]>`INSERT INTO academic_calendar_events
        (academic_year_id, class_id, title, description, category, starts_on, ends_on, created_by)
        VALUES (${yearId}, ${classId}, ${title}, ${description}, ${category}, ${startsOn}, ${endsOn}, ${mainTeacherId}) RETURNING id`;
      await recordAudit(tx, mainTeacherId, "demo_seed.academic_calendar_event_created", "academic_calendar_events", row!.id, requestId());
    }
    const academicCalendarEvents: [string, string, string, string, string, string | null][] = [
      ["Libur semester / Tahun ajaran baru", "Libur semester dan persiapan tahun ajaran baru.", "2026-07-29", "2026-08-11", "holiday", null],
      ["Serah terima santri", "Orientasi dan serah terima santri baru.", "2026-08-12", "2026-08-12", "student", null],
      ["MPLS", "Masa pengenalan lingkungan sekolah.", "2026-08-13", "2026-08-19", "student", null],
      ["Dauroh Ilmu Ust. Ayatullah", "Kegiatan pembinaan dan penguatan ilmu.", "2026-08-01", "2026-08-02", "academic", null],
      ["Nusantara Spirit Day", "Kegiatan kebersamaan sekolah.", "2026-08-16", "2026-08-17", "student", null],
      ["Sharing the Joy", "Kegiatan berbagi dan refleksi.", "2026-10-18", "2026-10-18", "student", null],
      ["Life to learn", "Sesi pengembangan karakter.", "2026-11-15", "2026-11-15", "learning", null],
      ["Ujian Tahfidz", "Penilaian hafalan tahfidz.", "2026-12-09", "2026-12-13", "assessment", null],
      ["SAS", "Sumatif akhir semester.", "2026-12-14", "2026-12-19", "assessment", null],
      ["Portofolio", "Pengumpulan dan presentasi portofolio.", "2026-12-20", "2026-12-22", "learning", null],
      ["Class Meeting", "Pertemuan kelas dan evaluasi semester.", "2026-12-23", "2026-12-24", "student", null],
      ["Liburan semester", "Libur semester ganjil.", "2026-12-27", "2027-01-09", "holiday", null],
      ["Kedatangan santri", "Kedatangan santri setelah liburan.", "2027-01-10", "2027-01-10", "student", null],
      ["Presentasi tugas liburan", "Presentasi tugas selama liburan.", "2027-01-11", "2027-01-11", "learning", null],
      ["KBM pertama", "Kegiatan belajar mengajar semester genap dimulai.", "2027-01-12", "2027-01-12", "academic", null],
      ["Prakiraan libur awal Ramadhan", "Tanggal dapat berubah mengikuti keputusan resmi.", "2027-02-08", "2027-02-08", "holiday", null],
      ["Ramadhan Journey", "Program pembelajaran dan ibadah Ramadhan.", "2027-02-09", "2027-02-27", "academic", null],
      ["Ramadhan Fest", "Kegiatan penutup program Ramadhan.", "2027-02-20", "2027-02-21", "student", null],
      ["Libur I'tikaf", "Libur dan persiapan I'tikaf.", "2027-03-01", "2027-03-08", "holiday", null],
      ["Perkiraan Idul Fitri", "Tanggal dapat berubah mengikuti keputusan resmi.", "2027-03-09", "2027-03-09", "holiday", null],
      ["Libur Idul Fitri", "Libur Idul Fitri.", "2027-03-10", "2027-03-19", "holiday", null],
      ["Kedatangan santri", "Kedatangan santri setelah libur Idul Fitri.", "2027-03-20", "2027-03-20", "student", null],
      ["Mission Impossible", "Kegiatan tantangan dan kolaborasi.", "2027-04-11", "2027-04-11", "student", null],
      ["Stories of Wisdom", "Sesi berbagi inspirasi.", "2027-04-24", "2027-04-24", "learning", null],
      ["Idul Adha", "Libur Idul Adha.", "2027-05-16", "2027-05-16", "holiday", null],
      ["Libur Idul Adha", "Libur Idul Adha.", "2027-05-17", "2027-05-18", "holiday", null],
      ["Edurance", "Kegiatan ketahanan dan kebersamaan.", "2027-05-22", "2027-05-23", "student", null],
      ["Ujian Tahfidz", "Penilaian hafalan tahfidz semester genap.", "2027-06-02", "2027-06-06", "assessment", null],
      ["SAS", "Sumatif akhir semester genap.", "2027-06-07", "2027-06-12", "assessment", null],
      ["Class Meeting", "Pertemuan kelas dan evaluasi akhir tahun.", "2027-06-18", "2027-06-18", "student", null],
    ];
    for (const event of academicCalendarEvents) await seedAcademicCalendarEvent(...event);

    // A few santri have tuned their notifications, so the preference form starts from a
    // saved state and the worker has something to suppress rather than deliver.
    for (let index = 0; index < 6; index++) {
      await tx`INSERT INTO notification_preferences (user_id, reminders, level_up, checkin, updated_at)
        VALUES (${studentIds[studentIds.length - 1 - index]}, ${index !== 0}, ${index !== 1}, ${index !== 2}, ${days(-int(2, 20))})`;
    }
  });

  // The application's own worker fills the inbox: reminders for work still outstanding,
  // level-up notices for the XP just awarded, and the QR notice for the class running now.
  // Running it here is the same tick the server would run at startup, only sooner.
  let generated = 0, delivered = 0, suppressed = 0;
  for (let tick = 0; tick < 20; tick++) {
    const result = await notificationTick(db);
    generated += result.generated;
    delivered += result.delivered;
    suppressed += result.suppressed;
    if (!result.generated && !result.delivered && !result.suppressed) break;
  }
  // Part of the inbox has already been read, so the unread filter shows a real difference.
  await db`UPDATE notifications SET read_at = clock_timestamp()
    WHERE status = 'delivered' AND read_at IS NULL AND left(md5(id::text), 1) IN ('0', '1', '2', '3', '4')`;
  const [totals] = await db<{ xp: number; badges: number; sessions: number; records: number; events: number; clubs: number; clubMembers: number; clubTracks: number; clubGroups: number; groupMembers: number; linkCollections: number; linkItems: number }[]>`SELECT
    (SELECT COALESCE(sum(points), 0)::int FROM xp_entries) AS xp, (SELECT count(*)::int FROM badge_awards) AS badges,
    (SELECT count(*)::int FROM classroom_sessions) AS sessions, (SELECT count(*)::int FROM attendance_records) AS records,
    (SELECT count(*)::int FROM academic_events) AS events,
    (SELECT count(*)::int FROM clubs WHERE archived_at IS NULL AND published) AS clubs,
    (SELECT count(*)::int FROM club_members WHERE removed_at IS NULL AND role = 'member') AS "clubMembers",
    (SELECT count(*)::int FROM club_tracks WHERE archived_at IS NULL) AS "clubTracks",
    (SELECT count(*)::int FROM club_groups WHERE archived_at IS NULL) AS "clubGroups",
    (SELECT count(*)::int FROM club_group_members WHERE removed_at IS NULL) AS "groupMembers",
    (SELECT count(*)::int FROM link_collections WHERE archived_at IS NULL) AS "linkCollections",
    (SELECT count(*)::int FROM link_items WHERE archived_at IS NULL) AS "linkItems"`;

  console.log("Demo data seeded.");
  console.log(`- Academic year: ${DEMO_ACADEMIC_YEAR}, classes: ${CLASS_NAMES.join(", ")}`);
  console.log(`- Teachers: ${TEACHERS.map(t => t.email).join(", ")}`);
  console.log(`- Students: ${STUDENTS.length} accounts (e.g. ${STUDENTS[0]!.email})`);
  console.log(`- Shared demo password: ${DEMO_PASSWORD}`);
  console.log(`- Gamification: ${totals!.xp} XP awarded, ${totals!.badges} badges earned`);
  console.log(`- Attendance: ${totals!.sessions} classroom sessions and ${totals!.records} attendance rows; regular classes follow their weekday timetable and club sessions are on Saturdays`);
  console.log(`- Calendar: ${totals!.events} academic events; notifications ${generated} generated, ${delivered} delivered, ${suppressed} suppressed by preference`);
  console.log(`- Clubs: ${totals!.clubs} klub aktif (Coders, Builders, Multimedia) dengan ${totals!.clubMembers} keanggotaan santri; sebagian santri mengikuti dua klub`);
  console.log(`- Coders Club: ${totals!.clubTracks} track belajar (Olympiad, Product) dan ${totals!.clubGroups} kelompok bimbingan berisi ${totals!.groupMembers} santri; dua santri kelas XI mendampingi kelompok pemula sekaligus dibimbing guru`);
  console.log(`- Tautan: ${totals!.linkCollections} koleksi (3 sekolah, 1 pribadi) berisi ${totals!.linkItems} tautan nyata sekolah`);
  console.log("- Reports derive from the data above; an administrator sees every course, a teacher only the ones they teach.");
  console.log("Bootstrap an administrator separately with `bun run db:bootstrap-admin` if one does not exist yet.");
}

try {
  await main();
} catch (error) {
  console.error("Demo seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.close();
}
