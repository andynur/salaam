// HTML to Markdown, for two jobs: turning a paste from Word, Google Docs, or a web page
// into the document's own Markdown, and reading the editor surface back after every edit.
// It parses with a small tokenizer instead of a DOM so the server and the tests run it too.

interface Element { name: string; attributes: Record<string, string>; children: Node[] }
type Node = Element | { text: string };
const isElement = (node: Node): node is Element => "name" in node;

const voids = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const dropped = new Set(["script", "style", "head", "title", "meta", "link", "noscript", "svg", "iframe", "object", "form", "button", "input", "select", "textarea"]);
// Opening one of these implicitly closes an open sibling of the same kind. The search for
// that sibling stops at a container, so a list inside an item keeps the item open.
const closes: Record<string, string[]> = { li: ["li"], p: ["p"], td: ["td", "th"], th: ["td", "th"], tr: ["td", "th", "tr"], dt: ["dt", "dd"], dd: ["dt", "dd"] };
const containers = new Set(["ul", "ol", "table", "thead", "tbody", "tfoot", "blockquote", "pre", "div", "section", "article", "dl", "figure"]);
const blocks = new Set(["address", "article", "aside", "blockquote", "div", "dl", "dd", "dt", "fieldset", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"]);

const entityNames: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", middot: "·", bull: "•" };
function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return entityNames[body.toLowerCase()] ?? match;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
    const value = match[2] ?? "";
    attributes[match[1]!.toLowerCase()] = decodeEntities(value.replace(/^["']|["']$/g, ""));
  }
  return attributes;
}

/** Builds a forgiving element tree; unknown and unbalanced tags never throw. */
function parse(html: string): Element {
  const root: Element = { name: "#root", attributes: {}, children: [] };
  const stack: Element[] = [root];
  const top = () => stack[stack.length - 1]!;
  let at = 0;
  while (at < html.length) {
    const next = html.indexOf("<", at);
    if (next === -1) { const text = html.slice(at); if (text) top().children.push({ text: decodeEntities(text) }); break; }
    if (next > at) top().children.push({ text: decodeEntities(html.slice(at, next)) });
    if (html.startsWith("<!--", next)) { const end = html.indexOf("-->", next); at = end === -1 ? html.length : end + 3; continue; }
    if (html.startsWith("<!", next) || html.startsWith("<?", next)) { const end = html.indexOf(">", next); at = end === -1 ? html.length : end + 1; continue; }
    const end = html.indexOf(">", next);
    if (end === -1) { at = html.length; break; }
    const raw = html.slice(next + 1, end).trim();
    at = end + 1;
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim().toLowerCase();
      const depth = stack.findLastIndex(element => element.name === name);
      if (depth > 0) stack.length = depth;
      continue;
    }
    const name = (raw.match(/^[a-zA-Z][-a-zA-Z0-9:]*/)?.[0] ?? "").toLowerCase();
    if (!name) continue;
    const attributes = parseAttributes(raw.slice(name.length).replace(/\/$/, ""));
    if (dropped.has(name)) {
      // Skip the element's whole subtree, styles and scripts included.
      const closing = html.toLowerCase().indexOf(`</${name}`, at);
      if (!voids.has(name)) at = closing === -1 ? html.length : (html.indexOf(">", closing) + 1 || html.length);
      continue;
    }
    const implicit = closes[name];
    if (implicit) {
      for (let depth = stack.length - 1; depth > 0; depth--) {
        const open = stack[depth]!.name;
        if (implicit.includes(open)) { stack.length = depth; break; }
        if (containers.has(open)) break;
      }
    }
    const element: Element = { name, attributes, children: [] };
    top().children.push(element);
    if (!voids.has(name) && !raw.endsWith("/")) stack.push(element);
  }
  return root;
}

const bolded = (element: Element) => /font-weight\s*:\s*(bold|[6-9]00)/i.test(element.attributes.style ?? "");
const italicized = (element: Element) => /font-style\s*:\s*italic/i.test(element.attributes.style ?? "");
// Google Docs wraps a whole paste in <b style="font-weight:normal">.
const neutralized = (element: Element) => /font-weight\s*:\s*(normal|[1-5]00)/i.test(element.attributes.style ?? "");

const escapeMarkdown = (value: string) => value.replace(/([\\`*_[\]])/g, "\\$1");
const collapse = (value: string) => value.replace(/[\t\f\r ]+/g, " ").replace(/\n+/g, " ");

function inlineOf(nodes: Node[]): string {
  let out = "";
  for (const node of nodes) {
    if (!isElement(node)) { out += escapeMarkdown(collapse(node.text)); continue; }
    const inner = () => inlineOf(node.children);
    switch (node.name) {
      case "br": out += "\n"; break;
      case "strong": case "b": out += neutralized(node) ? inner() : wrap(inner(), "**"); break;
      case "em": case "i": out += wrap(inner(), "*"); break;
      case "del": case "s": case "strike": out += wrap(inner(), "~~"); break;
      case "code": case "kbd": case "samp": case "tt": { const text = inner().replace(/\\([\\`*_[\]])/g, "$1"); out += text.trim() ? `\`${text}\`` : text; break; }
      case "a": { const href = (node.attributes.href ?? "").trim(); const label = inner().trim(); out += /^https?:\/\//i.test(href) && label ? `[${label}](${href})` : label; break; }
      case "img": { const source = (node.attributes.src ?? "").trim(); const alt = (node.attributes.alt ?? "").trim(); out += /^https?:\/\//i.test(source) ? `[${escapeMarkdown(alt) || "gambar"}](${source})` : escapeMarkdown(alt); break; }
      case "span": case "font": out += bolded(node) ? wrap(inner(), "**") : italicized(node) ? wrap(inner(), "*") : inner(); break;
      default: out += inner();
    }
  }
  return out;
}
// Emphasis cannot span its own padding, so surrounding spaces move outside the markers.
function wrap(text: string, marker: string) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  return `${text.startsWith(" ") ? " " : ""}${marker}${trimmed}${marker}${text.endsWith(" ") ? " " : ""}`;
}

const wrapsBlocks = (element: Element): boolean => element.children.some(child => isElement(child) && (blocks.has(child.name) || wrapsBlocks(child)));

function blockOf(nodes: Node[], depth: number, out: string[]) {
  // Loose text between blocks still becomes a paragraph.
  let inlineRun: Node[] = [];
  const flush = () => {
    const text = inlineOf(inlineRun).trim();
    inlineRun = [];
    if (text) out.push(text);
  };
  for (const node of nodes) {
    if (!isElement(node) || !(blocks.has(node.name) || wrapsBlocks(node))) { inlineRun.push(node); continue; }
    flush();
    // An inline wrapper around blocks — Google Docs pastes one — is not itself a block.
    if (!blocks.has(node.name)) { blockOf(node.children, depth, out); continue; }
    switch (node.name) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        const text = inlineOf(node.children).replace(/\n+/g, " ").trim();
        if (text) out.push(`${"#".repeat(Number(node.name[1]))} ${text}`);
        break;
      }
      case "hr": out.push("---"); break;
      case "pre": {
        const text = textOf(node).replace(/\n+$/, "");
        out.push(`\`\`\`\n${text}\n\`\`\``);
        break;
      }
      case "blockquote": {
        const inner: string[] = [];
        blockOf(node.children, depth, inner);
        out.push(inner.join("\n\n").split("\n").map(line => `> ${line}`.trimEnd()).join("\n"));
        break;
      }
      case "ul": case "ol": out.push(listOf(node, depth)); break;
      case "table": out.push(tableOf(node)); break;
      case "li": case "td": case "th": case "tr": case "thead": case "tbody": case "tfoot": blockOf(node.children, depth, out); break;
      default: blockOf(node.children, depth, out);
    }
  }
  flush();
}

function textOf(node: Node): string {
  if (!isElement(node)) return node.text;
  if (node.name === "br") return "\n";
  return node.children.map(textOf).join("");
}

function listOf(list: Element, depth: number): string {
  const ordered = list.name === "ol";
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  let number = Number(list.attributes.start ?? 1) || 1;
  for (const item of list.children) {
    if (!isElement(item) || item.name !== "li") continue;
    const nested = item.children.filter(child => isElement(child) && (child.name === "ul" || child.name === "ol")) as Element[];
    const own = item.children.filter(child => !nested.includes(child as Element));
    const body: string[] = [];
    blockOf(own, depth + 1, body);
    const text = body.join(" ").replace(/\n+/g, " ").trim();
    lines.push(`${pad}${ordered ? `${number++}.` : "-"} ${text}`.trimEnd());
    for (const child of nested) lines.push(listOf(child, depth + 1));
  }
  return lines.join("\n");
}

function tableOf(table: Element): string {
  const rows: string[][] = [];
  const collect = (node: Element) => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      if (child.name === "tr") rows.push(child.children.filter(cell => isElement(cell) && (cell.name === "td" || cell.name === "th")).map(cell => inlineOf((cell as Element).children).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim()));
      else collect(child);
    }
  };
  collect(table);
  const width = Math.max(0, ...rows.map(row => row.length));
  if (!width || !rows.length) return "";
  const line = (row: string[]) => `| ${Array.from({ length: width }, (_, index) => row[index] ?? "").join(" | ")} |`;
  return [line(rows[0]!), `| ${Array.from({ length: width }, () => "---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

/** Converts an HTML fragment — a clipboard payload or the editor surface — to Markdown. */
export function htmlToMarkdown(html: string): string {
  const blocksOut: string[] = [];
  blockOf(parse(html).children, 0, blocksOut);
  return blocksOut.map(block => block.replace(/[ \t]+$/gm, "")).filter(block => block.trim()).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}
