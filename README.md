# Sanyog — college-verified academia–industry platform

A full-stack web application where **the college is the trust and verification bridge** between students, industry and alumni.
Five roles (student, college authority, industry/recruiter, alumni, administrator) share one verified record, explainable
eligibility, an AI-assisted (or clearly labelled rule-based) career roadmap, a learning library, partnerships, a placement cell,
alumni referrals and role-specific analytics.

* Frontend: React 18 + Vite (JavaScript) · Backend: Node.js + Express · Database: PostgreSQL + Prisma
* The platform name is configurable (`PLATFORM_NAME` in `.env`, `VITE_PLATFORM_NAME` at build time).
* The platform is independent and makes no claim of government affiliation, approval or endorsement.

> **Read `docs/LIMITATIONS.md` first.** It separates what was actually executed while building this package from what is untested.
> The application has **not yet been started** in the build environment (no network, no PostgreSQL): expect to fix small
> first-run issues. Everything marked "demo" is synthetic.

## Prerequisites (Windows 10/11)

* Node.js **20.11 or newer** (check: `node -v`) and npm 10+
* Docker Desktop **or** a local PostgreSQL 14+ installation

## Quick start (PowerShell or Command Prompt)

```bat
cd academia-industry-platform
copy .env.example .env
notepad .env
```
In `.env` set at least `SEED_DEMO_PASSWORD` (12+ characters; used for all demo accounts). For stable sessions also set
`SESSION_SECRET` and `CREDENTIAL_SIGNING_KEY` — generate each with:
```bat
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Then:
```bat
npm install
npm run db:up
npm run db:migration:baseline  # first setup only; generates the initial SQL migration
npm run db:migrate
npm run db:seed
npm run dev
```
Open **http://localhost:5173** (use exactly this address). The API runs on http://localhost:4000.
After the first successful `npm install` you can use the one-line setup `npm run setup` (install + start DB + migrate + seed).

* `npm run db:up` starts PostgreSQL in Docker. Without Docker, install PostgreSQL, create a database and user, and edit `DATABASE_URL`.
* `npm run db:migration:baseline` generates an initial SQL migration from the Prisma schema for a new repository checkout. Review and commit `prisma/migrations/<timestamp>_init/migration.sql` and `prisma/migrations/migration_lock.toml`; run this only once, never over an existing migration history.
* `npm run db:migrate` applies and creates development migrations. See `prisma/migrations/README.md`.
* `npm run db:reset` wipes and re-seeds the **development** database.
* Verification and reset emails are printed in the **server terminal** (`MAIL_TRANSPORT=console`).

## Demo accounts and synthetic benchmark data

The seed includes 29 synthetic student profiles across seven engineering disciplines, two fictional institutions, two fictional organizations, 21 opportunities, skills, academic records, applications, alumni and learning resources. This is demonstration/functional-test data only—not real candidate, hiring, placement, partner or outcome data. All demo users share the password you configure in `SEED_DEMO_PASSWORD`.

Synthetic accounts (all `…@demo.sanyog.invalid`, password = your `SEED_DEMO_PASSWORD`). With `DEMO_MODE=true` they are listed on the login page.

| Role | Email prefix | Notes |
|---|---|---|
| Administrator | `admin` | **Must change password at first sign-in.** Has every permission. |
| College authority | `college1`, `college2` | **Must change password at first sign-in.** Institution-scoped; placement officer + partnerships. |
| Industry | `recruiter1`, `recruiter2` | `recruiter1` has an active partnership; `recruiter2` is awaiting one. |
| Student | `student1`…`student29` | `student4`, `student6`, `student12`, `student18`, and `student24` are pending approval; `student1` has applications, a project, and verified skills. |
| Alumni | `alumni1`, `alumni2` | `alumni2` is pending verification. |

Production refuses `DEMO_MODE=true`; the seed also refuses by default unless the explicit `ALLOW_DEMO_SEED_IN_PRODUCTION=I_UNDERSTAND` override is set. Never use synthetic demo data in production.

### Suggested demo walk-through
1. Sign in as `college1` (change the password), open **Verification queue**, review `student4`'s enrollment, approve it.
2. Sign in as `student1`: **Opportunities** → open one → see the explained eligibility and the readiness simulator → apply while choosing what to share.
3. Sign in as `recruiter1`: **Applicants** → open the application → note you see only consented fields → shortlist → schedule interview → offer.
4. As `student1`: accept the offer, request **Placement support**, generate an **AI career roadmap** (labelled rule-based when no AI key is set).
5. As `alumni1`: **Discover students** (only those who opted in) → create a referral → the student must consent.
6. As `admin`: verify a pending institution or organization, view the audit log and the fairness/health tabs.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) + web app together |
| `npm run build` | Production build of the web app (`client/dist`) |
| `npm test` | Server unit + database integration tests, then client tests (requires migrated and seeded PostgreSQL) |
| `npm run test:unit` | Server unit + client tests (no database needed) |
| `npm run test:integration` | API tests (migrated and seeded PostgreSQL required) |
| `npm run test:e2e` | Chromium browser smoke test against the running full stack (`E2E_BASE_URL` optional) |
| `npm run db:migration:baseline` | Generate the initial SQL migration once from the Prisma schema |
| `npm run test:offline` | Alias for database-free unit tests |
| `npm run prisma:validate` | Validate the Prisma schema |
| `npm run create-admin` | Create an administrator interactively (production bootstrap) |
| `npm run jobs:run` | Run the maintenance jobs once |

## AI provider (optional)

No key is needed. By default the roadmap uses the **rule-based fallback** and is labelled "Rule-based plan (not AI-generated)".
To use a real model, set `AI_PROVIDER` (`openai` or `anthropic`), `AI_API_KEY` and `AI_MODEL` in `.env` and restart. The key stays on the server.
Provider errors, timeouts, rate limits or invalid output automatically fall back to the labelled rule-based plan. Add another provider
by writing an adapter in `server/src/ai/providers.js` (one function with `generateRoadmap(input, signal)`).

## Project structure

```
client/      React app (pages per role, shared components, SVG charts, i18n scaffold)
server/      Express API: routes → services → Prisma; pure engines for eligibility, matching, AI
prisma/      schema.prisma (+ migrations/ once generated)
docs/        API.md · ARCHITECTURE.md · SECURITY.md · DEPLOYMENT.md · TROUBLESHOOTING.md · LIMITATIONS.md
tests/       pointer to the test suites (they live in server/tests and client/tests)
docker-compose.yml · .env.example · LICENSE · THIRD_PARTY_NOTICES.md
```

## Documentation
[API reference](docs/API.md) · [Architecture](docs/ARCHITECTURE.md) · [Security notes](docs/SECURITY.md) ·
[Deployment](docs/DEPLOYMENT.md) · [Testing plan](docs/TESTING.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Known limitations and test status](docs/LIMITATIONS.md)
