# Phase 21 — Question bank import and export

## Scope decisions

Teachers exchange question banks through a bounded CSV format with the columns
`type,prompt,options,correct,explanation`. Options and correct option IDs are separated by
`|`; standard CSV quoting handles commas and line breaks inside a field. An import accepts
1–100 questions and a payload up to 512 KiB.

## Delivered behavior

The teacher can import a complete CSV atomically or export the current course bank as CSV.
Import validates every row with the same question rules as manual authoring before creating
any row. A client `requestKey` and SHA-256 payload hash make an identical retry return the
same import and question IDs; reusing the key with different content returns a conflict.
The source CSV is not retained. Imported questions receive the same course scope, archive,
and attempt-lock behavior as manually authored questions. Export is manager-only and can
include archived questions explicitly.

## Verification

Migration `0019_question_imports.sql` has a matching down script. Unit tests cover CSV
quoting, required headers, row bounds, and identifiers. PostgreSQL integration tests cover
atomic import, idempotent retry, changed-payload conflict, CSV export, audit, migration
rollback, and course scope. Typecheck, build, and focused integration tests passed.

## Out of scope

Question pools, random selection rules, statistics, spreadsheet-specific formats, images or
file attachments in CSV, bulk editing of existing questions, and automatic import mapping
remain deferred.
