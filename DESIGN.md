## DESIGN.md — UI Kit Reference

Read this before building or changing any screen. It documents the UI kit as it actually
exists in `src/web/`, not an aspirational spec — every token and class below is real and
in use. The product-level direction (Jira-inspired productivity UI for teachers/admins,
simpler task UI for students) lives in `docs/06_UI_UX_DESIGN_SYSTEM.md`; this file is the
concrete "how to build it consistently" companion.

Reuse before inventing. Grep `src/web/styles/app.css` and `src/web/components/` for a
class or component that already does what you need before writing new CSS or a new
component. Most screens should only need new page-level layout classes, not new
primitives.

### Stack and rendering model

- Plain React function components, no CSS-in-JS, no component library.
- Tailwind CSS v4 is used only for its CSS-first token engine (`@theme` in
  `src/web/styles/app.css`) and `@layer` organization — **not** for utility classes in
  JSX. Do not write `className="flex gap-4 p-3"` etc. Every class used in a component is
  a semantic, hand-written class defined in `@layer components` in `app.css`.
- One global stylesheet (`app.css`), organized as `@layer base` (reset), then several
  `@layer components` blocks grouped by feature area (shell/dashboard, admin/tables,
  learning/assessment), plus grouped `@media` blocks at the end of each section for
  responsive overrides. Add new rules to the block matching your feature area instead of
  appending to the end of the file.
- Class naming is kebab-case, mostly BEM-ish without strict BEM (`.card-heading`,
  `.option-row`, `.option-row.option-correct`). Match this style for new classes.

### Design tokens (`@theme` in `app.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--color-navy` | `#0b1f3a` | Primary dark surface (topbar-adjacent dark panels, headings on dark bg) |
| `--color-blue` | `#1d5fd1` | Primary action color, links, active/selected state |
| `--color-blue-soft` | `#eaf2ff` | Selected/hover background paired with `--color-blue` text |
| `--color-gold` | `#eab308` | Restrained accent only — rules, dots, small highlights. Never a primary action color |
| `--color-gold-soft` | `#fff8d6` | Accent badge background paired with `--color-navy` text |
| `--color-surface` | `#ffffff` | Card/input/panel background |
| `--color-background` | `#f7f8fa` | Page background, table header background |
| `--color-border` | `#dfe1e6` | All hairline borders |
| `--color-text` | `#172b4d` | Body text |
| `--color-muted` | `#5e6c84` | Secondary text, labels, meta |
| `--color-danger` | `#b42318` | Error text/border |
| `--color-danger-soft` | `#fff0ee` | Error background |
| `--font-sans` | `"Aptos","Inter","Segoe UI",system-ui,sans-serif` | The only font stack |

Never write a raw hex color in a component or a new CSS rule — use the token. If a
screen genuinely needs a new semantic color, add it to `@theme` first, don't inline it.

There is no formal spacing or type scale (no `--space-*` tokens). Observed ranges:
font-size 9px (micro labels/eyebrows) to 28px (page `h1`), border-radius 4–8px for
controls/cards, 999px for pill/progress shapes. When sizing something new, match the
size used by the nearest existing element with the same role instead of picking an
arbitrary value.

### Layout shells

Two top-level page shells exist; every screen is one of these two, never a bespoke
layout:

- **`.login-page`** — unauthenticated split screen (`grid-template-columns: 1fr 1fr`),
  dark `.login-intro` brand panel + light `.login-form-area` form panel. Collapses to a
  single column under 760px.
- **`.app-shell`** — authenticated app (`Shell.tsx` layout), a `232px` sidebar +
  fluid main column, with a `64px` topbar spanning both. Collapses to a stacked
  mobile nav (`.menu-toggle` + `.navigation.is-open`) under 760px. `.main-content` caps
  at `1600px` and centers.

Responsive rules (enforced by the phase validation docs, keep honoring them):

- No document-level horizontal scroll at 390px (phone) or 820px (tablet) viewports.
- Wide tabular content scrolls internally via `.table-scroll { overflow: auto; }`
  around `.data-table` — never let a table force the page to scroll horizontally.
- Breakpoints in use: `1100px` (shell/grid density), `760px` (mobile stack), `420px`
  (tightest grids). Reuse these three; don't add a fourth without a real reason.

### Base primitives (`src/web/components/ui.tsx`)

```tsx
<Button>Simpan</Button>                          // primary, min-height 44px
<Button className="button-secondary">Batal</Button>
<Button className="button-secondary button-small">Cari</Button>
<Card>...</Card>                                  // white panel, border, radius 8px
<EmptyState title="Belum ada data" description="..." symbol="◇" />
<LoadingState />                                  // pulsing dot + "Memuat ruang belajar…"
<ErrorState message={error} retry={() => ...} />  // role="alert", optional retry button
```

Every data view must render one of `LoadingState` / `EmptyState` / `ErrorState` /
success content — no bare blank screens while fetching or on empty results. This is a
hard rule from `docs/06_UI_UX_DESIGN_SYSTEM.md`, not optional polish.

### List/detail/form kit (`src/web/components/learning.tsx`)

This is the reusable "Jira-like admin view" kit. Every new admin or data-management
screen (including Phase 4 Kanban/project views) should be built from these, not
reimplemented per page:

- `useData<T>(path, onExpired, revision?)` — fetch + loading/error state, redirects to
  `onExpired()` on a `401`, exposes `retry()`. Standard way to load any view's data.
- `<Pager offset next change />` — the only pagination UI (`.table-pagination`),
  50 rows/page convention baked into the label.
- `<Search change />` — the only search box pattern (`.table-search`).
- `<Status published />` — draft/published badge (`.badge` / `.badge-draft`). Model any
  new status pill (e.g. a future Kanban card status) on this component, not a new one.
- `<MutationForm path label body saved onExpired>` — the only create/update form
  pattern: disables its fieldset while pending, shows `ErrorState` on failure, shows a
  literal `"Menyimpan…"` pending label, supports both JSON and multipart (file upload)
  bodies transparently.
- `<Field label name .../>` — the only labeled input/textarea pattern
  (`.learning-field`, `.input`). Use `area` for a textarea, `type` for non-text inputs.

### Component class catalogue

Grouped by what they're for. This is the full inventory in `app.css` — check here before
adding a near-duplicate.

- **Buttons**: `.button` (primary), `.button-secondary`, `.button-small` (compose:
  `className="button-secondary button-small"`). Disabled state is automatic
  (`button:disabled { opacity: .6; cursor: wait }`) — don't hand-roll disabled styling.
- **Inputs**: `.input` on `input`/`select.input`/`textarea.input`. `44–46px` min-height
  everywhere except `.button-small`/`.table-search .input` (`36px`) and
  `.picker-points .input` (`96px` wide numeric field).
- **Badges/status**: `.badge` (blue), `.badge-gold` (gold, all-caps eyebrow style),
  `.badge-draft` (muted/gray). Compose `className="badge badge-draft"` etc.
- **Cards**: `.card` (generic panel), `.admin-form-card`, `.lesson-card`,
  `.submission-card`, `.question-item` — all a `.card`-like bordered block for a
  specific content shape. Add a new suffixed variant rather than overloading `.card`
  with one-off modifiers.
- **Tables**: `.table-scroll` > `.data-table` (+ `.table-search`, `.table-pagination`).
  This is the only tabular data pattern — reuse verbatim for any new admin list.
- **Tabs**: `.academic-tabs` + `.tab-active` on the active button.
- **Page chrome**: `.breadcrumb`, `.page-heading` (+ `h1`/`p`/`.date-label`),
  `.welcome-banner`, `.summary-grid` of `.card`s — the standard top-of-page pattern for
  an app-shell screen.
- **Empty/loading/error**: `.empty-state`/`.empty-symbol`, `.loading-state`/
  `.loading-dot`, `.error-state`, `.success-state`.
- **List rows / detail blocks**: `.task-item`, `.archive-item`, `.grade-entry`,
  `.material-item`/`.activity-item`, `.picker-row` — all a `border-top`/`border-bottom`
  hairline-separated row inside a card. Model a new list row on the nearest of these.
- **Forms in a grid**: `.admin-fields` (2-column grid, collapses to 1 column ≤760px) +
  `.admin-field`/`.learning-field`, `.field-wide` to span both columns,
  `.form-actions` to place the submit button.
- **Assessment-specific** (question/attempt UI): `.option-row` (+
  `.option-correct`/`.option-wrong` review states), `.attempt-bar` (sticky timer bar),
  `.attempt-timer`/`.attempt-timer-low`, `.question-picker`/`.picker-row`. Only reuse
  these for actual assessment UI, not as a generic "selectable row" — use `.option-row`'s
  shape as a reference for a new selectable-row pattern instead of repurposing the class.

### Interaction-state contract

Every data view/form must implement:

1. **Loading** — `<LoadingState />` (or equivalent inline `.loading-state`) while the
   first fetch is in flight.
2. **Empty** — `<EmptyState />` with a title + one-line description when a list has zero
   rows after loading (not a raw blank table).
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

### Accessibility checklist

- `:focus-visible` gets a `3px solid var(--color-blue)` outline globally — don't
  suppress it with `outline: none` on a custom control.
- Use real `label`/`fieldset`/`legend`, `role="alert"` for errors, `role="status"` for
  loading, `aria-current="page"` for active nav links (see `Shell.tsx`).
- `.skip-link` ("Langsung ke konten") is present in the app shell — keep it first in
  the DOM and keep `#main` as its target on any shell change.
- Respect `prefers-reduced-motion` (already globally handled — don't add an animation
  that bypasses the global `@media (prefers-reduced-motion: reduce)` rule).
- Minimum interactive height is `44px` for primary controls (`.button`, `.input`,
  `.option-row`) — keep new tappable elements at or above that, `36px` only for
  secondary/small controls that are not the primary action on a screen.

### Language

UI copy (labels, buttons, error messages, empty states) is Indonesian. Code, comments,
class names, and docs (this file included) are English. Don't mix — a new component
should read like `Sedang masuk…`, `Coba lagi`, `Belum ada data`, matching the tone
already in `ui.tsx`/`learning.tsx` (plain, short, no exclamation marks).

### Adding something new

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

### Looking ahead: Phase 4 (Kanban/project boards)

Nothing board-shaped exists in the codebase yet — don't treat the names below as real
classes. When Phase 4 is built, keep it inside this same kit instead of starting a
parallel design language:

- A board column is a `.card`-shaped container; a board card reuses `.card` sizing and
  the existing hairline-row rhythm (`border-top`/`border-bottom`, `14–18px` vertical
  padding) seen in `.task-item`/`.archive-item`, not a new shadow/elevation system —
  this kit has no shadows, only 1px borders.
  This is intentional: no elevation is used to signal depth anywhere in the app.
- Status/priority pills reuse `.badge`/`.badge-gold`/`.badge-draft` rather than
  introducing a new color-coded label system.
  A new priority scale should map onto the existing token set (`--color-blue`,
  `--color-gold`, `--color-danger`, `--color-muted`), not new hex colors.
- Drag affordances, column headers, and the board scroll container should follow the
  `.table-scroll` precedent: the page never scrolls horizontally, only the board's own
  container does, and it must not break the 390px/820px no-horizontal-scroll rule.
- Add the real classes to the catalogue above in the same PR that introduces them.
