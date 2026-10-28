# Deployment

Suggested layout: static web host (or the nginx image) → API host (Node 20) → managed PostgreSQL, all behind HTTPS.

## 1. Prepare once (on a development machine)

```
npm install                 # creates package-lock.json – commit it
npm run db:up && npm run db:migrate   # creates prisma/migrations – commit it
npm test                    # unit tests (integration tests need a seeded database)
npm run build               # builds client/dist
```

## 2. Database
Create a managed PostgreSQL 14+ instance, a dedicated user, and set `DATABASE_URL` (with `sslmode=require` if the provider needs it).
Apply migrations: `npm run prisma:deploy --workspace server`.

## 3. API
Environment variables (see `.env.example`): `NODE_ENV=production`, `DATABASE_URL`, `CLIENT_ORIGIN` (exact https origin of the web app),
`SESSION_SECRET`, `CREDENTIAL_SIGNING_KEY` (32+ random chars each), `COOKIE_SECURE=true`, `TRUST_PROXY=true` behind a proxy,
`UPLOAD_DIR` pointing at a **persistent** volume, SMTP settings with `MAIL_TRANSPORT=smtp`, optional `AI_*` variables.
Start: `node server/src/server.js` (health check: `GET /api/healthz`). Run **one** API instance unless you replace the in-memory rate limiter
and move uploads to shared storage; the hourly maintenance jobs run inside the process.
Never run the seed in production. Create the first administrator on the server: `npm run create-admin`.

## 4. Web
Serve `client/dist` as static files with a fallback to `index.html`, and route `/api/*` to the API **on the same site** (the sample
`client/nginx.conf` does this). If the API must live on a different site, set `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` and make
`CLIENT_ORIGIN` the web app's origin; the client currently calls relative `/api` URLs, so use a reverse proxy rather than a different host.
Set `VITE_PLATFORM_NAME` at build time to rename the product (and `PLATFORM_NAME` on the API).

## 5. Docker
`docker compose --profile full up --build` builds the API and web images and runs them with PostgreSQL (the Dockerfiles were **not built or run**
while preparing this package). The API image runs `prisma migrate deploy`, so commit `prisma/migrations` first.

## 6. After launch
Rotate the temporary admin password, verify your first institution through an independent channel, configure SMTP, review the draft legal pages,
set up backups and monitoring, and run `npm audit`.
