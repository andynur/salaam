# Phase 31 — Lesson documents

## Scope decisions

- A lesson stops being a plain-text field and becomes a document: Markdown body, optional
  cover image, in-place editing with autosave, and an optional public page.
- Markdown is one shared implementation (`src/shared/markdown.ts` and
  `src/shared/html-markdown.ts`) used by the SPA and by the server-rendered public page, so
  a document looks the same in both. No Markdown or editor dependency was added; the
  renderer escapes its input and emits a fixed tag set, and clipboard HTML is converted to
  the document's own Markdown before it is inserted.
- Autosave is versioned rather than last-write-wins: every save carries the version the
  editor started from, so a document changed elsewhere refuses the write instead of
  overwriting it.
- A public page is an explicit act by a course manager. It is reachable only through an
  opaque slug, carries no session, no script, and no student data.

## Delivered

- Migration `0026_lesson_documents.sql` with a matching down script: `lessons` gains
  `version`, `updated_at`, `cover_file_id`, `share_slug`, `shared_at`, and `shared_by`, a
  unique slug index, a composite cover foreign key that keeps the image inside its course,
  and a content limit raised from 20000 to 100000 characters.
- `POST /api/learning/courses/:courseId/lessons/:id/document` autosaves `{ content, title,
  version }` and returns the new version; a stale version returns 409 `STALE_DOCUMENT`, and
  a retry of the save that already landed returns the stored document.
- `POST …/lessons/:id/cover` sets or removes a PNG, JPG, or WebP cover (multipart, 10 MB),
  and `GET …/lessons/:id/cover` serves it inline behind the course's own access rules. A
  cover never changes the body or its version.
- `POST …/lessons/:id/share` turns public sharing on or off. `GET /share/lessons/:slug` and
  `GET /share/lessons/:slug/cover` render the document as one standalone HTML page with no
  session, `noindex`, and a `default-src 'none'` policy. Stopping the share breaks the link
  at once, and sharing again issues a new one.
- The SPA edits the document on the page itself: a formatting toolbar, a Markdown source
  view, autosave status, and a paste that arrives already formatted. Text materials and
  lesson bodies render as Markdown for students. The lesson form now covers title, module,
  and order only.
- Document saves are audited as `learning.lessons.document_saved`, coalesced to the first
  save plus one record per five minutes of continuous editing, alongside
  `learning.lessons.cover_set`, `cover_removed`, `shared`, and `unshared`.

## Validation

- Unit tests cover the Markdown renderer's escaping and block/inline subset, link
  filtering, HTML-to-Markdown conversion of a Word/Google Docs style paste, the
  render-and-read-back cycle the editor performs on every save, and the new validators.
- PostgreSQL integration covers autosave and version bumps, 409 on a stale save, the
  idempotent retry, capability and scope failures, audit coalescing, cover upload, replace,
  removal and inline delivery, share issue/stop/reissue, the archived-lesson case, and a
  metadata edit leaving the body and version untouched.
- Browser QA over the DevTools protocol: 35 of 35 checks passed — typing autosaves, a rich
  HTML paste renders in place and is stored as Markdown, cover upload displays, the public
  page loads in a clean browser without a session and dies when sharing stops, students see
  the rendered document but no editor or share control, and no screen scrolls sideways at
  1440, 820, or 390 px.
- Full suite (200 tests) with `TEST_DATABASE_URL`, typecheck, production build, and
  migration replay/rollback all pass.

## Boundaries

- The editor writes Markdown, not arbitrary HTML: anything outside the supported subset is
  dropped on paste. Images inside the body become links; only the cover is an inline image.
- A fenced code block keeps its code but not its language tag through a paste round trip.
- No collaborative editing, no revision history or restore, no comments, and no
  Markdown/PDF export of a document — a public page is the only sharing surface.
- The public page is protected by the secrecy of its slug alone; there is no password,
  expiry, or view count. Draft lessons can be shared, so a manager controls exposure
  through the share toggle rather than publication state.
