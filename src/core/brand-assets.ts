import { existsSync } from "node:fs";
import { join } from "node:path";
import favicon from "../../assets/brand/favicon.ico" with { type: "file" };
import appleTouchIcon from "../../assets/brand/apple-touch-icon.png" with { type: "file" };
import icon192 from "../../assets/brand/icon-192.png" with { type: "file" };
import icon512 from "../../assets/brand/icon-512.png" with { type: "file" };
import iconMaskable from "../../assets/brand/icon-maskable-512.png" with { type: "file" };
import socialPreview from "../../assets/brand/og-image.png" with { type: "file" };
import { securityHeaders } from "./http";

// Unhashed URLs requested directly by browsers, the web app manifest, and link previews.
// Icons referenced from `src/web/index.html` are also bundled there under hashed names.
const assets: Record<string, [path: string, type: string]> = {
  "/favicon.ico": [favicon, "image/x-icon"],
  "/apple-touch-icon.png": [appleTouchIcon, "image/png"],
  "/icon-192.png": [icon192, "image/png"],
  "/icon-512.png": [icon512, "image/png"],
  "/icon-maskable-512.png": [iconMaskable, "image/png"],
  "/og-image.png": [socialPreview, "image/png"],
};

// Source runs import absolute paths; the production bundle imports publicPath-prefixed
// names that sit next to `dist/server.js`.
function located(path: string): string {
  return existsSync(path) ? path : join(import.meta.dir, path);
}

export async function brandAssetRoutes(production: boolean): Promise<Record<string, Response>> {
  const headers = { ...securityHeaders(production), "Cache-Control": "public, max-age=86400" };
  return Object.fromEntries(await Promise.all(Object.entries(assets).map(async ([route, [path, type]]) =>
    [route, new Response(await Bun.file(located(path)).bytes(), { headers: { ...headers, "Content-Type": type } })] as const)));
}
