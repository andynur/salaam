// Single source for product branding; `src/web/index.html` mirrors the static title and description.
export const BRAND = {
  name: "SALAAM",
  tagline: "Learn. Build. Grow.",
  descriptor: "Learning & Growth Platform",
  organization: "HSI Boarding School",
} as const;

export const brandTitle = (page?: string) => page ? `${page} | ${BRAND.name}` : `${BRAND.name} — ${BRAND.organization}`;
