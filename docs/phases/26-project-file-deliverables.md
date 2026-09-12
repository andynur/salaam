# Phase 26 — Project file deliverables

## Scope decisions

- A project may use one private uploaded deliverable or one external HTTP(S) link; the two
  choices are mutually exclusive.
- Uploads reuse the existing allowlist, byte-signature checks, 10 MB bound, generated storage
  paths, and attachment-only download response.
- Project members and scoped managers can read the file; only editable project members and
  managers can replace it. Submitted and approved projects remain locked.

## Delivered

- Migration `0023_project_file_deliverables.sql` adds a course-scoped foreign key from projects
  to `stored_files`, with a matching down script.
- Project updates accept the existing multipart upload format and preserve transactional file
  cleanup when database or storage work fails.
- Project detail exposes file metadata and `/api/projects/:projectId/file` serves an authorized
  attachment only.
- The project overview offers the upload control while retaining the existing external-link
  option.

## Validation

- Typecheck and production build pass.
- PostgreSQL integration covers upload, metadata, private download, outsider denial, and
  migration rollback; the project suite passed 6 tests with 105 assertions.

## Boundaries

- task-level attachments, multiple deliverables, previews, malware scanning, and external
  delivery providers remain deferred
- old file rows are retained for backup/history safety; a cleanup/retention policy remains an
  operations decision
