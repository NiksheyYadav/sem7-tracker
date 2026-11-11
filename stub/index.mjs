// Loader: fetches the app bundle from Neon storage, verifies its SHA-256, then serves it.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import crypto from "node:crypto";
let mod = null;
async function load() {
  const r = await fetch(process.env.CODE_URL);
  if (!r.ok) throw new Error("code fetch " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const sum = crypto.createHash("sha256").update(buf).digest("hex");
  if (process.env.CODE_SHA && sum !== process.env.CODE_SHA) throw new Error("code checksum mismatch");
  const f = path.join(os.tmpdir(), "app-" + sum.slice(0, 12) + ".mjs");
  fs.writeFileSync(f, buf);
  return import(f);
}
export default {
  fetch: async (req) => {
    try { mod ??= load(); return await (await mod).default(req); }
    catch (e) { mod = null; console.error(e); return new Response("Starting up failed, please refresh. " + e.message, { status: 503 }); }
  },
};
