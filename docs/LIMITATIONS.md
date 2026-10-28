# Known limitations and test status

Everything here is stated as precisely as possible. "Executed" means a command was actually run while this package was prepared,
and the result is quoted. Anything not listed under "Executed" has **not** been run.

## 1. Executed in this audit (real results)

| Check | Result |
|---|---|
| Server unit suite (`node server/tests/run.js unit`) | **54 of 54 passed**, including the cross-discipline regression matrix |
| Client API-wrapper unit suite (`node client/tests/run.js`) | **5 of 5 passed** |
| `node --check` across server source/tests, migration generator and browser smoke test | passed |
| Root/server/client package JSON parsing | passed |
| npm dependency installation attempt | timed out while contacting the registry; no successful install/build claimed |

## 2. Not executed in this environment (treat as unverified)

* Dependency installation did not complete because registry access timed out. No package lock is shipped; create and commit one in a network-enabled environment.
* Prisma validation/generation and actual migration SQL generation/application were not run here because Prisma is not installed. `npm run db:migration:baseline` now generates the initial SQL migration from the schema when run in a network-enabled environment; review and commit its output.
* PostgreSQL-backed integration tests, database seeding, frontend production build, Docker builds/startup and Chromium browser smoke tests were not run here because Docker is unavailable and dependencies could not be installed.
* A GitHub Actions workflow now defines these checks, including a clean PostgreSQL migration/seed, integration tests, frontend build, Docker startup, HTTP health check and Chromium browser smoke test. The workflow itself has not yet run; it is a validation path, not evidence that these checks passed.
* Security penetration testing, accessibility audit, SMTP delivery, live AI-provider calls, PDF rendering, and load/performance testing remain outstanding.

The two database-free test suites and syntax checks pass, but that does not prove the entire application works. Run the CI workflow or the documented full verification sequence before treating this project as release-ready.

## 3. Implemented functionality (code present, see section 2 for test status)

Registration/approval for 5 roles · sessions, CSRF, lockout, forced password change · institution-scoped verification workflow with review history ·
document upload with private authorised download · partnerships and agreement review with validity/expiry/renewal reminders ·
opportunities with structured criteria, explainable eligibility, readiness simulator, weighted match score · applications with duplicate prevention,
consent-filtered recruiter view, interviews and offers · AI roadmap adapter with labelled rule-based fallback and output validation, skill-gap radar,
career comparison · learning library with bookmarks/completion/recommendations · placement cell · alumni discovery (opt-in), referrals with student consent ·
analytics for every role with documented definitions · admin: users, grants, approvals, audit, taxonomy, resources, moderation, configuration, AI usage,
fairness monitoring, health · credential tokens with revocation · privacy export and anonymising deletion · notifications and scheduled alerts ·
accessible reading mode · i18n scaffold.

## 4. Demonstration data and external services

* **Demo data**: all seeded institutions, organizations, people, opportunities and agreements are fictional and labelled "(Demo)"; the site
  shows a banner while the demo flag is set. Platform statistics are computed from whatever is in the database and flagged as demo when seeded.
  No placement results, partners, testimonials or national statistics are invented; there are no testimonials.
* **Skill taxonomy**: the seeded skills are a **demonstration set, not NSQF/NCVET/O*NET**. No official qualification mapping is included or invented.
* **Learning-library links**: pointers to well-known public sites written from memory. They were **not checked** (no network). Administrators should verify each
  link and licence in *Admin → Library resources* before launch. Nothing is hosted or copied by the platform.
* **Services needing credentials**: SMTP (email), an AI provider key (optional), a managed PostgreSQL instance and HTTPS hosting for production.

## 5. Features that are incomplete or simplified (honest list)

* **Organization verification** is done by platform administrators only. Colleges review partnerships/agreements but do not verify organizations themselves.
* One organization per recruiter account; recruiters cannot yet invite colleagues. College staff are added by registering and being approved by an institution administrator.
* The web UI has no institution switcher for staff who belong to several institutions (the API accepts `institutionId`; the first membership is used).
* Student opportunity lists evaluate up to 300 open opportunities in memory per request (fine for a pilot, not for a national catalogue).
* Matching is interpretable ID/keyword matching with configurable weights. **No semantic embeddings** are implemented (see ARCHITECTURE.md for how to add them).
* Rate limiting and the maintenance scheduler are per-process (run a single API instance, or replace them).
* File storage is a local directory (use a persistent volume). No malware scanning, no object storage.
* No two-factor authentication, no automatic link checking, no real-time chat (placement messages are request/response).
* Fairness monitoring only reports discipline and institution aggregates; protected characteristics are not collected. It is a monitoring aid, not a legal audit.
* Interviews/offers for college-published vacancies (no employer) are limited to shortlist/select/reject; interview scheduling and offers exist for employer opportunities.
* Page copy is English only; navigation labels use the i18n catalogue. Accessibility has not been audited.
* The privacy policy, terms and accessibility statement are **drafts that need legal review**. No legal or regulatory compliance is claimed.
* Account deletion anonymises the account and removes uploads; audit and aggregate records are retained without personal details.
