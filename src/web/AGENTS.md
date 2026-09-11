# src/web — SPA rules

Read `DESIGN.md` before changing a screen. It lists the tokens, components, and CSS classes
that already exist.

- Routing is manual: `main.tsx` picks a page from `location.pathname`. A new path also goes
  into the `routes` map in `src/server.ts` (otherwise a reload returns 404) and into
  `navigationFor()` in `layouts/navigation.ts` (sidebar and global search).
- Fetch with `api()` from `lib/api.ts`; it throws `ApiError` carrying the server's
  Indonesian message. Load views with `useData`, paginate with `Pager` and `Search`, and
  submit with `MutationForm` and `Field` from `components/learning.tsx`.
- Import data types from `src/shared/`. The only server import is
  `import type { Actor }` from `src/core/permissions`.
- Style with semantic classes in `styles/app.css`, inside the `@layer components` block for
  the feature area, using `--color-*` tokens. No Tailwind utility classes in JSX, no raw hex
  colors, no UI or icon packages; add icons to `components/icons.tsx`.
- Every data view has loading, empty, error-with-retry, and success states. Pending forms
  are disabled and guarded against double submission with a ref.
- Copy is Indonesian, short, and without exclamation marks. Use `BRAND` and `brandTitle()`
  for the product name.
- Keyboard and screen-reader parity: real labels, `aria-current`, `aria-expanded`, a button
  alternative for every drag action, and visible focus.
- No document-level horizontal scroll at 390px or 820px; wide content scrolls inside
  `.table-scroll` or `.board`.
- Verify UI changes with `bun run build` and, when practical, skill `browser-qa`.
