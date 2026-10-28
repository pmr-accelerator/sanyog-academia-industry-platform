# Validation and test plan

## Database-free regression suite

Run from the repository root:

```sh
npm run test:unit
```

This executes the server's Node.js test suite and the client API-wrapper suite. It does not require PostgreSQL or a running web server. The cross-discipline matrix covers every role track in the demonstration career taxonomy for both a verified eligible candidate and a disallowed-discipline rejection.

## Database-backed integration suite

On a disposable development database only:

```sh
copy .env.example .env       # Windows; edit .env and set SEED_DEMO_PASSWORD
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run test:integration
```

Do not run `npm run db:reset` against a database containing real or valuable data: it truncates all public tables. Integration tests use the seeded demo accounts and may change state if tests are extended; reset only a disposable database.

## Seed data coverage

The seed is deterministic in shape and synthetic in identity: 29 student profiles across seven engineering disciplines, two institutions, two organizations, 21 opportunities spanning several opportunity types, skill evidence, academic records, applications, alumni, and learning resources. It supports role dashboards, eligibility filters, matching, and pending-verification flows. It is a functional demo corpus, not a representative statistical sample or evidence of real placement outcomes.

## Release gates not covered by unit tests

Before a public demo or production deployment, also run and record:

1. `npm run prisma:validate` and `npx prisma generate --schema prisma/schema.prisma`.
2. Initial migration creation and review; commit `prisma/migrations/**/migration.sql` before production deployments.
3. `npm run test:integration` against a clean migrated and seeded PostgreSQL database.
4. `npm run build` and a browser smoke test for login, each role dashboard, application flow, consent controls, upload validation, and mobile layout.
5. Docker build and `docker compose --profile full up --build` on a clean local machine.
6. Authorization/tenant-isolation, CSRF, upload-abuse, dependency, and secret-scanning checks.

A passing unit suite is not a substitute for these release gates. No database-backed or browser end-to-end pass is claimed by this package audit.


## Release verification and CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) installs dependencies, validates Prisma, generates an initial migration for the clean CI database, applies it, seeds synthetic data, runs server unit and PostgreSQL-backed integration tests, runs client tests, builds the frontend, builds and starts the Docker stack, then runs an HTTP and Chromium browser smoke test. The workflow is the authoritative environment for the checks that cannot run in a sandbox without npm registry access or Docker.

For a local full verification pass, run `npm install`, create `.env`, start PostgreSQL, run `npm run db:migration:baseline` once, `npm run db:migrate`, `npm run db:seed`, `npm run test:unit`, `npm run test:integration`, `npm run build`, and finally run the full Docker stack and `npm run test:e2e`. Never treat a generated baseline as a replacement for reviewing/committing migration history.
