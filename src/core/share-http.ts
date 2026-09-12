import type { SQL } from "bun";
import { HttpError } from "./errors";
import { fileResponse } from "./storage/files";
import { sharedLesson, sharedLessonCover } from "../modules/learning/documents";
import { escapeHtml, markdownExcerpt, renderMarkdown } from "../shared/markdown";
import { BRAND, brandTitle } from "../web/lib/brand";
import type { SharedLesson } from "../shared/learning";

// A shared lesson is served as one standalone document: no session, no script, and no
// SPA. Only the slug grants access, so nothing about the course or its students is
// exposed beyond the document the teacher chose to publish.
const styles = `
:root { color-scheme: light; --ink: #172b4d; --muted: #626f86; --line: #dfe1e6; --blue: #1d5fd1; --navy: #0b1f3a; --surface: #ffffff; --sunken: #f7f8f9; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--sunken); color: var(--ink); font: 16px/1.7 "Inter", ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif; }
header.share-top { background: var(--navy); color: #fff; padding: 12px 20px; font-size: 14px; font-weight: 600; letter-spacing: .04em; }
main { max-width: 820px; margin: 0 auto; padding: 0 20px 64px; }
.share-paper { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; margin-top: 24px; overflow: hidden; }
.share-cover { display: block; width: 100%; max-height: 320px; object-fit: cover; }
.share-body { padding: 32px; }
.share-body h1 { font-size: 30px; line-height: 1.25; margin: 0 0 8px; }
.share-meta { color: var(--muted); font-size: 13px; margin: 0 0 24px; }
.share-doc > :first-child { margin-top: 0; }
.share-doc h1, .share-doc h2, .share-doc h3, .share-doc h4, .share-doc h5, .share-doc h6 { line-height: 1.3; margin: 28px 0 8px; }
.share-doc h1 { font-size: 26px; } .share-doc h2 { font-size: 22px; } .share-doc h3 { font-size: 18px; }
.share-doc h4, .share-doc h5, .share-doc h6 { font-size: 16px; }
.share-doc p, .share-doc ul, .share-doc ol, .share-doc table, .share-doc pre, .share-doc blockquote { margin: 0 0 16px; }
.share-doc ul, .share-doc ol { padding-left: 24px; }
.share-doc li { margin: 4px 0; }
.share-doc a { color: var(--blue); }
.share-doc code { background: var(--sunken); border: 1px solid var(--line); border-radius: 3px; padding: 1px 4px; font-size: 14px; }
.share-doc pre { background: var(--sunken); border: 1px solid var(--line); border-radius: 6px; padding: 16px; overflow-x: auto; }
.share-doc pre code { background: none; border: 0; padding: 0; }
.share-doc blockquote { border-left: 3px solid var(--line); color: var(--muted); margin-left: 0; padding: 2px 0 2px 16px; }
.share-doc hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
.share-doc table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; }
.share-doc th, .share-doc td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; font-size: 14px; }
.share-doc th { background: var(--sunken); }
.share-foot { color: var(--muted); font-size: 13px; text-align: center; padding: 24px 0 0; }
@media (max-width: 600px) { .share-body { padding: 20px; } .share-body h1 { font-size: 24px; } }
`;

function page(lesson: SharedLesson, slug: string, timezone: string) {
  const when = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: timezone }).format(new Date(lesson.updatedAt));
  const title = escapeHtml(brandTitle(lesson.title));
  const description = escapeHtml(markdownExcerpt(lesson.content, 160));
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:title" content="${escapeHtml(lesson.title)}" />
<meta property="og:description" content="${description}" />
<style>${styles}</style>
</head>
<body>
<header class="share-top">${escapeHtml(BRAND.name)} · ${escapeHtml(BRAND.organization)}</header>
<main>
  <article class="share-paper">
    ${lesson.cover ? `<img class="share-cover" src="/share/lessons/${encodeURIComponent(slug)}/cover" alt="Sampul ${escapeHtml(lesson.title)}" />` : ""}
    <div class="share-body">
      <h1>${escapeHtml(lesson.title)}</h1>
      <p class="share-meta">${escapeHtml(lesson.courseName)} · ${escapeHtml(lesson.className)} · ${escapeHtml(lesson.term)} ${escapeHtml(lesson.year)} · Diperbarui ${escapeHtml(when)}</p>
      <div class="share-doc">${renderMarkdown(lesson.content)}</div>
    </div>
  </article>
  <p class="share-foot">Halaman publik ${escapeHtml(BRAND.name)}. Tautan dapat dihentikan sewaktu-waktu oleh guru pengampu.</p>
</main>
</body>
</html>`;
}

const slugPattern = /^[A-Za-z0-9_-]{22}$/;
export function createShareHandler(db: SQL, storageRoot: string, timezone: string) {
  return async (request: Request): Promise<Response> => {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    const [, resource, slug, action] = parts;
    if (resource !== "lessons" || !slug || !slugPattern.test(slug) || parts.length > 4 || (parts.length === 4 && action !== "cover")) {
      throw new HttpError(404, "NOT_FOUND", "Halaman publik tidak ditemukan.");
    }
    if (action === "cover") return fileResponse(storageRoot, await sharedLessonCover(db, slug), "inline");
    const lesson = await sharedLesson(db, slug);
    return new Response(page(lesson, slug, timezone), { headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The page carries its own styles and no script at all.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    } });
  };
}
export type ShareHandler = ReturnType<typeof createShareHandler>;
