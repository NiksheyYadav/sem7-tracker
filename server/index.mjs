// Sem 7 Tracker — single Neon Function: serves the web app + JSON API + private file storage
import pg from "pg";
import crypto from "node:crypto";
import { AwsClient } from "aws4fetch";
import { INDEX_HTML, APP_JS, STYLE_CSS } from "./assets.gen.mjs";

// keep DATE columns as plain 'YYYY-MM-DD' strings, numerics as numbers
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v == null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => Number(v));

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000 });
pool.on("error", (e) => console.error("pg idle client error", e.message));
const q = async (text, params = []) => (await pool.query(text, params)).rows;

const BUCKET = process.env.BUCKET || "tracker-files";
const S3_BASE = (process.env.AWS_ENDPOINT_URL_S3 || "").replace(/\/+$/, "");
const aws = new AwsClient({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || "", secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  service: "s3", region: process.env.AWS_REGION || "ap-southeast-1",
});
const objUrl = (key) => `${S3_BASE}/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`;
async function s3Put(key, body, type) {
  const r = await aws.fetch(objUrl(key), { method: "PUT", body, headers: { "content-type": type, "content-length": String(body.length) } });
  if (!r.ok) throw new Error(`storage put ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
async function s3SignedPut(key, type) {
  const u = new URL(objUrl(key));
  u.searchParams.set("X-Amz-Expires", "900");
  const signed = await aws.sign(u.toString(), { method: "PUT", headers: { "content-type": type }, aws: { signQuery: true, allHeaders: true } });
  return signed.url;
}
async function s3Head(key) {
  const r = await aws.fetch(objUrl(key), { method: "HEAD" });
  return r.ok ? Number(r.headers.get("content-length") || 0) : -1;
}
async function s3Del(key) { await aws.fetch(objUrl(key), { method: "DELETE" }); }
async function s3SignedGet(key, disposition, type) {
  const u = new URL(objUrl(key));
  u.searchParams.set("X-Amz-Expires", "600");
  u.searchParams.set("response-content-disposition", disposition);
  u.searchParams.set("response-content-type", type);
  const signed = await aws.sign(u.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
// password hashing (scrypt) + signed session tokens (HMAC-SHA256) using only node:crypto
const scryptP = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? no(e) : ok(k))));
const bcrypt = {
  async hash(pw) { const salt = crypto.randomBytes(16); return `s1$${salt.toString("base64")}$${(await scryptP(pw, salt)).toString("base64")}`; },
  async compare(pw, stored) {
    const [v, salt, hash] = String(stored || "").split("$");
    if (v !== "s1" || !salt || !hash) return false;
    const k = await scryptP(pw, Buffer.from(salt, "base64")), h = Buffer.from(hash, "base64");
    return h.length === k.length && crypto.timingSafeEqual(h, k);
  },
};
const b64u = (b) => Buffer.from(b).toString("base64url");
const hmac = (d) => crypto.createHmac("sha256", SECRET).update(d).digest("base64url");
function signToken(payload) { const body = b64u(JSON.stringify(payload)); return `${body}.${hmac(body)}`; }
function verifyToken(tok) {
  const [body, sig] = String(tok).split(".");
  if (!body || !sig) return null;
  const want = hmac(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  return p.exp && p.exp > Date.now() / 1000 ? p : null;
}
const ADMIN_ROLLS = () => (process.env.ADMIN_ROLLS || "").split(",").map((s) => s.trim()).filter(Boolean);
const KINDS = ["TA1", "TA2", "TA3", "TA4", "TA5", "ERLA1", "ERLA2", "PA"];
const COOKIE = "tk";
const MAX_FILE = 100 * 1024 * 1024; // 100 MB
const STATIC_VER = String(Date.now());

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => { throw new HttpError(400, m); };

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}
const sessionCookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const issue = async (user) => signToken({ uid: user.id, exp: Math.floor(Date.now() / 1000) + 60 * 86400 });

async function currentUser(req) {
  if (req._user !== undefined) return req._user;
  const tok = readCookie(req, COOKIE);
  let u = null;
  if (tok) {
    try {
      const payload = verifyToken(tok);
      if (payload) u = (await q("select id, roll_no, name, section, is_admin, prefs, created_at from users where id=$1", [payload.uid]))[0] || null;
    } catch { u = null; }
  }
  req._user = u;
  return u;
}
async function needUser(req) {
  const u = await currentUser(req);
  if (!u) throw new HttpError(401, "Please log in");
  return u;
}

const str = (v, max = 500) => (v == null ? null : String(v).slice(0, max));
const dateOrNull = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const numOrNull = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
const normRoll = (r) => String(r || "").trim().toUpperCase();

async function subjectVisibleTo(user, subjectId) {
  const r = await q("select id from subjects where id=$1 and (owner_id is null or owner_id=$2)", [subjectId, user.id]);
  if (!r.length) bad("Unknown subject");
}

// tiny per-isolate login throttle
const attempts = new Map();
function throttle(key) {
  const now = Date.now(), a = attempts.get(key) || { n: 0, t: now };
  if (now - a.t > 10 * 60 * 1000) { a.n = 0; a.t = now; }
  a.n++; attempts.set(key, a);
  if (a.n > 12) throw new HttpError(429, "Too many attempts — wait a few minutes");
}

// ---------------------------------------------------------------- routes  (c = {req, body, url})
const routes = {
  "POST auth/signup": async ({ body: b }) => {
    const roll = normRoll(b.roll_no);
    const name = str(b.name, 80)?.trim();
    const pw = String(b.password || "");
    if (!/^[A-Z0-9]{5,15}$/.test(roll)) bad("Enter a valid roll number");
    if (!name) bad("Enter your name");
    if (pw.length < 6) bad("Password must be at least 6 characters");
    if ((await q("select 1 from users where roll_no=$1", [roll])).length) bad("This roll number already has an account — log in instead");
    const rows = await q(
      "insert into users (roll_no, name, section, password_hash, is_admin) values ($1,$2,$3,$4,$5) returning id, roll_no, name, section, is_admin, prefs",
      [roll, name, str(b.section, 20), await bcrypt.hash(pw, 10), ADMIN_ROLLS().includes(roll)]
    );
    return json({ user: rows[0] }, 200, { "set-cookie": sessionCookie(await issue(rows[0]), 60 * 86400) });
  },

  "POST auth/login": async ({ body: b }) => {
    const roll = normRoll(b.roll_no);
    throttle("login:" + roll);
    const u = (await q("select * from users where roll_no=$1", [roll]))[0];
    if (!u || !(await bcrypt.compare(String(b.password || ""), u.password_hash))) bad("Wrong roll number or password");
    attempts.delete("login:" + roll);
    delete u.password_hash;
    return json({ user: u }, 200, { "set-cookie": sessionCookie(await issue(u), 60 * 86400) });
  },

  "POST auth/logout": async () => json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) }),

  "POST auth/password": async ({ req, body: b }) => {
    const u = await needUser(req);
    const rows = await q("select password_hash from users where id=$1", [u.id]);
    if (!(await bcrypt.compare(String(b.old || ""), rows[0].password_hash))) bad("Current password is wrong");
    if (String(b.new || "").length < 6) bad("New password must be at least 6 characters");
    await q("update users set password_hash=$1 where id=$2", [await bcrypt.hash(String(b.new), 10), u.id]);
    return json({ ok: true });
  },

  "GET me": async ({ req }) => json({ user: await currentUser(req) }),

  "POST prefs": async ({ req, body: b }) => {
    const u = await needUser(req);
    const s = JSON.stringify(b.prefs || {});
    if (s.length > 20000) bad("Settings too large");
    const rows = await q("update users set prefs = prefs || $1::jsonb where id=$2 returning prefs", [s, u.id]);
    return json({ prefs: rows[0].prefs });
  },

  "POST profile": async ({ req, body: b }) => {
    const u = await needUser(req);
    const name = str(b.name, 80)?.trim();
    if (!name) bad("Enter your name");
    await q("update users set name=$1, section=$2 where id=$3", [name, str(b.section, 20), u.id]);
    return json({ ok: true });
  },

  "GET bootstrap": async ({ req }) => {
    const u = await needUser(req);
    const [subjects, deadlines, assessments, assignments, todos, topics, files, batch] = await Promise.all([
      q("select * from subjects where owner_id is null or owner_id=$1 order by sort, id", [u.id]),
      q("select * from batch_deadlines"),
      q("select * from assessments where user_id=$1", [u.id]),
      q("select * from assignments where user_id=$1 order by done, due_date nulls last, id", [u.id]),
      q("select * from todos where user_id=$1 order by done, id desc", [u.id]),
      q("select subject_id, topic_key from topic_progress where user_id=$1 and done", [u.id]),
      q("select id, subject_id, kind, name, size, content_type, created_at from files where user_id=$1 order by created_at desc", [u.id]),
      q("select count(*)::int as n from users"),
    ]);
    return json({ user: u, subjects, deadlines, assessments, assignments, todos, topics, files, kinds: KINDS, batchSize: batch[0].n });
  },

  "PUT assessment": async ({ req, body: b }) => {
    const u = await needUser(req);
    if (!KINDS.includes(b.kind)) bad("Unknown assessment type");
    await subjectVisibleTo(u, b.subject_id);
    const rows = await q(
      `insert into assessments (user_id, subject_id, kind, topic, due_date, report, ppt, viva, submitted, marks, max_marks, notes, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       on conflict (user_id, subject_id, kind) do update set topic=excluded.topic, due_date=excluded.due_date, report=excluded.report,
         ppt=excluded.ppt, viva=excluded.viva, submitted=excluded.submitted, marks=excluded.marks, max_marks=excluded.max_marks,
         notes=excluded.notes, updated_at=now()
       returning *`,
      [u.id, b.subject_id, b.kind, str(b.topic, 300), dateOrNull(b.due_date), !!b.report, !!b.ppt, !!b.viva, !!b.submitted,
       numOrNull(b.marks), numOrNull(b.max_marks), str(b.notes, 3000)]
    );
    return json({ assessment: rows[0] });
  },

  "PUT topic": async ({ req, body: b }) => {
    const u = await needUser(req);
    await subjectVisibleTo(u, b.subject_id);
    const key = str(b.topic_key, 40);
    if (b.done) await q("insert into topic_progress (user_id, subject_id, topic_key, done) values ($1,$2,$3,true) on conflict do nothing", [u.id, b.subject_id, key]);
    else await q("delete from topic_progress where user_id=$1 and subject_id=$2 and topic_key=$3", [u.id, b.subject_id, key]);
    return json({ ok: true });
  },

  "POST subject": async ({ req, body: b }) => {
    const u = await needUser(req);
    const name = str(b.name, 100)?.trim();
    if (!name) bad("Enter a subject name");
    if ((await q("select count(*)::int n from subjects where owner_id=$1", [u.id]))[0].n >= 15) bad("Too many custom subjects");
    const rows = await q(
      "insert into subjects (code, name, short, kind, is_default, exam_date, exam_slot, color, owner_id, sort) values ($1,$2,$3,'custom',true,$4,$5,$6,$7,50) returning *",
      [str(b.code, 20), name, str(b.short, 14) || name.slice(0, 12), dateOrNull(b.exam_date), str(b.exam_slot, 40), /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#6366f1", u.id]
    );
    return json({ subject: rows[0] });
  },
  "DELETE subject": async ({ req }, id) => {
    const u = await needUser(req);
    await q("delete from subjects where id=$1 and owner_id=$2", [id, u.id]);
    return json({ ok: true });
  },

  "POST assignment": async ({ req, body: b }) => {
    const u = await needUser(req);
    const title = str(b.title, 200)?.trim();
    if (!title) bad("Enter a title");
    if (b.subject_id) await subjectVisibleTo(u, b.subject_id);
    const rows = await q("insert into assignments (user_id, subject_id, title, due_date, notes) values ($1,$2,$3,$4,$5) returning *",
      [u.id, b.subject_id || null, title, dateOrNull(b.due_date), str(b.notes, 2000)]);
    return json({ assignment: rows[0] });
  },
  "PUT assignment": async ({ req, body: b }, id) => {
    const u = await needUser(req);
    if (b.subject_id) await subjectVisibleTo(u, b.subject_id);
    const rows = await q("update assignments set title=coalesce($1,title), subject_id=$2, due_date=$3, done=$4, notes=$5 where id=$6 and user_id=$7 returning *",
      [str(b.title, 200), b.subject_id || null, dateOrNull(b.due_date), !!b.done, str(b.notes, 2000), id, u.id]);
    return json({ assignment: rows[0] });
  },
  "DELETE assignment": async ({ req }, id) => {
    const u = await needUser(req);
    await q("delete from assignments where id=$1 and user_id=$2", [id, u.id]);
    return json({ ok: true });
  },

  "POST todo": async ({ req, body: b }) => {
    const u = await needUser(req);
    const text = str(b.text, 300)?.trim();
    if (!text) bad("Write something first");
    if ((await q("select count(*)::int n from todos where user_id=$1", [u.id]))[0].n >= 500) bad("Checklist is full — delete some done items");
    return json({ todo: (await q("insert into todos (user_id, text) values ($1,$2) returning *", [u.id, text]))[0] });
  },
  "PUT todo": async ({ req, body: b }, id) => {
    const u = await needUser(req);
    return json({ todo: (await q("update todos set done=$1, text=coalesce($2,text) where id=$3 and user_id=$4 returning *", [!!b.done, str(b.text, 300), id, u.id]))[0] });
  },
  "DELETE todo": async ({ req }, id) => {
    const u = await needUser(req);
    await q("delete from todos where id=$1 and user_id=$2", [id, u.id]);
    return json({ ok: true });
  },

  // ---- files (private bucket; everything goes through the session check)
  "POST upload": async ({ req, url }) => {
    const u = await needUser(req);
    const name = (url.searchParams.get("name") || "file").replace(/[\\/\u0000-\u001f]+/g, "_").slice(-150);
    const sid = numOrNull(url.searchParams.get("subject_id"));
    const kind = url.searchParams.get("kind") || null;
    if (kind && !KINDS.includes(kind)) bad("Unknown assessment type");
    if (sid) await subjectVisibleTo(u, sid);
    const len = Number(req.headers.get("content-length") || 0);
    if (len > MAX_FILE) bad("File is over 100 MB");
    const used = (await q("select coalesce(sum(size),0)::bigint s from files where user_id=$1", [u.id]))[0].s;
    if (used + len > 1024 * 1024 * 1024) bad("You've used your 1 GB — delete some files first");
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) bad("Empty file");
    if (buf.length > MAX_FILE) bad("File is over 100 MB");
    const type = (req.headers.get("content-type") || "application/octet-stream").slice(0, 120);
    const key = `u/${u.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}/${name}`;
    await s3Put(key, buf, type);
    const rows = await q("insert into files (user_id, subject_id, kind, name, url, pathname, size, content_type) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, subject_id, kind, name, size, content_type, created_at",
      [u.id, sid, kind, name, "s3://" + BUCKET + "/" + key, key, buf.length, type]);
    return json({ file: rows[0] });
  },
  // direct-to-storage upload: 1) get a signed URL, 2) browser PUTs the file, 3) confirm
  "POST upload-url": async ({ req, body: b }) => {
    const u = await needUser(req);
    const size = Number(b.size || 0);
    if (!size) bad("Empty file");
    if (size > MAX_FILE) bad("File is over 100 MB");
    if (b.kind && !KINDS.includes(b.kind)) bad("Unknown assessment type");
    if (b.subject_id) await subjectVisibleTo(u, b.subject_id);
    const used = (await q("select coalesce(sum(size),0)::bigint s from files where user_id=$1", [u.id]))[0].s;
    if (used + size > 1024 * 1024 * 1024) bad("You've used your 1 GB — delete some files first");
    const name = String(b.name || "file").replace(/[\\/\u0000-\u001f]+/g, "_").slice(-150);
    const type = String(b.type || "application/octet-stream").slice(0, 120);
    const key = `u/${u.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}/${name}`;
    return json({ url: await s3SignedPut(key, type), key, type });
  },
  "POST upload-done": async ({ req, body: b }) => {
    const u = await needUser(req);
    const key = String(b.key || "");
    if (!key.startsWith(`u/${u.id}/`) || key.includes("..")) bad("Bad file key");
    const size = await s3Head(key);
    if (size <= 0) bad("Upload didn't reach storage — try again");
    if (size > MAX_FILE) { await s3Del(key); bad("File is over 100 MB"); }
    if (b.kind && !KINDS.includes(b.kind)) bad("Unknown assessment type");
    if (b.subject_id) await subjectVisibleTo(u, b.subject_id);
    if ((await q("select 1 from files where pathname=$1", [key])).length) bad("Already saved");
    const name = key.split("/").pop();
    const rows = await q("insert into files (user_id, subject_id, kind, name, url, pathname, size, content_type) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, subject_id, kind, name, size, content_type, created_at",
      [u.id, b.subject_id || null, b.kind || null, name, "s3://" + BUCKET + "/" + key, key, size, str(b.type, 120) || "application/octet-stream"]);
    return json({ file: rows[0] });
  },
  "GET file": async ({ req, url }, id) => {
    const u = await needUser(req);
    const f = (await q("select * from files where id=$1 and user_id=$2", [id, u.id]))[0];
    if (!f) throw new HttpError(404, "File not found");
    const dl = url.searchParams.get("download") === "1";
    const safe = f.name.replace(/["\\\r\n]/g, "_");
    const signed = await s3SignedGet(f.pathname,
      `${dl ? "attachment" : "inline"}; filename="${safe.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      f.content_type || "application/octet-stream");
    return new Response(null, { status: 302, headers: { location: signed, "cache-control": "no-store" } });
  },
  "DELETE file": async ({ req }, id) => {
    const u = await needUser(req);
    const rows = await q("delete from files where id=$1 and user_id=$2 returning pathname", [id, u.id]);
    if (rows[0]) { try { await s3Del(rows[0].pathname); } catch (e) { console.error("s3 delete failed", e.message); } }
    return json({ ok: true });
  },

  // ---- admin
  "PUT deadline": async ({ req, body: b }) => {
    const u = await needUser(req);
    if (!u.is_admin) throw new HttpError(403, "Only admins can set batch deadlines");
    if (!KINDS.includes(b.kind)) bad("Unknown assessment type");
    if (!b.due_date && !b.note) {
      await q("delete from batch_deadlines where subject_id=$1 and kind=$2", [b.subject_id, b.kind]);
      return json({ deadline: null });
    }
    const rows = await q(`insert into batch_deadlines (subject_id, kind, due_date, note) values ($1,$2,$3,$4)
      on conflict (subject_id, kind) do update set due_date=excluded.due_date, note=excluded.note, updated_at=now() returning *`,
      [b.subject_id, b.kind, dateOrNull(b.due_date), str(b.note, 300)]);
    return json({ deadline: rows[0] });
  },
  "POST admin/reset": async ({ req, body: b }) => {
    const u = await needUser(req);
    if (!u.is_admin) throw new HttpError(403, "Admins only");
    if (String(b.password || "").length < 6) bad("Temporary password must be at least 6 characters");
    const rows = await q("update users set password_hash=$1 where roll_no=$2 returning roll_no, name", [await bcrypt.hash(String(b.password), 10), normRoll(b.roll_no)]);
    if (!rows.length) bad("No account with that roll number");
    return json({ user: rows[0] });
  },
  "GET admin/users": async ({ req }) => {
    const u = await needUser(req);
    if (!u.is_admin) throw new HttpError(403, "Admins only");
    return json({ users: await q(`select u.roll_no, u.name, u.section, u.created_at,
        (select count(*) from assessments a where a.user_id=u.id and a.submitted)::int as submitted,
        (select count(*) from files f where f.user_id=u.id)::int as files
      from users u order by u.roll_no`) });
  },
};

const STATIC = {
  "/app.js": [APP_JS, "text/javascript; charset=utf-8"],
  "/style.css": [STYLE_CSS, "text/css; charset=utf-8"],
};
const SEC_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" };

export default async function handler(req) {
  const url = new URL(req.url);
  const p = url.pathname;

  if (!p.startsWith("/api/")) {
    if (STATIC[p]) {
      const [body, type] = STATIC[p];
      return new Response(body, { headers: { "content-type": type, "cache-control": "public, max-age=300", ...SEC_HEADERS } });
    }
    if (p === "/favicon.ico") return new Response(null, { status: 204 });
    const html = INDEX_HTML.replace('/style.css"', `/style.css?v=${STATIC_VER}"`).replace('/app.js"', `/app.js?v=${STATIC_VER}"`);
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", ...SEC_HEADERS } });
  }

  let path = p.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  let id = null;
  const m = path.match(/^(.*)\/(\d+)$/);
  if (m) { path = m[1]; id = Number(m[2]); }
  const fn = routes[`${req.method} ${path}`];
  try {
    if (!fn) throw new HttpError(404, "Not found");
    // CSRF guard: state-changing requests must come from our own pages
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      let oh = null; try { oh = origin ? new URL(origin).host : null; } catch {}
      if (origin && oh !== (req.headers.get("x-forwarded-host") || req.headers.get("host"))) throw new HttpError(403, "Bad origin");
    }
    let body = {};
    if (path !== "upload" && req.method !== "GET" && (req.headers.get("content-type") || "").includes("application/json")) {
      try { body = await req.json(); } catch { body = {}; }
    }
    return await fn({ req, body, url }, id);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    return json({ error: status === 500 ? "Server error — please try again" : e.message }, status);
  }
}
