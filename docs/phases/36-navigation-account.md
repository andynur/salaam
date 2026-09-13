# Phase 36 — Navigation, account page, and administration layout

Validated locally on 2026-09-13 with Bun 1.4.2 and PostgreSQL 17. The product owner asked to
review where menu entries sit, move personal entries such as notifications to the top bar, add
a "my profile / my account" entry to the account dropdown next to **Keluar**, and make the
screens under **Administrasi** consistent.

## Workflow

1. Every user sees a bell in the top bar with an unread count. It opens the latest unread
   notifications; opening one marks it read and follows its link, the check button marks it
   read in place, and **Lihat semua notifikasi** opens the inbox.
2. The account dropdown lists **Profil saya**, **Notifikasi**, and **Keluar**.
3. **Profil saya** (`/account`) shows the user's name, email, role lozenges, identifiers,
   registration time, and active sessions. The user changes their own password there by
   entering the current password; other devices are signed out.
4. The sidebar groups workspaces: an unlabeled group (Dashboard, Kalender, Laporan), then
   **Belajar** (Pembelajaran, Kurikulum, Kehadiran, Projects), **Pembinaan** (Pertumbuhan,
   Tautan, Club), and **Administrasi**. Labeled groups collapse, and the choice is
   remembered per browser.
5. **Administrasi** has three entries. **Pengguna** holds the tabs Akun and Import santri.
   **Akademik** holds one tab per academic resource plus Transfer kelas. **Audit log** stands
   alone.

## Scope decisions

- **Personal pages leave the sidebar.** Notifikasi and Profil saya are reached from the top bar
  and stay searchable; the sidebar only lists workspaces.
- **Five administration entries became three.** Import santri and Transfer kelas are tabs of
  the section they belong to. Their URLs (`/admin/import`, `/admin/transfers`) still work,
  and tabs rewrite the URL so reloads and search land on the same tab.
- **The profile is read-only for its owner.** Name, email, role, and identifiers stay
  administrator-managed under Pengguna; only the password is self-service. No capability
  is added: both endpoints need only a valid session.
- **No new notification endpoint.** The bell reads `GET /api/notifications?unread=true`
  (first page, shown as `50+` when there are more) and polls every 60 seconds while the tab
  is visible.
- **Uniform admin screens.** Every screen shares the header, tab, panel (`PanelHeading`),
  success line, card-tools, table, and pagination shapes documented in `DESIGN.md`. Status
  columns render lozenges instead of `Ya`/`Tidak`, date-only columns are formatted, and the
  audit category filter moved into the list card beside the search box.

## API

- `GET /api/auth/account` → `{ id, name, email, createdAt, roles: [{ role, identifier }], activeSessions }`; 401 without a session.
- `POST /api/auth/password` with `{ currentPassword, newPassword }` → `{ sessionsRevoked }`.
  Requires `Origin`. 400 for invalid input, an unchanged password, or a wrong current
  password; 401 without a session; 409 when the stored hash changed after verification;
  429 through the login throttle. The current session survives, other sessions are deleted
  in the same transaction, and `auth.password_changed` is audited.

## Fixed along the way

- Transfer kelas reset its form through the React event after an `await`, which threw after
  a successful transfer and showed an error. The form now remounts instead, and the submit is
  guarded by a ref.
- Import santri read the target class from the DOM while rendering the commit form. The
  class is now captured when the preview runs, and a changed class or CSV discards the
  preview. A CSV file can be loaded into the text area.

## Validation

- `bun run typecheck` and `bun run build` pass; the full suite with `TEST_DATABASE_URL`
  passes 241 of 241 tests.
- Headless Chrome smoke run against a disposable QA database: 56 of 56 checks passed. It
  covered every changed page at 1440, 820, and 390 px with no horizontal overflow or
  unexpected alert, the bell count and read receipts in sync with the inbox, focus and
  Escape on the popover, account-menu arrow keys, a collapsed group remembered across
  navigation and reopened for the current page, the password change (mismatch, wrong current
  password, success), and the Pengguna and Akademik tabs with their URLs and reloads.
- `tests/foundation.integration.test.ts` covers the account read, 401/403/400 paths, the
  surviving and revoked sessions, a replayed request, login with the old and new password,
  and the audit row.

## Out of scope

- Editing one's own name, email, or photo; administrators keep that.
- A transfer history list on the Transfer kelas tab: there is no list endpoint yet.
- Collapsing the sidebar to an icon rail on desktop.
