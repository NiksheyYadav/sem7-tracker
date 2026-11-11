# Next session: v2.4 deploy checklist

Built and tested locally, NOT deployed yet:
- Sections/groups (A: DS · B: CS/CC · C: AIML · D: AIML/IOS); signup and settings require them; home prompt if missing
- "Who is this for?" targeting on announcements, deadlines, UA exams, class events, notes; Sec tags; feeds, reminders and push filtered per section
- Scoped admins (`admins` table, added by roll no.); super admin = env ADMIN_ROLLS
- Feedback page (More menu) plus admin inbox with status/reply
- Admin class-notes uploads per subject, optional unit (`shared_notes` table, keys n/<sid>/...)
- Leaderboard section tabs

To ship:
1. Live DB: run the `shared_notes` create-table and index from migrations-v2.sql (idempotent; the last attempt may have partly run). admins/feedback and the targeting columns already exist live.
2. `node build.mjs` → sha256 dist/index.mjs → presign PUT tracker-code/app-v11.mjs → curl upload → verify sha.
3. deploy_function slug `tracker` with env {CODE_URL, CODE_SHA} only (Neon merges env; other vars carry over).
4. Poll the live app.js for "pageFeedback"; smoke-test; insert v2.4 into the update log; commit.
5. GitHub: push once the empty `sem7-tracker` repo exists.
