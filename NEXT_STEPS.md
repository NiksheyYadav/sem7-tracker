# Next session

v2.4 is LIVE (deployed 11 Nov 2026 as app-v11.mjs, function deployment 12).
Includes sections/groups targeting, section admins, Feedback page, admin class-notes uploads,
leaderboard section tabs, update check + "Refresh app", custom assessment types (IT2 = Internal/External).

Deploy recipe: node build.mjs → sha256 dist/index.mjs → presign PUT tracker-code/app-vN.mjs → curl upload → verify
public copy sha → deploy_function slug `tracker` with env {CODE_URL, CODE_SHA} only (Neon merges env).

Open items:
- GitHub: push once the empty `sem7-tracker` repo exists (no remote configured yet).
- Shared subject list is Section A's (DS). Other sections may need their own subjects (main-admin only for now).
