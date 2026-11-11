// Sem 7 Tracker — single Neon Function: serves the web app + JSON API + private file storage
import pg from "pg";
import crypto from "node:crypto";
import { AwsClient } from "aws4fetch";
import * as webpush from "web-push";
import { INDEX_HTML, APP_JS, STYLE_CSS, SW_JS, NOTES, ICONS } from "./assets.gen.mjs";

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
// content hash, so every instance agrees on the version and it only changes when the code does
const STATIC_VER = (() => { let h = 0x811c9dc5; for (const t of [APP_JS, STYLE_CSS, INDEX_HTML]) for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); })();

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

// sections & minor-specialisation groups
const SECTIONS = {
  A: { name: "Data Science", groups: { DS: "Data Science" } },
  B: { name: "Cyber Security & Cloud Computing", groups: { CS: "Cyber Security", CC: "Cloud Computing" } },
  C: { name: "AI/ML", groups: { AIML: "AI/ML" } },
  D: { name: "AI/ML & iOS Development", groups: { AIML: "AI/ML", IOS: "iOS Development" } },
};
function cleanSecGrp(sec, grp) {
  sec = String(sec || "").trim().toUpperCase();
  if (!SECTIONS[sec]) return { section: null, grp: null };
  const gs = Object.keys(SECTIONS[sec].groups);
  grp = String(grp || "").trim().toUpperCase();
  if (!gs.includes(grp)) grp = gs.length === 1 ? gs[0] : null;
  return { section: sec, grp };
}
// who an item is for. Section admins can only target their own section.
function cleanTarget(b, admin) {
  let s = String(b.target_section || "").toUpperCase(), g = String(b.target_group || "").toUpperCase();
  if (!SECTIONS[s]) s = null;
  if (!s || !SECTIONS[s].groups[g]) g = null;
  if (admin.admin_scope) {
    if (s && s !== admin.admin_scope) throw new HttpError(403, `You can only post for Section ${admin.admin_scope}`);
    s = admin.admin_scope;
  }
  return { s, g };
}
const canManage = (u, item) => !!u.is_super || (u.is_admin && !u.admin_scope) || (!!u.admin_scope && item?.target_section === u.admin_scope);
const targetLabel = (s, g) => (s ? `[Sec ${s}${g ? " · " + g : ""}] ` : "");
const VIS = (a) => `(${a}.target_section is null or (${a}.target_section = $SEC and (${a}.target_group is null or ${a}.target_group = $GRP)))`;
const forUser = (sql, u, params = []) => q(sql.replaceAll("$SEC", `$${params.length + 1}`).replaceAll("$GRP", `$${params.length + 2}`), [...params, u.section || "", u.grp || ""]);
const visibleTo = (u, item) => !item.target_section || (item.target_section === u.section && (!item.target_group || item.target_group === u.grp));

async function currentUser(req) {
  if (req._user !== undefined) return req._user;
  const tok = readCookie(req, COOKIE);
  let u = null;
  if (tok) {
    try {
      const payload = verifyToken(tok);
      if (payload) u = (await q("select id, roll_no, name, section, grp, prefs, created_at from users where id=$1", [payload.uid]))[0] || null;
    } catch { u = null; }
  }
  if (u) await attachRole(u);
  req._user = u;
  return u;
}
async function attachRole(u) {
  u.is_super = ADMIN_ROLLS().includes(u.roll_no);
  const a = u.is_super ? null : (await q("select scope_section from admins where roll_no=$1", [u.roll_no]))[0];
  u.is_admin = u.is_super || !!a;
  u.admin_scope = u.is_super ? null : a?.scope_section || null;
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

async function needSuper(req) {
  const u = await needUser(req);
  if (!u.is_super) throw new HttpError(403, "Only the main admin can do this");
  return u;
}
async function needAdmin(req) {
  const u = await needUser(req);
  if (!u.is_admin) throw new HttpError(403, "Admins only");
  return u;
}
const fmtD = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
// one-line user text: strip control chars / zero-width / bidi tricks, collapse spaces, cap length (by characters, emoji-safe)
const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", txt: "text/plain", md: "text/markdown", csv: "text/csv",
  json: "application/json", py: "text/x-python", js: "text/javascript", java: "text/x-java", c: "text/x-c", cpp: "text/x-c++", html: "text/plain", sql: "text/plain", tcl: "text/plain",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
function guessType(name, ct) {
  const ext = String(name).split(".").pop().toLowerCase();
  if (ext === "svg" || ext === "html" || ext === "htm") return "text/plain"; // never render active content inline
  if (ct && ct !== "application/octet-stream" && !/html|svg|xml|javascript/i.test(ct)) return ct;
  return MIME[ext] || "application/octet-stream";
}
function cleanLine(v, max) {
  const t = String(v ?? "").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return [...t].slice(0, max).join("");
}
function cleanEvent(b) {
  const title = str(b.title, 150)?.trim();
  if (!title) bad("Enter a title");
  const d = dateOrNull(b.event_date);
  if (!d) bad("Pick a date");
  return { title, event_date: d, event_time: str(b.event_time, 40)?.trim() || null, note: str(b.note, 1000) || null,
    subject_id: numOrNull(b.subject_id), color: /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : null };
}
function cleanExam(b) {
  const name = str(b.name, 40)?.trim();
  if (!name) bad("Enter a name like UA-1");
  if (!numOrNull(b.subject_id)) bad("Pick a subject");
  return { subject_id: Number(b.subject_id), name, exam_date: dateOrNull(b.exam_date), slot: str(b.slot, 60)?.trim() || null, note: str(b.note, 500) || null };
}

// ---------------------------------------------------------------- push notifications
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || "";
if (VAPID_PUBLIC && process.env.VAPID_PRIVATE) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC, process.env.VAPID_PRIVATE);
async function sendTo(sub, payload) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) await q("delete from push_subs where endpoint=$1", [sub.endpoint]);
    else console.error("push failed", e.statusCode, e.body || e.message);
    return false;
  }
}
async function sendMany(subs, payload) {
  let n = 0;
  for (let i = 0; i < subs.length; i += 25) {
    const r = await Promise.all(subs.slice(i, i + 25).map((s) => sendTo(s, payload)));
    n += r.filter(Boolean).length;
  }
  return n;
}
async function pushToUser(uid, payload) {
  if (!VAPID_PUBLIC) return 0;
  return sendMany(await q("select * from push_subs where user_id=$1", [uid]), payload);
}
async function broadcast(payload, t = {}) {
  if (!VAPID_PUBLIC) return 0;
  const subs = await q(`select p.* from push_subs p join users u on u.id = p.user_id
    where $1::text is null or (u.section = $1 and ($2::text is null or u.grp = $2))`, [t.s || null, t.g || null]);
  return sendMany(subs, payload);
}
async function announce(title, body, notify, url, t = {}, author = null) {
  await q("insert into updates (title, body, kind, target_section, target_group, author_roll) values ($1,$2,'alert',$3,$4,$5)", [title.slice(0, 200), (body || "").slice(0, 2000), t.s || null, t.g || null, author]);
  if (notify) await broadcast({ title: targetLabel(t.s, t.g) + title, body: (body || "").slice(0, 180), url: url || "/#/notifications" }, t);
}

// scheduled reminders: called by a Neon cron trigger at ~8:00 and ~19:00 IST
async function runReminders(scheduledAt) {
  const now = scheduledAt ? new Date(scheduledAt) : new Date();
  const ist = new Date(now.getTime() + 330 * 60000);
  const today = ist.toISOString().slice(0, 10);
  const tomorrow = new Date(ist.getTime() + 86400000).toISOString().slice(0, 10);
  const morning = ist.getUTCHours() < 14;
  const dates = morning ? [today, tomorrow] : [tomorrow];
  const users = await q("select u.id, u.prefs, u.section, u.grp from users u where exists (select 1 from push_subs p where p.user_id=u.id)");
  if (!users.length) return { users: 0, sent: 0 };
  const [subjects, exams, deadlines, events] = await Promise.all([
    q("select id, short, kind, owner_id from subjects"),
    q("select * from exams where exam_date = any($1::date[])", [dates]),
    q("select * from batch_deadlines where due_date = any($1::date[])", [dates]),
    q("select * from events where event_date = any($1::date[])", [dates]),
  ]);
  const sById = Object.fromEntries(subjects.map((x) => [x.id, x]));
  let sent = 0;
  for (const u of users) {
    const p = u.prefs || {}, hidden = new Set(p.hidden || []), el = new Set(p.electives || []);
    const visible = (sid) => { const s = sById[sid]; if (!s) return false; if (s.owner_id) return s.owner_id === u.id; return s.kind === "elective" ? el.has(s.id) : !hidden.has(s.id); };
    const [mine, asg] = await Promise.all([
      q("select subject_id, kind, due_date, submitted, topic from assessments where user_id=$1", [u.id]),
      q("select title, due_date from assignments where user_id=$1 and not done and due_date = any($2::date[])", [u.id, dates]),
    ]);
    const items = [];
    const when = (d) => (d === today ? "Today" : "Tomorrow");
    for (const e of exams) if (visible(e.subject_id) && visibleTo(u, e)) items.push([e.exam_date, `${sById[e.subject_id].short} ${e.name} exam${e.slot ? " (" + e.slot + ")" : ""}`]);
    for (const e of events) if ((e.user_id === u.id || (e.user_id === null && visibleTo(u, e))) && (!e.subject_id || e.user_id || visible(e.subject_id))) items.push([e.event_date, e.title + (e.event_time ? " · " + e.event_time : "")]);
    const mineMap = Object.fromEntries(mine.map((a) => [a.subject_id + ":" + a.kind, a]));
    for (const a of mine) if (a.due_date && dates.includes(a.due_date) && !a.submitted && visible(a.subject_id)) items.push([a.due_date, `${sById[a.subject_id]?.short} ${a.kind}${a.topic ? " — " + a.topic : ""} due`]);
    for (const d of deadlines) {
      if (!visibleTo(u, d)) continue;
      const a = mineMap[d.subject_id + ":" + d.kind];
      if (!visible(d.subject_id) || a?.submitted || a?.due_date) continue;
      items.push([d.due_date, `${sById[d.subject_id]?.short} ${d.kind} due${d.note ? " — " + d.note : ""}`]);
    }
    for (const a of asg) items.push([a.due_date, `Assignment: ${a.title}`]);
    if (!items.length) continue;
    const key = `rem:${today}:${morning ? "am" : "pm"}`;
    const ins = await q("insert into push_log (user_id, key) values ($1,$2) on conflict do nothing returning key", [u.id, key]);
    if (!ins.length) continue;
    items.sort((x, y) => x[0].localeCompare(y[0]));
    const lines = items.slice(0, 5).map(([d, t]) => `${when(d)}: ${t}`);
    if (items.length > 5) lines.push(`+${items.length - 5} more`);
    const title = items.some(([d]) => d === today) ? `⏰ ${items.length} thing${items.length > 1 ? "s" : ""} due soon` : `📅 Tomorrow: ${items.length} thing${items.length > 1 ? "s" : ""} due`;
    sent += await pushToUser(u.id, { title, body: lines.join("\n"), url: "/#/calendar" });
  }
  return { users: users.length, sent };
}

// stream / sign a stored object for download, inline view, preview JSON or small text
async function serveObject(f, url) {
    const dl = url.searchParams.get("download") === "1";
    const type = guessType(f.name, f.content_type);
    // ?text=1 → small text files returned directly (for the in-app preview)
    if (url.searchParams.get("text") === "1") {
      if (Number(f.size) > 1024 * 1024) bad("Too big to preview as text");
      const r = await aws.fetch(objUrl(f.pathname));
      if (!r.ok) throw new HttpError(502, "Couldn't read the file");
      return new Response(await r.text(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }
    const safe = f.name.replace(/["\\\r\n]/g, "_");
    const signed = await s3SignedGet(f.pathname,
      `${dl ? "attachment" : "inline"}; filename="${safe.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(f.name)}`, type);
    // ?json=1 → signed URL + metadata for the preview viewer
    if (url.searchParams.get("json") === "1") return json({ url: signed, name: f.name, type, size: Number(f.size) });
    return new Response(null, { status: 302, headers: { location: signed, "cache-control": "no-store" } });
}
const cleanUnit = (v, sj) => { const n = Number(v); return v === "" || v == null || !Number.isInteger(n) || n < 0 || n >= (sj?.units || []).length ? null : n; };

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
    const sg = cleanSecGrp(b.section, b.grp);
    if (!sg.section) bad("Pick your section");
    if (!sg.grp) bad("Pick your specialisation group");
    const rows = await q(
      "insert into users (roll_no, name, section, grp, password_hash, is_admin) values ($1,$2,$3,$4,$5,false) returning id, roll_no, name, section, grp, prefs, created_at",
      [roll, name, sg.section, sg.grp, await bcrypt.hash(pw, 10)]
    );
    await attachRole(rows[0]);
    return json({ user: rows[0] }, 200, { "set-cookie": sessionCookie(await issue(rows[0]), 60 * 86400) });
  },

  "POST auth/login": async ({ body: b }) => {
    const roll = normRoll(b.roll_no);
    throttle("login:" + roll);
    const u = (await q("select * from users where roll_no=$1", [roll]))[0];
    if (!u || !(await bcrypt.compare(String(b.password || ""), u.password_hash))) bad("Wrong roll number or password");
    attempts.delete("login:" + roll);
    delete u.password_hash;
    await attachRole(u);
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
    const sg = cleanSecGrp(b.section, b.grp);
    if (!sg.section) bad("Pick your section");
    if (!sg.grp) bad("Pick your specialisation group");
    await q("update users set name=$1, section=$2, grp=$3 where id=$4", [name, sg.section, sg.grp, u.id]);
    return json({ ok: true, name, section: sg.section, grp: sg.grp });
  },

  "GET bootstrap": async ({ req }) => {
    const u = await needUser(req);
    const [subjects, deadlines, assessments, assignments, todos, topics, files, batch, exams, events, sharedNotes, updates, subs] = await Promise.all([
      q(`select id, code, name, short, credits, kind, is_default, units, color, owner_id, sort, (notes_md is not null) as has_db_notes
         from subjects where owner_id is null or owner_id=$1 order by sort, id`, [u.id]),
      u.is_admin ? q("select * from batch_deadlines") : forUser(`select * from batch_deadlines d where ${VIS("d")}`, u),
      q("select * from assessments where user_id=$1", [u.id]),
      q("select * from assignments where user_id=$1 order by done, due_date nulls last, id", [u.id]),
      q("select * from todos where user_id=$1 order by done, id desc", [u.id]),
      q("select subject_id, topic_key from topic_progress where user_id=$1 and done", [u.id]),
      q("select id, subject_id, kind, name, size, content_type, created_at from files where user_id=$1 order by created_at desc", [u.id]),
      q("select count(*)::int as n from users"),
      u.is_admin ? q("select * from exams order by exam_date nulls last, id") : forUser(`select * from exams e where ${VIS("e")} order by exam_date nulls last, id`, u),
      u.is_admin ? q("select * from events where user_id is null or user_id=$1 order by event_date, id", [u.id])
        : forUser(`select * from events e where e.user_id=$1 or (e.user_id is null and ${VIS("e")}) order by event_date, id`, u, [u.id]),
      u.is_admin ? q("select id, subject_id, unit_idx, title, name, size, content_type, author_roll, target_section, target_group, created_at from shared_notes order by created_at desc")
        : forUser(`select id, subject_id, unit_idx, title, name, size, content_type, target_section, target_group, created_at from shared_notes n where ${VIS("n")} order by created_at desc`, u),
      u.is_admin ? q("select id, version, title, body, kind, created_at, target_section, target_group, author_roll from updates order by created_at desc limit 120")
        : forUser(`select id, version, title, body, kind, created_at, target_section, target_group from updates x where ${VIS("x")} order by created_at desc limit 80`, u),
      q("select count(*)::int n from push_subs where user_id=$1", [u.id]),
    ]);
    for (const s of subjects) { s.has_notes = s.has_db_notes || !!NOTES[s.code]; delete s.has_db_notes; }
    return json({ user: u, subjects, deadlines, assessments, assignments, todos, topics, files, exams, events, sharedNotes, updates,
      kinds: KINDS, batchSize: batch[0].n, pushKey: VAPID_PUBLIC, pushOn: subs[0].n > 0, sections: SECTIONS });
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
    return serveObject(f, url);
  },

  // ---- class notes & material uploaded by admins, per subject (+ optional unit)
  "POST notes-file/url": async ({ req, body: b }) => {
    const u = await needAdmin(req);
    const sj = (await q("select id from subjects where id=$1 and owner_id is null", [b.subject_id]))[0];
    if (!sj) bad("Pick a subject");
    const size = Number(b.size || 0);
    if (!size) bad("Empty file");
    if (size > MAX_FILE) bad("File is over 100 MB");
    const name = String(b.name || "file").replace(/[\\/\u0000-\u001f]+/g, "_").slice(-150);
    const type = String(b.type || "application/octet-stream").slice(0, 120);
    const key = `n/${sj.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}/${name}`;
    return json({ url: await s3SignedPut(key, type), key, type });
  },
  "POST notes-file/done": async ({ req, body: b }) => {
    const u = await needAdmin(req);
    const key = String(b.key || "");
    const sj = (await q("select id, short, units from subjects where id=$1 and owner_id is null", [b.subject_id]))[0];
    if (!sj || !key.startsWith(`n/${sj.id}/`) || key.includes("..")) bad("Bad file key");
    const size = await s3Head(key);
    if (size <= 0) bad("Upload didn't reach storage — try again");
    if (size > MAX_FILE) { await s3Del(key); bad("File is over 100 MB"); }
    if ((await q("select 1 from shared_notes where pathname=$1", [key])).length) bad("Already saved");
    const unit = cleanUnit(b.unit_idx, sj), t = cleanTarget(b, u), name = key.split("/").pop();
    const rows = await q(`insert into shared_notes (subject_id, unit_idx, title, name, pathname, size, content_type, uploaded_by, author_roll, target_section, target_group)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [sj.id, unit, cleanLine(b.title, 120) || null, name, key, size, str(b.type, 120) || "application/octet-stream", u.id, u.roll_no, t.s, t.g]);
    if (b.notify) {
      const where = unit === null ? sj.short : `${sj.short} · Unit ${unit + 1}`;
      await announce(`📎 New notes: ${where}`, rows[0].title || name, true, `/#/notes/${sj.id}`, t, u.roll_no);
    }
    return json({ note: rows[0] });
  },
  "PUT notes-file": async ({ req, body: b }, id) => {
    const u = await needAdmin(req);
    const cur = (await q("select * from shared_notes where id=$1", [id]))[0];
    if (!cur || !canManage(u, cur)) throw new HttpError(403, "You can only edit your section's notes");
    const sj = (await q("select id, units from subjects where id=$1", [cur.subject_id]))[0];
    const t = cleanTarget(b, u);
    const rows = await q("update shared_notes set title=$1, unit_idx=$2, target_section=$3, target_group=$4 where id=$5 returning *",
      [cleanLine(b.title, 120) || null, cleanUnit(b.unit_idx, sj), t.s, t.g, id]);
    return json({ note: rows[0] });
  },
  "DELETE notes-file": async ({ req }, id) => {
    const u = await needAdmin(req);
    const cur = (await q("select * from shared_notes where id=$1", [id]))[0];
    if (!cur) return json({ ok: true });
    if (!canManage(u, cur) && cur.uploaded_by !== u.id) throw new HttpError(403, "You can only delete your section's notes");
    await q("delete from shared_notes where id=$1", [id]);
    try { await s3Del(cur.pathname); } catch (e) { console.error("s3 delete failed", e.message); }
    return json({ ok: true });
  },
  "GET notes-file": async ({ req, url }, id) => {
    const u = await needUser(req);
    const f = (await q("select * from shared_notes where id=$1", [id]))[0];
    if (!f || !(u.is_admin || visibleTo(u, f))) throw new HttpError(404, "File not found");
    return serveObject(f, url);
  },

  "DELETE file": async ({ req }, id) => {
    const u = await needUser(req);
    const rows = await q("delete from files where id=$1 and user_id=$2 returning pathname", [id, u.id]);
    if (rows[0]) { try { await s3Del(rows[0].pathname); } catch (e) { console.error("s3 delete failed", e.message); } }
    return json({ ok: true });
  },

  // ---- leaderboard (points only from shared subjects; marks are never exposed)
  "GET leaderboard": async ({ req }) => {
    const u = await needUser(req);
    const [rows, tot] = await Promise.all([
      q(`with a as (
           select x.user_id, sum(x.report::int) r, sum(x.ppt::int) p, sum(x.viva::int) v, sum(x.submitted::int) s, max(x.updated_at) last
           from assessments x join subjects sj on sj.id = x.subject_id and sj.owner_id is null group by x.user_id),
         t as (
           select tp.user_id, count(*) n from topic_progress tp join subjects sj on sj.id = tp.subject_id and sj.owner_id is null
           where tp.done group by tp.user_id)
         select u.id, u.roll_no, u.name, u.section, u.grp, coalesce(u.prefs->>'lbShow', 'roll') as show, u.prefs->>'lbNick' as nick, u.prefs->>'lbTitle' as title,
           coalesce(a.r,0)::int r, coalesce(a.p,0)::int p, coalesce(a.v,0)::int v, coalesce(a.s,0)::int s, coalesce(t.n,0)::int topics, a.last
         from users u left join a on a.user_id = u.id left join t on t.user_id = u.id`),
      q(`select coalesce(sum(jsonb_array_length(un->'topics')),0)::int n from subjects sj, jsonb_array_elements(sj.units) un where sj.owner_id is null and sj.kind <> 'elective'`),
    ]);
    const weekAgo = Date.now() - 7 * 86400000;
    const list = rows.map((x) => {
      const score = (x.r + x.p + x.v) * 10 + x.s * 20 + x.topics * 5;
      const badges = [];
      if (score > 0 && x.last && new Date(x.last).getTime() > weekAgo) badges.push("fire");
      if (x.s >= 5) badges.push("finisher");
      if (x.r >= 5) badges.push("reports");
      if (x.v >= 5) badges.push("viva");
      if (tot[0].n && x.topics / tot[0].n >= 0.75) badges.push("syllabus");
      const label = x.show === "nick" && x.nick ? x.nick : x.show === "name" ? x.name : x.roll_no;
      return { me: x.id === u.id, label, title: x.title || "", show: x.show, score, section: x.section, grp: x.grp,
        reports: x.r, ppts: x.p, vivas: x.v, submitted: x.s, topics: x.topics, badges };
    }).sort((a, b) => b.score - a.score || b.submitted - a.submitted || a.label.localeCompare(b.label));
    let rank = 0, prev = null;
    list.forEach((x, i) => { if (x.score !== prev) { rank = i + 1; prev = x.score; } x.rank = rank; });
    return json({ list, totalTopics: tot[0].n, updated: new Date().toISOString() });
  },

  "POST leaderboard/card": async ({ req, body: b }) => {
    const u = await needUser(req);
    const show = ["roll", "name", "nick"].includes(b.show) ? b.show : "roll";
    const nick = cleanLine(b.nick, 24), title = cleanLine(b.title, 40);
    if (show === "nick" && !nick) bad("Write a nickname, or pick roll number / name");
    const rows = await q("update users set prefs = prefs || $1::jsonb where id=$2 returning prefs", [JSON.stringify({ lbShow: show, lbNick: nick, lbTitle: title }), u.id]);
    return json({ prefs: rows[0].prefs });
  },

  // ---- study notes
  "GET notes": async ({ req }, id) => {
    const u = await needUser(req);
    const s = (await q("select id, code, name, notes_md from subjects where id=$1 and (owner_id is null or owner_id=$2)", [id, u.id]))[0];
    if (!s) throw new HttpError(404, "Subject not found");
    return json({ notes_md: s.notes_md ?? NOTES[s.code] ?? "", custom: s.notes_md != null });
  },
  "PUT notes": async ({ req, body: b }, id) => {
    await needSuper(req);
    const md = b.reset ? null : String(b.notes_md ?? "").slice(0, 200000);
    await q("update subjects set notes_md=$1 where id=$2 and owner_id is null", [md, id]);
    return json({ ok: true });
  },

  // ---- calendar events (personal; batch ones by admin)
  "POST event": async ({ req, body: b }) => {
    const u = await needUser(req);
    const ev = cleanEvent(b);
    if (b.batch && !u.is_admin) throw new HttpError(403, "Only admins can add batch events");
    if (ev.subject_id) await subjectVisibleTo(u, ev.subject_id);
    if (!b.batch && (await q("select count(*)::int n from events where user_id=$1", [u.id]))[0].n >= 1000) bad("Too many events");
    const t = b.batch ? cleanTarget(b, u) : {};
    const rows = await q("insert into events (user_id, subject_id, title, event_date, event_time, note, color, target_section, target_group) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",
      [b.batch ? null : u.id, ev.subject_id, ev.title, ev.event_date, ev.event_time, ev.note, ev.color, t.s || null, t.g || null]);
    if (b.batch) await announce(`New: ${ev.title}`, `${fmtD(ev.event_date)}${ev.event_time ? " · " + ev.event_time : ""}${ev.note ? "\n" + ev.note : ""}`, b.notify !== false, "/#/calendar", t, u.roll_no);
    return json({ event: rows[0] });
  },
  "PUT event": async ({ req, body: b }, id) => {
    const u = await needUser(req);
    const cur = (await q("select * from events where id=$1", [id]))[0];
    if (!cur || (cur.user_id ? cur.user_id !== u.id : !(u.is_admin && canManage(u, cur)))) throw new HttpError(404, "Event not found");
    const ev = cleanEvent(b);
    if (ev.subject_id) await subjectVisibleTo(u, ev.subject_id);
    const t = cur.user_id ? {} : cleanTarget(b, u);
    const rows = await q("update events set subject_id=$1, title=$2, event_date=$3, event_time=$4, note=$5, color=$6, target_section=$8, target_group=$9, updated_at=now() where id=$7 returning *",
      [ev.subject_id, ev.title, ev.event_date, ev.event_time, ev.note, ev.color, id, t.s || null, t.g || null]);
    if (!cur.user_id && b.notify) await announce(`Updated: ${ev.title}`, `${fmtD(ev.event_date)}${ev.event_time ? " · " + ev.event_time : ""}`, true, "/#/calendar", t, u.roll_no);
    return json({ event: rows[0] });
  },
  "DELETE event": async ({ req }, id) => {
    const u = await needUser(req);
    const cur = (await q("select * from events where id=$1", [id]))[0];
    if (cur && (cur.user_id === u.id || (!cur.user_id && u.is_admin && canManage(u, cur)))) await q("delete from events where id=$1", [id]);
    else if (cur) throw new HttpError(403, "You can't delete this event");
    return json({ ok: true });
  },

  // ---- push notifications
  "POST push/subscribe": async ({ req, body: b }) => {
    const u = await needUser(req);
    const ep = String(b.endpoint || ""), p256dh = String(b.keys?.p256dh || ""), auth = String(b.keys?.auth || "");
    if (!/^https:\/\//.test(ep) || !p256dh || !auth) bad("Bad subscription");
    await q(`insert into push_subs (endpoint, user_id, p256dh, auth) values ($1,$2,$3,$4)
      on conflict (endpoint) do update set user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`, [ep.slice(0, 1000), u.id, p256dh.slice(0, 200), auth.slice(0, 100)]);
    return json({ ok: true });
  },
  "POST push/unsubscribe": async ({ req, body: b }) => {
    const u = await needUser(req);
    await q("delete from push_subs where endpoint=$1 and user_id=$2", [String(b.endpoint || ""), u.id]);
    return json({ ok: true });
  },
  "POST push/test": async ({ req }) => {
    const u = await needUser(req);
    const n = await pushToUser(u.id, { title: "Notifications are on ✅", body: "You'll get deadline reminders and class updates here.", url: "/#/notifications" });
    return json({ sent: n });
  },

  // ---- admin
  "POST exam": async ({ req, body: b }) => {
    const u = await needAdmin(req);
    const ex = cleanExam(b), t = cleanTarget(b, u);
    const rows = await q("insert into exams (subject_id, name, exam_date, slot, note, target_section, target_group) values ($1,$2,$3,$4,$5,$6,$7) returning *", [ex.subject_id, ex.name, ex.exam_date, ex.slot, ex.note, t.s, t.g]);
    const s = (await q("select short from subjects where id=$1", [ex.subject_id]))[0];
    await announce(`${s?.short || ""} ${ex.name} scheduled`, `${ex.exam_date ? fmtD(ex.exam_date) : "Date TBA"}${ex.slot ? " · " + ex.slot : ""}`, b.notify !== false, "/#/exams", t, u.roll_no);
    return json({ exam: rows[0] });
  },
  "PUT exam": async ({ req, body: b }, id) => {
    const u = await needAdmin(req);
    const cur = (await q("select * from exams where id=$1", [id]))[0];
    if (!cur || !canManage(u, cur)) throw new HttpError(403, "You can only edit your section's assessments");
    const ex = cleanExam(b), t = cleanTarget(b, u);
    const rows = await q("update exams set subject_id=$1, name=$2, exam_date=$3, slot=$4, note=$5, target_section=$7, target_group=$8, updated_at=now() where id=$6 returning *", [ex.subject_id, ex.name, ex.exam_date, ex.slot, ex.note, id, t.s, t.g]);
    if (b.notify) {
      const s = (await q("select short from subjects where id=$1", [ex.subject_id]))[0];
      await announce(`${s?.short || ""} ${ex.name} updated`, `${ex.exam_date ? fmtD(ex.exam_date) : "Date TBA"}${ex.slot ? " · " + ex.slot : ""}`, true, "/#/exams", t, u.roll_no);
    }
    return json({ exam: rows[0] });
  },
  "DELETE exam": async ({ req }, id) => {
    const u = await needAdmin(req);
    const cur = (await q("select * from exams where id=$1", [id]))[0];
    if (cur && !canManage(u, cur)) throw new HttpError(403, "You can only delete your section's assessments");
    await q("delete from exams where id=$1", [id]);
    return json({ ok: true });
  },
  "POST update": async ({ req, body: b }) => {
    const u = await needAdmin(req);
    const title = str(b.title, 200)?.trim();
    if (!title) bad("Enter a title");
    const kind = b.kind === "release" && u.is_super ? "release" : "notice";
    const t = kind === "release" ? {} : cleanTarget(b, u);
    const rows = await q("insert into updates (version, title, body, kind, target_section, target_group, author_roll) values ($1,$2,$3,$4,$5,$6,$7) returning *", [str(b.version, 20) || null, title, str(b.body, 5000), kind, t.s || null, t.g || null, u.roll_no]);
    if (b.notify !== false) await broadcast({ title: targetLabel(t.s, t.g) + title, body: String(b.body || "").replace(/^[-*]\s*/gm, "• ").slice(0, 180), url: kind === "release" ? "/#/updates" : "/#/notifications" }, t);
    return json({ update: rows[0] });
  },
  "PUT update": async ({ req, body: b }, id) => {
    const u = await needAdmin(req);
    const cur = (await q("select * from updates where id=$1", [id]))[0];
    if (!cur || !canManage(u, cur)) throw new HttpError(403, "You can only edit your section's posts");
    const title = str(b.title, 200)?.trim();
    if (!title) bad("Enter a title");
    let kind = ["release", "notice", "alert"].includes(b.kind) ? b.kind : "notice";
    if (kind === "release" && !u.is_super) kind = "notice";
    const t = kind === "release" ? {} : cleanTarget(b, u);
    const rows = await q("update updates set version=$1, title=$2, body=$3, kind=$4, target_section=$6, target_group=$7 where id=$5 returning *", [str(b.version, 20) || null, title, str(b.body, 5000), kind, id, t.s || null, t.g || null]);
    if (b.notify) await broadcast({ title: targetLabel(t.s, t.g) + "Updated: " + title, body: String(b.body || "").replace(/^[-*]\s*/gm, "• ").slice(0, 180), url: "/#/notifications" }, t);
    return json({ update: rows[0] });
  },
  "PUT subject": async ({ req, body: b }, id) => {
    const u = await needUser(req);
    const s = (await q("select * from subjects where id=$1", [id]))[0];
    if (!s || (s.owner_id ? s.owner_id !== u.id : !u.is_super)) throw new HttpError(403, "You can't edit this subject");
    const name = str(b.name, 100)?.trim();
    if (!name) bad("Enter a subject name");
    const rows = await q(`update subjects set name=$1, short=$2, code=$3, credits=$4, color=$5 where id=$6
      returning id, code, name, short, credits, kind, is_default, units, color, owner_id, sort`,
      [name, str(b.short, 14)?.trim() || name.slice(0, 12), str(b.code, 20)?.trim() || null, numOrNull(b.credits), /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : s.color, id]);
    return json({ subject: rows[0] });
  },
  "PUT admin/user": async ({ req, body: b }) => {
    const me = await needAdmin(req);
    const target = (await q("select section from users where roll_no=$1", [normRoll(b.roll_no)]))[0];
    if (!me.is_super && target?.section !== me.admin_scope) throw new HttpError(403, "You can only edit students in your section");
    const name = str(b.name, 80)?.trim();
    if (!name) bad("Enter a name");
    const card = { lbNick: cleanLine(b.nick, 24), lbTitle: cleanLine(b.title, 40) };
    const sg = cleanSecGrp(b.section, b.grp);
    const rows = await q(`update users set name=$1, section=coalesce($2, section), grp=coalesce($6, grp), prefs = prefs || $4::jsonb
      || case when $5 and prefs->>'lbShow' = 'nick' then '{"lbShow":"roll"}'::jsonb else '{}'::jsonb end
      where roll_no=$3 returning roll_no, name, section, grp`, [name, me.is_super ? sg.section : null, normRoll(b.roll_no), JSON.stringify(card), !card.lbNick, me.is_super ? sg.grp : null]);
    if (!rows.length) bad("No account with that roll number");
    return json({ user: rows[0] });
  },
  "POST admin/delete-user": async ({ req, body: b }) => {
    const me = await needAdmin(req);
    if (!me.is_super) throw new HttpError(403, "Only the main admin can delete accounts");
    const roll = normRoll(b.roll_no);
    if (roll === me.roll_no) bad("You can't delete your own account");
    const keys = await q("select pathname from files f join users u on u.id=f.user_id where u.roll_no=$1", [roll]);
    const rows = await q("delete from users where roll_no=$1 returning roll_no, name", [roll]);
    if (!rows.length) bad("No account with that roll number");
    for (const k of keys) { try { await s3Del(k.pathname); } catch {} }
    return json({ user: rows[0] });
  },
  "DELETE update": async ({ req }, id) => {
    const u = await needAdmin(req);
    const cur = (await q("select * from updates where id=$1", [id]))[0];
    if (cur && !canManage(u, cur)) throw new HttpError(403, "You can only delete your section's posts");
    await q("delete from updates where id=$1", [id]);
    return json({ ok: true });
  },
  "PUT deadline": async ({ req, body: b }) => {
    const u = await needUser(req);
    if (!u.is_admin) throw new HttpError(403, "Only admins can set batch deadlines");
    if (!KINDS.includes(b.kind)) bad("Unknown assessment type");
    // editing an existing row (by id) may change its audience; otherwise target comes from the body
    const t = cleanTarget(b, u);
    if (b.id) {
      const cur = (await q("select * from batch_deadlines where id=$1", [b.id]))[0];
      if (cur && !canManage(u, cur)) throw new HttpError(403, "You can only change your section's deadlines");
      if (cur) await q("delete from batch_deadlines where id=$1", [b.id]);
    }
    if (!b.due_date && !b.note) {
      if (!b.id) await q("delete from batch_deadlines where subject_id=$1 and kind=$2 and coalesce(target_section,'')=$3 and coalesce(target_group,'')=$4", [b.subject_id, b.kind, t.s || "", t.g || ""]);
      return json({ deadline: null });
    }
    const rows = await q(`insert into batch_deadlines (subject_id, kind, due_date, note, target_section, target_group) values ($1,$2,$3,$4,$5,$6)
      on conflict (subject_id, kind, (coalesce(target_section,'')), (coalesce(target_group,''))) do update set due_date=excluded.due_date, note=excluded.note, updated_at=now() returning *`,
      [b.subject_id, b.kind, dateOrNull(b.due_date), str(b.note, 300), t.s, t.g]);
    const sj = (await q("select short from subjects where id=$1", [b.subject_id]))[0];
    await announce(`${sj?.short || ""} ${b.kind.replace(/(\d)/, " $1")}: ${b.due_date ? "due " + fmtD(b.due_date) : "update"}`, str(b.note, 300) || "", b.notify !== false, "/#/subject/" + b.subject_id, t, u.roll_no);
    return json({ deadline: rows[0] });
  },
  "POST admin/reset": async ({ req, body: b }) => {
    const u = await needUser(req);
    if (!u.is_admin) throw new HttpError(403, "Admins only");
    if (String(b.password || "").length < 6) bad("Temporary password must be at least 6 characters");
    if (!u.is_super) {
      const t = (await q("select section from users where roll_no=$1", [normRoll(b.roll_no)]))[0];
      if (t?.section !== u.admin_scope) throw new HttpError(403, "You can only reset passwords in your section");
    }
    const rows = await q("update users set password_hash=$1 where roll_no=$2 returning roll_no, name", [await bcrypt.hash(String(b.password), 10), normRoll(b.roll_no)]);
    if (!rows.length) bad("No account with that roll number");
    return json({ user: rows[0] });
  },
  "GET admin/users": async ({ req }) => {
    const u = await needUser(req);
    if (!u.is_admin) throw new HttpError(403, "Admins only");
    return json({ users: await q(`select u.roll_no, u.name, u.section, u.grp, u.created_at, u.prefs->>'lbNick' as nick, u.prefs->>'lbTitle' as title, coalesce(u.prefs->>'lbShow','roll') as show,
        (select count(*) from assessments a where a.user_id=u.id and a.submitted)::int as submitted,
        (select count(*) from files f where f.user_id=u.id)::int as files
      from users u order by u.section nulls last, u.roll_no`) });
  },

  // ---- build version, so an open/installed app can tell it's out of date
  "GET version": async () => json({ v: STATIC_VER }),

  // ---- admins (main admin only)
  "GET admins": async ({ req }) => {
    await needSuper(req);
    return json({ admins: await q("select a.roll_no, a.scope_section, a.created_at, u.name from admins a left join users u on u.roll_no=a.roll_no order by a.created_at") });
  },
  "POST admins": async ({ req, body: b }) => {
    const me = await needSuper(req);
    const roll = normRoll(b.roll_no);
    if (!roll) bad("Enter a roll number");
    if (ADMIN_ROLLS().includes(roll)) bad("That's already the main admin");
    let scope = String(b.scope_section || "").toUpperCase();
    if (scope === "ALL") scope = null; else if (!SECTIONS[scope]) bad("Pick a section");
    const rows = await q(`insert into admins (roll_no, scope_section, added_by) values ($1,$2,$3)
      on conflict (roll_no) do update set scope_section=excluded.scope_section returning *`, [roll, scope, me.roll_no]);
    const who = (await q("select name from users where roll_no=$1", [roll]))[0];
    return json({ admin: { ...rows[0], name: who?.name || null } });
  },
  "DELETE admins": async ({ req }, roll) => {
    await needSuper(req);
    await q("delete from admins where roll_no=$1", [normRoll(roll)]);
    return json({ ok: true });
  },

  // ---- feedback about the platform
  "POST feedback": async ({ req, body: b }) => {
    const u = await needUser(req);
    const msg = str(b.message, 3000)?.trim();
    if (!msg || msg.length < 3) bad("Write a few words of feedback");
    const cat = FB_CATS.includes(b.category) ? b.category : "idea";
    const rating = Number.isInteger(+b.rating) && +b.rating >= 1 && +b.rating <= 5 ? +b.rating : null;
    const recent = (await q("select count(*)::int n from feedback where user_id=$1 and created_at > now() - interval '1 hour'", [u.id]))[0].n;
    if (recent >= 10) bad("That's a lot of feedback for one hour — try again a bit later");
    const rows = await q("insert into feedback (user_id, category, rating, message) values ($1,$2,$3,$4) returning *", [u.id, cat, rating, msg]);
    // ping the main admin(s)
    if (VAPID_PUBLIC) {
      const subs = await q("select p.* from push_subs p join users x on x.id=p.user_id where x.roll_no = any($1::text[])", [ADMIN_ROLLS()]);
      await sendMany(subs, { title: `💬 New feedback (${cat})`, body: msg.slice(0, 160), url: "/#/feedback" });
    }
    return json({ feedback: rows[0] });
  },
  "GET feedback": async ({ req }) => {
    const u = await needUser(req);
    if (u.is_super) return json({ all: true, items: await q(`select f.*, u.roll_no, u.name, u.section from feedback f left join users u on u.id=f.user_id order by f.created_at desc limit 300`) });
    return json({ all: false, items: await q("select * from feedback where user_id=$1 order by created_at desc", [u.id]) });
  },
  "PUT feedback": async ({ req, body: b }, id) => {
    await needSuper(req);
    const status = FB_STATUS.includes(b.status) ? b.status : "new";
    const rows = await q("update feedback set status=$1, reply=$2, updated_at=now() where id=$3 returning *", [status, str(b.reply, 2000)?.trim() || null, id]);
    if (!rows.length) throw new HttpError(404, "Feedback not found");
    if (b.reply && b.notifyUser !== false && rows[0].user_id) await pushToUser(rows[0].user_id, { title: "Reply to your feedback", body: String(b.reply).slice(0, 160), url: "/#/feedback" });
    return json({ feedback: rows[0] });
  },
  "DELETE feedback": async ({ req }, id) => {
    const u = await needUser(req);
    if (u.is_super) await q("delete from feedback where id=$1", [id]);
    else await q("delete from feedback where id=$1 and user_id=$2 and status='new'", [id, u.id]);
    return json({ ok: true });
  },
};
const FB_CATS = ["bug", "idea", "design", "content", "praise", "other"];
const FB_STATUS = ["new", "seen", "planned", "done", "wontfix"];

const STATIC = {
  "/app.js": [APP_JS, "text/javascript; charset=utf-8"],
  "/style.css": [STYLE_CSS, "text/css; charset=utf-8"],
  "/sw.js": [SW_JS, "text/javascript; charset=utf-8", "no-cache"],
  "/manifest.webmanifest": [JSON.stringify({
    name: "Sem 7 Tracker", short_name: "Sem 7", start_url: "/#/home", scope: "/", display: "standalone",
    background_color: "#f6f5fb", theme_color: "#4f46e5",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }],
  }), "application/manifest+json"],
};
const ICON_BUF = Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, Buffer.from(v, "base64")]));
const SEC_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "x-frame-options": "DENY" };

export default async function handler(req) {
  const url = new URL(req.url);
  const p = url.pathname;

  if (!p.startsWith("/api/")) {
    if (STATIC[p]) {
      const [body, type, cache] = STATIC[p];
      return new Response(body, { headers: { "content-type": type, "cache-control": cache || "public, max-age=300", ...SEC_HEADERS } });
    }
    if (ICON_BUF[p]) return new Response(ICON_BUF[p], { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    if (p === "/cron/remind" && req.method === "POST") {
      if (!req.headers.get("x-neon-trigger-invocation-id")) return json({ error: "not a trigger call" }, 401);
      let data = {};
      try { data = (await req.json()).data || {}; } catch {}
      try { const r = await runReminders(data.scheduled_at); console.log("reminders", data.scheduled_at, JSON.stringify(r)); return json(r); }
      catch (e) { console.error("reminders failed", e); return json({ error: e.message }, 500); }
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
