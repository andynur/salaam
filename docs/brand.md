# SALAAM Brand Guidelines

This is the reference for how SALAAM presents itself in the product, documentation, and
shared links. The product was renamed from Learning OS to SALAAM in September 2026; the
technical names that keep the old name on purpose are listed near the end.

## Identity

| Element | Value | Rule |
| --- | --- | --- |
| Product name | **SALAAM** | Always uppercase, one word, never translated or abbreviated |
| Tagline | **Learn. Build. Grow.** | English, three words with periods; never translated |
| Descriptor | **Learning & Growth Platform** | Use where the name needs a one-line explanation |
| Organization | **HSI Boarding School** | The owning school; its logo stays the organization logo |

Browser titles use `SALAAM — HSI Boarding School` for the application and
`<Page> | SALAAM` for a page, for example `Dashboard | SALAAM`.

`src/web/lib/brand.ts` (`BRAND`, `brandTitle()`) is the single source for these strings
in the web app. `src/web/index.html` and `assets/brand/site.webmanifest` repeat the static
values because they load before JavaScript; change all three together.

## Meaning and philosophy

SALAAM comes from the Arabic word "Salām" (سلام): peace, safety, well-being, and positive
growth. The three principles are **Learn** (knowledge and understanding), **Build**
(challenges, projects, and meaningful work), and **Grow** (skills, achievements,
character, and a lasting portfolio).

The mark is a handshake: the gesture that accompanies the salām greeting and stands for
peace, trust, and growing together.

Use the Arabic script only in about or philosophy contexts, such as the README
Philosophy section. Do not put it in UI chrome, page titles, icons, or notifications.

**Exception — login greeting.** HSI Boarding School is an Islamic school, so the login
form badge greets users with "السَّلاَمُ عَلَيْكُمْ وَرَحْمَةُ اللهِ وَبَرَكَاتُهُ". This is the only place in the UI
where Arabic script appears; do not extend it to other screens.

## Voice and language

- UI copy is Indonesian. The product name, tagline, and descriptor stay in English.
- Show the tagline once per surface: the sidebar footer, the social preview, the web app
  manifest description, and the README. Do not repeat it in page headers, empty states,
  errors, or buttons.
- Keep the login page's Indonesian welcome copy; it speaks to students and staff, while
  the product name marks the product. The Arabic greeting in the login badge is the one
  exception to Indonesian UI copy (see Meaning and philosophy).

## Logos

### HSI Boarding School logo

`assets/logo-white.png` and `assets/logo-color.png` are the organization logo. The white
version sits on the navy login brand panel and the social preview; the color version
identifies the school in the sidebar space header, on a white bordered tile. Do not
recolor, crop, or stretch it, and do not replace it with the SALAAM mark on those
surfaces.

### SALAAM mark

`assets/brand/salaam-mark.svg` is a white outline handshake on a blue rounded tile. It
identifies the product: the app topbar (28 px, 24 px on phones), browser tabs,
home-screen and install icons, and the social preview.

- Tile: 64 × 64 units, corner radius 14, color `#1D5FD1` (`--color-blue`).
- Handshake: a 24-unit line icon (2.25 stroke, round caps and joins, no fill) scaled
  1.95× and centered on the tile, which matches the 24-unit line style of the UI icons.
- Clear space: at least one quarter of the tile width on every side.
- Minimum size: 16 px. At 16 px the handshake reads as a silhouette; the tile color
  carries recognition, so do not simplify or thicken the drawing for small sizes.
- Backgrounds: white, `--color-background`, or `--color-navy`. Avoid blue backgrounds.
- Do not recolor the tile or outline, fill the hands, add shadows or gradients, rotate,
  mirror, or stretch the mark, or place text inside the tile.

### Wordmark

There is no wordmark image. Set "SALAAM" as live text in `--font-sans`:

- UI sizes: 16 px (15 px on phones), weight 650 — the page-title weight — with `0.03em`
  letter spacing, in `--color-text`, 8 px after the mark.
- Display sizes (social preview): weight 700 with up to `0.06em` letter spacing, in
  white on navy, with the text cap height close to the mark height.

## Color

Brand color uses the existing UI tokens in `src/web/styles/app.css`; there is no separate
brand palette.

| Token | Value | Brand use |
| --- | --- | --- |
| `--color-navy` | `#0b1f3a` | Brand panels, social preview background, `theme-color` |
| `--color-blue` | `#1d5fd1` | Mark tile |
| `--color-gold` | `#eab308` | Tagline, rules, and dots on navy only — never text on white |
| `--color-surface` | `#ffffff` | Mark glyph, text on navy, manifest background |
| `--color-border` | `#dfe1e6` | Secondary text on navy |

## Typography

Use `--font-sans` everywhere, including brand text. Do not introduce a display font for
the brand.

## Assets

| File | Format | Served at | Use |
| --- | --- | --- | --- |
| `salaam-mark.svg` | SVG, 64-unit grid | Hashed URL from `index.html` | SVG favicon, README |
| `favicon.ico` | ICO with PNG 16/32/48 entries | `/favicon.ico` and hashed URL | Legacy favicon |
| `apple-touch-icon.png` | PNG 180 × 180, square tile | `/apple-touch-icon.png` and hashed URL | iOS home screen |
| `icon-192.png`, `icon-512.png` | PNG, rounded tile, transparent corners | `/icon-192.png`, `/icon-512.png` | Manifest icons (`any`) |
| `icon-maskable-512.png` | PNG 512 × 512, square tile, handshake at 75% | `/icon-maskable-512.png` | Manifest icon (`maskable`) |
| `og-image.png` | PNG 1200 × 630 | `/og-image.png` | Link previews (Open Graph, Twitter card) |
| `site.webmanifest` | JSON | Hashed URL from `index.html` | Install name, icons, and colors |

All files live in `assets/brand/`. `src/web/index.html` links the favicon, touch icon,
and manifest; Bun bundles those links under hashed names. The manifest icons and the
social preview need stable URLs, so `src/core/brand-assets.ts` also serves the raster
files at the fixed paths above with a one-day public cache. When you add, rename, or
remove an asset, update `index.html`, `site.webmanifest`, `brand-assets.ts`, and
`tests/brand.test.ts` together.

### Social preview

The social preview mirrors the login brand panel: a navy background with faint
concentric rings, the white HSI logo at the top left, the mark and "SALAAM" (112 px,
weight 700), the gold tagline (40 px), a 64 × 4 px gold rule, and
"Learning & Growth Platform • HSI Boarding School" (26 px, `--color-border`). It contains
no user data.

`og:image` is the root-relative `/og-image.png` because the HTML is built before the
deployment origin is known. Some crawlers require an absolute URL and may skip the image;
if previews must work in every client, set an absolute URL based on `APP_BASE_URL` at
deploy time.

### Regenerating raster assets

Edit `salaam-mark.svg` first, then export every raster file from it at device scale 1:

- `icon-192.png` and `icon-512.png`: the mark as drawn, on a transparent background.
- `apple-touch-icon.png`: the tile without corner radius (platforms apply their own mask).
- `icon-maskable-512.png`: the tile without corner radius and the handshake scaled to
  75% around the center, which keeps it inside the maskable safe zone.
- `favicon.ico`: PNG-compressed 16, 32, and 48 px renders of the mark.
- `og-image.png`: the layout described under Social preview.

Check every size visually, then run `bun test tests/brand.test.ts` and `bun run build`.

## Names that stay technical

These identifiers keep the original name on purpose. Renaming them would need data or
deployment migrations and is not a branding change:

- package name `hsi-learning-os`;
- databases `hsi_learning_os` and `hsi_learning_os_test`;
- browser storage keys `learning-os:sidebar-collapsed` and `learning-os:attempt:<id>`
  (renaming would drop sidebar preferences and pending exam answers saved on the device).

## Credits

The handshake outline is adapted from the Lucide `handshake` icon
(<https://lucide.dev>), used under the ISC License:

> Copyright (c) Lucide Contributors 2022.
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with
> or without fee is hereby granted, provided that the above copyright notice and this
> permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO
> THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO
> EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL
> DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER
> IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
> CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

A handshake outline is a common symbol. Before registering SALAAM as a trademark or
printing it at large scale, commission a custom drawing of the mark.
