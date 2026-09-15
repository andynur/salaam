# DESIGN.md — UI kit reference

Read this before building or changing any screen. It documents the UI kit as it actually
exists in `src/web/`, not an aspirational spec — every token and class below is real and
in use.

Product direction: teacher and administrator screens are dense, Jira-inspired productivity
views; student screens stay simple, task- and progress-focused, and comfortable on a phone.

The visual language follows the Atlassian/Jira pattern — white topbar with global search,
a grouped left sidebar with line icons, breadcrumb + page header, bordered cards, lozenges,
underline tabs — expressed in the HSI palette (navy, blue, restrained gold).

Reuse before inventing. Grep `src/web/styles/app.css` and `src/web/components/` for a
class or component that already does what you need before writing new CSS or a new
component. Most screens should only need new page-level layout classes, not new
primitives.

## Stack and rendering model

- Plain React function components, no CSS-in-JS, no component library, no icon package.
- Tailwind CSS v4 is used only for its CSS-first token engine (`@theme` in
  `src/web/styles/app.css`), Preflight reset, and `@layer` organization — **not** for
  utility classes in JSX. Do not write `className="flex gap-4 p-3"` etc. Every class used
  in a component is a semantic, hand-written class defined in `@layer components` in
  `app.css`.
- One global stylesheet (`app.css`), organized as `@layer base` (reset + layout
  variables), then several `@layer components` blocks grouped by feature area
  (primitives/page chrome/shell/dashboard, admin/tables, learning/assessment), plus
  grouped `@media` blocks after each section for responsive overrides. Add new rules to
  the block matching your feature area instead of appending to the end of the file.
- Class naming is kebab-case, mostly BEM-ish without strict BEM (`.card-heading`,
  `.option-row`, `.option-row.option-correct`). State classes use `is-*`
  (`.nav-item.is-active`, `.sidebar.is-open`). Match this style for new classes.

## Design tokens (`@theme` in `app.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--color-navy` | `#0b1f3a` | Brand dark: avatars, space/course tiles, pressed primary button |
| `--color-blue` | `#1d5fd1` | Primary action, links, selected/active state, focus ring |
| `--color-blue-hover` | `#174ba6` | Primary button hover |
| `--color-blue-soft` | `#e9f2ff` | Selected background paired with `--color-blue` text |
| `--color-blue-soft-hover` | `#cfe1fd` | Hover on an already-selected item |
| `--color-gold` | `#eab308` | Restrained accent only — dots, rules, grading icon. Never a primary action color |
| `--color-gold-soft` | `#fff7d6` | Gold lozenge/stat background paired with `--color-navy` text |
| `--color-surface` | `#ffffff` | App background, cards, inputs, popovers |
| `--color-background` | `#f7f8f9` | Sunken/hover rows, input hover, nested answer panels |
| `--color-neutral` | `#f1f2f4` | Secondary button, neutral lozenge, nav/menu hover |
| `--color-neutral-hover` | `#dcdfe4` | Secondary button hover, spinner track |
| `--color-border` | `#dfe1e6` | All hairline borders and dividers |
| `--color-border-input` | `#8590a2` | Input and search borders (3:1 non-text contrast) |
| `--color-text` | `#172b4d` | Body text |
| `--color-subtle` | `#44546f` | Nav items, labels, breadcrumbs, secondary button text |
| `--color-muted` | `#626f86` | Meta text, hints, placeholders, section headings |
| `--color-danger` / `-soft` | `#b42318` / `#ffeceb` | Errors, exam task type, danger lozenge |
| `--color-success` / `-soft` | `#216e4e` / `#dcfff1` | Success messages, published/active lozenges, lesson task type |
| `--color-discovery` / `-soft` | `#5e4db2` / `#f3f0ff` | Quiz task type, discovery lozenge, course stat |
| `--font-sans` | `"Inter", ui-sans-serif, -apple-system, … sans-serif` | The only font stack |
| `--shadow-overlay` | `0 8px 12px …, 0 0 1px …` | Popovers, menus, mobile drawer, skip link — nothing else |

Layout variables live in `@layer base` `:root`: `--topbar-height` (`56px`) and
`--sidebar-width` (`240px`, `220px` ≤1100px). Use them for anything sticky under the
topbar (see `.attempt-bar`).

Never write a raw hex color in a component or a new CSS rule — use the token. If a
screen genuinely needs a new semantic color, add it to `@theme` first, don't inline it.

Type scale in use: 11–12px (lozenges, section headings, meta), 13–14px (body, nav,
tables, buttons), 15–18px (card/section headings), 20–24px (page `h1`, stat values).
Radius: 3px lozenges, 4px controls/nav items, 6px search/option rows, 8px cards/popovers,
50% avatars. Elevation: cards are flat with a 1px border; only overlays get
`--shadow-overlay`.

## Icons (`src/web/components/icons.tsx`)

```tsx
<Icon name="book" />            // 16px, inherits currentColor, aria-hidden
<Icon name="users" size={20} /> // 20px for nav items and icon buttons
```

Inline SVG line icons on a 24px grid with a 2px stroke. Always pair an icon with visible
text or an `aria-label` on the parent control; the icon itself is decorative. Add a new
icon by adding a path entry to the `paths` map in the same style — don't import an icon
library, and don't use Unicode glyphs (`◇`, `▦`, `☰`) as icons.

## Layout shells

Two top-level page shells exist; every screen is one of these two, never a bespoke
layout:

- **`.login-page`** — unauthenticated split screen (`grid-template-columns: 1fr 1fr`),
  dark `.login-intro` brand panel + light `.login-form-area` form panel. Collapses to a
  single column under 760px. Login keeps 44px inputs/buttons. The form `.badge` holds
  the Arabic salam greeting — the only Arabic-script copy allowed in the UI, because HSI
  Boarding School is an Islamic school; see `docs/brand.md`. The product name in
  `.intro-footer` and `.login-footer`, and every `document.title`, come from `BRAND` and
  `brandTitle()` in `src/web/lib/brand.ts` — never hard-code the product name. Favicon,
  app icons, manifest, and social preview live in `assets/brand/`; see
  `docs/brand.md`.
- **`.app-shell`** — authenticated app (`src/web/layouts/Shell.tsx`):
  - `.topbar` (sticky, `--topbar-height`): `.topbar-start` (sidebar toggle
    `.icon-button` + `.brand` link: 28px SALAAM mark and the product name at 16px/650),
    `GlobalSearch` in the middle, `.topbar-end` with the notification bell and the
    account menu. The bell (`.notification-trigger` with a `.notification-count` badge,
    `aria-haspopup="dialog"`) opens `.menu-popover.notification-popover`: up to six unread
    notifications as `.notification-popover-item` rows (open marks read, a check
    `.icon-button-small` marks read in place), `.notification-popover-empty`, and a
    `.card-footer-link` to `/notifications`. It polls every 60 s while the tab is visible and
    listens for `notificationsChanged` (`Calendar.tsx`), which the inbox page also fires and
    hears, so the badge and the list agree. At ≤760px the popover is fixed under the topbar.
    The account menu (`.account-trigger` → `.menu-popover[role=menu]`, arrow keys and
    Home/End move between items) holds `.menu-profile`, the personal pages as `a.menu-item`
    (`.is-active` on the current one: **Profil saya**, **Notifikasi**), `.menu-separator`,
    and **Keluar**.
  - `.sidebar` (sticky, own scroll): `.space-header` (`.space-avatar` — the HSI logo on
    a white bordered tile — + school name/role),
    `nav.navigation` of `.nav-group`s — an unlabeled first group (Dashboard, Kalender,
    Laporan), then labeled groups (Belajar, Pembinaan, Administrasi) whose `.nav-heading`
    is a `.nav-disclosure` button (`aria-expanded`; closed groups remembered in
    `localStorage` under `salaam:nav-closed-groups`, and a group holding the current page
    always starts open), `ul` of `.nav-item`
    links (`.is-active` + `aria-current="page"` draws the blue left indicator), a
    collapsible "Segera hadir" group (`.nav-disclosure`, `.nav-item-disabled`,
    `.nav-soon`), and `.sidebar-footer`.
  - `.main-content` caps at `1600px` and centers.
  - The toggle collapses the sidebar on desktop (`.sidebar-collapsed`, remembered in
    `localStorage`) and opens it as an off-canvas drawer (`.sidebar.is-open` +
    `.sidebar-backdrop`, Escape closes) at ≤760px.
- Navigation entries come from `navigationFor(actor)` in `src/web/layouts/navigation.ts`,
  filtered by permission. Add a new page there once; the sidebar, the account menu, and the
  topbar search all read it. Workspaces go in `groups` (sidebar), personal pages in
  `account` (account menu), and screens reached only through a tab in `screens` (search
  only). An administration section with several screens is one sidebar entry whose
  `active` matcher covers every screen path, and the screens are tabs.
- `GlobalSearch` (`src/web/layouts/GlobalSearch.tsx`) is an ARIA combobox: it filters
  reachable pages locally and matches course names through `GET /api/learning/courses?q=`
  (debounced, top 5). `/` focuses it; ↑/↓/Enter/Escape work. At ≤760px it collapses to a
  `.search-trigger` icon that expands over the topbar.

Responsive rules (checked in every phase's browser smoke run; keep honoring them):

- No document-level horizontal scroll at 390px (phone) or 820px (tablet) viewports.
- Wide tabular content scrolls internally via `.table-scroll { overflow: auto; }`
  around `.data-table`; long tab rows scroll inside `.tabs` — never let content force the
  page to scroll horizontally.
- Breakpoints in use: `1100px` (shell/grid density), `760px` (drawer/mobile stack;
  `min-width: 761px` only for the desktop sidebar-collapse rule), `420px` (tightest rows).
  `@media (pointer: coarse)` raises touch targets. Don't add another width breakpoint
  without a real reason.

## Base primitives (`src/web/components/ui.tsx`)

```tsx
<Button>Simpan</Button>                                   // primary
<Button className="button-secondary">Batal</Button>       // neutral gray
<Button className="button-secondary button-small">Cari</Button>
<Button><Icon name="plus" />Buat akun</Button>             // icon + label
<Card>...</Card>                                           // white panel, 1px border, radius 8px
<PageHeader breadcrumbs={[{ label: "Pembelajaran", href: "/learning" }]} title={course.name}
  description="Kelas 10A · Semester Ganjil" actions={<Status published />} />
<EmptyState icon="book" title="Belum ada course" description="..." action={<Button>…</Button>} />
<LoadingState />                                           // spinner + "Memuat ruang belajar…"
<ErrorState message={error} retry={() => ...} />           // role="alert", icon, optional retry
```

Every app-shell screen starts with `PageHeader`. Breadcrumbs list ancestors only (the
`h1` names the current page); omit them on top-level pages (Dashboard, Pembelajaran).
Don't reintroduce "← Kembali" links — a breadcrumb is the back navigation.

Every data view must render one of `LoadingState` / `EmptyState` / `ErrorState` /
success content — no bare blank screens while fetching or on empty results. This is a
hard rule, not optional polish; see the interaction-state contract below.

## List/detail/form kit (`src/web/components/learning.tsx`)

This is the reusable "Jira-like admin view" kit. Every new admin or data-management
screen (the Phase 4 project screens included) should be built from these, not
reimplemented per page:

- `useData<T>(path, onExpired, revision?)` — fetch + loading/error state, redirects to
  `onExpired()` on a `401`, exposes `retry()`. Standard way to load any view's data.
- `<PersonName name sub? role? classroom? className? />` (`components/ui.tsx`) — the only way a
  student or teacher name appears in a table cell or member list: `.avatar-small` initials, the
  name, and an optional `.table-sub` meta line (NIS, join date). Always pass what the row knows
  so the avatar colour identifies the person: `role` (`admin`, `teacher`, `student`, or a
  comma list) and, for a santri, `classroom` (a class name; `gradeOf()` reads X/XI/XII from
  it). Tones: admin `.avatar-admin` (purple), guru `.avatar-teacher` (navy/gold), kelas X
  `.avatar-grade-x` (blue), XI `.avatar-grade-xi` (green), XII `.avatar-grade-xii` (gold),
  santri without a class `.avatar-student` (grey). Use `initials()` from the same file for any
  other initials tile.
- `<Pager offset next change />` — the only pagination UI (`.table-pagination`),
  50 rows/page convention baked into the label.
- `<Search change />` — the only in-card search box pattern (`.table-search`).
- `<Status published />` — `Terbit` (`.badge-success`) / `Draft` (`.badge-draft`)
  lozenge. Model any new status pill on this component, not a new one.
- `<MutationForm path label body saved onExpired>` — the only create/update form
  pattern: disables its fieldset while pending, shows `ErrorState` on failure, shows a
  literal `"Menyimpan…"` pending label, supports both JSON and multipart (file upload)
  bodies transparently.
- `<Field label name .../>` — the only labeled input/textarea pattern
  (`.learning-field`, `.input`). Use `area` for a textarea, `type` for non-text inputs.

Create flows on list pages follow the Jira pattern in `Foundation.tsx`: a primary
`+ Action` button in `PageHeader` actions toggles an `.admin-form-card` panel above the
list (focus moves to the first field), and the empty state offers the same action.

Every administration screen has the same shape: `PageHeader` with the `Administrasi`
breadcrumb and the section name as `h1`, section tabs when the section has several screens,
form panels as `.admin-form-card` opened by `PanelHeading` (title, hint, close button), the
success line below the panels, then one card with `.card-heading` + `.card-tools` (filter
select and `.table-search`) over the table, row actions in `.table-actions`, and
`.table-pagination`. Sections: **Pengguna** (`UsersAdmin`: tabs Akun `/admin/users` and
Import santri `/admin/import`), **Akademik** (`AcademicFoundation`: one tab per academic
resource at `/admin/academic?tab=<resource>` plus Transfer kelas `/admin/transfers`), and
**Audit log**. `AdminTabs` rewrites the URL with `history.replaceState`, so a reload or a
search result lands on the same tab. Status columns render lozenges (Aktif/Nonaktif,
Aktif/Diarsipkan, role lozenges from `roleTone`), never raw booleans or role keys.

The admin Audit log (`Foundation.tsx`, `resource: "audit"`) is the one list in this kit
without a create flow; its category filter is a `.filter-select` in the list card's
`.card-tools` beside the search box, plus a category lozenge — tone and
`Icon` keyed off the event's dot-separated prefix (e.g. `gamification` for
`gamification.badge.awarded`) — in the Event column, with the humanized action underneath
via `.table-sub`. Add a new prefix to `auditCategories` in `Foundation.tsx` when a module
introduces one instead of letting it fall through to "Lainnya".

## Component class catalogue

Grouped by what they're for. This is the full inventory in `app.css` — check here before
adding a near-duplicate.

- **Buttons**: `.button` (primary, 36px), `.button-secondary` (neutral gray),
  `.button-small` (32px), `.icon-button` (36px square, transparent, for icon-only
  controls with `aria-label`). Compose `className="button-secondary button-small"`.
  Disabled state is automatic (`button:disabled { opacity: .6; cursor: not-allowed }`).
- **Inputs**: `.input` on `input`/`select.input`/`textarea.input` — 40px, 1px
  `--color-border-input`, blue border on focus. `.button-small`-sized contexts
  (`.table-search .input`, `.choice-search`, `.picker-points .input`) are 32px.
- **Lozenges**: `.badge` (blue, default/in progress), `.badge-success`, `.badge-draft`
  (neutral), `.badge-gold`, `.badge-danger`, `.badge-discovery`. Sentence case, 12px
  semibold. Compose `className="badge badge-success"`.
- **Cards**: `.card` (generic panel), `.stat-card`, `.admin-form-card`, `.lesson-card`,
  `.course-tile`, `.submission-card`, `.question-item` — add a new suffixed variant
  rather than overloading `.card` with one-off modifiers. `.card-heading` (title row,
  16px `h2`) and `.card-footer-link` (full-width footer link) frame a card.
- **Tables**: `.table-scroll` > `.data-table` (+ `.table-search`, `.table-pagination`).
  2px header rule, row hover. This is the only tabular data pattern — reuse verbatim.
  A row-level control goes in a trailing `td.table-action` cell (no wrap, no minimum
  width) under an `Aksi` header, and opens a panel above the table rather than editing
  in place.
- **Tabs**: `nav.tabs` of buttons + `.tab-active` (+ `aria-current`) — Jira underline
  tabs, scroll horizontally inside the bar on narrow screens. Place directly under
  `PageHeader`.
- **Page chrome**: `.page-header` (`.breadcrumbs`, `.page-header-main`,
  `.page-header-text`, `.page-actions`), `.date-label`.
- **Dashboard**: `.summary-grid` of `.stat-card`s (`.stat-icon` + `.stat-blue` /
  `.stat-purple` / `.stat-gold`, `.summary-label`, `.summary-value`), `.dashboard-grid`.
  The role-specific header combines the role lozenge and date in
  `.dashboard-header-actions`. `.quick-action-grid` holds capability-filtered
  `.quick-action` links with `.quick-action-icon` and `.quick-action-copy` in a dedicated
  `.dashboard-shortcuts` section: four columns on desktop, two on tablets, and horizontal
  single-column rows on phones. Each full card is a keyboard-focusable link.
  `.dashboard-task-filters` uses pressed-state buttons to filter loaded activity types;
  `.dashboard-list-control` expands the initial five rows. Counts refer to activities,
  while summary pending-work counts include grouped answers and projects.
  `.dashboard-focus` highlights the first server-ordered task with a direct action.
- **Empty/loading/error/messages**: `.empty-state`/`.empty-symbol`/`.empty-action`,
  `.loading-state`/`.spinner`, `.error-state`, `.success-state` (green), `.info-state`
  (blue, neutral notices such as "settings are locked").
- **List rows / detail blocks**: `.task-item` (icon tile + `.task-body` + lozenge — the
  Jira issue-row shape), `.archive-item`, `.grade-entry`, `.material-item`/
  `.activity-item`, `.picker-row`, `.lesson-nav` — hairline-separated rows inside a card.
  Model a new list row on the nearest of these.
- **Forms in a grid**: `.admin-fields` (2-column grid, collapses to 1 column ≤760px) +
  `.admin-field`/`.learning-field`, `.field-wide` to span both columns,
  `.form-actions` to place the submit button. `PanelHeading` (`ui.tsx`) renders
  `.admin-form-heading` at the top of an `.admin-form-card`; `.admin-check` is a checkbox
  row inside the grid, `.admin-code` a monospace textarea (CSV input), `.admin-tabs` adds
  icons to section tabs, `.table-actions` spaces row buttons, and `.admin-result-footer`
  holds the confirm/cancel row under a preview table.
- **Account page**: `Account.tsx` at `/account` — `.account-layout` (profile card beside
  `.account-side`, one column ≤1100px), `.account-identity` with `.avatar-xl`, the
  `.account-facts` definition list, `.account-note`, and `.account-links-text`/
  `.account-links` for the notification shortcuts.
- **Assessment-specific** (question/attempt UI): `.option-row` (+
  `.option-correct`/`.option-wrong` review states), `.attempt-bar` (sticky under the
  topbar), `.attempt-timer`/`.attempt-timer-low`, `.question-picker`/`.picker-row`. Only
  reuse these for actual assessment UI, not as a generic "selectable row" — use
  `.option-row`'s shape as a reference for a new selectable-row pattern instead.
- **Kanban board**: `.board` (the only horizontally scrolling region) > `.board-column`
  (`--color-background` lane, `.is-drop-target`) > `.board-column-header` (`h2` +
  `.board-count`) + `ul.board-cards` > `li.board-card` (`.board-card-title` button,
  `.board-card-desc`, `.board-card-footer` with `.board-assignee`/`.board-card-unassigned`
  and `.board-card-moves`), plus `.board-empty`, `.board-add`, `.board-quick-add`,
  `.board-hint`, `.task-editor`.
- **Projects**: `.project-meta` (icon + text strip under the header), `.project-layout`
  (`.project-main` + 360px `.project-side`, one column ≤1100px), `.member-list`,
  `.member-picker`, `.board-progress` (inline done/total bar in tables), showcase tiles
  (`.course-tile` with `.showcase-summary`/`.showcase-team`/`.showcase-links`),
  `.portfolio-entry` with `.portfolio-reflection` (gold rule).
- **Gamification**: `.growth-level` (navy-to-blue hero card) with `.growth-level-main` and
  the gold `.growth-level-mark` showing the level number, `.growth-progress` with a
  `.growth-meter` (`role="progressbar"`, animated fill) and `.growth-progress-meta`;
  `.award-grid` of `.award-tile` (`.is-earned` gold tint, `.is-locked` with a lock icon and
  an `.award-meter` progress strip) with `.award-icon`, `.award-text`, `.award-meta`, plus
  the `.xp-row` and `.rule-row` list rows with an `.xp-icon` per rule inside `.xp-row-main`.
  The leaderboard adds a `.podium` of three `.podium-place-N` cards (`.podium-card` is a
  button when the viewer can open a student; the first place sits in the middle, and on
  phones the cards shrink and hide their meta lines), a `.leaderboard-table` with `.rank-mark`
  (`.rank-mark-1..3` gold/silver/bronze), a `.grade-chip-x|xi|xii|lainnya` class chip, an
  `.xp-cell` with an `.xp-bar` scaled to the leader, `.badge-count`, and clickable rows
  (`tr.is-clickable`, with a "Lihat" button kept for keyboard users). `.leaderboard-filter`
  is the class select grouped by grade.
  `.dashboard-side` stacks cards in the dashboard's right column, and `.card-hint` is a
  muted one-line note under a `.card-heading`.
- **Attendance**: `Attendance.tsx` reuses `.lesson-workspace`, `.lesson-card`, the form
  kit, `.filter-bar`, and scrolling tables, and colours everything through one tone set:
  `.tone-success|gold|blue|discovery|danger|neutral` set `--tone-ink`/`--tone-soft` for a
  component, with `.tone-fill-*`, `.tone-text-*`, and `.tone-soft-*` helpers. Attendance
  statuses map hadir→success, terlambat→gold, izin→blue, sakit→discovery, alpa→danger;
  session states map terjadwal→blue, berlangsung→success (pulsing dot), ditutup→neutral,
  dibatalkan→danger.
  - Landing agenda: `.agenda-card` sits above the catalog and lists today's sessions plus
    any still open (`GET /api/attendance/agenda`), open sessions first. Each `.agenda-item`
    has an `.agenda-time` column, an `.agenda-body` (class chip and course, `.agenda-title`
    link, `.agenda-meta` with the session pill and relative timing, gold when a session
    runs late), and one `.agenda-action` button. The open session gets `.is-live` (green
    left border); closed and cancelled rows mute their time, and cancelled titles are struck
    through. Managers see an `.agenda-progress` meter ("12/30 dicatat") and a primary
    "Catat kehadiran" or "Buka sesi" button; santri see their own status pill and a primary
    "Absen QR" button while check-in is open and they have no record. Actions deep-link with
    `?tab=checkin|manage`. The agenda refreshes every minute and when the tab becomes visible,
    without blanking the list. When nothing is scheduled today, the empty state names the
    next session. Kehadiran has no counters.
  - Course list: `.segmented` pill filters with `.segmented-count` (grade here, session
    status on the session list) sit in their own row under the card heading, without a
    grey band; the active pill uses the tab/badge blue (`--color-blue-soft` ground,
    `--color-blue` border, text, and count), neutral-bordered `.catalog-tile` with
    `.course-avatar-x|xi|xii`, and neutral `.grade-chip` class tags. Class X/XI initials use
    solid blue/green backgrounds with white text; group labels are plain headings and the
    card surface stays white. This catalog is the shared
    `CourseCatalog` in `components/courses.tsx`, used by Pembelajaran and Kehadiran; only
    Pembelajaran turns on the three full-width `.catalog-stats` counters. Kehadiran passes a
    `badge` so each tile shows its live session, the next session ("Besok, 08.00"), or
    "Belum ada jadwal" instead of the publication status. There is no
    separate grade chart because the grade pills already carry the counts.
  - Session list: `.session-spotlight` links the live or next session, the
    `.session-table` rows open on click (`tr.is-clickable`, with a "Buka" link kept) and
    show a `.date-block` (highlighted `.is-today`) and a `.session-pill`.
  - Report: `.report-glance` stat cards (page average, below 75%), a `.status-legend`,
    a stacked `.status-bar` per santri, centred `.count-col` numbers, and a `.rate-cell`
    meter toned by rate (≥90 success, ≥75 gold, otherwise danger), with a sort select.
  - Session detail: `.live-status` shows the realtime connection; the summary card has a
    recorded-percentage `.status-bar` and `.status-tile` buttons that filter the loaded
    roster page (`aria-pressed`). Managers mark attendance in one click with the
    `.quick-mark` letter buttons (H T I S A), keeping the note and predecessor record so
    concurrent edits still fail with 409; the "Catatan" button opens the full editor.
    `.qr-mark` flags rows that scanned the QR. The roster editor collapses behind a toggle.
  - Manage and history: `.session-stepper` shows the lifecycle, `.session-note` the
    private note, and `.session-timeline` the session history with action icons.
  Editors retain their original version/predecessor during realtime updates so stale
  edits fail rather than overwrite newer records.
- **QR check-in**: `checkin.tsx` adds one `.lesson-card` to the session screen.
  `.checkin-display` puts the `.checkin-qr` SVG beside the large `.checkin-code`, stacking
  and centring below 760px. `.checkin-qr-paper` and `.checkin-qr-ink` carry the QR's fills,
  so contrast comes from tokens rather than hard-coded colours. `.checkin-scanner` holds the
  `.checkin-video` camera preview and its close button. `.checkin-countdown` drains once
  per code rotation, `.checkin-idle` explains why the QR is not available yet, and
  `.checkin-done` confirms a santri's recorded check-in. The camera is never the only path:
  a typed code field sits beside it for keyboard use and unsupported browsers, and the QR
  carries an `aria-label` spelling out the code.
- **Reports**: `Reports.tsx` reuses `.summary-grid`/`.stat-card`, `.tabs`, `.card-tools`,
  `.table-scroll`, and the search/pager kit. New here: `.report-filter-card` (the filter
  bar in its own card above the report), `.report-filters` + `.report-filter` (labelled
  filter selects that go full width below 760px), and `.report-metrics` (a grid of
  label/value tiles for figures that do not warrant a stat card). Each report keeps its own
  table instance — the call site passes `key={kind}` — so rows fetched for the previous
  report are never rendered with another report's columns. A CSV export is a plain
  `<a className="button button-secondary button-small">`, not a fetch.
- **Lesson documents**: `.lesson-document` (a `.lesson-card` whose cover bleeds to the
  card edge) holds `.doc-cover`/`.doc-cover-image`/`.doc-cover-actions`, the editor
  (`.doc-editor`, `.doc-bar` with the borderless `.doc-title` and the `.doc-status`
  autosave line, `.doc-toolbar` of `.doc-tool` buttons, the contenteditable
  `.doc-surface`, the `.doc-source` Markdown textarea, `.doc-hint`) and
  `.doc-share`/`.doc-share-row`/`.doc-share-link`. `.doc-prose` is the rendered-Markdown
  block used by the editor surface, the student's read-only view, and text materials —
  reuse it for any Markdown body instead of `.learning-prose`, which stays the
  pre-wrapped plain-text block.
- **Club workspace**: `Club.tsx` reuses `.summary-grid`/`.stat-card`, `.tabs`, `.card`,
  `.card-hint`, `.table-scroll`, `.member-list`, `.member-picker`, and the search/pager kit.
  New here: `.club-tile` (a `.course-tile` rendered as a button for the club directory) with
  `.club-tile-meta` for its counts, `.club-switch` (the club select in `.page-actions`), `.club-subhead` (a 14px
  heading inside a card body), `.club-flow` of `.club-flow-step` pills (the numbered
  Belajar → Bertumbuh strip, numbered by CSS counter so the markup stays an ordered list),
  `.club-goals` of `.club-goal` rows with the `.club-goal-mark` numeral tile, `.club-list`
  (hairline-free list of `.task-item` rows for challenges), and `.club-members` with
  `.club-member-name` so a role lozenge and a remove button wrap instead of squeezing the
  name. `.club-note` is the muted draft notice under the tabs. Each tab's filter select sits
  in `.club-filter` beside its `Search`, and the Progres table numbers rows with
  `.club-rank`. The Kelompok tab adds `.club-track-list` of `.club-track-card` (one learning
  track per hairline-separated row) and `.club-group-grid` of `.club-group-card`
  (auto-filling 300px cards, one column below 760px) whose facts sit in `.club-group-meta`.
  The club pickers use the list form of `.member-picker` (`ul.member-picker`): one candidate
  per row with its action at the end.
- **Curriculum map**: `Curriculum.tsx` reuses `.tabs`, `.summary-grid`/`.stat-card`,
  `.report-filter-card`/`.report-filters`, `.admin-form-card`, `.task-body`, lozenges, and the
  form kit. New here: `.curriculum-tab` (a tab with a trailing "Segera hadir" lozenge),
  `.curriculum-intro` (program card; class X/XI reuse `.grade-accent-x|xi` for a 3px left
  accent on white, a solid `.curriculum-grade-label`, and plain wrapping semester
  metadata in `.curriculum-intro-meta`; publication remains a status badge), `.curriculum-semester` with `.curriculum-phases` of
  `.curriculum-phase-chip` toggle buttons (`aria-pressed`), `.curriculum-phase` groups, and
  `.curriculum-week` disclosure rows (`.curriculum-week-toggle` with `aria-expanded`, the
  `.curriculum-week-number` tile turning gold for `.is-milestone`, and
  `.curriculum-week-detail` holding the `.curriculum-facts` definition list and
  `.curriculum-chips`).
- **Small shared helpers**: `.avatar-small`, `.avatar-stack`/`.avatar-more`/`.avatar-names`,
  `.badge-group` (inline lozenge row), `.card-tools` (filters + search in a
  `.card-heading`), `.filter-select`, `.filter-bar`, `.table-link` + `.table-sub` (title
  and meta inside a table cell), `.icon-button-small` (28px, 36px on coarse pointers),
  `.visually-hidden`. Dashboard task tiles add `.task-challenge` (navy) and `.task-review`
  (gold).

## Interaction-state contract

Every data view/form must implement:

1. **Loading** — `<LoadingState />` (or equivalent inline `.loading-state`) while the
   first fetch is in flight.
2. **Empty** — `<EmptyState />` with a title + one-line description when a list has zero
   rows after loading (not a raw blank table); add `action` when the user can create the
   first item.
3. **Error** — `<ErrorState message retry />`, `role="alert"`, with a retry action when
   the failure is retriable (`useData`'s `retry()`).
4. **Pending mutation** — disable the form (`fieldset disabled={pending}`), swap the
   submit label to a "…ing" Indonesian gerund (`"Menyimpan…"`, `"Sedang masuk…"`), and
   guard against double-submit with a `useRef` pending flag (see `MutationForm`), not
   just `useState` (state updates are async; a ref catches a second submit before
   re-render).
5. **Validation error recovery** — never clear user input after a failed submit; forms
   use uncontrolled inputs with `defaultValue` for this reason. Don't switch a `Field` to
   controlled state unless you also preserve the value on error.

## Accessibility checklist

- `:focus-visible` gets a `2px solid var(--color-blue)` outline (offset 2px; inputs,
  tabs, and menu items draw it inset) — don't suppress it with `outline: none`.
- Use real `label`/`fieldset`/`legend`, `role="alert"` for errors, `role="status"` for
  loading, `aria-current="page"` for active nav links and tabs, `aria-expanded` +
  `aria-controls` on every toggle (sidebar, account menu, create panel, disclosure).
- Popovers close on Escape and return focus to their trigger; menus move focus to the
  first `menuitem` when opened.
- `.skip-link` ("Langsung ke konten") is present in the app shell — keep it first in
  the DOM and keep `#main` as its target on any shell change.
- Respect `prefers-reduced-motion` (already globally handled — don't add an animation
  that bypasses the global `@media (prefers-reduced-motion: reduce)` rule).
- Target sizes: 36px buttons/nav items and 40px inputs on fine pointers;
  `@media (pointer: coarse)` raises `.button`, `.input`, `.nav-item`, `.icon-button` to
  44px. `.option-row` is always ≥44px (students answer on phones).

## Language

UI copy (labels, buttons, error messages, empty states) is Indonesian. Code, comments,
class names, and docs (this file included) are English. Don't mix — a new component
should read like `Sedang masuk…`, `Coba lagi`, `Belum ada data`, matching the tone
already in `ui.tsx`/`learning.tsx` (plain, short, no exclamation marks).

## Adding something new

1. Search `app.css` and `components/` first (see catalogue above).
2. If nothing fits, add the smallest new class that covers the case, in the
   `@layer components` block for the relevant feature area, using only `--color-*`
   tokens and sizes consistent with neighboring rules.
3. If it's a genuinely new pattern likely to be reused (a new card shape, a new list-row
   shape, a new status pill), give it a plain descriptive class name and add one line to
   the catalogue above in the same change.
4. If a screen needs a color, spacing, or interaction not covered by an existing token
   or rule, treat that as a design decision, not a one-off — extend the token set or the
   relevant primitive instead of hardcoding.

## Projects and the Kanban board (Phase 4)

Project screens live in `src/web/pages/Projects.tsx` (hub: project list, showcase,
portfolio), `src/web/pages/ProjectBoard.tsx` (one project: board + overview), and
`src/web/pages/ChallengePanel.tsx` (the per-lesson challenge card). Shared pieces are in
`src/web/components/projects.tsx`:

```tsx
<ProjectStatusBadge status="submitted" />      // Dikerjakan / Menunggu review / Perlu revisi / Disetujui
<AvatarStack members={members} />               // overlapping initials, names as screen-reader text
<AvatarStack members={members} names />         // …with visible names
<MemberPicker courseId max selected onChange onExpired />  // enrolled-student checklist
```

- Project status maps onto the existing lozenges: in progress `.badge`, submitted
  `.badge-discovery`, changes requested `.badge-danger`, approved `.badge-success`;
  showcase is `.badge-gold`. Don't add a separate color system.
- The board keeps its data on screen while it reloads (`useProject` in
  `ProjectBoard.tsx`) — a card move must never flash `LoadingState`. Use `useData` for
  ordinary lists.
- Every drag action has a button equivalent: each card has ←/↑/↓/→ `.icon-button-small`
  controls with `aria-label`s, a visually hidden `role="status"` announces the move, and
  focus returns to the moved card's title. Drag-and-drop is a pointer shortcut, not the
  only path.
- Only `.board` scrolls horizontally (four `minmax(260px, 1fr)` columns, scroll-snap
  under 760px); the page keeps the 390px/820px no-horizontal-scroll rule. A dragged card
  (`.board-card.is-dragging`) is the one card that gets `--shadow-overlay`.
- Project stages follow the Jira flow in copy too: "Kirim untuk review" → guru "Setujui
  proyek" (0–100) or "Minta revisi". Locked states explain themselves with `.info-state`.

## Lesson documents (Phase 31)

`src/web/components/editor.tsx` holds the document pieces: `<Markdown source />` renders
stored Markdown through `src/shared/markdown.ts`, `<DocumentEditor />` is the in-place
editor, `<LessonCover />` the header image, and `<LessonShare />` the public link.

- The editor is the page, not a form: no modal, no submit button. Typing, formatting, and
  pasting happen on `.doc-surface`, and the body autosaves about a second after the last
  keystroke. `.doc-status` is the only feedback — `Menyimpan…`, `Tersimpan HH.MM`, or a
  red failure line — so don't add a save button beside it.
- React renders the surface's HTML once and never again while it is mounted; anything that
  re-renders the workspace must keep the editor's `key` stable, or in-flight typing is
  lost. Autosave failures show an `ErrorState` with a retry, and a 409 stops autosaving and
  offers a reload rather than overwriting the other editor's work.
- A paste is converted to this document's Markdown first, so pasted content arrives
  formatted but never carries foreign markup or styles. `Sumber Markdown` toggles a plain
  textarea, which is also the keyboard-friendly path.
- Toolbar buttons are `.doc-tool` labels (`B`, `H2`, `•`) with an Indonesian `aria-label`;
  they use `onMouseDown` prevention so the caret stays in the document.
- Everything a student sees is read-only `.doc-prose`. The share control, the cover
  actions, and the editor render only when `course.canManage` is true.

## Calendar and notifications (Phase 8)

`Calendar.tsx` reuses `PageHeader`, the mutation/field kit, agenda task rows, date filters,
search, pagination, and lozenges. Times and datetime form labels explicitly use WIB. Creation
focuses the title; edits retain a version snapshot, and archiving requires confirmation.
The dashboard reuses the agenda API for its next-seven-days shortcut.

`.calendar-description` preserves description line breaks, `.calendar-preference` aligns
checkbox labels, and `.notification-row` wraps source links, delivery status and receipt
controls on phones. Pending, delivered, suppressed and read states have distinct Indonesian
labels; delivery alone never claims the notification was read. No new color token or icon
library is needed. The navigation hides its future group when there are no unavailable pages.

## Club workspace (Phase 32)

`/club` opens the club directory: the course-card grid (`.course-grid` of `.club-tile`) with
one card per club — initials tile, state lozenges (Mentor/Anggota, Draft, Arsip), tagline,
`.club-tile-meta` counts, and a `.course-open` call to action. An administrator gets a
`Klub baru` form and a `Tampilkan arsip` checkbox there; nobody else sees either. Choosing a
card opens that club at `/club?club=<id>`, which carries the club switcher, a `Semua klub`
button back to the directory, and eight tabs (Ringkasan, Pembelajaran,
Pertemuan, Challenge, Projects, Anggota, Kelompok, Progres). Ringkasan carries the stat row, the
narrative cards, the learning-flow strip, and the goal list; the other tabs are the standard
card + table/list + search + pager shape, each with its own loading, empty, error-with-retry
and success states. Pertemuan, Projects, Anggota, and Kelompok each filter server-side from a
`.club-filter` select beside the search box, so the pager never lies about what was narrowed.

Kelompok is the club's mentoring structure: learning tracks on top (hidden for a club that
runs none), then one `.club-group-card` per small circle — track and level lozenges, the
mentor with a `Guru` or `Mentor santri` lozenge, tema and jadwal, a `.board-progress`
capacity bar, and the member `AvatarStack`. A santri's own group is flagged `Kelompok Anda`.
Naming a santri as mentor is a label on the card, never a capability: every group and track
write still goes through `club.manage`, so the manage panels appear for club mentors and
administrators only.

Mentor controls are additive, never a separate screen: a `Kelola klub` toggle (with
`aria-expanded`) reveals the profile form, the goal editor (one goal per line,
`Judul | Keterangan`), and the publish action; the Pembelajaran and Anggota tabs gain a
linker and a candidate list below the read-only card. A student sees the same tabs without
those panels. An administrator additionally finds the archive or restore control at the
bottom of the manage panel; on an archived club the panel offers nothing but `Pulihkan klub`,
and `.club-note` under the tabs explains that the club is read-only. Copy stays Indonesian,
and the page never scrolls sideways at 390 px — wide data sits in `.table-scroll`.

## Course certification

The course **Sertifikasi** tab reuses the progress bar, card, search/pager, and labeled
student select. `.certification-body` spaces the hint, preview, and PDF action;
`.certification-preview` fits the landscape image within the card, and `.is-locked`
keeps the complete certificate visible in grayscale while its download stays disabled.
The centered canvas follows the reference's monospace typography, navy header, geometric
background, QR verification block, teacher signature line, and seal. Eligible previews
show a clearly labeled sample signature; downloaded PDFs leave that signature line blank.
After issuance, the existing public-link control exposes the stable verification URL.
