import fs from "fs";
import { build } from "esbuild";
const r = (f) => fs.readFileSync(f, "utf8");
const b64 = (f) => fs.readFileSync(f).toString("base64");
const NOTES = { "130207125": r("notes/cyber.md"), "130207115": r("notes/seminar.md") };
const ICONS = { "/icon-192.png": b64("icons/icon-192.png"), "/icon-512.png": b64("icons/icon-512.png"), "/apple-touch-icon.png": b64("icons/apple-touch-icon.png") };
fs.writeFileSync("server/assets.gen.mjs",
  `export const INDEX_HTML = ${JSON.stringify(r("public/index.html"))};\n` +
  `export const APP_JS = ${JSON.stringify(r("public/app.js"))};\n` +
  `export const STYLE_CSS = ${JSON.stringify(r("public/style.css"))};\n` +
  `export const SW_JS = ${JSON.stringify(r("public/sw.js"))};\n` +
  `export const NOTES = ${JSON.stringify(NOTES)};\n` +
  `export const ICONS = ${JSON.stringify(ICONS)};\n`);
await build({
  entryPoints: ["server/index.mjs"], bundle: true, platform: "node", target: "node24", format: "esm",
  outfile: "dist/index.mjs", minify: true, legalComments: "none",
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  external: ["pg-native"],
});
console.log("built", fs.statSync("dist/index.mjs").size);
