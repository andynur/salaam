# Phase 33 — Club mentoring groups and learning tracks

Extends the Club workspace of [Phase 32](32-club-management.md) with the two structures
Coders Club actually runs: small mentoring circles, and the two learning tracks the club
splits its members across.

## Scope decisions

- **A group is a roster, not an engine.** A mentoring group holds one mentor, a topic, a
  level, a capacity, a schedule note, and its santri. Progress is still read from XP,
  lessons, and projects; no aggregate is stored, and no group-owned attendance, assignment,
  or curriculum table was added.
- **Mentoring is a label, never a capability.** A group's mentor may be a teacher who
  mentors the club or a senior santri guiding juniors — that is the point of the small
  circles. It changes nothing in the authorization model: every group and track write goes
  through `club.manage`, so a santri named as mentor still reads only. No new capability was
  added.
- **Tracks are per-club, seeded for Coders Club only.** `club_tracks` is a general table;
  migration `0031` seeds `Olympiad Track` (OSN Informatika and competitive programming) and
  `Product Track` (web development and software projects) for `coders-club`. Another club
  can adopt tracks later without a schema change, and a club with no track simply never
  shows the section.
- **One active group per santri per club**, enforced by a partial unique index. A santri may
  still mentor a different group while being a member of another — the "Student Mentor"
  pattern of the club's own concept, where kelas XI guides kelas X on HTML and CSS while
  being guided by a teacher on harder material.
- **Capacity is a per-group number** (2–20, default 8), not a global rule, because a circle
  of 7–8 is a guideline rather than an invariant. Filling one answers 409 `GROUP_FULL`
  rather than silently over-filling.
- Archive, not delete: an archived group leaves the tab but keeps its membership rows, the
  way an archived club does.

## Delivered

- Migration `0031_club_mentoring_groups.sql` with a matching down script: `club_tracks`,
  `club_groups`, and `club_group_members`. Composite foreign keys `(track_id, club_id)` and
  `(group_id, club_id)` keep a group's track and its members inside the same club; a partial
  unique index on `(club_id, user_id)` enforces one active group per santri. The migration
  seeds the two Coders Club tracks. No new capabilities.
- `GET /api/clubs/:id/tracks` — active tracks with their group and santri counts.
- `GET /api/clubs/:id/groups` — groups with mentor, mentor's club role, track, live member
  count, and the first member names for the avatar stack. Filters `?trackId=` and `?level=`
  narrow server-side; an unknown value is 400, never a silent full list.
- `GET /api/clubs/:id/group-candidates` — club santri not yet in any active group (manager
  only).
- `POST /api/clubs/:id/tracks`, `POST …/groups`, `POST …/group-members` — one upsert body
  each (create, edit, archive/remove), the shape `…/members` and `…/courses` already use.
  All idempotent; all `club.manage`.
- Refusals carry Indonesian messages and stable codes: 409 `GROUP_FULL`, 409
  `ALREADY_GROUPED`, 409 `MENTOR_IS_MEMBER`, 400 for a mentor who is not a club member or a
  track belonging to another club.
- **Locking.** Every write locks the club row `FOR UPDATE` through
  `clubAccess(…, "manage", true)`; membership additionally locks the group row, so capacity
  is checked under the lock. Reads run in one `REPEATABLE READ READ ONLY` transaction.
- **Audit events:** `club.track.created`, `club.track.updated`, `club.track.archived`,
  `club.group.created`, `club.group.updated`, `club.group.archived`,
  `club.group.member.added`, `club.group.member.removed`. The admin Audit log already tags
  the `club` prefix, so they arrive with a category lozenge and icon.
- **UI:** a `Kelompok` tab in the club workspace (`src/web/pages/Club.tsx`) — the track list
  on top, then one card per group with its track and level lozenges, the mentor with a
  `Guru` or `Mentor santri` lozenge, tema and jadwal, a capacity bar, and the member avatar
  stack; a santri's own group is flagged `Kelompok Anda`. Club mentors additionally get the
  group form, the archive action, the member panel, and a track form. Ringkasan gained a
  `Track belajar` section and Anggota now names each santri's group. New CSS:
  `.club-track-list`, `.club-track-card`, `.club-group-grid`, `.club-group-card`,
  `.club-group-meta`.
- **Demo data** (`database/seed/demo.ts`): Coders Club gets four groups across the two
  tracks — `Kelompok HTML & CSS Dasar A` and `B` (level 1, Product Track, six kelas X santri
  each, mentored by a kelas XI santri), `Kelompok Proyek JavaScript` (level 3, Product
  Track, mentored by the main teacher), and `Kelompok Algoritma & C++` (level 3, Olympiad
  Track, mentored by the second teacher, and holding the two kelas XI santri who mentor the
  beginner circles). 16 santri in groups.

## API additions

Mutations require the same origin. Resources outside the actor's scope return 404.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/clubs/:id/tracks` | Learning tracks with group and santri counts |
| `GET` | `/api/clubs/:id/groups` | Mentoring groups (`?trackId=`, `?level=`, `?q=`, `?offset=`) |
| `GET` | `/api/clubs/:id/group-candidates` | Club santri without a group (manager only) |
| `POST` | `/api/clubs/:id/tracks` | Create, edit, or archive one track |
| `POST` | `/api/clubs/:id/groups` | Create, edit, or archive one group |
| `POST` | `/api/clubs/:id/group-members` | Add or remove one santri from a group |

## Verified behavior

- PostgreSQL integration (`tests/club.integration.test.ts`, one added test): the two seeded
  tracks and their absence in other clubs; a santri named as group mentor; a mentor outside
  the club refused (400); a track of another club refused (400); idempotent membership;
  409 `MENTOR_IS_MEMBER`, `ALREADY_GROUPED`, and `GROUP_FULL`; candidates excluding grouped
  santri; `?trackId=`, `?level=`, and `?q=` narrowing and `?level=9` / `?trackId=bukan-uuid`
  refused with 400; track counts following the groups; the members tab naming each santri's
  group; a santri — **including the santri who mentors a group** — reading the tab and
  refused every write with 403; cross-origin refusal; an edited track and group; an archived
  group leaving the list while its membership rows stay; and every audit event present.
- Unit tests (`tests/club.test.ts`, four added tests): track slug derivation and position
  bounds, group level and capacity bounds with optional track and mentor, group membership
  input, and filter rejection of unknown values.
- `tests/database.integration.test.ts` covers the rollback of `0031_club_mentoring_groups.sql`
  and the disappearance of its three tables.

## Commands and results

- `bun run typecheck`: passed.
- `bun run build`: passed, 16 production assets.
- `bun test tests/club.test.ts`: **11 passed, 0 failed**, 61 assertions.
- `TEST_DATABASE_URL=… bun test tests/club.integration.test.ts`: **10 passed, 0 failed**.
- `TEST_DATABASE_URL=postgres://localhost:5432/salaam_test bun test`: **221 passed,
  0 failed**, 2949 assertions across 29 files.
- `bun run db:seed:demo` against a throwaway migrated database: seeded without error and
  reported 2 tracks, 4 groups, and 16 santri in groups.

## Boundaries

Phase 33 does not include:

- Group-level attendance or sessions. A small-circle meeting is still a classroom session on
  a club course in Kehadiran; adding a second session table would duplicate that module.
- A curriculum or milestone list per track. Materials stay in Pembelajaran; a track carries
  a name, a tagline, and a description only.
- Self-service joining: a mentor or administrator places santri in groups, as with club
  membership itself.
- Group-scoped permissions. A santri mentor has no write access anywhere in the application;
  if that changes, it should be a resource-scoped check on `club_groups.mentor_id`, never a
  role-name check.
