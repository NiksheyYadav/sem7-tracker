// Sem 7 Tracker — vanilla JS SPA
const $app = document.getElementById("app");
const KIND_LABEL = { TA1: "TA 1", TA2: "TA 2", TA3: "TA 3", TA4: "TA 4", TA5: "TA 5", ERLA1: "ERLA 1", ERLA2: "ERLA 2", PA: "PA" };
const KIND_FULL = { TA: "Thematic Assessment", ERLA: "ERLA", PA: "PA" };
const EXAM_NAME = "Unit Assessment-2 (Dec 2026)";
const EXAM_VENUE = "Vikram Sarabhai (E-Block), SoET";

let S = null;          // bootstrap data
let route = "home";
let routeArg = null;
let subTab = "assess";
let nextSubTab = null;

// ------------------------------------------------------------ utils
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dOnly = (v) => (v ? String(v).slice(0, 10) : "");
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

// ------------------------------------------------------------ derived data
const prefs = () => S.user.prefs || {};
function visibleSubjects() {
  const p = prefs(), hidden = new Set(p.hidden || []), el = new Set(p.electives || []);
  return S.subjects.filter((s) => s.owner_id ? true : s.kind === "elective" ? el.has(s.id) : !hidden.has(s.id));
}
const subjById = (id) => S.subjects.find((s) => s.id === Number(id));
function kindsFor(sid) { const k = (prefs().kinds || {})[sid]; return Array.isArray(k) && k.length ? S.kinds.filter((x) => k.includes(x)) : S.kinds; }
function getA(sid, kind) {
  return S.assessments.find((a) => a.subject_id === sid && a.kind === kind) ||
    { subject_id: sid, kind, topic: "", due_date: null, report: false, ppt: false, viva: false, submitted: false, marks: null, max_marks: null, notes: "" };
}
const batchDL = (sid, kind) => S.deadlines.find((d) => d.subject_id === sid && d.kind === kind);
const effDue = (a) => dOnly(a.due_date) || dOnly(batchDL(a.subject_id, a.kind)?.due_date) || "";
function aScore(a) { return a.submitted ? 1 : ((a.report ? 1 : 0) + (a.ppt ? 1 : 0) + (a.viva ? 1 : 0)) / 4; }
function subjProgress(s) {
  const ks = kindsFor(s.id); if (!ks.length) return 0;
  return ks.reduce((t, k) => t + aScore(getA(s.id, k)), 0) / ks.length;
}
function topicKeys(s) { const out = []; (s.units || []).forEach((u, i) => u.topics.forEach((_, j) => out.push(`${i}.${j}`))); return out; }
const topicDone = (sid, key) => S.topics.some((t) => t.subject_id === sid && t.topic_key === key);
function syllabusProgress(s) { const ks = topicKeys(s); if (!ks.length) return null; return ks.filter((k) => topicDone(s.id, k)).length / ks.length; }
const pct = (x) => Math.round((x || 0) * 100);

function upcoming() {
  const items = [];
  for (const s of visibleSubjects()) {
    for (const k of kindsFor(s.id)) {
      const a = getA(s.id, k), due = effDue(a);
      if (due && !a.submitted && daysUntil(due) >= -14) items.push({ due, s, title: `${KIND_LABEL[k]}${a.topic ? " · " + a.topic : ""}`, href: `#/subject/${s.id}`, type: "as" });
    }
    if (s.exam_date && daysUntil(s.exam_date) >= 0) items.push({ due: dOnly(s.exam_date), s, title: `UA-2 exam · ${s.exam_slot || ""}`, href: "#/exams", type: "exam" });
  }
  if (prefs().showAssignments) for (const a of S.assignments) if (!a.done && a.due_date) items.push({ due: dOnly(a.due_date), s: subjById(a.subject_id), title: a.title, href: "#/assignments", type: "asg" });
  return items.sort((a, b) => a.due.localeCompare(b.due));
}

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
        <div class="chips"><span>TA 1–5</span><span>ERLA 1–2</span><span>PA</span><span>Report · PPT · Viva</span><span>Syllabus checklist</span><span>File locker</span><span>UA-2 countdown</span></div>
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
      <p class="muted small" style="margin-top:14px">${mode === "login" ? "Forgot your password? Ask the class admin to reset it." : "No email needed. Remember your password — the class admin can reset it if you forget."}</p>
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
const NAV = [
  ["home", "Home", "⌂"], ["subjects", "Subjects", "▦"], ["checklist", "Checklist", "☑"], ["files", "Files", "⇪"], ["exams", "Exams", "◷"],
];
function shell(content) {
  const p = prefs();
  const nav = NAV.slice();
  if (p.showAssignments) nav.splice(3, 0, ["assignments", "Assignments", "✎"]);
  const active = route === "subject" ? "subjects" : route;
  const initials = S.user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return `
  <header class="top"><div class="top-in">
    <a class="logo" href="#/home"><i>✓</i><span>Sem 7 Tracker</span></a>
    <nav class="nav">${nav.map(([r, l]) => `<a href="#/${r}" class="${active === r ? "on" : ""}">${l}</a>`).join("")}</nav>
    <div class="spacer"></div>
    <div class="menu" id="more">
      <button class="btn ghost sm" id="moreBtn" aria-haspopup="true">More ▾</button>
      <div class="menu-pop" role="menu">
        <a href="#/assignments">✎ Assignments${p.showAssignments ? "" : ' <span class="pill" style="margin-left:auto">optional</span>'}</a>
        <a href="#/exams">◷ UA-2 date sheet</a>
        <a href="#/settings">⚙ Subjects &amp; settings</a>
        <button id="expJson">⤓ Export my data (JSON)</button>
        <button id="expCsv">⤓ Export tracker (CSV)</button>
        ${S.user.is_admin ? `<hr><a href="#/admin">★ Admin: batch deadlines</a>` : ""}
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
  <nav class="bottom-nav">${nav.map(([r, l, ic]) => `<a href="#/${r}" class="${active === r ? "on" : ""}"><b>${ic}</b>${l}</a>`).join("")}</nav>`;
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
function pageHome() {
  const subs = visibleSubjects();
  const up = upcoming().filter((x) => daysUntil(x.due) >= -14).slice(0, 8);
  const exams = subs.filter((s) => s.exam_date && daysUntil(s.exam_date) >= 0).sort((a, b) => dOnly(a.exam_date).localeCompare(dOnly(b.exam_date)));
  const next = exams[0];
  let total = 0, sub = 0, comp = 0;
  for (const s of subs) for (const k of kindsFor(s.id)) { const a = getA(s.id, k); total++; if (a.submitted) sub++; comp += (a.report ? 1 : 0) + (a.ppt ? 1 : 0) + (a.viva ? 1 : 0); }
  const sylSubs = subs.filter((s) => syllabusProgress(s) !== null);
  const syl = sylSubs.length ? sylSubs.reduce((t, s) => t + syllabusProgress(s), 0) / sylSubs.length : 0;
  const openTodos = S.todos.filter((t) => !t.done);
  const first = S.user.name.split(" ")[0];
  return `
  <section class="hero">
    <h2>Hey ${esc(first)} 👋</h2>
    <p>${next ? `Next up: <b>${esc(next.name)}</b> on ${fmtDate(next.exam_date)} (${esc(next.exam_slot || "")}).` : "No upcoming exams on the date sheet."}</p>
    <div class="count">
      ${next ? `<div><b>${daysUntil(next.exam_date)}</b><span>days to UA-2</span></div>` : ""}
      <div><b>${sub}/${total}</b><span>assessments submitted</span></div>
      <div><b>${pct(syl)}%</b><span>syllabus covered</span></div>
    </div>
  </section>
  <div class="grid g2">
    <div class="card"><h3>⏰ Coming up</h3>
      ${up.length ? `<div class="list">${up.map((x) => `<a class="li" href="${x.href}" style="text-decoration:none;color:inherit">
          <span class="dot" style="--c:${x.s?.color || "#64748b"}"></span>
          <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(x.s?.short || "General")} — ${esc(x.title)}</div><div class="muted small">${fmtDate(x.due)}</div></div>
          ${x.type === "exam" ? '<span class="pill brand">exam</span>' : ""}${dueLabel(x.due)}</a>`).join("")}</div>`
        : `<div class="empty">Nothing dated yet. Add due dates inside a subject's TA / ERLA / PA cards.</div>`}
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
  const pips = kindsFor(s.id).map((k) => { const a = getA(s.id, k), sc = aScore(a); return `<i class="${sc >= 1 ? "full" : sc > 0 ? "half" : ""}" title="${KIND_LABEL[k]}"></i>`; }).join("");
  return `<a class="card subj" href="#/subject/${s.id}" style="--c:${s.color || "#6366f1"}">
    <div class="row between"><span class="tag">${esc(s.short)}</span>${s.exam_date ? `<span class="small muted">UA-2 ${fmtDate(s.exam_date, false)}</span>` : ""}</div>
    <h4>${esc(s.name)}</h4>
    <div class="meta">${s.code ? esc(s.code) : ""}${s.credits ? ` · ${s.credits} credits` : ""}${s.kind === "elective" ? " · elective" : ""}${s.owner_id ? " · custom" : ""}</div>
    <div class="row between small"><b>Assessments ${pct(p)}%</b>${syl !== null ? `<span class="muted">Syllabus ${pct(syl)}%</span>` : ""}</div>
    <div class="pips">${pips}</div>
  </a>`;
}

function pageSubjects() {
  const subs = visibleSubjects();
  return `<h1 class="page">Subjects</h1><p class="sub">B.Tech CSE (Data Science) · Semester VII. Tap a subject to track TA, ERLA, PA, files and syllabus.</p>
  <div class="grid g3">${subs.map(subjCard).join("")}</div>
  <div class="card" style="margin-top:16px"><div class="row between wrap"><div><b>Missing a subject or elective?</b><div class="muted small">Turn on your elective, hide ones you don't take, or add your own.</div></div><a class="btn ghost" href="#/settings">Manage subjects</a></div></div>`;
}

function pageSubject() {
  const s = subjById(routeArg);
  if (!s) return `<div class="empty">Subject not found. <a href="#/subjects">Back</a></div>`;
  const syl = syllabusProgress(s);
  const files = S.files.filter((f) => f.subject_id === s.id);
  const tabs = [["assess", "TA · ERLA · PA"], ["syllabus", `Syllabus${syl !== null ? ` ${pct(syl)}%` : ""}`], ["files", `Files (${files.length})`], ["cols", "Customise"]];
  let body = "";
  if (subTab === "assess") body = `<div class="as-grid">${kindsFor(s.id).map((k) => asCard(s, k)).join("")}</div>`;
  else if (subTab === "syllabus") body = syllabusView(s);
  else if (subTab === "files") body = filesView(files, s.id);
  else body = `<div class="card"><h3>Which assessments apply to ${esc(s.short)}?</h3>
      <p class="muted small" style="margin-top:-6px">Untick ones your faculty isn't taking (e.g. IT2 may have no TA 5). Only affects your view.</p>
      <form id="kindsF" class="kchips">${S.kinds.map((k) => `<label><input type="checkbox" name="k" value="${k}" ${kindsFor(s.id).includes(k) ? "checked" : ""}> ${KIND_LABEL[k]}</label>`).join("")}</form></div>`;
  return `
  <div class="sd-head" style="--c:${s.color || "#6366f1"}">
    <a class="back" href="#/subjects">← All subjects</a>
    <h1>${esc(s.name)}</h1>
    <div class="row wrap">${s.code ? `<span>${esc(s.code)}</span>` : ""}${s.credits ? `<span>${s.credits} credits</span>` : ""}${s.exam_date ? `<span>UA-2: ${fmtDate(s.exam_date)} · ${esc(s.exam_slot || "")}</span>` : ""}<span>Assessments ${pct(subjProgress(s))}%</span></div>
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
  if (!s.units?.length) return `<div class="card empty">No syllabus units for this subject. Use the Checklist tab for your own to-dos.</div>`;
  return `<div class="grid g2">${s.units.map((u, i) => {
    const keys = u.topics.map((_, j) => `${i}.${j}`), done = keys.filter((k) => topicDone(s.id, k)).length;
    return `<div class="card unit"><h4>${esc(u.title)} <span class="pill ${done === keys.length ? "green" : ""}">${done}/${keys.length}</span></h4>
      <div class="bar" style="margin-bottom:8px"><i style="width:${(done / keys.length) * 100}%"></i></div>
      ${u.topics.map((t, j) => { const on = topicDone(s.id, `${i}.${j}`); return `<label class="tcheck ${on ? "on" : ""}"><input type="checkbox" data-topic="${i}.${j}" data-sid="${s.id}" ${on ? "checked" : ""}><span>${esc(t)}</span></label>`; }).join("")}
    </div>`;
  }).join("")}</div>`;
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
  <div class="card">${files.length ? `<div class="scroll"><table class="t"><thead><tr><th>File</th>${sid ? "" : "<th>Subject</th>"}<th>For</th><th>Size</th><th>Added</th><th></th></tr></thead><tbody>
    ${files.map((f) => { const s = subjById(f.subject_id); return `<tr>
      <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="/api/file/${f.id}" target="_blank" rel="noopener" style="font-weight:700;text-decoration:none;color:inherit">📎 ${esc(f.name)}</a></td>
      ${sid ? "" : `<td>${s ? `<span class="row" style="gap:6px"><span class="dot" style="--c:${s.color}"></span>${esc(s.short)}</span>` : '<span class="muted">General</span>'}</td>`}
      <td>${f.kind ? `<span class="pill">${KIND_LABEL[f.kind] || esc(f.kind)}</span>` : ""}</td>
      <td class="muted">${fmtSize(f.size)}</td><td class="muted">${fmtDate(f.created_at, false)}</td>
      <td style="white-space:nowrap"><a class="btn sm ghost" href="/api/file/${f.id}?download=1">⤓ Download</a> <button class="btn sm danger" data-delfile="${f.id}">✕</button></td></tr>`; }).join("")}
    </tbody></table></div>` : `<div class="empty">No files yet. Everything you upload here is saved to your account, so you can download it from any device.</div>`}</div>`;
}

function pageFiles() {
  const total = S.files.reduce((t, f) => t + Number(f.size || 0), 0);
  return `<h1 class="page">My files</h1><p class="sub">${S.files.length} file${S.files.length === 1 ? "" : "s"} · ${fmtSize(total) || "0 B"} stored. Upload your reports and PPTs so your work is never lost.</p>${filesView(S.files)}`;
}

function todoRow(t) {
  return `<div class="li"><label class="tcheck ${t.done ? "on" : ""}" style="flex:1;padding:2px"><input type="checkbox" data-todo="${t.id}" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span></label><button class="btn sm ghost" data-deltodo="${t.id}" title="Delete">✕</button></div>`;
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
        <span class="dot" style="--c:${s.color}"></span><div style="flex:1"><b>${esc(s.short)} · ${KIND_LABEL[k]}</b><div class="muted small">${miss.length ? "Still to do: " + miss.map((m) => m === "ppt" ? "PPT" : m[0].toUpperCase() + m.slice(1)).join(", ") : "Mark as done once submitted"}</div></div>${dueLabel(effDue(a))}</a>`).join("")}</div>`
        : `<div class="empty">Started assessments with something left will show here.</div>`}
    </div>
  </div>
  <div class="card" style="margin-top:14px"><h3>📚 Exam prep — syllabus coverage</h3>
    ${subs.filter((s) => syllabusProgress(s) !== null).map((s) => `<a href="#/subject/${s.id}" data-goto-syl style="display:block;text-decoration:none;color:inherit;margin-bottom:12px">
      <div class="row between small"><b>${esc(s.name)}</b><span class="muted">${pct(syllabusProgress(s))}% · UA-2 ${fmtDate(s.exam_date, false)}</span></div>
      <div class="bar" style="--c:${s.color};margin-top:5px"><i style="width:${pct(syllabusProgress(s))}%"></i></div></a>`).join("")}
  </div>`;
}

function pageAssignments() {
  const p = prefs(), subs = visibleSubjects();
  const open = S.assignments.filter((a) => !a.done), done = S.assignments.filter((a) => a.done);
  const row = (a) => { const s = subjById(a.subject_id); return `<div class="li">
    <input type="checkbox" data-asg="${a.id}" ${a.done ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--brand)">
    <span class="dot" style="--c:${s?.color || "#64748b"}"></span>
    <div style="flex:1;min-width:0"><b style="${a.done ? "text-decoration:line-through;color:var(--muted)" : ""}">${esc(a.title)}</b><div class="muted small">${s ? esc(s.short) : "General"}${a.notes ? " · " + esc(a.notes) : ""}</div></div>
    ${a.done ? "" : dueLabel(a.due_date)}<button class="btn sm ghost" data-delasg="${a.id}">✕</button></div>`; };
  return `<div class="row between wrap"><div><h1 class="page">Assignments</h1><p class="sub">Optional tracker for regular class assignments.</p></div>
    <label class="row small" style="font-weight:700;cursor:pointer"><input type="checkbox" id="pinAsg" ${p.showAssignments ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--brand)"> Show as a tab</label></div>
  <div class="card" style="margin-bottom:14px"><form id="asgF" class="grid g4" style="align-items:end">
    <label class="f" style="margin:0"><span>Title</span><input class="in" name="title" required placeholder="Assignment 2 – Hadoop"></label>
    <label class="f" style="margin:0"><span>Subject</span><select class="in" name="subject_id"><option value="">General</option>${subs.map((s) => `<option value="${s.id}">${esc(s.short)}</option>`).join("")}</select></label>
    <label class="f" style="margin:0"><span>Due</span><input class="in" type="date" name="due_date"></label>
    <button class="btn primary" style="height:44px">Add assignment</button></form></div>
  <div class="card">${open.length ? `<div class="list">${open.map(row).join("")}</div>` : `<div class="empty">No open assignments.</div>`}
    ${done.length ? `<details style="margin-top:10px"><summary class="muted small" style="cursor:pointer">Completed (${done.length})</summary><div class="list">${done.map(row).join("")}</div></details>` : ""}</div>`;
}

function pageExams() {
  const all = S.subjects.filter((s) => s.exam_date).sort((a, b) => dOnly(a.exam_date).localeCompare(dOnly(b.exam_date)) || (a.exam_slot || "").localeCompare(b.exam_slot || ""));
  const mine = new Set(visibleSubjects().map((s) => s.id));
  return `<h1 class="page">${EXAM_NAME}</h1><p class="sub">Theory exams for B.Tech CSE 7th semester · ${EXAM_VENUE} · Morning 10:00–11:30, Afternoon 1:30–3:00. From the official date sheet dated 06/11/2026.</p>
  <div class="card"><div class="scroll"><table class="t"><thead><tr><th>Date</th><th>Shift</th><th>Code</th><th>Subject</th><th>Countdown</th></tr></thead><tbody>
  ${all.map((s) => `<tr style="${mine.has(s.id) ? "" : "opacity:.5"}"><td><b>${fmtDate(s.exam_date)}</b></td><td>${esc(s.exam_slot || "")}</td><td class="muted">${esc(s.code || "")}</td>
    <td><span class="row" style="gap:7px"><span class="dot" style="--c:${s.color}"></span>${esc(s.name)}${s.kind === "elective" ? ' <span class="pill">elective</span>' : ""}</span></td><td>${dueLabel(s.exam_date)}</td></tr>`).join("")}
  </tbody></table></div><p class="muted small">Faded rows are electives you haven't turned on. The four electives share the Tue 8 Dec afternoon slot with BDA — enable yours in <a href="#/settings">Settings</a>. Always double-check with the official notice.</p></div>`;
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
        <div class="two" style="display:grid;grid-template-columns:2fr 1fr;gap:8px"><label class="f"><span>Name</span><input class="in" name="name" required></label><label class="f"><span>Short</span><input class="in" name="short" maxlength="14"></label></div>
        <div class="two" style="display:grid;grid-template-columns:1fr 1fr 70px;gap:8px"><label class="f"><span>Code</span><input class="in" name="code"></label><label class="f"><span>Exam date</span><input class="in" type="date" name="exam_date"></label><label class="f"><span>Colour</span><input class="in" type="color" name="color" value="#6366f1" style="padding:3px;height:42px"></label></div>
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
      <div class="row wrap" style="margin-top:10px"><button class="btn ghost" id="expJson2">⤓ Export all my data (JSON)</button><button class="btn ghost" id="expCsv2">⤓ Export tracker (CSV)</button></div>
    </div>
  </div>`;
}

function pageAdmin() {
  if (!S.user.is_admin) return `<div class="empty">Admins only.</div>`;
  const subs = S.subjects.filter((s) => !s.owner_id && (s.kind !== "elective"));
  return `<h1 class="page">Admin · batch deadlines</h1><p class="sub">Dates and notes you set here appear on everyone's TA / ERLA / PA cards (their own due date overrides it). ${S.batchSize} account${S.batchSize === 1 ? "" : "s"} so far.</p>
  <div class="card" style="margin-bottom:14px"><form id="dlF" class="grid g4" style="align-items:end">
    <label class="f" style="margin:0"><span>Subject</span><select class="in" name="subject_id">${subs.map((s) => `<option value="${s.id}">${esc(s.short)}</option>`).join("")}</select></label>
    <label class="f" style="margin:0"><span>Assessment</span><select class="in" name="kind">${S.kinds.map((k) => `<option value="${k}">${KIND_LABEL[k]}</option>`).join("")}</select></label>
    <label class="f" style="margin:0"><span>Due date</span><input class="in" type="date" name="due_date"></label>
    <label class="f" style="margin:0"><span>Note</span><input class="in" name="note" placeholder="Topic / format / faculty note"></label>
    <button class="btn primary">Save for batch</button><span class="muted small">Leave date and note empty to remove.</span></form></div>
  <div class="card" style="margin-bottom:14px"><h3>Current batch deadlines</h3>${S.deadlines.length ? `<div class="list">${S.deadlines.slice().sort((a, b) => dOnly(a.due_date).localeCompare(dOnly(b.due_date))).map((d) => { const s = subjById(d.subject_id); return `<div class="li"><span class="dot" style="--c:${s?.color}"></span><div style="flex:1"><b>${esc(s?.short)} · ${KIND_LABEL[d.kind]}</b><div class="muted small">${d.due_date ? fmtDate(d.due_date) : "no date"}${d.note ? " — " + esc(d.note) : ""}</div></div><button class="btn sm danger" data-deldl="${d.subject_id}|${d.kind}">Remove</button></div>`; }).join("")}</div>` : `<div class="empty">None yet.</div>`}</div>
  <div class="grid g2">
    <div class="card"><h3>Reset a batchmate's password</h3><form id="rstF">
      <label class="f"><span>Roll number</span><input class="in" name="roll_no" required></label>
      <label class="f"><span>Temporary password</span><input class="in" name="password" required minlength="6"></label>
      <button class="btn primary">Reset</button></form></div>
    <div class="card"><h3>Accounts</h3><div id="usersBox"><button class="btn ghost" id="loadUsers">Load list</button></div></div>
  </div>`;
}

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

// ------------------------------------------------------------ render & events
function render() {
  if (!S) return renderAuth();
  const pages = { home: pageHome, subjects: pageSubjects, subject: pageSubject, checklist: pageChecklist, files: pageFiles, assignments: pageAssignments, exams: pageExams, settings: pageSettings, admin: pageAdmin };
  $app.innerHTML = shell((pages[route] || pageHome)());
  wireShell();
  wirePage();
}

function wirePage() {
  const main = document.getElementById("main");

  // sub-tabs
  main.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => { subTab = b.dataset.st; render(); }));

  // assessment cards — edits go into local state first, saves run one at a time per card
  main.querySelectorAll(".as").forEach((card) => {
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

  // syllabus topics
  main.querySelectorAll("[data-topic]").forEach((el) => (el.onchange = async () => {
    const sid = Number(el.dataset.sid), key = el.dataset.topic;
    S.topics = S.topics.filter((t) => !(t.subject_id === sid && t.topic_key === key));
    if (el.checked) S.topics.push({ subject_id: sid, topic_key: key });
    render();
    try { await api("PUT", "topic", { subject_id: sid, topic_key: key, done: el.checked }); } catch (e) { toast(e.message, true); }
  }));

  // customise columns
  const kf = document.getElementById("kindsF");
  if (kf) kf.onchange = () => {
    const ks = [...kf.querySelectorAll("input:checked")].map((i) => i.value);
    if (!ks.length) return toast("Keep at least one", true);
    savePrefs({ kinds: { ...(prefs().kinds || {}), [routeArg]: ks } });
  };

  // todos
  const qt = document.getElementById("qtodo");
  if (qt) qt.onsubmit = async (e) => {
    e.preventDefault(); const text = qt.text.value.trim(); if (!text) return;
    try { const r = await api("POST", "todo", { text }); S.todos.unshift(r.todo); render(); } catch (err) { toast(err.message, true); }
  };
  main.querySelectorAll("[data-todo]").forEach((el) => (el.onchange = async () => {
    const t = S.todos.find((x) => x.id === Number(el.dataset.todo)); t.done = el.checked; render();
    try { await api("PUT", `todo/${t.id}`, { done: t.done }); } catch (e) { toast(e.message, true); }
  }));
  main.querySelectorAll("[data-deltodo]").forEach((el) => (el.onclick = async () => {
    const id = Number(el.dataset.deltodo); S.todos = S.todos.filter((t) => t.id !== id); render();
    try { await api("DELETE", `todo/${id}`); } catch (e) { toast(e.message, true); }
  }));

  // assignments
  const af = document.getElementById("asgF");
  if (af) af.onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(af));
    try { const r = await api("POST", "assignment", { ...fd, subject_id: fd.subject_id ? Number(fd.subject_id) : null }); S.assignments.push(r.assignment); render(); toast("Added"); } catch (err) { toast(err.message, true); }
  };
  main.querySelectorAll("[data-asg]").forEach((el) => (el.onchange = async () => {
    const a = S.assignments.find((x) => x.id === Number(el.dataset.asg)); a.done = el.checked; render();
    try { await api("PUT", `assignment/${a.id}`, { ...a, due_date: dOnly(a.due_date) }); } catch (e) { toast(e.message, true); }
  }));
  main.querySelectorAll("[data-delasg]").forEach((el) => (el.onclick = async () => {
    if (!confirm("Delete this assignment?")) return;
    const id = Number(el.dataset.delasg); S.assignments = S.assignments.filter((a) => a.id !== id); render();
    try { await api("DELETE", `assignment/${id}`); } catch (e) { toast(e.message, true); }
  }));
  const pin = document.getElementById("pinAsg");
  if (pin) pin.onchange = async () => { await savePrefs({ showAssignments: pin.checked }); render(); };

  // files
  main.querySelectorAll("[data-upload]").forEach((el) => (el.onchange = () => uploadFiles([...el.files], Number(el.dataset.sid), el.dataset.kind, el.closest(".as")?.querySelector("[data-saving]"))));
  const drop = document.getElementById("drop"), dropIn = document.getElementById("dropIn");
  if (drop) {
    const go = (files) => uploadFiles(files, Number(document.getElementById("upSid").value) || null, document.getElementById("upKind").value || null, document.getElementById("upProg"));
    drop.onclick = () => dropIn.click();
    dropIn.onchange = () => go([...dropIn.files]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); go([...e.dataTransfer.files]); };
  }
  main.querySelectorAll("[data-delfile]").forEach((el) => (el.onclick = async () => {
    if (!confirm("Delete this file permanently?")) return;
    const id = Number(el.dataset.delfile);
    try { await api("DELETE", `file/${id}`); S.files = S.files.filter((f) => f.id !== id); render(); toast("Deleted"); } catch (e) { toast(e.message, true); }
  }));

  // settings
  main.querySelectorAll("[data-hide]").forEach((el) => (el.onchange = () => {
    const h = new Set(prefs().hidden || []); const id = Number(el.dataset.hide);
    el.checked ? h.delete(id) : h.add(id); savePrefs({ hidden: [...h] });
  }));
  main.querySelectorAll("[data-el]").forEach((el) => (el.onchange = () => {
    const s = new Set(prefs().electives || []); const id = Number(el.dataset.el);
    el.checked ? s.add(id) : s.delete(id); savePrefs({ electives: [...s] });
  }));
  const sf = document.getElementById("subF");
  if (sf) sf.onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await api("POST", "subject", Object.fromEntries(new FormData(sf))); S.subjects.push(r.subject); render(); toast("Subject added"); } catch (err) { toast(err.message, true); }
  };
  main.querySelectorAll("[data-delsub]").forEach((el) => (el.onclick = async () => {
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
  const dl = document.getElementById("dlF");
  if (dl) dl.onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(dl)); fd.subject_id = Number(fd.subject_id);
    try {
      const r = await api("PUT", "deadline", fd);
      S.deadlines = S.deadlines.filter((d) => !(d.subject_id === fd.subject_id && d.kind === fd.kind));
      if (r.deadline) S.deadlines.push(r.deadline);
      render(); toast("Batch deadline saved");
    } catch (err) { toast(err.message, true); }
  };
  main.querySelectorAll("[data-deldl]").forEach((el) => (el.onclick = async () => {
    const [sid, kind] = el.dataset.deldl.split("|");
    try { await api("PUT", "deadline", { subject_id: Number(sid), kind }); S.deadlines = S.deadlines.filter((d) => !(d.subject_id === Number(sid) && d.kind === kind)); render(); } catch (e) { toast(e.message, true); }
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
      document.getElementById("usersBox").innerHTML = `<div class="scroll"><table class="t"><thead><tr><th>Roll</th><th>Name</th><th>Submitted</th><th>Files</th></tr></thead><tbody>${r.users.map((u) => `<tr><td>${esc(u.roll_no)}</td><td>${esc(u.name)}</td><td>${u.submitted}</td><td>${u.files}</td></tr>`).join("")}</tbody></table></div>`;
    } catch (e) { toast(e.message, true); }
  };
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
async function sendFile(file, sid, kind, onProgress) {
  const type = file.type || "application/octet-stream";
  const t = await api("POST", "upload-url", { name: file.name, size: file.size, type, subject_id: sid, kind });
  try { await xhrPut(t.url, file, t.type, onProgress); }
  catch (e) {
    if (e.message === "network" && file.size < 9 * 1024 * 1024) return putFile(file, sid, kind, onProgress); // fallback via server
    throw new Error(e.message === "network" ? "Network error" : e.message);
  }
  return api("POST", "upload-done", { key: t.key, type: t.type, subject_id: sid, kind });
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
    subjects: visibleSubjects().map((s) => ({ name: s.name, code: s.code, exam_date: dOnly(s.exam_date),
      assessments: kindsFor(s.id).map((k) => { const a = getA(s.id, k); return { kind: k, topic: a.topic, due_date: effDue(a), report: a.report, ppt: a.ppt, viva: a.viva, submitted: a.submitted, marks: a.marks, max_marks: a.max_marks, notes: a.notes }; }),
      syllabus_done: (s.units || []).flatMap((u, i) => u.topics.filter((_, j) => topicDone(s.id, `${i}.${j}`))),
    })),
    todos: S.todos.map((t) => ({ text: t.text, done: t.done })),
    assignments: S.assignments.map((a) => ({ title: a.title, subject: subjById(a.subject_id)?.short || null, due_date: dOnly(a.due_date), done: a.done, notes: a.notes })),
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
}
window.addEventListener("hashchange", () => { parseRoute(); if (S) { render(); window.scrollTo(0, 0); } });
document.addEventListener("click", (e) => { const a = e.target.closest("[data-goto-syl]"); if (a) nextSubTab = "syllabus"; }, true);

async function boot() {
  document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";
  parseRoute();
  try {
    const me = await api("GET", "me");
    if (!me.user) { S = null; return renderAuth(); }
    S = await api("GET", "bootstrap");
    for (const k of ["subjects", "assessments", "assignments", "todos", "files"]) S[k].forEach((x) => { for (const n of ["marks", "max_marks", "size"]) if (x[n] != null) x[n] = Number(x[n]); });
    render();
  } catch (e) {
    $app.innerHTML = `<div class="boot"><div class="card" style="max-width:380px;text-align:center"><b>Couldn't load</b><p class="muted">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Retry</button></div></div>`;
  }
}
boot();
