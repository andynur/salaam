import { rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

await rm("dist", { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["src/server.ts"],
  outdir: "dist",
  publicPath: "/",
  target: "bun",
  minify: true,
  sourcemap: "none",
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!result.success) {
  for (const issue of result.logs) console.error(issue);
  process.exit(1);
}
console.log(`Built ${result.outputs.length} production assets.`);
