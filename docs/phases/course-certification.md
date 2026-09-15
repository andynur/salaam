# Course certification

## Scope decisions

The course detail now has a **Sertifikasi** tab. The requested certificate uses a dark
header, white HSI Boarding School logo, centered student and course names, and a blank
signature area above the assigned teachers' names. All assigned users with
`learning.manage` contribute their names; assistants are not listed as signing teachers.

- No schema, capability, dependency, or runtime service is added.
- Students view and download only their own certificate. Course managers and assigned
  assistants may select enrolled students through a searchable, paginated picker.
- Progress is `floor(100 * (completed lessons + completed activities) / (visible lessons +
  visible activities))`. Materials follow their parent lesson's completion mark.
- Only published, unarchived lessons/modules/activities count. Empty courses stay at 0%.
- Assignments count when submitted and not returned; quizzes/exams count after submission;
  surveys count after response; challenges count when submitted or approved, excluding
  projects returned for changes. No passing-score or teacher-grading threshold is added.
- Generation requires exact completion, a published course, and unarchived academic
  parents. Later changes to content, enrollment, or submissions are rechecked on download.
- Existing learning progress reports retain their historical submission semantics; only
  certification excludes returned work. The certification tab shows its own progress bar.
- This is an on-demand completion document, not a permanent award registry. The date is
  the generation date in WIB; names/content reflect the current snapshot. There is no
  public verification URL, certificate number, signature upload, or stored PDF.

## API and rendering

All paths are under `/api/learning/courses/:courseId` and require a session:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/certifications?q=&offset=` | Scoped student progress, 50 rows plus next offset |
| GET | `/certifications/:studentId` | Current eligibility, student/course data, teacher names |
| POST | `/certifications/:studentId/generate` | Rechecked eligible data, or `409 CERTIFICATION_LOCKED` |

The service uses `courseAccess`, enrollment-scoped progress queries, and a repeatable-read
snapshot. Generation takes a shared course lock and writes
`learning.certification.generated` with the recipient user as resource, the requesting
actor, and request ID. Audit failure prevents a successful generation response.

The browser renders a 1684 × 1190 canvas using local brand assets and colors. The locked
preview is grayscale with an opaque lock message; the download button is disabled.
An eligible download fetches fresh authorized data, rasterizes it to JPEG, then embeds
that image in a single landscape A4 PDF. PDF object offsets count bytes; no HTML-to-PDF
runtime is needed. Generation is guarded against double clicks and supports error retry.

## Validation (2026-09-15)

- Targeted unit/integration suites: **19 passed, 0 failed, 390 assertions**. Includes
  role/course/student isolation, invalid IDs, 50% and 100%, returned submissions,
  unpublished courses, unauthenticated access, audit failure, and PDF binary offsets.
- Full PostgreSQL suite: **254 passed, 0 failed, 3657 assertions**. The subsequent added
  certificate audit-failure assertion passed in the targeted suite above.
- Without database: **124 passed, 156 skipped, 0 failed, 1418 assertions**.
- `bun run typecheck` passed; `bun run build` produced 16 assets.
- Disposable QA database migration passed; no application database schema change required.
- Headless Chrome: **26/26 checks passed**, including locked 50%, unlocked 100%, four
  roles, student-picker visibility, and no horizontal overflow or alerts at 1440/820/390.
- Actual browser download inspected with `pdfinfo` and rendered with Poppler: one A4
  landscape page, readable white logo, names and blank signature area. Desktop, phone,
  locked preview, and PDF render were visually inspected.

## Limits

A downloaded image PDF has no cryptographic signature or server verification registry.
Access and progress checks govern application generation; an already downloaded document
is not revoked when course data changes. Production deployment is outside this change.
