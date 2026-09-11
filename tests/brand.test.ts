import { expect, test } from "bun:test";
import { brandAssetRoutes } from "../src/core/brand-assets";
import { BRAND, brandTitle } from "../src/web/lib/brand";

test("browser titles use the product and page patterns", () => {
  expect(brandTitle()).toBe("SALAAM — HSI Boarding School");
  expect(brandTitle("Dashboard")).toBe("Dashboard | SALAAM");
});
test("brand assets are served at stable URLs with type, caching, and security headers", async () => {
  const routes = await brandAssetRoutes(true);
  expect(Object.keys(routes).sort()).toEqual(["/apple-touch-icon.png", "/favicon.ico", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/og-image.png"]);
  for (const [path, response] of Object.entries(routes)) {
    const ico = path.endsWith(".ico");
    const signature = Array.from(new Uint8Array(await response.clone().arrayBuffer()).slice(0, 4));
    expect(signature).toEqual(ico ? [0, 0, 1, 0] : [0x89, 0x50, 0x4e, 0x47]);
    expect(response.headers.get("content-type")).toBe(ico ? "image/x-icon" : "image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
  }
});
test("manifest icons and the social preview point at served brand assets", async () => {
  const routes = await brandAssetRoutes(false);
  const manifest = await Bun.file(new URL("../assets/brand/site.webmanifest", import.meta.url)).json() as { short_name: string; icons: { src: string }[] };
  expect(manifest.short_name).toBe(BRAND.name);
  for (const icon of manifest.icons) expect(routes[icon.src]).toBeDefined();
  const html = await Bun.file(new URL("../src/web/index.html", import.meta.url)).text();
  const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  expect(routes[image ?? ""]).toBeDefined();
});
