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
    `GlobalSearch` in the middle, `.topbar-end` with the
    account menu (`.account-trigger` → `.menu-popover[role=menu]` with `.menu-profile`,
    `.menu-separator`, `.menu-item`).
  - `.sidebar` (sticky, own scroll): `.space-header` (`.space-avatar` — the HSI logo on
    a white bordered tile — + school name/role),
    `nav.navigation` of `.nav-group`s — optional `.nav-heading`, `ul` of `.nav-item`
    links (`.is-active` + `aria-current="page"` draws the blue left indicator), a
    collapsible "Segera hadir" group (`.nav-disclosure`, `.nav-item-disabled`,
    `.nav-soon`), and `.sidebar-footer`.
  - `.main-content` caps at `1600px` and centers.
  - The toggle collapses the sidebar on desktop (`.sidebar-collapsed`, remembered in
    `localStorage`) and opens it as an off-canvas drawer (`.sidebar.is-open` +
    `.sidebar-backdrop`, Escape closes) at ≤760px.
- Navigation entries come from `navigationFor(actor)` in `src/web/layouts/navigation.ts`,
  filtered by permission. Add a new page there once; the sidebar and the topbar search
  both read it.
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
- **Tabs**: `nav.tabs` of buttons + `.tab-active` (+ `aria-current`) — Jira underline
  tabs, scroll horizontally inside the bar on narrow screens. Place directly under
  `PageHeader`.
- **Page chrome**: `.page-header` (`.breadcrumbs`, `.page-header-main`,
  `.page-header-text`, `.page-actions`), `.date-label`.
- **Dashboard**: `.summary-grid` of `.stat-card`s (`.stat-icon` + `.stat-blue` /
  `.stat-purple` / `.stat-gold`, `.summary-label`, `.summary-value`), `.dashboard-grid`.
- **Empty/loading/error/messages**: `.empty-state`/`.empty-symbol`/`.empty-action`,
  `.loading-state`/`.spinner`, `.error-state`, `.success-state` (green), `.info-state`
  (blue, neutral notices such as "settings are locked").
- **List rows / detail blocks**: `.task-item` (icon tile + `.task-body` + lozenge — the
  Jira issue-row shape), `.archive-item`, `.grade-entry`, `.material-item`/
  `.activity-item`, `.picker-row`, `.lesson-nav` — hairline-separated rows inside a card.
  Model a new list row on the nearest of these.
- **Forms in a grid**: `.admin-fields` (2-column grid, collapses to 1 column ≤760px) +
  `.admin-field`/`.learning-field`, `.field-wide` to span both columns,
  `.form-actions` to place the submit button.
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
- **Gamification**: `.growth-level` (XP/level header card) with `.growth-level-main` and
  `.growth-level-mark`, `.growth-progress` (+ `progress` bar and `.growth-progress-meta`),
  `.award-grid` of `.award-tile` (`.is-locked` for an unearned badge) with `.award-icon`,
  `.award-text`, `.award-meta`, plus the `.xp-row` and `.rule-row` list rows.
  `.dashboard-side` stacks cards in the dashboard's right column, and `.card-hint` is a
  muted one-line note under a `.card-heading`.
- **Attendance**: `Attendance.tsx` reuses `.lesson-workspace`, `.lesson-card`, the form
  kit, `.filter-bar`, lozenges, and scrolling tables. `.attendance-actions` arranges
  lifecycle forms in responsive columns. A visible live-connection status and manual
  refresh sit above each session. Editors retain their original version/predecessor
  during realtime updates so stale edits fail rather than overwrite newer records.
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
