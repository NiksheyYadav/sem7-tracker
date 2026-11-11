// Sem 7 Tracker — vanilla JS SPA
const $app = document.getElementById("app");
const KIND_LABEL = { TA1: "TA 1", TA2: "TA 2", TA3: "TA 3", TA4: "TA 4", TA5: "TA 5", ERLA1: "ERLA 1", ERLA2: "ERLA 2", PA: "PA" };
const EXAM_VENUE = "Vikram Sarabhai (E-Block), SoET";

let S = null;          // bootstrap data
let route = "home";
let routeArg = null;
let subTab = "assess";
let nextSubTab = null;
let calMonth = null;   // "YYYY-MM"
let calSel = null;     // "YYYY-MM-DD"
const notesCache = {};

// ------------------------------------------------------------ utils
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dOnly = (v) => (v ? String(v).slice(0, 10) : "");
const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(todayISO() + "T00:00:00"), b = new Date(dOnly(iso) + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function fmtDate(iso, withDay = true) {
  if (!iso) return "";
  const d = new Date(dOnly(iso) + "T00:00:00");
  return d.toLocaleDateString("en-IN", withDay ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
}
function fmtStamp(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}
function dueLabel(iso) {
  const n = daysUntil(iso);
  if (n === null) return "";
  if (n < 0) return `<span class="pill red">${-n}d overdue</span>`;
  if (n === 0) return `<span class="pill red">Today</span>`;
  if (n === 1) return `<span class="pill amber">Tomorrow</span>`;
  if (n <= 7) return `<span class="pill amber">in ${n}d</span>`;
  return `<span class="pill">${fmtDate(iso, false)}</span>`;
}
function fmtSize(b) { if (!b) return ""; const u = ["B", "KB", "MB", "GB"]; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return `${b.toFixed(i ? 1 : 0)} ${u[i]}`; }
function toast(msg, bad = false) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ""), 2600);
}
async function api(method, path, body) {
  const r = await fetch("/api/" + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  let data = {};
  try { data = await r.json(); } catch {}
  if (r.status === 401 && path !== "me" && !path.startsWith("auth/")) { S = null; renderAuth(); throw new Error("Session expired — log in again"); }
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// tiny, safe markdown renderer (headings, lists, tables, quotes, bold/italic/code, hr)
function md(src) {
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  let out = "", i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { const n = m[1].length; out += `<h${n + 1}>${inline(m[2])}</h${n + 1}>`; i++; continue; }
    if (/^---+\s*$/.test(l)) { out += "<hr>"; i++; continue; }
    if (/^>\s?/.test(l)) { let q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, "")); out += `<blockquote>${inline(q.join(" "))}</blockquote>`; continue; }
    if (/^\|.*\|\s*$/.test(l)) {
      const rows = []; while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|\s*$/.test(r));
      out += `<div class="scroll"><table class="t md-t"><thead><tr>${cells(body[0]).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.slice(1).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)) { let it = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) it.push(lines[i++].replace(/^\s*[-*]\s+/, "")); out += `<ul>${it.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`; continue; }
    if (/^\s*\d+[.)]\s+/.test(l)) { let it = []; while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) it.push(lines[i++].replace(/^\s*\d+[.)]\s+/, "")); out += `<ol>${it.map((x) => `<li>${inline(x)}</li>`).join("")}</ol>`; continue; }
    let p = []; while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\||\s*[-*]\s|\s*\d+[.)]\s|---)/.test(lines[i])) p.push(lines[i++]);
    if (!p.length) p.push(lines[i++]);
    out += `<p>${inline(p.join(" "))}</p>`;
  }
  return out;
}

// ------------------------------------------------------------ derived data
const prefs = () => S.user.prefs || {};
function isVisible(s) {
  if (!s) return false;
  const p = prefs();
  if (s.owner_id) return true;
  if (s.kind === "elective") return (p.electives || []).includes(s.id);
  return !(p.hidden || []).includes(s.id);
}
const visibleSubjects = () => S.subjects.filter(isVisible);
const subjById = (id) => S.subjects.find((s) => s.id === Number(id));
function kindsFor(sid) { const k = (prefs().kinds || {})[sid]; return Array.isArray(k) && k.length ? S.kinds.filter((x) => k.includes(x)) : S.kinds; }
function getA(sid, kind) {
  return S.assessments.find((a) => a.subject_id === sid && a.kind === kind) ||
    { subject_id: sid, kind, topic: "", due_date: null, report: false, ppt: false, viva: false, submitted: false, marks: null, max_marks: null, notes: "" };
}
const batchDL = (sid, kind) => S.deadlines.find((d) => d.subject_id === sid && d.kind === kind);
const effDue = (a) => dOnly(a.due_date) || dOnly(batchDL(a.subject_id, a.kind)?.due_date) || "";
function aScore(a) { return a.submitted ? 1 : ((a.report ? 1 : 0) + (a.ppt ? 1 : 0) + (a.viva ? 1 : 0)) / 4; }
function subjProgress(s) { const ks = kindsFor(s.id); return ks.length ? ks.reduce((t, k) => t + aScore(getA(s.id, k)), 0) / ks.length : 0; }
const topicDone = (sid, key) => S.topics.some((t) => t.subject_id === sid && t.topic_key === key);
function syllabusProgress(s) {
  const ks = []; (s.units || []).forEach((u, i) => u.topics.forEach((_, j) => ks.push(`${i}.${j}`)));
  return ks.length ? ks.filter((k) => topicDone(s.id, k)).length / ks.length : null;
}
const pct = (x) => Math.round((x || 0) * 100);
const examsFor = (sid) => S.exams.filter((e) => e.subject_id === sid);
const myExams = () => S.exams.filter((e) => isVisible(subjById(e.subject_id)));

// everything with a date, for calendar / reminders / home
function datedItems() {
  const out = [];
  for (const e of myExams()) if (e.exam_date) { const s = subjById(e.subject_id); out.push({ date: dOnly(e.exam_date), type: "exam", s, title: `${s.short} ${e.name}`, time: e.slot, note: e.note, href: "#/exams" }); }
  for (const s of visibleSubjects()) for (const k of kindsFor(s.id)) {
    const a = getA(s.id, k), due = effDue(a);
    if (due && !a.submitted) out.push({ date: due, type: a.due_date ? "assess" : "deadline", s, title: `${s.short} ${KIND_LABEL[k]} due${a.topic ? " — " + a.topic : ""}`, note: batchDL(s.id, k)?.note, href: `#/subject/${s.id}` });
  }
  for (const a of S.assignments) if (!a.done && a.due_date) out.push({ date: dOnly(a.due_date), type: "asg", s: subjById(a.subject_id), title: `Assignment: ${a.title}`, href: "#/assignments" });
  for (const ev of S.events) {
    const s = subjById(ev.subject_id);
    if (!ev.user_id && s && !isVisible(s)) continue;
    out.push({ date: dOnly(ev.event_date), type: ev.user_id ? "event" : "batch", s, title: ev.title, time: ev.event_time, note: ev.note, ev, color: ev.color });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
}
const TYPE_META = {
  exam: ["Unit assessment", "brand"], deadline: ["Batch deadline", "amber"], assess: ["My due date", "amber"],
  asg: ["Assignment", ""], event: ["My event", "green"], batch: ["Class event", "brand"],
};
function reminders() {
  return datedItems().filter((x) => { const n = daysUntil(x.date); return x.type === "exam" ? n >= 0 && n <= 7 : n >= -7 && n <= 3; });
}
function unreadUpdates() { const seen = prefs().notifSeen || S.user.created_at; return S.updates.filter((u) => u.created_at > seen); }
function badgeCount() { return unreadUpdates().length + reminders().filter((x) => daysUntil(x.date) <= 1).length; }

async function savePrefs(patch) {
  S.user.prefs = { ...prefs(), ...patch };
  try { const r = await api("POST", "prefs", { prefs: patch }); S.user.prefs = r.prefs; } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------ auth screen
function renderAuth(mode = "login") {
  document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";
  $app.innerHTML = `
  <div class="auth">
    <div class="auth-hero">
      <div><div class="logo" style="color:#fff"><i style="background:rgba(255,255,255,.2)">✓</i> Sem 7 Tracker</div></div>
      <div>
        <h1>Every TA, ERLA, PA, report, PPT and viva in one place.</h1>
        <p>Built for B.Tech CSE (Data Science), 7th semester, SGT University. Your own account, your own progress, your files saved in the cloud.</p>
        <div class="chips"><span>TA 1–5</span><span>ERLA 1–2</span><span>PA</span><span>Report · PPT · Viva</span><span>Calendar</span><span>Study notes</span><span>Reminders</span><span>File locker</span></div>
      </div>
      <div class="small" style="opacity:.8">Data is private to your account.</div>
      <div class="blob"></div>
    </div>
    <div class="auth-form"><div class="auth-card">
      <h2>${mode === "login" ? "Welcome back" : "Create your account"}</h2>
      <div class="muted small">Use your university roll number to sign in.</div>
      <div class="tabs-mini"><button data-m="login" class="${mode === "login" ? "on" : ""}">Log in</button><button data-m="signup" class="${mode === "signup" ? "on" : ""}">Sign up</button></div>
      <form id="authf">
        ${mode === "signup" ? `<label class="f"><span>Full name</span><input class="in" name="name" required autocomplete="name"></label>` : ""}
        <label class="f"><span>Roll number</span><input class="in" name="roll_no" required inputmode="numeric" autocomplete="username" placeholder="e.g. 231302221"></label>
        ${mode === "signup" ? `<label class="f"><span>Section (optional)</span><input class="in" name="section" placeholder="A"></label>` : ""}
        <label class="f"><span>Password</span><input class="in" type="password" name="password" required minlength="6" autocomplete="${mode === "login" ? "current-password" : "new-password"}"></label>
        <div class="err" id="aerr"></div>
        <button class="btn grad block" type="submit">${mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p class="muted small" style="margin-top:14px">${mode === "login" ? "Forgot your password? Ask the class admin (Nikshey) to reset it." : "No email needed. Remember your password — the class admin can reset it if you forget."}</p>
    </div></div>
  </div>`;
  $app.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
  document.getElementById("authf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector("button"); btn.disabled = true;
    try { await api("POST", mode === "login" ? "auth/login" : "auth/signup", fd); await boot(); }
    catch (err) { document.getElementById("aerr").textContent = err.message; btn.disabled = false; }
  };
}

// ------------------------------------------------------------ shell
function navItems() {
  const nav = [["home", "Home", "⌂"], ["subjects", "Subjects", "▦"], ["calendar", "Calendar", "▤"], ["leaderboard", "Leaderboard", "🏆"], ["notes", "Notes", "✎"], ["checklist", "Checklist", "☑"], ["files", "Files", "⇪"]];
  if (prefs().showAssignments) nav.splice(5, 0, ["assignments", "Assignments", "✍"]);
  return nav;
}
function shell(content) {
  const nav = navItems();
  const active = route === "subject" ? "subjects" : route;
  const initials = S.user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const badge = badgeCount();
  const bottom = [["home", "Home", "⌂"], ["subjects", "Subjects", "▦"], ["calendar", "Calendar", "▤"], ["leaderboard", "Ranks", "🏆"], ["checklist", "Checklist", "☑"]];
  return `
  <header class="top"><div class="top-in">
    <a class="logo" href="#/home"><i>✓</i><span class="logo-t">Sem 7 Tracker</span></a>
    <nav class="nav">${nav.map(([r, l]) => `<a href="#/${r}" class="${active === r ? "on" : ""}">${l}</a>`).join("")}</nav>
    <div class="spacer"></div>
    <a class="bell ${active === "notifications" ? "on" : ""}" href="#/notifications" title="Notifications" aria-label="Notifications${badge ? ` (${badge} new)` : ""}">🔔${badge ? `<b>${badge > 9 ? "9+" : badge}</b>` : ""}</a>
    <div class="menu" id="more">
      <button class="btn ghost sm" id="moreBtn" aria-haspopup="true">More ▾</button>
      <div class="menu-pop" role="menu">
        <a href="#/leaderboard">🏆 Leaderboard</a>
        <a href="#/files">⇪ My files</a>
        <a href="#/notes">✎ Study notes</a>
        <a href="#/assignments">✍ Assignments${prefs().showAssignments ? "" : ' <span class="pill" style="margin-left:auto">optional</span>'}</a>
        <a href="#/exams">◷ Unit assessments</a>
        <a href="#/notifications">🔔 Notifications</a>
        <a href="#/updates">✦ Update log</a>
        <a href="#/settings">⚙ Subjects &amp; settings</a>
        <button id="expJson">⤓ Export my data (JSON)</button>
        <button id="expCsv">⤓ Export tracker (CSV)</button>
        ${S.user.is_admin ? `<hr><a href="#/admin">★ Admin panel</a>` : ""}
      </div>
    </div>
    <div class="menu" id="me">
      <button class="avatar" id="meBtn" title="${esc(S.user.name)}">${esc(initials)}</button>
      <div class="menu-pop">
        <div class="who"><b>${esc(S.user.name)}</b><div class="muted">${esc(S.user.roll_no)}${S.user.section ? " · Sec " + esc(S.user.section) : ""}</div></div>
        <hr>
        <button id="themeBtn">◐ ${document.documentElement.dataset.theme === "dark" ? "Light" : "Dark"} mode</button>
        <a href="#/settings">⚙ Settings</a>
        <button id="logoutBtn">⎋ Log out</button>
      </div>
    </div>
  </div></header>
  <main class="main" id="main">${content}</main>
  <nav class="bottom-nav">${bottom.map(([r, l, ic]) => `<a href="#/${r}" class="${active === r ? "on" : ""}"><b>${ic}</b>${l}</a>`).join("")}</nav>`;
}
function wireShell() {
  for (const id of ["more", "me"]) {
    const m = document.getElementById(id);
    m.querySelector("button").onclick = (e) => { e.stopPropagation(); document.querySelectorAll(".menu.open").forEach((x) => x !== m && x.classList.remove("open")); m.classList.toggle("open"); };
  }
  document.getElementById("logoutBtn").onclick = async () => { await api("POST", "auth/logout"); S = null; renderAuth(); };
  document.getElementById("themeBtn").onclick = () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t; localStorage.setItem("theme", t); render();
  };
  document.getElementById("expJson").onclick = exportJson;
  document.getElementById("expCsv").onclick = exportCsv;
}
document.addEventListener("click", () => document.querySelectorAll(".menu.open").forEach((x) => x.classList.remove("open")));

// ------------------------------------------------------------ pages
function itemRow(x, opts = {}) {
  const [label, tone] = TYPE_META[x.type] || ["", ""];
  const href = x.href || (x.ev ? "#/calendar" : "#/home");
  return `<a class="li" href="${href}" ${x.ev ? `data-cal-date="${x.date}"` : ""} style="text-decoration:none;color:inherit">
    <span class="dot" style="--c:${x.color || x.s?.color || "#64748b"}"></span>
    <div style="flex:1;min-width:0"><div class="ellip" style="font-weight:700">${esc(x.title)}</div>
      <div class="muted small">${opts.noDate ? "" : fmtDate(x.date) + " · "}${label}${x.time ? " · " + esc(x.time) : ""}</div></div>
    ${dueLabel(x.date)}</a>`;
}

function pageHome() {
  const subs = visibleSubjects();
  const items = datedItems().filter((x) => { const n = daysUntil(x.date); return n >= -7 && n <= 30; }).slice(0, 8);
  const exams = myExams().filter((e) => e.exam_date && daysUntil(e.exam_date) >= 0).sort((a, b) => dOnly(a.exam_date).localeCompare(dOnly(b.exam_date)));
  const next = exams[0];
  let total = 0, sub = 0;
  for (const s of subs) for (const k of kindsFor(s.id)) { total++; if (getA(s.id, k).submitted) sub++; }
  const sylSubs = subs.filter((s) => syllabusProgress(s) !== null);
  const syl = sylSubs.length ? sylSubs.reduce((t, s) => t + syllabusProgress(s), 0) / sylSubs.length : 0;
  const openTodos = S.todos.filter((t) => !t.done);
  const latest = S.updates.find((u) => u.kind !== "release");
  const first = S.user.name.split(" ")[0];
  return `
  <section class="hero">
    <h2>Hey ${esc(first)} 👋</h2>
    <p>${next ? `Next up: <b>${esc(subjById(next.subject_id)?.name)} ${esc(next.name)}</b> on ${fmtDate(next.exam_date)}${next.slot ? ` (${esc(next.slot)})` : ""}.` : "No upcoming unit assessments."}</p>
    <div class="count">
      ${next ? `<div><b>${daysUntil(next.exam_date)}</b><span>days to ${esc(next.name)}</span></div>` : ""}
      <div><b>${sub}/${total}</b><span>assessments done</span></div>
      <div><b>${pct(syl)}%</b><span>syllabus covered</span></div>
    </div>
  </section>
  ${latest && unreadUpdates().some((u) => u.id === latest.id) ? `<a class="card notice" href="#/notifications"><b>📣 ${esc(latest.title)}</b><span class="muted small">${esc((latest.body || "").split("\n")[0])}</span></a>` : ""}
  <div class="grid g2">
    <div class="card"><h3>⏰ Coming up <a href="#/calendar" class="small" style="margin-left:auto;font-weight:600">calendar</a></h3>
      ${items.length ? `<div class="list">${items.map((x) => itemRow(x)).join("")}</div>` : `<div class="empty">Nothing dated yet. Add due dates in a subject's TA / ERLA / PA cards, or add events in the calendar.</div>`}
    </div>
    <div class="card"><h3>☑ Quick checklist <a href="#/checklist" class="small" style="margin-left:auto;font-weight:600">open</a></h3>
      <form id="qtodo" class="row" style="margin-bottom:8px"><input class="in" name="text" placeholder="Add a to-do… e.g. print BDA report"><button class="btn primary">Add</button></form>
      ${openTodos.length ? `<div class="list">${openTodos.slice(0, 6).map(todoRow).join("")}</div>` : `<div class="empty">All clear ✨</div>`}
    </div>
  </div>
  <h3 style="margin:22px 0 10px">Subjects</h3>
  <div class="grid g3">${subs.map(subjCard).join("")}</div>
  <p class="muted small" style="margin-top:16px">Each pip = one assessment (TA1–5, ERLA1–2, PA). Half-filled = some of report/PPT/viva done, full = submitted.</p>`;
}

function subjCard(s) {
  const p = subjProgress(s), syl = syllabusProgress(s);
  const pips = kindsFor(s.id).map((k) => { const sc = aScore(getA(s.id, k)); return `<i class="${sc >= 1 ? "full" : sc > 0 ? "half" : ""}" title="${KIND_LABEL[k]}"></i>`; }).join("");
  const nextEx = examsFor(s.id).filter((e) => e.exam_date && daysUntil(e.exam_date) >= 0).sort((a, b) => dOnly(a.exam_date).localeCompare(dOnly(b.exam_date)))[0];
  return `<div class="card subj" style="--c:${s.color || "#6366f1"}">
    <a class="cover" href="#/subject/${s.id}" aria-label="${esc(s.name)}"></a>
    <div class="row between"><span class="tag">${esc(s.short)}</span>${nextEx ? `<span class="small muted">${esc(nextEx.name)} ${fmtDate(nextEx.exam_date, false)}</span>` : ""}</div>
    <h4>${esc(s.name)}</h4>
    <div class="meta">${s.code ? esc(s.code) : ""}${s.credits ? ` · ${s.credits} credits` : ""}${s.kind === "elective" ? " · elective" : s.kind === "minor" ? " · minor elective" : ""}${s.owner_id ? " · custom" : ""}</div>
    <div class="row between small"><b>Assessments ${pct(p)}%</b>${syl !== null ? `<span class="muted">Syllabus ${pct(syl)}%</span>` : ""}</div>
    <div class="pips">${pips}</div>
    ${s.has_notes ? `<a class="notes-link" href="#/notes/${s.id}">📘 Study notes</a>` : ""}
  </div>`;
}

function pageSubjects() {
  const subs = visibleSubjects();
  const withNotes = subs.filter((s) => s.has_notes);
  return `<h1 class="page">Subjects</h1><p class="sub">B.Tech CSE (Data Science) · Semester VII. Tap a subject to track TA, ERLA, PA, files, syllabus and notes.</p>
  ${withNotes.length ? `<div class="card notes-strip"><b>📘 Study notes</b>${withNotes.map((s) => `<a class="pill brand" href="#/notes/${s.id}">${esc(s.short)}</a>`).join("")}<a class="small" href="#/notes" style="margin-left:auto">all notes →</a></div>` : ""}
  <div class="grid g3">${subs.map(subjCard).join("")}</div>
  <div class="card" style="margin-top:16px"><div class="row between wrap"><div><b>Missing a subject or elective?</b><div class="muted small">Turn on your elective, hide ones you don't take, or add your own.</div></div><a class="btn ghost" href="#/settings">Manage subjects</a></div></div>`;
}

function pageSubject() {
  const s = subjById(routeArg);
  if (!s) return `<div class="empty">Subject not found. <a href="#/subjects">Back</a></div>`;
  const syl = syllabusProgress(s);
  const files = S.files.filter((f) => f.subject_id === s.id);
  const tabs = [["assess", "TA · ERLA · PA"], ["syllabus", `Syllabus${syl !== null ? ` ${pct(syl)}%` : ""}`], ...(s.has_notes ? [["notes", "📘 Study notes"]] : []), ["files", `Files (${files.length})`], ["cols", "Customise"]];
  if (!tabs.some(([t]) => t === subTab)) subTab = "assess";
  let body = "";
  if (subTab === "assess") body = `<div class="as-grid">${kindsFor(s.id).map((k) => asCard(s, k)).join("")}</div>`;
  else if (subTab === "syllabus") body = syllabusView(s);
  else if (subTab === "notes") body = notesBody(s);
  else if (subTab === "files") body = filesView(files, s.id);
  else body = `<div class="card"><h3>Which assessments apply to ${esc(s.short)}?</h3>
      <p class="muted small" style="margin-top:-6px">Untick ones your faculty isn't taking (e.g. IT2 may have no TA 5). Only affects your view.</p>
      <form id="kindsF" class="kchips">${S.kinds.map((k) => `<label><input type="checkbox" name="k" value="${k}" ${kindsFor(s.id).includes(k) ? "checked" : ""}> ${KIND_LABEL[k]}</label>`).join("")}</form></div>`;
  const ex = examsFor(s.id).filter((e) => e.exam_date || e.slot);
  return `
  <div class="sd-head" style="--c:${s.color || "#6366f1"}">
    <a class="back" href="#/subjects">← All subjects</a>
    <h1>${esc(s.name)}</h1>
    <div class="row wrap">${s.code ? `<span>${esc(s.code)}</span>` : ""}${s.credits ? `<span>${s.credits} credits</span>` : ""}${ex.map((e) => `<span>${esc(e.name)}: ${e.exam_date ? fmtDate(e.exam_date) : "TBA"}${e.slot ? " · " + esc(e.slot) : ""}</span>`).join("")}<span>Assessments ${pct(subjProgress(s))}%</span></div>
  </div>
  <div class="seg">${tabs.map(([t, l]) => `<button data-st="${t}" class="${subTab === t ? "on" : ""}">${l}</button>`).join("")}</div>
  <div style="--c:${s.color || "#6366f1"}">${body}</div>`;
}

function asCard(s, k) {
  const a = getA(s.id, k), bd = batchDL(s.id, k), due = effDue(a), sc = aScore(a);
  const files = S.files.filter((f) => f.subject_id === s.id && f.kind === k);
  const chk = (f, label, icon, cls = "") => `<label class="chk ${cls}"><input type="checkbox" data-f="${f}" ${a[f] ? "checked" : ""}><span><em>${icon}</em>${label}</span></label>`;
  return `<div class="card as ${a.submitted ? "done" : sc > 0 ? "prog" : ""}" data-sid="${s.id}" data-kind="${k}">
    <div class="hd"><b>${KIND_LABEL[k]}</b><div class="row"><span class="saving" data-saving></span>${a.submitted ? '<span class="pill green">Submitted</span>' : due ? dueLabel(due) : ""}</div></div>
    ${bd ? `<div class="batch-note">📌 Batch: ${bd.due_date ? "due " + fmtDate(bd.due_date) : ""}${bd.note ? (bd.due_date ? " — " : "") + esc(bd.note) : ""}</div>` : ""}
    <div class="checks">${chk("report", "Report", "📄")}${chk("ppt", "PPT", "📊")}${chk("viva", "Viva", "🎤")}${chk("submitted", "Done", "✅", "sub")}</div>
    <label class="f"><span>Topic / title</span><input class="in" data-f="topic" value="${esc(a.topic || "")}" placeholder="e.g. YouTube analytics model"></label>
    <div class="two">
      <label class="f"><span>Due date</span><input class="in" type="date" data-f="due_date" value="${dOnly(a.due_date)}"></label>
      <label class="f"><span>Marks</span><div class="marks"><input class="in" data-f="marks" inputmode="decimal" value="${a.marks ?? ""}" placeholder="–"><span class="muted">/</span><input class="in" data-f="max_marks" inputmode="decimal" value="${a.max_marks ?? ""}" placeholder="–"></div></label>
    </div>
    <label class="f"><span>Notes</span><textarea class="in" data-f="notes" rows="2" placeholder="Faculty instructions, group members, viva questions…">${esc(a.notes || "")}</textarea></label>
    <div class="as-files">
      ${files.map((f) => `<div class="fchip">📎 <a href="/api/file/${f.id}" target="_blank" rel="noopener">${esc(f.name)}</a><span class="muted small">${fmtSize(f.size)}</span><a class="btn sm ghost" style="flex:none" href="/api/file/${f.id}?download=1" title="Download">⤓</a></div>`).join("")}
      <label class="btn sm ghost" style="cursor:pointer">＋ Attach report / PPT<input type="file" multiple hidden data-upload data-kind="${k}" data-sid="${s.id}"></label>
    </div>
  </div>`;
}

function syllabusView(s) {
  if (!s.units?.length) return `<div class="card empty">No syllabus units for this subject yet. Use the Checklist tab for your own to-dos.</div>`;
  return `<div class="grid g2">${s.units.map((u, i) => {
    const keys = u.topics.map((_, j) => `${i}.${j}`), done = keys.filter((k) => topicDone(s.id, k)).length;
    return `<div class="card unit"><h4>${esc(u.title)} <span class="pill ${done === keys.length ? "green" : ""}">${done}/${keys.length}</span></h4>
      <div class="bar" style="margin-bottom:8px"><i style="width:${(done / keys.length) * 100}%"></i></div>
      ${u.topics.map((t, j) => { const on = topicDone(s.id, `${i}.${j}`); return `<label class="tcheck ${on ? "on" : ""}"><input type="checkbox" data-topic="${i}.${j}" data-sid="${s.id}" ${on ? "checked" : ""}><span>${esc(t)}</span></label>`; }).join("")}
    </div>`;
  }).join("")}</div>`;
}

// ---- study notes
function notesBody(s) {
  const n = notesCache[s.id];
  if (!n) { loadNotes(s.id); return `<div class="card empty"><div class="spinner" style="margin:0 auto 10px"></div>Loading notes…</div>`; }
  const editing = S.user.is_admin && notesCache._edit === s.id;
  if (editing) return `<div class="card"><h3>Edit study notes · ${esc(s.short)}</h3>
    <p class="muted small" style="margin-top:-6px">Markdown: # headings, - bullets, **bold**, | tables |, > quotes.</p>
    <textarea class="in mono" id="notesEd" rows="24">${esc(n.notes_md)}</textarea>
    <div class="row wrap" style="margin-top:10px"><button class="btn primary" id="notesSave">Save notes</button><button class="btn ghost" id="notesCancel">Cancel</button>${n.custom ? `<button class="btn danger" id="notesReset">Reset to default</button>` : ""}</div></div>`;
  if (!n.notes_md) return `<div class="card empty">No study notes for ${esc(s.short)} yet.${S.user.is_admin ? ` <button class="btn sm ghost" id="notesEdit">Write notes</button>` : ""}</div>`;
  const heads = [...n.notes_md.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  return `<div class="notes-wrap">
    ${heads.length > 2 ? `<aside class="card toc"><b class="small muted">ON THIS PAGE</b>${heads.map((h, i) => `<a href="#" data-toc="${i}">${esc(h)}</a>`).join("")}</aside>` : ""}
    <article class="card md">${S.user.is_admin ? `<button class="btn sm ghost" id="notesEdit" style="float:right">✎ Edit</button>` : ""}${md(n.notes_md)}</article></div>`;
}
async function loadNotes(id) {
  try { notesCache[id] = await api("GET", `notes/${id}`); } catch (e) { notesCache[id] = { notes_md: "", custom: false }; toast(e.message, true); }
  render();
}
function pageNotes() {
  if (routeArg) {
    const s = subjById(routeArg);
    if (!s) return `<div class="empty">Subject not found.</div>`;
    return `<a class="back-link" href="#/notes">← All study notes</a>
      <div class="sd-head slim" style="--c:${s.color}"><h1>📘 ${esc(s.name)}</h1><div class="row wrap"><a href="#/subject/${s.id}" style="color:#fff;font-weight:700">Open tracker →</a></div></div>
      <div style="--c:${s.color}">${notesBody(s)}</div>`;
  }
  const subs = visibleSubjects();
  return `<h1 class="page">Study notes</h1><p class="sub">Exam-oriented notes for your subjects. More subjects will be added.</p>
  <div class="grid g3">${subs.map((s) => `<a class="card subj" href="#/notes/${s.id}" style="--c:${s.color};${s.has_notes ? "" : "opacity:.55"}">
    <span class="tag">${esc(s.short)}</span><h4>${esc(s.name)}</h4><div class="meta">${s.has_notes ? "📘 Notes available" : "Coming soon"}</div></a>`).join("")}</div>`;
}

function filesView(files, sid = null) {
  const subs = visibleSubjects();
  return `<div class="card" style="margin-bottom:14px">
    <div class="drop" id="drop"><b>Drop files here</b> or tap to choose<div class="small">Reports, PPTs, PDFs, code zips — up to 100 MB each</div><input type="file" multiple hidden id="dropIn"></div>
    <div class="row wrap" style="margin-top:10px">
      ${sid ? `<input type="hidden" id="upSid" value="${sid}">` : `<select class="in" id="upSid" style="max-width:240px"><option value="">General (no subject)</option>${subs.map((s) => `<option value="${s.id}">${esc(s.short)}</option>`).join("")}</select>`}
      <select class="in" id="upKind" style="max-width:180px"><option value="">Not linked</option>${S.kinds.map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`).join("")}</select>
    </div>
    <div class="progress" id="upProg"></div>
  </div>
  <div class="card">${files.length ? `<div class="list">${files.map((f) => { const s = subjById(f.subject_id); return `<div class="li file-row">
      <span class="dot" style="--c:${s?.color || "#94a3b8"}"></span>
      <div style="flex:1;min-width:0"><a class="ellip" href="/api/file/${f.id}" target="_blank" rel="noopener" style="font-weight:700;text-decoration:none;color:inherit;display:block">📎 ${esc(f.name)}</a>
        <div class="muted small">${sid ? "" : (s ? esc(s.short) : "General") + " · "}${f.kind ? KIND_LABEL[f.kind] + " · " : ""}${fmtSize(f.size)} · ${fmtDate(f.created_at, false)}</div></div>
      <a class="btn sm ghost" href="/api/file/${f.id}?download=1" title="Download">⤓<span class="hide-sm"> Download</span></a>
      <button class="btn sm danger" data-delfile="${f.id}" title="Delete">✕</button></div>`; }).join("")}</div>`
    : `<div class="empty">No files yet. Everything you upload here is saved to your account, so you can download it from any device.</div>`}</div>`;
}
function pageFiles() {
  const total = S.files.reduce((t, f) => t + Number(f.size || 0), 0);
  return `<h1 class="page">My files</h1><p class="sub">${S.files.length} file${S.files.length === 1 ? "" : "s"} · ${fmtSize(total) || "0 B"} of 1 GB used. Upload your reports and PPTs so your work is never lost.</p>${filesView(S.files)}`;
}

function todoRow(t) {
  return `<div class="li"><label class="tcheck ${t.done ? "on" : ""}" style="flex:1;padding:2px;min-width:0"><input type="checkbox" data-todo="${t.id}" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span></label><button class="btn sm ghost" data-deltodo="${t.id}" title="Delete">✕</button></div>`;
}
function pageChecklist() {
  const subs = visibleSubjects();
  const open = S.todos.filter((t) => !t.done), done = S.todos.filter((t) => t.done);
  const pending = [];
  for (const s of subs) for (const k of kindsFor(s.id)) {
    const a = getA(s.id, k); if (a.submitted) continue;
    const miss = ["report", "ppt", "viva"].filter((f) => !a[f]);
    if (miss.length < 3 || effDue(a)) pending.push({ s, k, a, miss });
  }
  return `<h1 class="page">Checklist</h1><p class="sub">Your own to-dos, what's pending in each assessment, and exam-prep progress.</p>
  <div class="grid g2">
    <div class="card"><h3>☑ My to-dos</h3>
      <form id="qtodo" class="row" style="margin-bottom:8px"><input class="in" name="text" placeholder="Add a to-do…"><button class="btn primary">Add</button></form>
      ${open.length ? `<div class="list">${open.map(todoRow).join("")}</div>` : `<div class="empty">Nothing pending ✨</div>`}
      ${done.length ? `<details style="margin-top:10px"><summary class="muted small" style="cursor:pointer">Completed (${done.length})</summary><div class="list">${done.map(todoRow).join("")}</div></details>` : ""}
    </div>
    <div class="card"><h3>📋 Pending in assessments</h3>
      ${pending.length ? `<div class="list">${pending.map(({ s, k, a, miss }) => `<a class="li" href="#/subject/${s.id}" style="text-decoration:none;color:inherit">
        <span class="dot" style="--c:${s.color}"></span><div style="flex:1;min-width:0"><b>${esc(s.short)} · ${KIND_LABEL[k]}</b><div class="muted small">${miss.length ? "Still to do: " + miss.map((m) => m === "ppt" ? "PPT" : m[0].toUpperCase() + m.slice(1)).join(", ") : "Mark as done once submitted"}</div></div>${dueLabel(effDue(a))}</a>`).join("")}</div>`
        : `<div class="empty">Started assessments with something left will show here.</div>`}
    </div>
  </div>
  <div class="card" style="margin-top:14px"><h3>📚 Exam prep — syllabus coverage</h3>
    ${subs.filter((s) => syllabusProgress(s) !== null).map((s) => { const ne = examsFor(s.id).filter((e) => e.exam_date && daysUntil(e.exam_date) >= 0).sort((a, b) => dOnly(a.exam_date).localeCompare(dOnly(b.exam_date)))[0]; return `<a href="#/subject/${s.id}" data-goto-syl style="display:block;text-decoration:none;color:inherit;margin-bottom:12px">
      <div class="row between small"><b class="ellip">${esc(s.name)}</b><span class="muted" style="white-space:nowrap">${pct(syllabusProgress(s))}%${ne ? ` · ${esc(ne.name)} ${fmtDate(ne.exam_date, false)}` : ""}</span></div>
      <div class="bar" style="--c:${s.color};margin-top:5px"><i style="width:${pct(syllabusProgress(s))}%"></i></div></a>`; }).join("")}
  </div>`;
}

function pageAssignments() {
  const p = prefs();
  const subs = S.subjects.slice().sort((a, b) => a.sort - b.sort);   // every subject incl. electives
  const open = S.assignments.filter((a) => !a.done), done = S.assignments.filter((a) => a.done);
  const row = (a) => { const s = subjById(a.subject_id); return `<div class="li asg-row">
    <input type="checkbox" data-asg="${a.id}" ${a.done ? "checked" : ""} title="Mark done" style="width:20px;height:20px;accent-color:var(--brand);flex:none">
    <span class="dot" style="--c:${s?.color || "#64748b"}"></span>
    <div style="flex:1;min-width:0"><b class="ellip" style="display:block;${a.done ? "text-decoration:line-through;color:var(--muted)" : ""}">${esc(a.title)}</b><div class="muted small">${s ? esc(s.short) : "General"}${a.due_date ? " · due " + fmtDate(a.due_date) : ""}${a.notes ? " · " + esc(a.notes) : ""}</div></div>
    ${a.done ? "" : dueLabel(a.due_date)}<button class="btn sm danger" data-delasg="${a.id}" title="Delete this assignment">🗑<span class="hide-sm"> Delete</span></button></div>`; };
  return `<div class="row between wrap"><div><h1 class="page">Assignments</h1><p class="sub">Optional tracker for regular class assignments. Added one by mistake? Tap 🗑 Delete.</p></div>
    <label class="row small" style="font-weight:700;cursor:pointer"><input type="checkbox" id="pinAsg" ${p.showAssignments ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--brand)"> Show as a tab</label></div>
  <div class="card" style="margin-bottom:14px"><form id="asgF" class="grid g4" style="align-items:end">
    <label class="f" style="margin:0"><span>Title</span><input class="in" name="title" required placeholder="Assignment 2 – Hadoop"></label>
    <label class="f" style="margin:0"><span>Subject</span><select class="in" name="subject_id"><option value="">General</option>
      <optgroup label="Core">${subs.filter((s) => s.kind !== "elective" && !s.owner_id).map((s) => `<option value="${s.id}">${esc(s.short)} — ${esc(s.name)}</option>`).join("")}</optgroup>
      <optgroup label="Electives">${subs.filter((s) => s.kind === "elective").map((s) => `<option value="${s.id}">${esc(s.short)} — ${esc(s.name)}</option>`).join("")}</optgroup>
      ${subs.some((s) => s.owner_id) ? `<optgroup label="My subjects">${subs.filter((s) => s.owner_id).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</optgroup>` : ""}
    </select></label>
    <label class="f" style="margin:0"><span>Due</span><input class="in" type="date" name="due_date"></label>
    <button class="btn primary" style="height:44px">Add assignment</button></form></div>
  <div class="card">${open.length ? `<div class="list">${open.map(row).join("")}</div>` : `<div class="empty">No open assignments.</div>`}
    ${done.length ? `<details style="margin-top:10px" ${done.length < 6 ? "open" : ""}><summary class="muted small" style="cursor:pointer">Completed (${done.length})</summary><div class="list">${done.map(row).join("")}</div>
      <button class="btn sm danger" id="clearDone" style="margin-top:8px">🗑 Delete all completed</button></details>` : ""}</div>`;
}

// ---- leaderboard
let LB = null, lbLoading = false, lbConfettiDone = false;
const BADGES = {
  fire: ["🔥", "Active this week"], finisher: ["✅", "5+ assessments submitted"], reports: ["📄", "5+ reports done"],
  viva: ["🎤", "5+ vivas done"], syllabus: ["📚", "75%+ syllabus covered"],
};
async function loadLB() {
  if (lbLoading) return; lbLoading = true;
  try { LB = await api("GET", "leaderboard"); LB._at = Date.now(); } catch (e) { toast(e.message, true); }
  lbLoading = false;
  if (route === "leaderboard") render();
}
function lbAvatar(x, size) {
  const t = /^\d+$/.test(x.label) ? x.label.slice(-3) : x.label.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return `<div class="lb-av" style="--s:${size}px"><span>${esc(t)}</span></div>`;
}
function pageLeaderboard() {
  if (!LB || Date.now() - LB._at > 30000) loadLB();
  const show = prefs().lbShow || "roll";
  const head = `<div class="lb-top">
      <div><div class="lb-kicker">Sem VII · B.Tech CSE (DS)</div><h1 class="lb-title" data-text="LEADERBOARD">LEADERBOARD</h1>
        <p class="lb-sub">Tick your reports, PPTs, vivas and syllabus topics. Climb the board.</p></div>
      <button class="lb-edit" id="lbEdit"><span class="lb-av mini" style="--s:30px"><span>✎</span></span><span><b>Edit my card</b><small>${{ roll: "Showing roll no.", name: "Showing name", nick: "Showing nickname" }[show] || "Showing roll no."}${prefs().lbTitle ? " · " + esc(prefs().lbTitle) : ""}</small></span></button>
</div>`;
  if (!LB) return `<div class="lb">${lbBg()}${head}<div class="lb-loading"><div class="lb-spin"></div>Loading the rankings…</div></div>`;
  const L = LB.list, max = Math.max(1, ...L.map((x) => x.score));
  const me = L.find((x) => x.me);
  const ahead = me ? L.filter((x) => x.score > me.score).slice(-1)[0] : null;
  const pctile = me ? Math.max(1, Math.round((L.filter((x) => x.score > me.score).length + 1) / L.length * 100)) : 0;
  const scored = L.filter((x) => x.score > 0);
  const top = [scored[1], scored[0], scored[2]];
  const pod = top.map((x, i) => {
    if (!x) return `<div class="pod empty"></div>`;
    const place = [2, 1, 3][i];
    return `<div class="pod p${place} ${x.me ? "me" : ""}" style="--d:${[0.25, 0, 0.45][i]}s" data-tilt>
      ${place === 1 ? `<svg class="crown" viewBox="0 0 64 44"><path d="M4 40 L8 10 L22 24 L32 4 L42 24 L56 10 L60 40 Z" fill="url(#cg)" stroke="#7a4b00" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="4" r="4" fill="#fff6c9"/><circle cx="8" cy="10" r="3.4" fill="#fff6c9"/><circle cx="56" cy="10" r="3.4" fill="#fff6c9"/><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset=".5" stop-color="#ffc83d"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs></svg>` : ""}
      <div class="pod-ring">${lbAvatar(x, place === 1 ? 92 : 74)}</div>
      <div class="pod-name">${esc(x.label)}${x.me ? ' <em>you</em>' : ""}</div>
      ${x.title ? `<div class="pod-title">${esc(x.title)}</div>` : ""}
      <div class="pod-score"><b data-count="${x.score}">0</b> pts</div>
      <div class="pod-badges">${x.badges.map((b) => `<span title="${BADGES[b][1]}">${BADGES[b][0]}</span>`).join("")}</div>
      <div class="pillar"><span>${place}</span></div>
    </div>`;
  }).join("");
  const rest = L.filter((x) => !top.includes(x));
  const rows = rest.map((x, i) => `<div class="lb-row ${x.me ? "me" : ""} ${x.score ? "" : "zero"}" style="--d:${Math.min(i, 20) * 0.05 + 0.5}s">
      <div class="rk">${x.score ? "#" + x.rank : "–"}</div>${lbAvatar(x, 40)}
      <div class="who"><b>${esc(x.label)}${x.me ? ' <em>you</em>' : ""}</b>${x.title ? `<span class="lb-tl">${esc(x.title)}</span>` : ""}
        <div class="bar"><i style="--w:${(x.score / max) * 100}%"></i></div></div>
      <div class="bd">${x.badges.map((b) => `<span title="${BADGES[b][1]}">${BADGES[b][0]}</span>`).join("")}</div>
      <div class="pts"><b data-count="${x.score}">0</b><small>pts</small></div></div>`).join("");
  return `<div class="lb">${lbBg()}${head}
    ${scored.length ? `<div class="podium">${pod}</div>` : `<div class="lb-empty"><div class="trophy">🏆</div><h2>The race hasn't started yet</h2><p>Open any subject, tick a report, PPT or viva, or check off a syllabus topic. The first points take the crown.</p><a class="lb-cta" href="#/subjects">Start scoring →</a></div>`}
    ${me && me.score === 0 && scored.length ? `<div class="lb-me"><div class="big"><small>Your rank</small><b>–</b><span>not on the board</span></div>
      <div class="mid"><div class="line1">Score your first points to enter the board. <b>${(scored[scored.length - 1]?.score || 0) + 1}</b> pts gets you past the last place.</div><div class="line2">One report + PPT + viva = 30 pts. Submitting = 20 more.</div></div></div>` : ""}
    ${me && me.score > 0 ? `<div class="lb-me">
      <div class="big"><small>Your rank</small><b>#${me.rank}</b><span>of ${L.length}</span></div>
      <div class="mid"><div class="line1">${me.rank === 1 ? "👑 You're on top. Defend the crown!" : `<b>${ahead.score - me.score + 1}</b> pts to overtake <b>#${ahead.rank}</b>`}</div>
        <div class="bar"><i style="--w:${(me.score / max) * 100}%"></i></div>
        <div class="line2">Top ${pctile}% of the batch · ${me.submitted} submitted · ${me.reports + me.ppts + me.vivas} report/PPT/viva ticks · ${me.topics} topics</div></div>
      <div class="pts"><b data-count="${me.score}">0</b><small>points</small></div></div>` : ""}
    <div class="lb-list">${rows || ""}</div>
    <div class="lb-rules">
      <b>How points work</b>
      <span>📄 Report <i>+10</i></span><span>📊 PPT <i>+10</i></span><span>🎤 Viva <i>+10</i></span><span>✅ Submitted <i>+20</i></span><span>📚 Syllabus topic <i>+5</i></span>
      <div class="lb-legend">${Object.values(BADGES).map(([e, t]) => `<span>${e} ${t}</span>`).join("")}</div>
      <div class="lb-fine">Only what you choose on your card (roll no., name or nickname + title) and your points are shown. Marks are never shown. Custom subjects don't count.</div>
    </div>
  </div>`;
}
const TITLE_IDEAS = ["Topper in making 📈", "Last bench legend 🪑", "Viva warrior 🎤", "Deadline se 1 min pehle ⏱️", "PPT ka baadshah 📊", "Khapittar 🤣", "Sleeping through UA-3 😴", "Report likh raha hu... ✍️"];
function lbCardModal() {
  const p = prefs();
  let st = { show: p.lbShow || "roll", nick: p.lbNick || "", title: p.lbTitle || "" };
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  const label = () => (st.show === "nick" && st.nick.trim() ? st.nick.trim() : st.show === "name" ? S.user.name : S.user.roll_no);
  bg.innerHTML = `<form class="modal lb-modal"><h3>Your leaderboard card</h3>
    <div class="lb-preview"><div class="lb-av" style="--s:52px"><span></span></div><div style="min-width:0"><b class="pv-name"></b><div class="pv-title"></div></div><div class="pv-pts">🏆</div></div>
    <div class="f"><span>Show me as</span><div class="seg3">${[["roll", "Roll no."], ["name", "Name"], ["nick", "Nickname"]].map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join("")}</div></div>
    <label class="f nick-f"><span>Nickname <small class="muted">(max 24)</small></span><input class="in" name="nick" maxlength="40" placeholder="e.g. Khapittar" value="${esc(st.nick)}"></label>
    <label class="f"><span>Title under your name <small class="muted">(like WhatsApp About · max 40)</small></span><input class="in" name="title" maxlength="80" placeholder="e.g. Viva warrior 🎤" value="${esc(st.title)}"></label>
    <div class="ideas">${TITLE_IDEAS.map((t) => `<button type="button" class="pill" data-idea="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <p class="muted small" style="margin:8px 0 0">Everyone in the batch can see this. Keep it fun, not offensive. The admin can clear titles.</p>
    <div class="row wrap" style="margin-top:12px"><button class="btn grad">Save card</button><button type="button" class="btn ghost" data-close>Cancel</button>${st.title || st.nick ? `<button type="button" class="btn danger" data-clear style="margin-left:auto">Clear</button>` : ""}</div></form>`;
  document.body.appendChild(bg);
  const f = bg.querySelector("form"), chars = (v, n) => [...v].slice(0, n).join("");
  const paint = () => {
    const l = label();
    bg.querySelector(".pv-name").textContent = l;
    bg.querySelector(".pv-title").textContent = st.title || "No title yet";
    bg.querySelector(".pv-title").style.opacity = st.title ? 1 : 0.5;
    bg.querySelector(".lb-preview .lb-av span").textContent = /^\d+$/.test(l) ? l.slice(-3) : l.split(/\s+/).map((w) => [...w][0] || "").slice(0, 2).join("").toUpperCase();
    bg.querySelectorAll(".seg3 button").forEach((b) => b.classList.toggle("on", b.dataset.v === st.show));
    bg.querySelector(".nick-f").style.display = st.show === "nick" ? "" : "none";
  };
  bg.querySelectorAll(".seg3 button").forEach((b) => (b.onclick = () => { st.show = b.dataset.v; paint(); if (st.show === "nick") f.nick.focus(); }));
  f.nick.oninput = () => { st.nick = chars(f.nick.value, 24); paint(); };
  f.title.oninput = () => { st.title = chars(f.title.value, 40); paint(); };
  bg.querySelectorAll("[data-idea]").forEach((b) => (b.onclick = () => { f.title.value = st.title = b.dataset.idea; paint(); }));
  const close = () => bg.remove();
  bg.onclick = (e) => { if (e.target === bg) close(); };
  bg.querySelector("[data-close]").onclick = close;
  const save = async (card) => {
    try {
      const r = await api("POST", "leaderboard/card", card);
      S.user.prefs = r.prefs; LB = null; lbConfettiDone = true; close(); render(); toast("Card updated ✨");
    } catch (e) { toast(e.message, true); }
  };
  const clr = bg.querySelector("[data-clear]");
  if (clr) clr.onclick = () => save({ show: st.show === "nick" ? "roll" : st.show, nick: "", title: "" });
  f.onsubmit = (e) => { e.preventDefault(); save(st); };
  paint();
}
function lbBg() {
  return `<div class="lb-bg" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i><div class="stars"></div><div class="floor"></div></div><canvas class="lb-confetti"></canvas>`;
}
function lbEffects() {
  const root = document.querySelector(".lb");
  if (!root || !LB) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count);
    if (still || !to) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 1400;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  root.querySelectorAll("[data-tilt]").forEach((card) => {
    card.onmousemove = (e) => { const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; card.style.transform = `perspective(700px) rotateY(${x * 14}deg) rotateX(${-y * 10}deg) translateY(-4px)`; };
    card.onmouseleave = () => (card.style.transform = "");
  });
  const fire = () => confetti(root.querySelector(".lb-confetti"));
  root.querySelector(".pod.p1")?.addEventListener("click", fire);
  if (!still && !lbConfettiDone && LB.list.some((x) => x.score > 0)) { lbConfettiDone = true; setTimeout(fire, 700); }
}
function confetti(cv) {
  if (!cv) return;
  const ctx = cv.getContext("2d"), dpr = devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
  const cols = ["#ffd166", "#ff6b9d", "#7cf3ff", "#a78bfa", "#5eead4", "#ffffff", "#ff9f43"];
  const ps = Array.from({ length: 170 }, () => ({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.28, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
    s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0], shape: Math.random() < 0.35 }));
  const t0 = performance.now();
  const tick = (t) => {
    ctx.clearRect(0, 0, W, H);
    const alive = t - t0 < 3600;
    for (const p of ps) {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - (t - t0) / 3600);
      if (p.shape) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.4, 0, 7); ctx.fill(); } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(tick);
}

// ---- calendar
function pageCalendar() {
  const today = todayISO();
  if (!calMonth) calMonth = today.slice(0, 7);
  if (!calSel) calSel = today;
  const [y, m] = calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;   // Monday first
  const daysIn = new Date(y, m, 0).getDate();
  const items = datedItems();
  const byDate = {};
  for (const x of items) (byDate[x.date] ||= []).push(x);
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(`<div class="cal-c out"></div>`);
  for (let d = 1; d <= daysIn; d++) {
    const iso = `${calMonth}-${String(d).padStart(2, "0")}`;
    const list = byDate[iso] || [];
    cells.push(`<button class="cal-c ${iso === today ? "today" : ""} ${iso === calSel ? "sel" : ""} ${list.some((x) => x.type === "exam") ? "has-exam" : ""}" data-day="${iso}">
      <span class="n">${d}</span>
      <span class="chips">${list.slice(0, 3).map((x) => `<i style="--c:${x.color || x.s?.color || "#64748b"}" class="t-${x.type}"><em>${esc(x.title)}</em></i>`).join("")}${list.length > 3 ? `<small>+${list.length - 3}</small>` : ""}</span>
    </button>`);
  }
  const sel = byDate[calSel] || [];
  const monthName = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const upcoming = items.filter((x) => x.date >= today).slice(0, 10);
  const subsOpts = visibleSubjects().map((s) => `<option value="${s.id}">${esc(s.short)}</option>`).join("");
  return `<div class="row between wrap"><div><h1 class="page">Calendar</h1><p class="sub">Unit assessments, deadlines, assignments and your own events — all in one place.</p></div></div>
  <div class="cal-layout">
    <div class="card cal">
      <div class="cal-head"><button class="btn sm ghost" data-cal="-1" aria-label="Previous month">‹</button><b>${monthName}</b><button class="btn sm ghost" data-cal="1" aria-label="Next month">›</button><button class="btn sm ghost" data-cal="0">Today</button></div>
      <div class="cal-grid wk">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<div>${d}</div>`).join("")}</div>
      <div class="cal-grid">${cells.join("")}</div>
      <div class="legend small muted"><span><i style="background:var(--brand)"></i>Unit assessment / class event</span><span><i style="background:var(--warn)"></i>Deadline</span><span><i style="background:var(--ok)"></i>My event</span></div>
    </div>
    <div class="cal-side">
      <div class="card"><h3>${fmtDate(calSel)}${calSel === today ? ' <span class="pill brand">Today</span>' : ""}</h3>
        ${sel.length ? `<div class="list">${sel.map((x) => `<div class="li">
            <span class="dot" style="--c:${x.color || x.s?.color || "#64748b"}"></span>
            <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(x.title)}</div><div class="muted small">${TYPE_META[x.type][0]}${x.time ? " · " + esc(x.time) : ""}${x.note ? " · " + esc(x.note) : ""}</div></div>
            ${x.ev && (x.ev.user_id || S.user.is_admin) ? `<button class="btn sm ghost" data-edit-ev="${x.ev.id}">Edit</button>` : x.href ? `<a class="btn sm ghost" href="${x.href}">Open</a>` : ""}
          </div>`).join("")}</div>` : `<div class="empty" style="padding:12px">Nothing on this day.</div>`}
        <form id="evF" style="margin-top:12px;border-top:1px dashed var(--line);padding-top:12px">
          <b class="small">＋ Add event on ${fmtDate(calSel, false)}</b>
          <label class="f" style="margin-top:8px"><span>Title</span><input class="in" name="title" required placeholder="e.g. Group meeting for TA3"></label>
          <div class="two" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <label class="f"><span>Date</span><input class="in" type="date" name="event_date" value="${calSel}" required></label>
            <label class="f"><span>Time (optional)</span><input class="in" name="event_time" placeholder="10:00 AM"></label>
          </div>
          <label class="f"><span>Subject (optional)</span><select class="in" name="subject_id"><option value="">—</option>${subsOpts}</select></label>
          <label class="f"><span>Note</span><input class="in" name="note" placeholder="Room, what to bring…"></label>
          ${S.user.is_admin ? `<label class="tcheck" style="padding:4px 0"><input type="checkbox" name="batch"><span>Class event — show to everyone and notify devices</span></label>` : ""}
          <button class="btn primary">Add event</button>
        </form>
      </div>
      <div class="card"><h3>Next up</h3>${upcoming.length ? `<div class="list">${upcoming.map((x) => itemRow(x)).join("")}</div>` : `<div class="empty">Nothing upcoming.</div>`}</div>
    </div>
  </div>`;
}
function eventModal(ev) {
  const subsOpts = visibleSubjects().map((s) => `<option value="${s.id}" ${s.id === ev.subject_id ? "selected" : ""}>${esc(s.short)}</option>`).join("");
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<form class="modal" id="evEdit"><h3>${ev.user_id ? "Edit my event" : "Edit class event"}</h3>
    <label class="f"><span>Title</span><input class="in" name="title" value="${esc(ev.title)}" required></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f"><span>Date</span><input class="in" type="date" name="event_date" value="${dOnly(ev.event_date)}" required></label>
    <label class="f"><span>Time</span><input class="in" name="event_time" value="${esc(ev.event_time || "")}"></label></div>
    <label class="f"><span>Subject</span><select class="in" name="subject_id"><option value="">—</option>${subsOpts}</select></label>
    <label class="f"><span>Note</span><textarea class="in" name="note" rows="2">${esc(ev.note || "")}</textarea></label>
    ${!ev.user_id ? `<label class="tcheck" style="padding:4px 0"><input type="checkbox" name="notify"><span>Notify everyone about this change</span></label>` : ""}
    <div class="row wrap" style="margin-top:6px"><button class="btn primary">Save</button><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn danger" data-del style="margin-left:auto">🗑 Delete</button></div></form>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = (e) => { if (e.target === bg) close(); };
  bg.querySelector("[data-close]").onclick = close;
  bg.querySelector("[data-del]").onclick = async () => {
    if (!confirm("Delete this event?")) return;
    try { await api("DELETE", `event/${ev.id}`); S.events = S.events.filter((x) => x.id !== ev.id); close(); render(); toast("Event deleted"); } catch (e) { toast(e.message, true); }
  };
  bg.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      const r = await api("PUT", `event/${ev.id}`, { ...fd, subject_id: fd.subject_id ? Number(fd.subject_id) : null, notify: !!fd.notify });
      S.events = S.events.map((x) => (x.id === ev.id ? r.event : x)); close(); calSel = dOnly(r.event.event_date); render(); toast("Saved");
    } catch (err) { toast(err.message, true); }
  };
}

// ---- notifications
function pushState() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    return ios && !navigator.standalone ? "ios" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return S.pushOn && Notification.permission === "granted" ? "on" : "off";
}
function pageNotifications() {
  const seenBefore = prefs().notifSeen || S.user.created_at;
  const rem = reminders();
  const st = pushState();
  const pushCard = {
    on: `<div class="row between wrap"><div><b>✅ Device notifications are on</b><div class="muted small">You'll get a reminder around 8 AM and 7 PM when something is due, plus class announcements.</div></div><div class="row"><button class="btn sm ghost" id="pushTest">Send test</button><button class="btn sm ghost" id="pushOff">Turn off</button></div></div>`,
    off: `<div class="row between wrap"><div><b>🔔 Get reminders on this device</b><div class="muted small">Deadline and exam reminders + class updates, even when the site is closed.</div></div><button class="btn grad" id="pushOn">Turn on notifications</button></div>`,
    denied: `<b>🔕 Notifications are blocked</b><div class="muted small">Allow notifications for this site in your browser settings, then reload.</div>`,
    ios: `<b>📱 On iPhone: add to Home Screen first</b><div class="muted small">Tap Share → <b>Add to Home Screen</b>, open Sem 7 from your home screen, then come back here to turn on notifications (iOS 16.4+).</div>`,
    unsupported: `<b>This browser can't receive push notifications.</b><div class="muted small">Try Chrome, Edge, Firefox or Safari (on iPhone, add to Home Screen first).</div>`,
  }[st];
  const groups = [["Overdue", rem.filter((x) => daysUntil(x.date) < 0)], ["Today", rem.filter((x) => daysUntil(x.date) === 0)], ["Tomorrow", rem.filter((x) => daysUntil(x.date) === 1)], ["Coming up", rem.filter((x) => daysUntil(x.date) > 1)]].filter(([, l]) => l.length);
  setTimeout(() => { if (unreadUpdates().length) savePrefs({ notifSeen: new Date().toISOString() }).then(() => { const b = document.querySelector(".bell b"); const n = badgeCount(); if (b) n ? (b.textContent = n) : b.remove(); }); }, 400);
  return `<h1 class="page">Notifications</h1><p class="sub">Reminders for what's due, and announcements from the class admin.</p>
  <div class="card push-card" style="margin-bottom:14px">${pushCard}</div>
  <div class="grid g2">
    <div class="card"><h3>⏰ Reminders</h3>
      ${groups.length ? groups.map(([g, l]) => `<div class="grp"><div class="grp-h">${g}</div><div class="list">${l.map((x) => itemRow(x)).join("")}</div></div>`).join("") : `<div class="empty">Nothing due in the next few days 🎉</div>`}
    </div>
    <div class="card"><h3>📣 Announcements &amp; updates</h3>
      ${S.updates.length ? `<div class="list">${S.updates.slice(0, 40).map((u) => `<div class="li ann ${u.created_at > seenBefore ? "unread" : ""}">
        <span class="ann-ic">${u.kind === "release" ? "✦" : u.kind === "alert" ? "📌" : "📣"}</span>
        <div style="flex:1;min-width:0"><div style="font-weight:700">${u.version ? `<span class="pill brand">${esc(u.version)}</span> ` : ""}${esc(u.title)}</div>
          ${u.body ? `<div class="muted small ann-body">${md(u.body)}</div>` : ""}<div class="muted small">${fmtStamp(u.created_at)}</div></div></div>`).join("")}</div>` : `<div class="empty">No announcements yet.</div>`}
    </div>
  </div>`;
}

function pageUpdates() {
  const rel = S.updates.filter((u) => u.kind === "release");
  return `<h1 class="page">Update log</h1><p class="sub">What's new in Sem 7 Tracker, newest first.</p>
  <div class="timeline">${rel.map((u, i) => `<div class="card tl-item ${i === 0 ? "latest" : ""}">
    <div class="row between wrap"><div class="row">${u.version ? `<span class="pill brand">${esc(u.version)}</span>` : ""}<b>${esc(u.title)}</b>${i === 0 ? '<span class="pill green">Latest</span>' : ""}</div><span class="muted small">${fmtStamp(u.created_at)}</span></div>
    ${u.body ? `<div class="md small-md">${md(u.body)}</div>` : ""}</div>`).join("") || `<div class="card empty">No updates yet.</div>`}</div>`;
}

function pageExams() {
  const all = S.exams.slice().sort((a, b) => (dOnly(a.exam_date) || "9999").localeCompare(dOnly(b.exam_date) || "9999") || (a.slot || "").localeCompare(b.slot || ""));
  const names = [...new Set(all.map((e) => e.name))].sort().reverse();
  const table = (list) => `<div class="scroll"><table class="t"><thead><tr><th>Date</th><th>Shift / time</th><th>Subject</th><th>Countdown</th></tr></thead><tbody>
    ${list.map((e) => { const s = subjById(e.subject_id); return `<tr style="${isVisible(s) ? "" : "opacity:.45"}"><td style="white-space:nowrap"><b>${e.exam_date ? fmtDate(e.exam_date) : "TBA"}</b></td><td>${esc(e.slot || "—")}</td>
      <td><span class="row" style="gap:7px"><span class="dot" style="--c:${s?.color}"></span><span>${esc(s?.name)}${s?.code ? ` <span class="muted small">${esc(s.code)}</span>` : ""}${s?.kind === "elective" ? ' <span class="pill">elective</span>' : ""}${e.note ? `<div class="muted small">${esc(e.note)}</div>` : ""}</span></span></td>
      <td>${e.exam_date ? dueLabel(e.exam_date) : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
  return `<h1 class="page">Unit assessments</h1><p class="sub">Theory exams for B.Tech CSE 7th semester · ${EXAM_VENUE}. There are three unit assessments; UA-1 and UA-2 dates for most subjects will be added once available.</p>
  ${names.map((n) => `<div class="card" style="margin-bottom:14px"><h3>${n === "UA-3" ? "Unit Assessment-3 · Dec 2026" : n === "UA-2" ? "Unit Assessment-2" : n === "UA-1" ? "Unit Assessment-1" : esc(n)}</h3>
    ${n === "UA-3" ? `<p class="muted small" style="margin-top:-6px">Morning 10:00–11:30 · Afternoon 1:30–3:00 · from the official date sheet (06/11/2026).</p>` : ""}
    ${table(all.filter((e) => e.name === n))}</div>`).join("")}
  <p class="muted small">Faded rows are subjects you've hidden or electives you haven't turned on (<a href="#/settings">Settings</a>). Always double-check with the official notice.</p>`;
}

function pageSettings() {
  const p = prefs(), hidden = new Set(p.hidden || []), el = new Set(p.electives || []);
  const defaults = S.subjects.filter((s) => !s.owner_id && s.kind !== "elective");
  const electives = S.subjects.filter((s) => s.kind === "elective");
  const custom = S.subjects.filter((s) => s.owner_id);
  return `<h1 class="page">Subjects &amp; settings</h1><p class="sub">Everything here only changes your own view.</p>
  <div class="grid g2">
    <div class="card"><h3>Core subjects</h3><p class="muted small" style="margin-top:-6px">Untick to hide a subject you don't take.</p>
      ${defaults.map((s) => `<label class="tcheck"><input type="checkbox" data-hide="${s.id}" ${hidden.has(s.id) ? "" : "checked"}><span><b>${esc(s.short)}</b> — ${esc(s.name)}</span></label>`).join("")}
      <h3 style="margin-top:16px">Electives</h3>
      ${electives.map((s) => `<label class="tcheck"><input type="checkbox" data-el="${s.id}" ${el.has(s.id) ? "checked" : ""}><span><b>${esc(s.short)}</b> — ${esc(s.name)} <span class="muted small">${esc(s.code || "")}</span></span></label>`).join("")}
    </div>
    <div class="card"><h3>Add your own subject</h3>
      <form id="subF">
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px"><label class="f"><span>Name</span><input class="in" name="name" required></label><label class="f"><span>Short</span><input class="in" name="short" maxlength="14"></label></div>
        <div style="display:grid;grid-template-columns:1fr 64px;gap:8px"><label class="f"><span>Code</span><input class="in" name="code"></label><label class="f"><span>Colour</span><input class="in" type="color" name="color" value="#6366f1" style="padding:3px;height:44px"></label></div>
        <button class="btn primary">Add subject</button></form>
      ${custom.length ? `<div class="list" style="margin-top:12px">${custom.map((s) => `<div class="li"><span class="dot" style="--c:${s.color}"></span><div style="flex:1">${esc(s.name)}</div><button class="btn sm danger" data-delsub="${s.id}">Delete</button></div>`).join("")}</div>` : ""}
    </div>
    <div class="card"><h3>Profile</h3><form id="profF">
      <label class="f"><span>Name</span><input class="in" name="name" value="${esc(S.user.name)}" required></label>
      <label class="f"><span>Section</span><input class="in" name="section" value="${esc(S.user.section || "")}"></label>
      <button class="btn primary">Save</button></form></div>
    <div class="card"><h3>Change password</h3><form id="pwF">
      <label class="f"><span>Current password</span><input class="in" type="password" name="old" required autocomplete="current-password"></label>
      <label class="f"><span>New password</span><input class="in" type="password" name="new" required minlength="6" autocomplete="new-password"></label>
      <button class="btn primary">Update password</button></form></div>
    <div class="card"><h3>Options</h3>
      <label class="tcheck"><input type="checkbox" id="pinAsg" ${p.showAssignments ? "checked" : ""}><span>Show the Assignments tab in the main menu</span></label>
      <a class="tcheck" href="#/notifications" style="text-decoration:none;color:inherit"><span>🔔 Device notifications: <b>${{ on: "on", off: "off", denied: "blocked", ios: "add to Home Screen first", unsupported: "not supported" }[pushState()]}</b> →</span></a>
      <div class="row wrap" style="margin-top:10px"><button class="btn ghost" id="expJson2">⤓ Export all my data (JSON)</button><button class="btn ghost" id="expCsv2">⤓ Export tracker (CSV)</button></div>
    </div>
  </div>`;
}

function pageAdmin() {
  if (!S.user.is_admin) return `<div class="empty">This page is only for the class admin.</div>`;
  const subs = S.subjects.filter((s) => !s.owner_id);
  const subOpts = (sel) => subs.map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(s.short)}</option>`).join("");
  return `<h1 class="page">Admin panel</h1><p class="sub">Only you can see this. Everything here is shown to the whole batch. ${S.batchSize} account${S.batchSize === 1 ? "" : "s"} so far.</p>
  <div class="grid g2">
    <div class="card"><h3>📣 Post an announcement / update</h3><form id="updF">
      <div style="display:grid;grid-template-columns:1fr 110px;gap:8px"><label class="f"><span>Title</span><input class="in" name="title" required placeholder="e.g. TA3 submission extended"></label>
      <label class="f"><span>Type</span><select class="in" name="kind"><option value="notice">Notice</option><option value="release">App update</option></select></label></div>
      <label class="f"><span>Version (for app updates)</span><input class="in" name="version" placeholder="v2.1"></label>
      <label class="f"><span>Details</span><textarea class="in" name="body" rows="3" placeholder="- one point per line"></textarea></label>
      <label class="tcheck" style="padding:4px 0"><input type="checkbox" name="notify" checked><span>Ping everyone's devices</span></label>
      <button class="btn primary">Post</button></form></div>
    <div class="card"><h3>📌 Batch deadline (TA / ERLA / PA)</h3><form id="dlF">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label class="f"><span>Subject</span><select class="in" name="subject_id">${subOpts()}</select></label>
      <label class="f"><span>Assessment</span><select class="in" name="kind">${S.kinds.map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`).join("")}</select></label></div>
      <label class="f"><span>Due date</span><input class="in" type="date" name="due_date"></label>
      <label class="f"><span>Note</span><input class="in" name="note" placeholder="Topic / format / faculty note"></label>
      <label class="tcheck" style="padding:4px 0"><input type="checkbox" name="notify" checked><span>Ping everyone's devices</span></label>
      <button class="btn primary">Save for batch</button> <span class="muted small">Empty date + note removes it.</span></form>
      ${S.deadlines.length ? `<div class="list" style="margin-top:10px">${S.deadlines.slice().sort((a, b) => dOnly(a.due_date).localeCompare(dOnly(b.due_date))).map((d) => { const s = subjById(d.subject_id); return `<div class="li"><span class="dot" style="--c:${s?.color}"></span><div style="flex:1;min-width:0"><b>${esc(s?.short)} · ${KIND_LABEL[d.kind]}</b><div class="muted small">${d.due_date ? fmtDate(d.due_date) : "no date"}${d.note ? " — " + esc(d.note) : ""}</div></div><button class="btn sm ghost" data-edit-dl="${d.subject_id}|${d.kind}">Edit</button> <button class="btn sm danger" data-deldl="${d.subject_id}|${d.kind}">✕</button></div>`; }).join("")}</div>` : ""}
    </div>
  </div>
  <div class="card" style="margin-top:14px"><h3>◷ Unit assessments (UA-1 / UA-2 / UA-3)</h3>
    <form id="exF" class="grid g4" style="align-items:end">
      <label class="f" style="margin:0"><span>Subject</span><select class="in" name="subject_id">${subOpts()}</select></label>
      <label class="f" style="margin:0"><span>Name</span><select class="in" name="name"><option>UA-1</option><option>UA-2</option><option selected>UA-3</option><option>End-term</option></select></label>
      <label class="f" style="margin:0"><span>Date</span><input class="in" type="date" name="exam_date"></label>
      <label class="f" style="margin:0"><span>Shift / time</span><input class="in" name="slot" placeholder="Mon 10:00–11:30 AM"></label>
      <label class="f" style="margin:0;grid-column:1/-2"><span>Note</span><input class="in" name="note" placeholder="Syllabus / marks / room"></label>
      <button class="btn primary">Add assessment</button>
    </form>
    <div class="scroll" style="margin-top:12px"><table class="t"><thead><tr><th>Subject</th><th>Name</th><th>Date</th><th>Shift</th><th></th></tr></thead><tbody>
      ${S.exams.slice().sort((a, b) => (dOnly(a.exam_date) || "9").localeCompare(dOnly(b.exam_date) || "9")).map((e) => `<tr><td>${esc(subjById(e.subject_id)?.short)}</td><td>${esc(e.name)}</td><td style="white-space:nowrap">${e.exam_date ? fmtDate(e.exam_date) : "TBA"}</td><td>${esc(e.slot || "")}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" data-edit-ex="${e.id}">Edit</button> <button class="btn sm danger" data-del-ex="${e.id}">✕</button></td></tr>`).join("")}
    </tbody></table></div></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>📅 Class events</h3><p class="muted small" style="margin-top:-6px">Add from the <a href="#/calendar">Calendar</a> with "Class event" ticked. Current ones:</p>
      ${S.events.filter((e) => !e.user_id).length ? `<div class="list">${S.events.filter((e) => !e.user_id).map((e) => `<div class="li"><div style="flex:1;min-width:0"><b>${esc(e.title)}</b><div class="muted small">${fmtDate(e.event_date)}${e.event_time ? " · " + esc(e.event_time) : ""}</div></div><button class="btn sm ghost" data-edit-ev="${e.id}">Edit</button></div>`).join("")}</div>` : `<div class="empty">None.</div>`}
    </div>
    <div class="card"><h3>🔑 Reset a batchmate's password</h3><form id="rstF">
      <label class="f"><span>Roll number</span><input class="in" name="roll_no" required></label>
      <label class="f"><span>Temporary password</span><input class="in" name="password" required minlength="6"></label>
      <button class="btn primary">Reset</button></form></div>
  </div>
  <div class="card" style="margin-top:14px"><h3>👥 Accounts</h3><div id="usersBox"><button class="btn ghost" id="loadUsers">Load list</button></div></div>
  <div class="card" style="margin-top:14px"><h3>✦ Posted updates</h3><div class="list">${S.updates.slice(0, 30).map((u) => `<div class="li"><div style="flex:1;min-width:0"><b>${u.version ? esc(u.version) + " · " : ""}${esc(u.title)}</b><div class="muted small">${u.kind} · ${fmtStamp(u.created_at)}</div></div><button class="btn sm ghost" data-edit-upd="${u.id}">Edit</button> <button class="btn sm danger" data-del-upd="${u.id}">✕</button></div>`).join("")}</div></div>
  <div class="card" style="margin-top:14px"><h3>📚 Subjects (shown to everyone)</h3><div class="list">${S.subjects.filter((s) => !s.owner_id).map((s) => `<div class="li"><span class="dot" style="--c:${s.color}"></span><div style="flex:1;min-width:0"><b>${esc(s.short)}</b> — ${esc(s.name)}<div class="muted small">${esc(s.code || "no code")}${s.credits ? " · " + s.credits + " credits" : ""} · ${s.kind}</div></div><button class="btn sm ghost" data-edit-sub="${s.id}">Edit</button></div>`).join("")}</div></div>`;
}
function examModal(e) {
  const subs = S.subjects.filter((s) => !s.owner_id);
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<form class="modal"><h3>Edit unit assessment</h3>
    <label class="f"><span>Subject</span><select class="in" name="subject_id">${subs.map((s) => `<option value="${s.id}" ${s.id === e.subject_id ? "selected" : ""}>${esc(s.short)}</option>`).join("")}</select></label>
    <label class="f"><span>Name</span><input class="in" name="name" value="${esc(e.name)}" required></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f"><span>Date</span><input class="in" type="date" name="exam_date" value="${dOnly(e.exam_date)}"></label>
    <label class="f"><span>Shift / time</span><input class="in" name="slot" value="${esc(e.slot || "")}"></label></div>
    <label class="f"><span>Note</span><input class="in" name="note" value="${esc(e.note || "")}"></label>
    <label class="tcheck" style="padding:4px 0"><input type="checkbox" name="notify"><span>Notify everyone about this change</span></label>
    <div class="row" style="margin-top:6px"><button class="btn primary">Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = (ev) => { if (ev.target === bg) close(); };
  bg.querySelector("[data-close]").onclick = close;
  bg.querySelector("form").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target));
    try { const r = await api("PUT", `exam/${e.id}`, { ...fd, notify: !!fd.notify }); S.exams = S.exams.map((x) => (x.id === e.id ? r.exam : x)); close(); render(); toast("Saved"); }
    catch (err) { toast(err.message, true); }
  };
}

// generic edit modal: fields = [{name,label,value,type,options,rows}]
function formModal(title, fields, onSave, extra = "") {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<form class="modal"><h3>${esc(title)}</h3>${fields.map((f) => `<label class="${f.type === "checkbox" ? "tcheck" : "f"}" ${f.type === "checkbox" ? 'style="padding:4px 0"' : ""}>
    ${f.type === "checkbox" ? `<input type="checkbox" name="${f.name}" ${f.value ? "checked" : ""}><span>${esc(f.label)}</span>`
      : `<span>${esc(f.label)}</span>${f.type === "select" ? `<select class="in" name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`
      : f.type === "textarea" ? `<textarea class="in" name="${f.name}" rows="${f.rows || 4}">${esc(f.value ?? "")}</textarea>`
      : `<input class="in" name="${f.name}" type="${f.type || "text"}" value="${esc(f.value ?? "")}" ${f.required ? "required" : ""}>`}`}</label>`).join("")}
    ${extra}<div class="row wrap" style="margin-top:6px"><button class="btn primary">Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = (e) => { if (e.target === bg) close(); };
  bg.querySelector("[data-close]").onclick = close;
  bg.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    fields.filter((f) => f.type === "checkbox").forEach((f) => (fd[f.name] = !!fd[f.name]));
    const btn = e.target.querySelector("button.primary"); btn.disabled = true;
    try { await onSave(fd); close(); } catch (err) { btn.disabled = false; toast(err.message, true); }
  };
}
function wireUsers() {
  document.querySelectorAll("[data-edit-user]").forEach((b) => (b.onclick = () => {
    const u = window._users.find((x) => x.roll_no === b.dataset.editUser);
    formModal(`Edit account · ${u.roll_no}`, [{ name: "name", label: "Name", value: u.name, required: true }, { name: "section", label: "Section", value: u.section || "" },
      { name: "nick", label: "Leaderboard nickname (empty = remove)", value: u.nick || "" }, { name: "title", label: "Leaderboard title (empty = remove)", value: u.title || "" }], async (fd) => {
      await api("PUT", "admin/user", { roll_no: u.roll_no, ...fd }); toast("Account updated"); document.getElementById("loadUsers")?.click();
    });
  }));
  document.querySelectorAll("[data-del-user]").forEach((b) => (b.onclick = async () => {
    const roll = b.dataset.delUser, u = window._users.find((x) => x.roll_no === roll);
    if (!confirm(`Delete the account ${roll} (${u?.name})? All their tracker data and files will be removed. This can't be undone.`)) return;
    try { await api("POST", "admin/delete-user", { roll_no: roll }); toast("Account deleted"); window._users = window._users.filter((x) => x.roll_no !== roll); S.batchSize--; document.getElementById("loadUsers")?.click(); } catch (e) { toast(e.message, true); }
  }));
}

// ------------------------------------------------------------ render & events
const saveChains = {};
function queueSave(sid, kind) {
  const key = sid + ":" + kind;
  const tagFor = () => document.querySelector(`.as[data-sid="${sid}"][data-kind="${kind}"] [data-saving]`);
  const t0 = tagFor(); if (t0) t0.textContent = "saving…";
  saveChains[key] = (saveChains[key] || Promise.resolve()).then(async () => {
    const a = S.assessments.find((x) => x.subject_id === sid && x.kind === kind);
    if (!a) return;
    try {
      const r = await api("PUT", "assessment", { ...a, due_date: dOnly(a.due_date) });
      a.id = r.assessment.id;
      const t = tagFor(); if (t) { t.textContent = "saved ✓"; setTimeout(() => { if (t.textContent === "saved ✓") t.textContent = ""; }, 1200); }
    } catch (e) { const t = tagFor(); if (t) t.textContent = "not saved!"; toast(e.message, true); }
  });
}

function render() {
  if (!S) return renderAuth();
  const pages = { home: pageHome, subjects: pageSubjects, subject: pageSubject, checklist: pageChecklist, files: pageFiles, assignments: pageAssignments,
    exams: pageExams, settings: pageSettings, admin: pageAdmin, calendar: pageCalendar, notifications: pageNotifications, updates: pageUpdates, notes: pageNotes, leaderboard: pageLeaderboard };
  const y = window.scrollY;
  $app.innerHTML = shell((pages[route] || pageHome)());
  wireShell();
  wirePage();
  if (route === "leaderboard") lbEffects();
  window.scrollTo(0, y);
}

function wirePage() {
  const main = document.getElementById("main");
  const on = (sel, fn) => main.querySelectorAll(sel).forEach(fn);

  on("[data-st]", (b) => (b.onclick = () => { subTab = b.dataset.st; render(); }));

  // assessment cards — local state first, saves run one at a time per card
  on(".as", (card) => {
    const sid = Number(card.dataset.sid), kind = card.dataset.kind;
    const local = () => {
      let a = S.assessments.find((x) => x.subject_id === sid && x.kind === kind);
      if (!a) { a = { ...getA(sid, kind) }; S.assessments.push(a); }
      return a;
    };
    const soft = debounce(() => queueSave(sid, kind), 600);
    card.querySelectorAll("[data-f]").forEach((el) => {
      const f = el.dataset.f;
      if (el.type === "checkbox") el.onchange = () => { local()[f] = el.checked; queueSave(sid, kind); render(); };
      else if (el.type === "date") el.onchange = () => { local()[f] = el.value || null; queueSave(sid, kind); render(); };
      else el.oninput = () => { local()[f] = el.value; soft(); };
    });
  });

  on("[data-topic]", (el) => (el.onchange = async () => {
    const sid = Number(el.dataset.sid), key = el.dataset.topic;
    S.topics = S.topics.filter((t) => !(t.subject_id === sid && t.topic_key === key));
    if (el.checked) S.topics.push({ subject_id: sid, topic_key: key });
    render();
    try { await api("PUT", "topic", { subject_id: sid, topic_key: key, done: el.checked }); } catch (e) { toast(e.message, true); }
  }));

  const kf = document.getElementById("kindsF");
  if (kf) kf.onchange = () => {
    const ks = [...kf.querySelectorAll("input:checked")].map((i) => i.value);
    if (!ks.length) return toast("Keep at least one", true);
    savePrefs({ kinds: { ...(prefs().kinds || {}), [routeArg]: ks } });
  };

  // notes
  on("[data-toc]", (a) => (a.onclick = (e) => { e.preventDefault(); main.querySelectorAll(".md h3")[Number(a.dataset.toc)]?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  const ne = document.getElementById("notesEdit");
  if (ne) ne.onclick = () => { notesCache._edit = Number(routeArg); render(); };
  const nc = document.getElementById("notesCancel");
  if (nc) nc.onclick = () => { notesCache._edit = null; render(); };
  const ns = document.getElementById("notesSave");
  if (ns) ns.onclick = async () => {
    const id = notesCache._edit, v = document.getElementById("notesEd").value;
    try { await api("PUT", `notes/${id}`, { notes_md: v }); notesCache[id] = { notes_md: v, custom: true }; notesCache._edit = null; const s = subjById(id); if (s) s.has_notes = !!v.trim(); render(); toast("Notes saved"); } catch (e) { toast(e.message, true); }
  };
  const nr = document.getElementById("notesReset");
  if (nr) nr.onclick = async () => {
    if (!confirm("Reset these notes to the default version?")) return;
    const id = notesCache._edit;
    try { await api("PUT", `notes/${id}`, { reset: true }); delete notesCache[id]; notesCache._edit = null; render(); } catch (e) { toast(e.message, true); }
  };

  // todos
  const qt = document.getElementById("qtodo");
  if (qt) qt.onsubmit = async (e) => {
    e.preventDefault(); const text = qt.text.value.trim(); if (!text) return;
    try { const r = await api("POST", "todo", { text }); S.todos.unshift(r.todo); render(); } catch (err) { toast(err.message, true); }
  };
  on("[data-todo]", (el) => (el.onchange = async () => {
    const t = S.todos.find((x) => x.id === Number(el.dataset.todo)); t.done = el.checked; render();
    try { await api("PUT", `todo/${t.id}`, { done: t.done }); } catch (e) { toast(e.message, true); }
  }));
  on("[data-deltodo]", (el) => (el.onclick = async () => {
    const id = Number(el.dataset.deltodo); S.todos = S.todos.filter((t) => t.id !== id); render();
    try { await api("DELETE", `todo/${id}`); } catch (e) { toast(e.message, true); }
  }));

  // assignments
  const af = document.getElementById("asgF");
  if (af) af.onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(af));
    try { const r = await api("POST", "assignment", { ...fd, subject_id: fd.subject_id ? Number(fd.subject_id) : null }); S.assignments.push(r.assignment); render(); toast("Added"); } catch (err) { toast(err.message, true); }
  };
  on("[data-asg]", (el) => (el.onchange = async () => {
    const a = S.assignments.find((x) => x.id === Number(el.dataset.asg)); a.done = el.checked; render();
    try { await api("PUT", `assignment/${a.id}`, { ...a, due_date: dOnly(a.due_date) }); } catch (e) { toast(e.message, true); }
  }));
  on("[data-delasg]", (el) => (el.onclick = async () => {
    const id = Number(el.dataset.delasg), a = S.assignments.find((x) => x.id === id);
    if (!confirm(`Delete "${a?.title}"?`)) return;
    S.assignments = S.assignments.filter((x) => x.id !== id); render();
    try { await api("DELETE", `assignment/${id}`); toast("Deleted"); } catch (e) { toast(e.message, true); }
  }));
  const cd = document.getElementById("clearDone");
  if (cd) cd.onclick = async () => {
    const done = S.assignments.filter((a) => a.done);
    if (!confirm(`Delete ${done.length} completed assignment${done.length > 1 ? "s" : ""}?`)) return;
    S.assignments = S.assignments.filter((a) => !a.done); render();
    for (const a of done) { try { await api("DELETE", `assignment/${a.id}`); } catch {} }
    toast("Cleared");
  };
  on("#pinAsg", (pin) => (pin.onchange = async () => { await savePrefs({ showAssignments: pin.checked }); render(); }));

  // calendar
  on("[data-cal]", (b) => (b.onclick = () => {
    const d = Number(b.dataset.cal);
    if (!d) { calMonth = todayISO().slice(0, 7); calSel = todayISO(); }
    else { const [y, m] = calMonth.split("-").map(Number); const n = new Date(y, m - 1 + d, 1); calMonth = isoOf(n).slice(0, 7); }
    render();
  }));
  on("[data-day]", (b) => (b.onclick = () => { calSel = b.dataset.day; render(); if (innerWidth < 1000) document.querySelector(".cal-side")?.scrollIntoView({ behavior: "smooth" }); }));
  on("[data-edit-ev]", (b) => (b.onclick = () => { const ev = S.events.find((x) => x.id === Number(b.dataset.editEv)); if (ev) eventModal(ev); }));
  const evF = document.getElementById("evF");
  if (evF) evF.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(evF));
    try {
      const r = await api("POST", "event", { ...fd, subject_id: fd.subject_id ? Number(fd.subject_id) : null, batch: !!fd.batch });
      S.events.push(r.event); calSel = dOnly(r.event.event_date); calMonth = calSel.slice(0, 7);
      if (fd.batch) { try { S.updates = (await api("GET", "bootstrap")).updates; } catch {} }
      render(); toast("Event added");
    } catch (err) { toast(err.message, true); }
  };

  // leaderboard card
  const lbE = document.getElementById("lbEdit");
  if (lbE) lbE.onclick = lbCardModal;

  // notifications
  const pOn = document.getElementById("pushOn");
  if (pOn) pOn.onclick = enablePush;
  const pOff = document.getElementById("pushOff");
  if (pOff) pOff.onclick = disablePush;
  const pT = document.getElementById("pushTest");
  if (pT) pT.onclick = async () => { try { const r = await api("POST", "push/test"); toast(r.sent ? "Test sent — check your notifications" : "Couldn't reach this device; try turning notifications off and on", !r.sent); } catch (e) { toast(e.message, true); } };

  // files
  on("[data-upload]", (el) => (el.onchange = () => uploadFiles([...el.files], Number(el.dataset.sid), el.dataset.kind, el.closest(".as")?.querySelector("[data-saving]"))));
  const drop = document.getElementById("drop"), dropIn = document.getElementById("dropIn");
  if (drop) {
    const go = (files) => uploadFiles(files, Number(document.getElementById("upSid").value) || null, document.getElementById("upKind").value || null, document.getElementById("upProg"));
    drop.onclick = () => dropIn.click();
    dropIn.onchange = () => go([...dropIn.files]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); go([...e.dataTransfer.files]); };
  }
  on("[data-delfile]", (el) => (el.onclick = async () => {
    if (!confirm("Delete this file permanently?")) return;
    const id = Number(el.dataset.delfile);
    try { await api("DELETE", `file/${id}`); S.files = S.files.filter((f) => f.id !== id); render(); toast("Deleted"); } catch (e) { toast(e.message, true); }
  }));

  // settings
  on("[data-hide]", (el) => (el.onchange = () => {
    const h = new Set(prefs().hidden || []); const id = Number(el.dataset.hide);
    el.checked ? h.delete(id) : h.add(id); savePrefs({ hidden: [...h] });
  }));
  on("[data-el]", (el) => (el.onchange = () => {
    const s = new Set(prefs().electives || []); const id = Number(el.dataset.el);
    el.checked ? s.add(id) : s.delete(id); savePrefs({ electives: [...s] });
  }));
  const sf = document.getElementById("subF");
  if (sf) sf.onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api("POST", "subject", Object.fromEntries(new FormData(sf))); S.subjects.push(r.subject); render(); toast("Subject added"); } catch (err) { toast(err.message, true); }
  };
  on("[data-delsub]", (el) => (el.onclick = async () => {
    if (!confirm("Delete this subject and everything tracked under it?")) return;
    const id = Number(el.dataset.delsub);
    try { await api("DELETE", `subject/${id}`); S.subjects = S.subjects.filter((s) => s.id !== id); S.assessments = S.assessments.filter((a) => a.subject_id !== id); render(); } catch (e) { toast(e.message, true); }
  }));
  const pf = document.getElementById("profF");
  if (pf) pf.onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(pf));
    try { await api("POST", "profile", fd); Object.assign(S.user, fd); render(); toast("Saved"); } catch (err) { toast(err.message, true); }
  };
  const pw = document.getElementById("pwF");
  if (pw) pw.onsubmit = async (e) => {
    e.preventDefault();
    try { await api("POST", "auth/password", Object.fromEntries(new FormData(pw))); pw.reset(); toast("Password updated"); } catch (err) { toast(err.message, true); }
  };
  const ej = document.getElementById("expJson2"), ec = document.getElementById("expCsv2");
  if (ej) ej.onclick = exportJson; if (ec) ec.onclick = exportCsv;

  // admin
  const refreshUpdates = async () => { try { S.updates = (await api("GET", "bootstrap")).updates; } catch {} };
  const dl = document.getElementById("dlF");
  if (dl) dl.onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(dl)); fd.subject_id = Number(fd.subject_id); fd.notify = !!fd.notify;
    try {
      const r = await api("PUT", "deadline", fd);
      S.deadlines = S.deadlines.filter((d) => !(d.subject_id === fd.subject_id && d.kind === fd.kind));
      if (r.deadline) S.deadlines.push(r.deadline);
      await refreshUpdates(); render(); toast("Batch deadline saved");
    } catch (err) { toast(err.message, true); }
  };
  on("[data-deldl]", (el) => (el.onclick = async () => {
    const [sid, kind] = el.dataset.deldl.split("|");
    try { await api("PUT", "deadline", { subject_id: Number(sid), kind }); S.deadlines = S.deadlines.filter((d) => !(d.subject_id === Number(sid) && d.kind === kind)); render(); } catch (e) { toast(e.message, true); }
  }));
  on("[data-edit-dl]", (b) => (b.onclick = () => {
    const [sid, kind] = b.dataset.editDl.split("|"), d = batchDL(Number(sid), kind);
    formModal(`Edit batch deadline · ${subjById(sid)?.short} ${KIND_LABEL[kind]}`, [
      { name: "due_date", label: "Due date", type: "date", value: dOnly(d?.due_date) },
      { name: "note", label: "Note", value: d?.note || "" },
      { name: "notify", label: "Ping everyone's devices about this change", type: "checkbox", value: false },
    ], async (fd) => {
      const r = await api("PUT", "deadline", { subject_id: Number(sid), kind, ...fd });
      S.deadlines = S.deadlines.filter((x) => !(x.subject_id === Number(sid) && x.kind === kind));
      if (r.deadline) S.deadlines.push(r.deadline);
      await refreshUpdates(); render(); toast("Deadline updated");
    });
  }));
  on("[data-edit-upd]", (b) => (b.onclick = () => {
    const u = S.updates.find((x) => x.id === Number(b.dataset.editUpd));
    formModal("Edit announcement / update", [
      { name: "title", label: "Title", value: u.title, required: true },
      { name: "kind", label: "Type", type: "select", value: u.kind, options: [["notice", "Notice"], ["release", "App update"], ["alert", "Alert"]] },
      { name: "version", label: "Version", value: u.version || "" },
      { name: "body", label: "Details", type: "textarea", value: u.body || "", rows: 5 },
      { name: "notify", label: "Ping everyone's devices about this change", type: "checkbox", value: false },
    ], async (fd) => {
      const r = await api("PUT", `update/${u.id}`, fd);
      S.updates = S.updates.map((x) => (x.id === u.id ? r.update : x)); render(); toast("Updated");
    });
  }));
  on("[data-edit-sub]", (b) => (b.onclick = () => {
    const s = subjById(b.dataset.editSub);
    formModal(`Edit subject · ${s.short}`, [
      { name: "name", label: "Full name", value: s.name, required: true },
      { name: "short", label: "Short name", value: s.short },
      { name: "code", label: "Course code", value: s.code || "" },
      { name: "credits", label: "Credits", value: s.credits ?? "" },
      { name: "color", label: "Colour", type: "color", value: s.color || "#6366f1" },
    ], async (fd) => {
      const r = await api("PUT", `subject/${s.id}`, fd);
      S.subjects = S.subjects.map((x) => (x.id === s.id ? { ...x, ...r.subject } : x)); render(); toast("Subject updated");
    });
  }));
  const exF = document.getElementById("exF");
  if (exF) exF.onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api("POST", "exam", Object.fromEntries(new FormData(exF))); S.exams.push(r.exam); await refreshUpdates(); render(); toast("Unit assessment added"); } catch (err) { toast(err.message, true); }
  };
  on("[data-edit-ex]", (b) => (b.onclick = () => examModal(S.exams.find((x) => x.id === Number(b.dataset.editEx)))));
  on("[data-del-ex]", (b) => (b.onclick = async () => {
    if (!confirm("Delete this unit assessment entry?")) return;
    const id = Number(b.dataset.delEx);
    try { await api("DELETE", `exam/${id}`); S.exams = S.exams.filter((x) => x.id !== id); render(); } catch (e) { toast(e.message, true); }
  }));
  const updF = document.getElementById("updF");
  if (updF) updF.onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(updF));
    try { const r = await api("POST", "update", { ...fd, notify: !!fd.notify }); S.updates.unshift(r.update); updF.reset(); render(); toast("Posted"); } catch (err) { toast(err.message, true); }
  };
  on("[data-del-upd]", (b) => (b.onclick = async () => {
    if (!confirm("Delete this update/announcement?")) return;
    const id = Number(b.dataset.delUpd);
    try { await api("DELETE", `update/${id}`); S.updates = S.updates.filter((x) => x.id !== id); render(); } catch (e) { toast(e.message, true); }
  }));
  const rf = document.getElementById("rstF");
  if (rf) rf.onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api("POST", "admin/reset", Object.fromEntries(new FormData(rf))); rf.reset(); toast(`Password reset for ${r.user.name}`); } catch (err) { toast(err.message, true); }
  };
  const lu = document.getElementById("loadUsers");
  if (lu) lu.onclick = async () => {
    try {
      const r = await api("GET", "admin/users");
      window._users = r.users;
      document.getElementById("usersBox").innerHTML = `<button class="btn sm ghost" id="loadUsers" style="margin-bottom:8px">↻ Refresh</button><div class="scroll"><table class="t"><thead><tr><th>Roll</th><th>Name</th><th>Sec</th><th>Done</th><th>Files</th><th>Joined</th><th></th></tr></thead><tbody>${r.users.map((u) => `<tr><td>${esc(u.roll_no)}</td><td>${esc(u.name)}${u.nick || u.title ? `<div class="muted small">${u.nick ? "“" + esc(u.nick) + "” " : ""}${u.title ? "· " + esc(u.title) : ""}</div>` : ""}</td><td>${esc(u.section || "")}</td><td>${u.submitted}</td><td>${u.files}</td><td class="muted small">${fmtDate(u.created_at, false)}</td>
        <td style="white-space:nowrap"><button class="btn sm ghost" data-edit-user="${esc(u.roll_no)}">Edit</button>${u.roll_no === S.user.roll_no ? "" : ` <button class="btn sm danger" data-del-user="${esc(u.roll_no)}">✕</button>`}</td></tr>`).join("")}</tbody></table></div>`;
      wireUsers();
      document.getElementById("loadUsers").onclick = lu.onclick;
    } catch (e) { toast(e.message, true); }
  };
}

// ------------------------------------------------------------ push notifications
function urlB64ToUint8(b64) { const p = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); }
async function swReg() { return navigator.serviceWorker.register("/sw.js"); }
async function enablePush() {
  try {
    if (!S.pushKey) return toast("Notifications aren't set up on the server yet", true);
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { render(); return toast("Notifications weren't allowed", true); }
    const reg = await swReg(); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(S.pushKey) });
    await api("POST", "push/subscribe", sub.toJSON());
    S.pushOn = true; render();
    try { await api("POST", "push/test"); } catch {}
    toast("Notifications on 🔔");
  } catch (e) { toast("Couldn't turn on notifications: " + e.message, true); }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api("POST", "push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    S.pushOn = false; render(); toast("Notifications off on this device");
  } catch (e) { toast(e.message, true); }
}
async function syncPush() {   // keep server subscription fresh for devices already allowed
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await swReg();
    if (Notification.permission !== "granted" || !S.pushKey) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api("POST", "push/subscribe", sub.toJSON()); if (!S.pushOn) { S.pushOn = true; if (route === "notifications") render(); } }
  } catch {}
}

// ------------------------------------------------------------ uploads
function xhrPut(url, file, type, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("Content-Type", type);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error(`Storage refused the upload (${x.status})`)));
    x.onerror = () => reject(new Error("network"));
    x.send(file);
  });
}
function putFile(file, sid, kind, onProgress) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ name: file.name });
    if (sid) qs.set("subject_id", sid);
    if (kind) qs.set("kind", kind);
    const x = new XMLHttpRequest();
    x.open("POST", "/api/upload?" + qs);
    x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} x.status < 300 ? resolve(d) : reject(new Error(d.error || `Upload failed (${x.status})`)); };
    x.onerror = () => reject(new Error("Network error"));
    x.send(file);
  });
}
async function sendFile(file, sid, kind, onProgress) {
  const type = file.type || "application/octet-stream";
  const t = await api("POST", "upload-url", { name: file.name, size: file.size, type, subject_id: sid, kind });
  try { await xhrPut(t.url, file, t.type, onProgress); }
  catch (e) {
    if (e.message === "network" && file.size < 9 * 1024 * 1024) return putFile(file, sid, kind, onProgress);
    throw new Error(e.message === "network" ? "Network error" : e.message);
  }
  return api("POST", "upload-done", { key: t.key, type: t.type, subject_id: sid, kind });
}
async function uploadFiles(files, sid, kind, statusEl) {
  if (!files.length) return;
  for (const file of files) {
    if (file.size > 100 * 1024 * 1024) { toast(`${file.name} is over 100 MB`, true); continue; }
    const say = (t) => { if (statusEl) statusEl.textContent = t; };
    try {
      say(`Uploading ${file.name}… 0%`);
      const r = await sendFile(file, sid, kind, (p) => say(`Uploading ${file.name}… ${p}%`));
      S.files.unshift(r.file);
      say(""); toast(`Saved ${file.name}`);
    } catch (e) { say(""); toast(`Upload failed: ${e.message}`, true); }
  }
  render();
}

// ------------------------------------------------------------ export
function exportJson() {
  const out = { exported_at: new Date().toISOString(), user: { name: S.user.name, roll_no: S.user.roll_no, section: S.user.section },
    subjects: visibleSubjects().map((s) => ({ name: s.name, code: s.code, unit_assessments: examsFor(s.id).map((e) => ({ name: e.name, date: dOnly(e.exam_date), slot: e.slot })),
      assessments: kindsFor(s.id).map((k) => { const a = getA(s.id, k); return { kind: k, topic: a.topic, due_date: effDue(a), report: a.report, ppt: a.ppt, viva: a.viva, submitted: a.submitted, marks: a.marks, max_marks: a.max_marks, notes: a.notes }; }),
      syllabus_done: (s.units || []).flatMap((u, i) => u.topics.filter((_, j) => topicDone(s.id, `${i}.${j}`))),
    })),
    todos: S.todos.map((t) => ({ text: t.text, done: t.done })),
    assignments: S.assignments.map((a) => ({ title: a.title, subject: subjById(a.subject_id)?.short || null, due_date: dOnly(a.due_date), done: a.done, notes: a.notes })),
    my_events: S.events.filter((e) => e.user_id).map((e) => ({ title: e.title, date: dOnly(e.event_date), time: e.event_time, note: e.note })),
    files: S.files.map((f) => ({ name: f.name, subject: subjById(f.subject_id)?.short || null, for: f.kind, size: f.size, download: location.origin + "/api/file/" + f.id + "?download=1" })) };
  download(`sem7-tracker-${S.user.roll_no}.json`, JSON.stringify(out, null, 2));
}
function exportCsv() {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Subject", "Code", "Assessment", "Topic", "Due", "Report", "PPT", "Viva", "Submitted", "Marks", "Max", "Notes"]];
  for (const s of visibleSubjects()) for (const k of kindsFor(s.id)) {
    const a = getA(s.id, k);
    rows.push([s.name, s.code, KIND_LABEL[k], a.topic, effDue(a), a.report ? "Yes" : "", a.ppt ? "Yes" : "", a.viva ? "Yes" : "", a.submitted ? "Yes" : "", a.marks, a.max_marks, a.notes]);
  }
  download(`sem7-tracker-${S.user.roll_no}.csv`, "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n"), "text/csv");
}

// ------------------------------------------------------------ routing & boot
function parseRoute() {
  const parts = (location.hash.replace(/^#\/?/, "") || "home").split("/");
  const prev = route + routeArg;
  route = parts[0] || "home"; routeArg = parts[1] || null;
  if (prev !== route + routeArg && route === "subject") { subTab = nextSubTab || "assess"; nextSubTab = null; }
  if (prev !== route + routeArg) notesCache._edit = null;
}
window.addEventListener("hashchange", () => { parseRoute(); if (S) { render(); window.scrollTo(0, 0); } });
document.addEventListener("click", (e) => { const a = e.target.closest("[data-goto-syl]"); if (a) nextSubTab = "syllabus"; const c = e.target.closest("[data-cal-date]"); if (c) { calSel = c.dataset.calDate; calMonth = calSel.slice(0, 7); } }, true);
document.addEventListener("visibilitychange", async () => {   // refresh when coming back to the tab
  if (document.visibilityState !== "visible" || !S || document.querySelector(".modal-bg") || document.activeElement?.matches("input,textarea")) return;
  if (Date.now() - (boot._at || 0) < 60000) return;
  try { const n = await api("GET", "bootstrap"); Object.assign(S, n); boot._at = Date.now(); render(); } catch {}
});

async function boot() {
  document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";
  parseRoute();
  try {
    const me = await api("GET", "me");
    if (!me.user) { S = null; return renderAuth(); }
    S = await api("GET", "bootstrap");
    boot._at = Date.now();
    render();
    syncPush();
  } catch (e) {
    $app.innerHTML = `<div class="boot"><div class="card" style="max-width:380px;text-align:center"><b>Couldn't load</b><p class="muted">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Retry</button></div></div>`;
  }
}
boot();
