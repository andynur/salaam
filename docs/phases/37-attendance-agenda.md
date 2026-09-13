# Phase 37 — Attendance agenda

Validated locally on 2026-09-13 with Bun 1.4.2 and PostgreSQL 17. The product owner found
the counters on the Kehadiran landing page unhelpful and asked for a better flow. Teachers
open Kehadiran to take attendance for the session that is running now. Before this phase
that took three to four clicks: pick a course, find the session, open it, then mark.

## Workflow

1. **Kehadiran** (`/attendance`) opens with **Agenda hari ini**: every session in the
   viewer's scope that starts today in the school timezone, plus any session that is still
   open from an earlier day. Open sessions come first, then the rest by start time.
2. A teacher sees roster progress ("12/30 dicatat") on each session. The session carries
   one primary action:
   - **Catat kehadiran** while the session is open.
   - **Buka sesi** once it starts within 30 minutes or is already late.
   - **Lihat rekap** after it closes.
3. A santri sees their own status. While QR check-in is open and they have no record, the
   primary action is **Absen QR**, which opens the check-in tab directly.
4. Late situations are called out: a session whose start time has passed but was not
   opened, and an open session running past its end time.
5. The course catalog stays below the agenda. Each tile shows its live session, its next
   session ("Besok, 08.00"), or "Belum ada jadwal". The Kehadiran counters are gone; the
   catalog counters remain only on Pembelajaran.
6. The session screen accepts `?tab=checkin|manage|history`. Switching tabs rewrites the
   URL, so a reload keeps the tab. Santri asking for a manager tab land on their attendance.

## Scope decisions

- **One read-only endpoint instead of client fan-out.** The agenda needs sessions across
  courses, and there was only a per-course list. Calling that list once per course would
  cost one request per course, so a single scoped query replaces it.
- **Same scope as the existing screens.** Managers see sessions of courses they manage
  (teaching assignment or `learning.manage.all`). Santri see sessions only in published
  courses of an active class they belong to, and only when they are on the session roster.
  No capability is added; `learning.view` is required.
- **The database clock and school timezone decide "today".** The response carries `now`, so
  relative times ("Mulai 20 menit lagi") follow the server clock even on a device with a
  wrong clock.
- **Polling, not a new socket.** The agenda refreshes every 60 seconds while the tab is
  visible and when it becomes visible again. The classroom WebSocket stays per session.
- **Shortcuts link; they do not mutate.** "Buka sesi" opens the manage tab, where the
  existing version-checked transition runs. The list performs no writes.

## API

- `GET /api/attendance/agenda` → `{ now, sessions, hasMore, courses }`.
  - `sessions`: up to 50 `{ id, courseId, courseName, className, title, startsAt, endsAt,
    status, canManage, total, recorded, myStatus, checkinOpen }`. `hasMore` is true when
    more sessions exist.
    - `total` and `recorded` are set for managers only.
    - `myStatus` is set for santri only: the latest record in the correction chain.
    - Cancelled sessions from today stay listed.
  - `courses`: one `{ courseId, courseName, sessionId, title, startsAt, endsAt, status }`
    per course in scope. It points to the open session, otherwise to the next scheduled
    session that has not ended.
  - The endpoint runs in one `REPEATABLE READ READ ONLY` transaction. It returns 401
    without a session, 403 without `learning.view`, and 405 for other methods.

## Tests

`tests/attendance.integration.test.ts` › "agenda lists today's and still-open sessions in
scope with role-specific progress" covers:

- Today's and still-open sessions are listed; tomorrow's sessions and earlier closed or
  cancelled sessions are not.
- Open sessions are ordered first.
- Managers get progress counts; santri get their own status.
- Sessions stay out of scope for a santri in another class, a teacher without the course, a
  santri removed from the roster, and every santri once the course is unpublished.
- The course pointer switches from the open session to the next scheduled one.
- The endpoint answers 405 and 401.

## Asisten Mentor and documentation

Migrations `0034_assistant_mentors_attendance_documentation.sql` and
`0035_assistant_mentor_workspace_access.sql` add the **Asisten Mentor** role. An asmen receives
`learning.view`, `learning.assist`, and `attendance.manage`, but not `learning.manage`: they can
view only assigned courses, mark attendance in an open session, upload PNG/JPG/WebP session
documentation (up to 10 MB), and open scoped dashboard, calendar, reports, projects, and growth
workspaces. They cannot create or manage sessions, modify roster or QR, author learning content,
grade, archive, or delete. Documentation is stored through `stored_files`, listed in the session
attendance screen, and served only to scoped teachers/asmen.
