# Troubleshooting (Windows-friendly)

| Symptom | Fix |
|---|---|
| `Invalid environment configuration: DATABASE_URL` | You have no `.env`. Run `copy .env.example .env` in the project root and edit it. |
| `Set SEED_DEMO_PASSWORD in .env` | Put a password of 12+ characters in `.env` (this is the demo-account password) and run the seed again. |
| `docker: error during connect` / DB won't start | Start Docker Desktop, then `npm run db:up`. Check with `docker compose ps`. |
| `P1001: Can't reach database server` | PostgreSQL isn't running, or port 5432 is used by another install. Stop the other service or change the port in `docker-compose.yml` **and** `DATABASE_URL`. |
| Password authentication failed | `DB_PASSWORD` in `.env` must equal the password inside `DATABASE_URL`. If the volume was created earlier with another password run `docker compose down -v` (this erases the database). |
| `EPERM: operation not permitted` during `prisma generate` | Close running `node` processes / the dev server, then rerun `npm install`. |
| `Cannot find module '@prisma/client'` or "did not initialize yet" | Run `npm run prisma:generate --workspace server`. |
| `prisma migrate dev` asks to reset the database | Only in development; accept. Never run it against production. |
| Login says "Cross-origin request blocked" or `CSRF_INVALID` | Open the app at exactly `http://localhost:5173` (not `127.0.0.1`) so it matches `CLIENT_ORIGIN`; clear cookies; make sure the API is on port 4000. |
| Everything signs out after restarting the server | `SESSION_SECRET` is empty (random per start in development). Set a fixed value in `.env`. |
| Verification email never arrives | With `MAIL_TRANSPORT=console` the link is printed in the **server terminal**. Copy it into the browser. |
| Demo admin/college can't open pages | Expected: they must change the temporary password first (the app redirects you). |
| Login page shows no demo accounts | `DEMO_MODE=true` and run `npm run db:seed`. |
| Want a clean demo database | `npm run db:reset` (development only; erases all data). |
| Upload says "content does not match its type" | Only genuine PDF, PNG or JPEG files up to `MAX_UPLOAD_MB` are accepted. |
| `npm test` integration tests fail with 401 | They need a migrated and seeded database and the same `SEED_DEMO_PASSWORD`; privileged demo accounts are skipped by design. |
| `AI provider is set but AI_MODEL is empty` | Set `AI_MODEL`, or set `AI_PROVIDER=none` to use the rule-based fallback. |
| Blank page after `npm run build` + preview | The API must also be running; use `npm run dev`, or the nginx sample that proxies `/api`. |
