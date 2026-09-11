// Realistic demo dataset for local development and product walkthroughs. It fills every
// table delivered through Phase 4 (identity, academic foundation, learning core, assessment
// engine, project learning) with data shaped like a real HSI Boarding School term in
// progress: some lessons taught, some still in draft, a closed exam, an open quiz, an
// overdue assignment, an upcoming one, and capstone projects at every review stage.
//
// The JavaScript course curriculum follows the table of contents of the handbook
// "Modern JavaScript Programming" (tmp/Modern Javascript Programming.md): four parts,
// 38 chapters. Chapter 1 and 2 content is condensed from the handbook text; the rest
// follows the same chapter titles with syllabus-level notes, since the handbook itself
// is still being written past Chapter 2 — matching a real in-progress curriculum.
//
// Usage: bun database/seed/demo.ts (development only; refuses if demo data already exists).
import { loadConfig } from "../../src/core/config";
import { connectDatabase } from "../../src/core/database/connection";
import { hashPassword } from "../../src/core/auth/password";
import { recordAudit } from "../../src/core/audit/repository";

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
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------
const TEACHERS = [
  { name: "Ahmad Zaki Mubarok", email: "ahmad.zaki@hsiboardingschool.sch.id", identifier: "GRU2026001" },
  { name: "Siti Nur Hasanah", email: "siti.hasanah@hsiboardingschool.sch.id", identifier: "GRU2026002" },
];
const FIRST_NAMES = [
  "Ahmad", "Muhammad", "Abdullah", "Yusuf", "Ibrahim", "Hamzah", "Zaid", "Umar", "Ali", "Bilal",
  "Salman", "Fathi", "Rizki", "Fauzan", "Akmal", "Dzaki", "Farel", "Naufal", "Rafi", "Azzam",
];
const LAST_NAMES = [
  "Ramadhan", "Pratama", "Saputra", "Nugroho", "Hidayat", "Firmansyah", "Wijaya", "Setiawan",
  "Maulana", "Alfarizi", "Nasution", "Siregar", "Harahap", "Lubis", "Prasetyo", "Rahman",
];
const CLASS_NAMES = ["X RPL 1", "X RPL 2", "XI RPL 1"];
const STUDENTS_PER_CLASS = 12;
const STUDENTS = Array.from({ length: CLASS_NAMES.length * STUDENTS_PER_CLASS }, (_, i) => {
  const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
  const last = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
  const name = `${first} ${last}`;
  const classIndex = Math.floor(i / STUDENTS_PER_CLASS);
  const slug = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
  return {
    name,
    email: `${slug}${i + 1}@santri.hsiboardingschool.sch.id`,
    identifier: `2026${String(classIndex + 1).padStart(2, "0")}${String((i % STUDENTS_PER_CLASS) + 1).padStart(3, "0")}`,
    classIndex,
    skill: 0.4 + random() * 0.55, // per-student ability, drives realistic quiz/exam variance
  };
});

// ---------------------------------------------------------------------------------------
// Curriculum: "Modern JavaScript Programming" handbook table of contents
// ---------------------------------------------------------------------------------------
interface Chapter { number: number; title: string; objectives: string[]; summary: string }
const PART_TITLES = [
  "Bagian I – Fondasi",
  "Bagian II – Dasar JavaScript",
  "Bagian III – Intermediate JavaScript",
  "Bagian IV – Best Practice",
];
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

  await db.begin(async tx => {
    // --- Roles -----------------------------------------------------------------------
    const roleRows = await tx<{ id: string; key: string }[]>`SELECT id, key FROM roles`;
    const roleId = (key: string) => roleRows.find(r => r.key === key)!.id;

    async function createPerson(person: { name: string; email: string; identifier: string }, role: "teacher" | "student") {
      const [user] = await tx<{ id: string }[]>`INSERT INTO users (email, display_name, password_hash)
        VALUES (${person.email}, ${person.name}, ${passwordHash}) RETURNING id`;
      const userId = user!.id;
      await tx`INSERT INTO user_roles (user_id, role_id) VALUES (${userId}, ${roleId(role)})`;
      await tx`INSERT INTO user_profiles (user_id, role_id, identifier) VALUES (${userId}, ${roleId(role)}, ${person.identifier})`;
      return userId;
    }

    const teacherIds: string[] = [];
    for (const teacher of TEACHERS) teacherIds.push(await createPerson(teacher, "teacher"));
    const [mainTeacherId, coTeacherId] = teacherIds as [string, string];

    const studentIds: string[] = [];
    for (const student of STUDENTS) studentIds.push(await createPerson(student, "student"));
    await recordAudit(tx, mainTeacherId, "demo_seed.identity_created", "users", mainTeacherId, requestId());

    // --- Academic foundation -----------------------------------------------------------
    const [year] = await tx<{ id: string }[]>`INSERT INTO academic_years (name, starts_on, ends_on)
      VALUES (${DEMO_ACADEMIC_YEAR}, ${dateOnly(days(-60))}, ${dateOnly(days(305))}) RETURNING id`;
    const yearId = year!.id;
    const [termGanjil] = await tx<{ id: string }[]>`INSERT INTO terms (academic_year_id, name, starts_on, ends_on)
      VALUES (${yearId}, ${`Semester Ganjil ${DEMO_ACADEMIC_YEAR}`}, ${dateOnly(days(-60))}, ${dateOnly(days(100))}) RETURNING id`;
    const [termGenap] = await tx<{ id: string }[]>`INSERT INTO terms (academic_year_id, name, starts_on, ends_on)
      VALUES (${yearId}, ${`Semester Genap ${DEMO_ACADEMIC_YEAR}`}, ${dateOnly(days(120))}, ${dateOnly(days(305))}) RETURNING id`;
    const termId = termGanjil!.id;
    void termGenap;

    const classIds: string[] = [];
    for (const name of CLASS_NAMES) {
      const [cls] = await tx<{ id: string }[]>`INSERT INTO classes (academic_year_id, name) VALUES (${yearId}, ${name}) RETURNING id`;
      classIds.push(cls!.id);
    }
    for (const student of STUDENTS) {
      const studentId = studentIds[STUDENTS.indexOf(student)]!;
      await tx`INSERT INTO class_members (class_id, academic_year_id, student_id) VALUES (${classIds[student.classIndex]}, ${yearId}, ${studentId})`;
    }

    const [subject] = await tx<{ id: string }[]>`INSERT INTO subjects (code, name) VALUES ('JS101', 'Pemrograman JavaScript') RETURNING id`;
    const subjectId = subject!.id;

    // --- One course per class, all following the handbook curriculum -------------------
    const courses: { id: string; classIndex: number; studentIds: string[] }[] = [];
    for (let classIndex = 0; classIndex < CLASS_NAMES.length; classIndex++) {
      const [course] = await tx<{ id: string }[]>`INSERT INTO courses (name, academic_year_id, term_id, class_id, subject_id, published)
        VALUES (${`Pemrograman JavaScript – ${CLASS_NAMES[classIndex]}`}, ${yearId}, ${termId}, ${classIds[classIndex]}, ${subjectId}, true) RETURNING id`;
      await tx`INSERT INTO teaching_assignments (course_id, teacher_id) VALUES (${course!.id}, ${mainTeacherId})`;
      if (classIndex === 2) await tx`INSERT INTO teaching_assignments (course_id, teacher_id) VALUES (${course!.id}, ${coTeacherId})`;
      const classStudentIds = STUDENTS.filter(s => s.classIndex === classIndex).map(s => studentIds[STUDENTS.indexOf(s)]!);
      courses.push({ id: course!.id, classIndex, studentIds: classStudentIds });
      await recordAudit(tx, mainTeacherId, "demo_seed.course_created", "courses", course!.id, requestId());
    }

    // --- Modules, lessons, materials, activities, assessments, projects, per course ----
    for (const course of courses) {
      const moduleIds: string[] = [];
      for (let part = 0; part < PART_TITLES.length; part++) {
        const [module] = await tx<{ id: string }[]>`INSERT INTO course_modules (course_id, title, position, published)
          VALUES (${course.id}, ${PART_TITLES[part]}, ${part}, ${part < 3})
          RETURNING id`;
        moduleIds.push(module!.id);
      }

      const lessonByChapter = new Map<number, { id: string; published: boolean }>();
      for (let part = 0; part < PART_TITLES.length; part++) {
        const chapters = chaptersOfPart(part);
        for (let index = 0; index < chapters.length; index++) {
          const chapter = chapters[index]!;
          // Bagian I & II already taught; Bagian III only the first two chapters; Bagian IV still in draft.
          const published = part <= 1 || (part === 2 && index < 2);
          const [lesson] = await tx<{ id: string }[]>`INSERT INTO lessons (course_id, module_id, title, content, position, published)
            VALUES (${course.id}, ${moduleIds[part]}, ${`Bab ${chapter.number} – ${chapter.title}`}, ${lessonContent(chapter)}, ${index}, ${published})
            RETURNING id`;
          lessonByChapter.set(chapter.number, { id: lesson!.id, published });
          await tx`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content)
            VALUES (${course.id}, ${lesson!.id}, 'Ringkasan Bab', 'text', ${chapter.summary.slice(0, 4000)})`;
          if (chapter.number % 4 === 0) {
            await tx`INSERT INTO lesson_materials (course_id, lesson_id, title, kind, content)
              VALUES (${course.id}, ${lesson!.id}, 'Referensi MDN', 'link', ${`https://developer.mozilla.org/en-US/search?q=${encodeURIComponent(chapter.title)}`})`;
          }
        }
      }

      // Lesson completions: earlier chapters completed by more students; per-student skill drives pace.
      for (const studentId of course.studentIds) {
        const student = STUDENTS[studentIds.indexOf(studentId)]!;
        for (const [chapterNumber, lesson] of lessonByChapter) {
          if (!lesson.published) continue;
          const recency = 1 - chapterNumber / 22; // later chapters completed less often
          if (chance(Math.min(0.97, Math.max(0.15, recency * (0.5 + student.skill))))) {
            const completedAt = days(-int(1, 55));
            await tx`INSERT INTO lesson_completions (lesson_id, student_id, completed_at) VALUES (${lesson.id}, ${studentId}, ${completedAt})`;
          }
        }
      }

      // --- Activities --------------------------------------------------------------
      const anchor = (n: number) => lessonByChapter.get(n)!.id;
      const [assignment1] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, due_at, published)
        VALUES (${course.id}, ${anchor(10)}, 'assignment', 'Tugas 1: Variabel & Tipe Data',
          'Buat file variabel-siswa.js yang mendeklarasikan variabel untuk nama, umur, dan status aktif menggunakan let/const yang tepat, lalu cetak tipe setiap variabel menggunakan typeof.',
          ${days(-20)}, true) RETURNING id`;
      const [assignment2] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, due_at, published)
        VALUES (${course.id}, ${anchor(16)}, 'assignment', 'Tugas 2: Function & Array',
          'Buat function hitungRataRata(nilai) yang menerima array nilai siswa dan mengembalikan rata-ratanya menggunakan method reduce.',
          ${days(5)}, true) RETURNING id`;
      const [quiz] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, published)
        VALUES (${course.id}, ${anchor(20)}, 'quiz', 'Kuis Dasar JavaScript',
          'Kerjakan kuis pilihan ganda meliputi tipe data, operator, percabangan, perulangan, function, array, dan object.', true) RETURNING id`;
      await tx`INSERT INTO assessment_settings (activity_id, kind, opens_at, closes_at, time_limit_minutes, max_attempts, shuffle_questions, shuffle_options, results_visibility)
        VALUES (${quiz!.id}, 'quiz', ${days(-20)}, ${days(-6)}, 20, 2, true, true, 'after_submit')`;
      const [exam] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, published)
        VALUES (${course.id}, ${anchor(20)}, 'exam', 'Ujian Tengah Semester',
          'Ujian tengah semester mencakup seluruh materi Bagian I dan Bagian II. Kerjakan dalam satu kali kesempatan sebelum waktu habis.', true) RETURNING id`;
      await tx`INSERT INTO assessment_settings (activity_id, kind, opens_at, closes_at, time_limit_minutes, max_attempts, shuffle_questions, shuffle_options, results_visibility)
        VALUES (${exam!.id}, 'exam', ${days(-25)}, ${days(-24)}, 60, 1, true, true, 'after_close')`;
      const [challenge] = await tx<{ id: string }[]>`INSERT INTO activities (course_id, lesson_id, kind, title, instructions, published)
        VALUES (${course.id}, ${anchor(38)}, 'challenge', 'Capstone Project: Aplikasi Web untuk Kehidupan Santri',
          'Bekerja dalam tim 2–3 orang membangun aplikasi web interaktif (DOM, array/object, dan penyimpanan lokal) yang bermanfaat bagi kegiatan santri sehari-hari. Kelola pekerjaan tim melalui papan Kanban dan ajukan untuk direview.', true) RETURNING id`;
      await tx`INSERT INTO challenge_settings (activity_id, team_mode, max_team_size) VALUES (${challenge!.id}, 'team', 3)`;
      await recordAudit(tx, mainTeacherId, "demo_seed.activity_published", "activities", challenge!.id, requestId());

      // --- Question bank -------------------------------------------------------------
      const questionIds: { id: string; correctIds: string[] }[] = [];
      for (const q of QUESTION_BANK) {
        const options = q.options.map((text, i) => ({ id: OPTION_IDS[i]!, text }));
        const correct = q.correctIndexes.map(i => OPTION_IDS[i]!).sort();
        const [row] = await tx<{ id: string }[]>`INSERT INTO questions (course_id, type, prompt, options, correct, explanation, created_by)
          VALUES (${course.id}, ${q.type}, ${q.prompt}, ${JSON.stringify(options)}::text::jsonb, ${JSON.stringify(correct)}::text::jsonb, ${q.explanation}, ${mainTeacherId})
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
        if (chance(0.8)) await runAttempt(quiz!.id, quizQuestions, { id: studentId, skill: student.skill }, days(-20), 20, days(-6), true);
        if (chance(0.9)) await runAttempt(exam!.id, examQuestions, { id: studentId, skill: student.skill * 0.95 }, days(-25), 60, days(-24), true);
      }

      // --- Submissions & grades for the two assignments -------------------------------
      const feedbackPool = [
        "Kerja bagus, logika sudah tepat dan kode mudah dibaca.",
        "Sudah benar, tetapi perhatikan penamaan variabel agar lebih deskriptif.",
        "Fungsi berjalan dengan baik. Coba tambahkan komentar singkat pada bagian penting.",
        "Hampir sempurna, ada satu kasus tepi yang belum ditangani.",
        "Baik. Lanjutkan konsistensi indentasi 2 spasi seperti standar kelas.",
      ];
      for (const [activity, submitRate, gradeRate, dueAt] of [
        [assignment1!, 0.85, 0.9, days(-20)],
        [assignment2!, 0.3, 0.15, days(5)],
      ] as const) {
        for (const studentId of course.studentIds) {
          if (!chance(submitRate)) continue;
          const raw = dueAt.getTime() + (chance(0.75) ? -int(1, 10) : int(1, 3)) * 86400000;
          const submittedAt = new Date(Math.min(raw, days(-1).getTime()));
          const [submission] = await tx<{ id: string }[]>`INSERT INTO submissions (activity_id, student_id, content, submitted_at)
            VALUES (${activity.id}, ${studentId}, ${"Berikut jawaban tugas saya:\n\nconst nama = \"Santri\";\nconst umur = 16;\nconsole.log(typeof nama, typeof umur);"}, ${submittedAt})
            RETURNING id`;
          if (chance(gradeRate)) {
            const score = int(65, 100);
            await tx`INSERT INTO submission_grades (submission_id, grader_id, score, feedback) VALUES (${submission!.id}, ${mainTeacherId}, ${score}, ${pick(feedbackPool)})`;
          }
        }
      }

      // --- Capstone projects: teams, kanban boards, reviews, portfolio ----------------
      const projectTitles = [
        "Pengingat Waktu Sholat", "Pencatat Hafalan Qur'an", "Aplikasi To-Do Harian Santri",
        "Kalkulator Zakat Sederhana", "Jadwal Piket Kelas", "Galeri Kegiatan Kelas",
      ];
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
            'Aplikasi web sederhana yang dibangun sebagai capstone project menggunakan HTML, CSS, dan JavaScript murni.',
            ${submitted ? "https://github.com/hsi-santri/capstone-demo" : null}, ${status}, ${firstSubmittedAt}, ${submittedAt},
            ${showcase ? days(-2) : null}, ${showcase ? mainTeacherId : null}, ${members[0]}) RETURNING id`;
        for (const memberId of members) await tx`INSERT INTO project_members (project_id, activity_id, student_id) VALUES (${project!.id}, ${challenge!.id}, ${memberId})`;

        const cardDefs: { title: string; status: "todo" | "in_progress" | "review" | "done" }[] = [
          { title: "Rancang wireframe antarmuka", status: "done" },
          { title: "Implementasi struktur HTML & CSS", status: "done" },
          { title: "Implementasi logika JavaScript utama", status: status === "in_progress" ? "in_progress" : "done" },
          { title: "Uji coba pada beberapa perangkat", status: status === "approved" ? "done" : "review" },
          { title: "Tulis dokumentasi & catatan penggunaan", status: status === "approved" ? "done" : "todo" },
        ];
        for (let i = 0; i < cardDefs.length; i++) {
          await tx`INSERT INTO project_tasks (project_id, title, status, position, assignee_id, created_by)
            VALUES (${project!.id}, ${cardDefs[i]!.title}, ${cardDefs[i]!.status}, ${i}, ${pick(members)}, ${members[0]})`;
        }

        if (status === "changes_requested") {
          await tx`INSERT INTO project_reviews (project_id, reviewer_id, decision, feedback)
            VALUES (${project!.id}, ${mainTeacherId}, 'changes_requested', 'Sudah bagus, tetapi mohon perbaiki responsivitas tampilan pada layar kecil dan tambahkan validasi input sebelum diajukan ulang.')`;
        } else if (status === "approved") {
          const score = int(78, 96);
          await tx`INSERT INTO project_reviews (project_id, reviewer_id, decision, score, feedback)
            VALUES (${project!.id}, ${mainTeacherId}, 'approved', ${score}, 'Project selesai dengan baik, fungsional, dan bermanfaat. Selamat!')`;
          for (const memberId of members) {
            await tx`INSERT INTO portfolio_entries (project_id, student_id, reflection)
              VALUES (${project!.id}, ${memberId}, 'Project ini mengajarkan saya cara bekerja sama dalam tim, membagi tugas lewat papan Kanban, dan menyelesaikan aplikasi nyata dari awal hingga direview oleh pembimbing.')`;
          }
          if (showcase) await recordAudit(tx, mainTeacherId, "demo_seed.project_showcased", "projects", project!.id, requestId());
        }
      }
    }
  });

  console.log("Demo data seeded.");
  console.log(`- Academic year: ${DEMO_ACADEMIC_YEAR}, classes: ${CLASS_NAMES.join(", ")}`);
  console.log(`- Teachers: ${TEACHERS.map(t => t.email).join(", ")}`);
  console.log(`- Students: ${STUDENTS.length} accounts (e.g. ${STUDENTS[0]!.email})`);
  console.log(`- Shared demo password: ${DEMO_PASSWORD}`);
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
