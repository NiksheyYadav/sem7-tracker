# Sem 7 Tracker — B.Tech CSE (DS), SGT University

Live: https://br-proud-mountain-b3hura5m-tracker.compute.c-4.ap-southeast-1.aws.neon.tech/

Multi-user academic tracker: TA 1–5, ERLA 1–2, PA with Report / PPT / Viva / Done checkboxes,
marks, notes, file locker, syllabus checklist, to-dos, optional assignments, UA-2 date sheet, admin batch deadlines.

## Stack
- Neon Postgres (project `sem7-tracker`, Singapore) — tables in `schema.sql`, subjects in `seed.sql`
- Neon Function `tracker` serves the page + JSON API (`server/index.mjs`)
- Neon Object Storage: `tracker-files` (private, user uploads via signed URLs), `tracker-code` (app bundle)
- Login = roll number + password (scrypt hashes, signed HttpOnly cookie). Admin roll numbers come from `ADMIN_ROLLS`.

## Update the app
1. `npm install && node build.mjs` → `dist/index.mjs`
2. Upload it to `tracker-code/app-vN.mjs` (presigned PUT)
3. Redeploy the function with env `CODE_URL` pointing at the new file and `CODE_SHA` = its sha256
   (the loader in `stub/index.mjs` downloads, verifies and runs it).
