# Sem 7 Tracker — B.Tech CSE (DS), SGT University

Live: https://br-proud-mountain-b3hura5m-tracker.compute.c-4.ap-southeast-1.aws.neon.tech/

Multi-user academic tracker: TA 1–5, ERLA 1–2, PA with Report / PPT / Viva / Done checkboxes,
marks, notes, file locker, syllabus checklist, to-dos, optional assignments, unit assessments (UA-1/2/3),
calendar with personal + class events, notifications with web-push reminders (8 AM / 7 PM IST),
study notes (markdown), update log, and an admin panel.

## Stack
- Neon Postgres (project `sem7-tracker`, Singapore) — tables in `schema.sql`, subjects in `seed.sql`
- Neon Function `tracker` serves the page + JSON API (`server/index.mjs`)
- Neon Object Storage: `tracker-files` (private, user uploads via signed URLs), `tracker-code` (app bundle)
- Neon cron trigger `deadline-reminders` (`30 2,13 * * *` UTC) → `POST /cron/remind`
- Web push via `web-push` (VAPID keys in env), service worker `public/sw.js`, PWA manifest
- Study notes in `notes/*.md` (built into the bundle; admin edits are stored in `subjects.notes_md`)
- Login = roll number + password (scrypt hashes, signed HttpOnly cookie). Admin roll numbers come from `ADMIN_ROLLS`.

## Update the app
1. `npm install && node build.mjs` → `dist/index.mjs`
2. Upload it to `tracker-code/app-vN.mjs` (presigned PUT)
3. Redeploy the function with env `CODE_URL` pointing at the new file and `CODE_SHA` = its sha256
   (the loader in `stub/index.mjs` downloads, verifies and runs it).

Schema changes for v2 are in `migrations-v2.sql`.
