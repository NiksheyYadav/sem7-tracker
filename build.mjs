import fs from "fs";
import { build } from "esbuild";
const r = (f) => fs.readFileSync(f, "utf8");
fs.writeFileSync("server/assets.gen.mjs",
  `export const INDEX_HTML = ${JSON.stringify(r("public/index.html"))};\nexport const APP_JS = ${JSON.stringify(r("public/app.js"))};\nexport const STYLE_CSS = ${JSON.stringify(r("public/style.css"))};\n`);
await build({
  entryPoints: ["server/index.mjs"], bundle: true, platform: "node", target: "node24", format: "esm",
  outfile: "dist/index.mjs", minify: true, legalComments: "none",
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  external: ["pg-native"],
});
console.log("built", fs.statSync("dist/index.mjs").size);
