import { expect, test } from "bun:test";
import { markdownExcerpt, renderMarkdown, safeUrl } from "../src/shared/markdown";
import { htmlToMarkdown } from "../src/shared/html-markdown";

test("renderMarkdown escapes everything it does not own", () => {
  expect(renderMarkdown("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  expect(renderMarkdown('<img src=x onerror="alert(1)">')).not.toContain("<img");
  expect(renderMarkdown("Teks & 'kutip' \"ganda\"")).toBe("<p>Teks &amp; &#39;kutip&#39; &quot;ganda&quot;</p>");
  // Only absolute HTTP(S) links become anchors; anything else stays literal text.
  expect(renderMarkdown("[x](javascript:alert(1))")).toBe("<p>[x](javascript:alert(1))</p>");
  for (const href of ["data:text/html,hi", "//example.org", "https://user:secret@example.org", "ftp://example.org"]) {
    expect(renderMarkdown(`[x](${href})`)).not.toContain("<a ");
  }
  const link = renderMarkdown("[SALAAM](https://example.org/a?b=1&c=2)");
  expect(link).toBe('<p><a href="https://example.org/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">SALAAM</a></p>');
  expect(safeUrl(" https://example.org ")).toBe("https://example.org");
  expect(safeUrl("https://exa mple.org")).toBeNull();
});

test("renderMarkdown covers the block and inline subset the editor produces", () => {
  expect(renderMarkdown("# Satu\n## Dua")).toBe("<h1>Satu</h1><h2>Dua</h2>");
  expect(renderMarkdown("**tebal** *miring* ~~coret~~ `kode`"))
    .toBe("<p><strong>tebal</strong> <em>miring</em> <del>coret</del> <code>kode</code></p>");
  expect(renderMarkdown("- satu\n- dua\n  - dalam")).toBe("<ul><li>satu</li><li>dua<ul><li>dalam</li></ul></li></ul>");
  expect(renderMarkdown("1. satu\n2. dua")).toBe("<ol><li>satu</li><li>dua</li></ol>");
  expect(renderMarkdown("> kutipan")).toBe("<blockquote><p>kutipan</p></blockquote>");
  expect(renderMarkdown("---")).toBe("<hr />");
  expect(renderMarkdown("```\nconst a = 1 < 2;\n```")).toBe("<pre><code>const a = 1 &lt; 2;</code></pre>");
  expect(renderMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |"))
    .toBe("<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>");
  // Emphasis markers inside code and escaped markers stay literal.
  expect(renderMarkdown("`a * b`")).toBe("<p><code>a * b</code></p>");
  expect(renderMarkdown("2 \\* 3 \\* 4")).toBe("<p>2 * 3 * 4</p>");
  expect(renderMarkdown("baris satu\nbaris dua")).toBe("<p>baris satu<br />baris dua</p>");
  expect(renderMarkdown("")).toBe("");
});

test("htmlToMarkdown converts a pasted document, dropping styles, scripts and markup", () => {
  const pasted = `<meta charset="utf-8"><b style="font-weight:normal" id="docs-internal-guid-x">` +
    `<h2>Bab 2</h2><p>Teks <span style="font-weight:700">tebal</span> dan <span style="font-style:italic">miring</span>.</p>` +
    `<ul><li>satu<ul><li>dalam</li></ul></li><li>dua</li></ul><ol><li>langkah</li></ol>` +
    `<blockquote>catatan</blockquote><pre>kode &lt; 2</pre><hr />` +
    `<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>` +
    `<style>p{color:red}</style><script>alert(1)</script>` +
    `<p><a href="https://x.test/a?b=1&amp;c=2">tautan</a> dan <a href="javascript:alert(1)">jahat</a></p></b>`;
  expect(htmlToMarkdown(pasted)).toBe([
    "## Bab 2",
    "Teks **tebal** dan *miring*.",
    "- satu\n  - dalam\n- dua",
    "1. langkah",
    "> catatan",
    "```\nkode < 2\n```",
    "---",
    "| A | B |\n| --- | --- |\n| 1 | 2 |",
    "[tautan](https://x.test/a?b=1&c=2) dan jahat",
  ].join("\n\n"));
  expect(htmlToMarkdown("<p>lihat <img src='https://x.test/a.png' alt='bagan'></p>")).toBe("lihat [bagan](https://x.test/a.png)");
  expect(htmlToMarkdown("<div>satu<br>dua</div>")).toBe("satu\ndua");
  // Markup characters that were plain text in the source stay plain text after a round trip.
  expect(htmlToMarkdown("<p>bintang * dan _garis_</p>")).toBe("bintang \\* dan \\_garis\\_");
  expect(renderMarkdown(htmlToMarkdown("<p>bintang * dan _garis_</p>"))).toBe("<p>bintang * dan _garis_</p>");
  expect(htmlToMarkdown("<p>belum <b>ditutup")).toBe("belum **ditutup**");
  expect(htmlToMarkdown("")).toBe("");
});

test("a document survives the render and read-back cycle the editor performs on every save", () => {
  const document = ["# Judul", "Paragraf **tebal** dengan [tautan](https://example.org/a).",
    "## Bagian", "- satu\n- dua\n  - dalam", "1. langkah\n2. langkah", "> kutipan", "```\nconst a = 1 < 2;\n```",
    "| a | b |\n| --- | --- |\n| 1 | 2 |", "---"].join("\n\n");
  const once = htmlToMarkdown(renderMarkdown(document));
  expect(once).toBe(document);
  // Stable under repetition: autosave reads the surface back again and again.
  expect(htmlToMarkdown(renderMarkdown(once))).toBe(once);
});

test("markdownExcerpt flattens a document into one bounded line", () => {
  expect(markdownExcerpt("# Judul\n\nIsi **tebal** dan [tautan](https://x.test).")).toBe("Judul Isi tebal dan tautan.");
  expect(markdownExcerpt("a".repeat(300), 20)).toHaveLength(20);
  expect(markdownExcerpt("```\nkode\n```\n\nsisanya")).toBe("sisanya");
});
