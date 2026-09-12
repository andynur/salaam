// Markdown for lesson documents and text materials. One implementation renders on the
// server (the public share page) and in the SPA, so a document always looks the same.
// The renderer escapes first and only emits a fixed tag set, so its output is safe HTML.

const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => entities[character]!);
const decode = (value: string) => value.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) =>
  name === "amp" ? "&" : name === "lt" ? "<" : name === "gt" ? ">" : name === "quot" ? '"' : name === "nbsp" ? " " : "'");

// Only absolute HTTP(S) links survive; everything else renders as plain text.
export function safeUrl(raw: string): string | null {
  const value = decode(raw.trim());
  if (!/^https?:\/\//i.test(value) || /[\s<>"'`]/.test(value)) return null;
  try { const url = new URL(value); return url.username || url.password ? null : value; } catch { return null; }
}

// Rendered code spans and links are parked under this marker so emphasis and escaping
// cannot reach inside them.
const mark = "\u0000";
function inline(text: string): string {
  const held: string[] = [];
  const hold = (html: string) => { held.push(html); return `${mark}${held.length - 1}${mark}`; };
  let out = text.replaceAll(mark, "");
  out = out.replace(/`([^`]+)`/g, (_, code: string) => hold(`<code>${escapeHtml(code)}</code>`));
  // A backslash-escaped character is literal: hold it before links and emphasis run.
  out = out.replace(/\\([\\`*_[\]~#>|-])/g, (_, character: string) => hold(escapeHtml(character)));
  out = out.replace(/\[([^\]\n]*)\]\(([^)\s]+)\)/g, (match: string, label: string, href: string) => {
    const url = safeUrl(href);
    return url ? hold(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(label || url)}</a>`) : match;
  });
  out = escapeHtml(out);
  out = out.replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>").replace(/__([^\n]+?)__/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>");
  out = out.replace(/~~([^\n]+?)~~/g, "<del>$1</del>");
  return out.replace(new RegExp(`${mark}(\\d+)${mark}`, "g"), (_, index: string) => held[Number(index)] ?? "");
}

const listMarker = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const tableDivider = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const cells = (line: string) => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(cell => cell.trim());

/** Renders the Markdown subset the editor produces into sanitized HTML. */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;
  const paragraph: string[] = [];
  function flush() {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join("\n")).replace(/\n/g, "<br />")}</p>`);
    paragraph.length = 0;
  }
  // Lists nest by indentation; every level opens its own ul or ol.
  function list(start: number, depth: number): number {
    let at = start;
    const ordered = /\d/.test(listMarker.exec(lines[at]!)![2]!);
    html.push(ordered ? "<ol>" : "<ul>");
    while (at < lines.length) {
      const current = listMarker.exec(lines[at] ?? "");
      if (!current) break;
      const indent = current[1]!.length;
      if (indent < depth || /\d/.test(current[2]!) !== ordered) break;
      if (indent >= depth + 2) { at = list(at, indent); continue; }
      const parts = [current[3]!];
      at++;
      // A plain continuation line belongs to the item it follows.
      while (at < lines.length && lines[at]!.trim() && !listMarker.test(lines[at]!) && !/^\s*(#{1,6}\s|>|```)/.test(lines[at]!)) parts.push(lines[at++]!.trim());
      const nested = listMarker.exec(lines[at] ?? "");
      html.push(`<li>${inline(parts.join(" "))}`);
      if (nested && nested[1]!.length >= depth + 2) at = list(at, nested[1]!.length);
      html.push("</li>");
    }
    html.push(ordered ? "</ol>" : "</ul>");
    return at;
  }
  while (index < lines.length) {
    const line = lines[index]!;
    if (/^\s*```([a-zA-Z0-9+#-]*)\s*$/.test(line)) {
      flush();
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index]!)) code.push(lines[index++]!);
      index++;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flush(); const level = heading[1]!.length; html.push(`<h${level}>${inline(heading[2]!.trim())}</h${level}>`); index++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); html.push("<hr />"); index++; continue; }
    if (/^\s*>\s?/.test(line)) {
      flush();
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index]!)) quoted.push(lines[index++]!.replace(/^\s*>\s?/, ""));
      html.push(`<blockquote>${renderMarkdown(quoted.join("\n"))}</blockquote>`);
      continue;
    }
    if (line.includes("|") && line.trim() && tableDivider.test(lines[index + 1] ?? "")) {
      flush();
      const header = cells(line);
      index += 2;
      const body: string[][] = [];
      while (index < lines.length && lines[index]!.includes("|") && lines[index]!.trim()) body.push(cells(lines[index++]!));
      html.push(`<table><thead><tr>${header.map(cell => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${
        body.map(row => `<tr>${header.map((_, column) => `<td>${inline(row[column] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (listMarker.test(line)) { flush(); index = list(index, listMarker.exec(line)![1]!.length); continue; }
    if (!line.trim()) { flush(); index++; continue; }
    paragraph.push(line.trim());
    index++;
  }
  flush();
  return html.join("");
}

/** A one-line excerpt, for outlines and the share page description. */
export function markdownExcerpt(source: string, max = 200): string {
  const text = source.replace(/```[\s\S]*?```/g, " ").replace(/\[([^\]\n]*)\]\([^)\s]+\)/g, "$1")
    .replace(/[#>*_~`|]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
