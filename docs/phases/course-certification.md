# Course certification

## Scope decisions

The course detail has a **Sertifikasi** tab. The certificate uses a centered dark header,
white HSI Boarding School logo, centered student and course names, geometric background,
QR verification, and a teacher signature area. All assigned users with
`learning.manage` contribute their names; assistants are not listed as signing teachers.

- Migration `0037_course_certificates.sql` with a matching down script stores one immutable
  issuance snapshot per course/student. No capability, dependency, or runtime service is added.
- Students view and download only their own certificate. Course managers and assigned
  assistants may select enrolled students through a searchable, paginated picker.
- Progress is `floor(100 * (completed lessons + completed activities) / (visible lessons +
  visible activities))`. Materials follow their parent lesson's completion mark.
- Only published, unarchived lessons/modules/activities count. Empty courses stay at 0%.
- Assignments count when submitted and not returned; quizzes/exams count after submission;
  surveys count after response; challenges count when submitted or approved, excluding
  projects returned for changes. No passing-score or teacher-grading threshold is added.
- Generation requires exact completion, a published course, and unarchived academic
  parents. Later content/submission changes are rechecked before another download; the
  already issued public verification snapshot remains available.
- Existing learning progress reports retain their historical submission semantics; only
  certification excludes returned work. The certification tab shows its own progress bar.
- First generation fixes the issue date and printed identity snapshot. Its opaque public
  URL is encoded as a QR and shown as a clickable/copyable link. There is no public index,
  certificate number, signature upload, stored PDF, or revocation control.

## API and rendering

All paths are under `/api/learning/courses/:courseId` and require a session:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/certifications?q=&offset=` | Scoped student progress, 50 rows plus next offset |
| GET | `/certifications/:studentId` | Current eligibility, student/course data, teacher names |
| POST | `/certifications/:studentId/generate` | Issue once, then return rechecked downloadable data or `409 CERTIFICATION_LOCKED` |
| GET | `/share/certificates/:slug` | Script-free public verification page; no session |

The service uses `courseAccess` and enrollment-scoped progress queries. Read requests use a
repeatable-read snapshot. Generation takes a shared course lock and a transaction advisory
lock per course/student, then writes
`learning.certification.generated` with the recipient user as resource, the requesting
actor, and request ID. First issuance also writes `learning.certification.issued` and stores
the immutable snapshot in the same transaction. Audit failure prevents a successful response.

The browser renders a 1684 × 1190 canvas using local brand assets, monospace typography,
an isometric line pattern, a centered header, QR, signature line, and school seal. The
locked preview keeps complete data visible in grayscale and disables issuance. Eligible
previews display a labeled sample signature; the downloaded PDF leaves the line blank.
An eligible download fetches fresh authorized data, rasterizes it to JPEG, then embeds
that image in a single landscape A4 PDF. PDF object offsets count bytes; no HTML-to-PDF
runtime is needed. The local version 5-L QR encoder accepts verification URLs up to 106
UTF-8 bytes. Generation is guarded against double clicks and supports error retry.

## Validation (2026-09-15)

- Targeted QR, learning, and migration suites: **30 passed, 0 failed, 810 assertions**.
  This includes role/course/student isolation, concurrent issuance by four roles, one
  immutable snapshot, public-route method and missing-slug handling, QR error correction,
  returned work, unpublished courses, audit rollback, migration replay/rollback, and PDF
  binary offsets.
- Full PostgreSQL suite: **255 passed, 0 failed, 3684 assertions**.
- Without database: **125 passed, 156 skipped, 0 failed, 1423 assertions**.
- `bun run typecheck` passed; `bun run build` produced 16 assets.
- Migration `0037` replay/rollback passed in an isolated schema, then applied to the local
  application database; a second migration run reported it up to date.
- Headless Chrome public-certificate smoke: **13/13 checks passed**, including locked 50%,
  unlocked 100%, issuance controls, unauthenticated verification, QR decoding to the exact
  public URL, and no horizontal overflow or alerts at 1440/820/390.
- Actual browser download inspected with `pdfinfo` and rendered with Poppler: one A4
  landscape page, readable white logo, centered names, clipped background pattern, QR,
  public URL, and blank signature area. Desktop, phone, locked preview, public page, and PDF
  render were visually inspected.

## Limits

A downloaded image PDF has no cryptographic signature. The public snapshot is verifiable
through possession of its opaque URL and cannot currently be revoked. Access and progress
checks govern application generation; an already issued certificate is not withdrawn when
course data changes. Production deployment is outside this change.
