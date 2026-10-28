# Architecture

```
Browser (React SPA, Vite)
   │  HTTPS, same origin via /api proxy (dev) or reverse proxy (prod)
   ▼
Express API ── middleware: helmet → cors → rate limit → json → cookies → session → CSRF
   │             routes (controllers + zod validation) → services (business rules) → Prisma → PostgreSQL
   ├─ eligibility/engine.js   pure function: opportunity criteria + student snapshot → result + explained checks
   ├─ matching/matcher.js     pure function: weighted, named factors → 0-100 ranking score (never decides eligibility)
   ├─ ai/                     provider-independent adapter (openai, anthropic) + rule-based fallback + output validator
   ├─ services/documents.js   private file store, magic-byte checks, authorised streaming downloads
   └─ jobs/                   hourly maintenance: expire partnerships, reminders, deadline alerts, close past-deadline vacancies
```

## Layers

| Layer | Location | Rule |
|---|---|---|
| Routes (controllers) | `server/src/routes` | Parse and validate input, call one service function, return `{ok,data}`. No business logic. |
| Services | `server/src/services` | All business rules, transactions, notifications, audit events. |
| Pure engines | `server/src/eligibility`, `matching`, `ai` | No database or network access except provider adapters; unit-tested. |
| Middleware | `server/src/middleware` | Authentication, CSRF, role and scope loaders, rate limits, errors, uploads. |
| Client | `client/src` | Role-based pages; the server enforces every permission again. |

## Roles and scoping

* Every protected route composes `requireAuth → requireRole → context loader`. Loaders attach the caller's *own* scope:
  `studentContext` (own profile), `collegeContext` (approved memberships at VERIFIED institutions), `orgContext`
  (own organization), `alumniContext`. Services then filter every query by that scope, so ids sent by the client are never
  trusted on their own. Records outside the caller's scope return 404.
* Administrators have no implicit powers: each endpoint requires a specific `AdminPermission` grant.

## Key workflows

* **Registration → approval**: users start `PENDING_EMAIL` → `PENDING_APPROVAL` → `ACTIVE`. Students and alumni are approved by
  their college's verification decision; new colleges by an administrator; organizations by an administrator.
  `recomputeUserStatus` derives the account status from these facts.
* **Verification**: submit → (claim) → verified / rejected / changes requested. Each decision writes `VerificationReview`
  (reviewer, time, reason), updates the item status, notifies the owner and writes an audit event. Editing a verified item
  materially sends it back to draft and revokes the old request; changing identity fields triggers re-verification and
  revokes credential tokens.
* **Eligibility**: computed live from saved profile + written criteria + institution rules; frozen as an explanation on
  application and recalculated (with a notification) whenever the profile or the opportunity changes. Duplicate applications
  are blocked by a database unique constraint.
* **Consent**: applying creates a `ConsentGrant` listing the shared fields; the recruiter API returns only those fields and
  hides explanation lines that would reveal unshared data. Referrals need explicit student consent. Alumni discovery is opt-in.
* **AI roadmap**: input snapshot → provider (or fallback) → strict validation → stored with `source` and the exact inputs.
  Provider failure, timeout, rate limit or invalid output all fall back to the labelled rule-based plan.
* **Credential tokens**: HMAC-signed minimal claims (no name/contact), looked up by random id, revocable, invalid if the
  enrollment is no longer verified.

## Metric definitions

* Placement conversion = students with ≥1 accepted offer ÷ verified students.
* Time-to-placement = days from a student's first application to first accepted offer (average).
* Time-to-fill = days from publish date to a vacancy's first accepted offer (average).
* Course alignment = share of skills demanded by open opportunities that have ≥1 active library resource.

## Data model

See `prisma/schema.prisma` (50 models, 33 enums). Groups: identity/sessions, institutions, student profile & evidence,
verification, organizations/alumni, partnerships/agreements, opportunities/requirements, applications/interviews/offers,
referrals/consent, roadmaps/learning library, placement cell, mentorship sessions, notifications, audit, AI usage, privacy.

## Skill taxonomy and NSQF

Skills live in `SkillTaxonomy` rows. The seeded set is a **demonstration** taxonomy (`isOfficial=false`, no NSQF levels).
The admin API refuses to store NSQF levels on a non-official taxonomy. To use official data, create a taxonomy with
`isOfficial=true` and a `sourceUrl`, then import skills from the official publication. No official mapping is invented here.

## Semantic embeddings

Not implemented. Matching is ID/keyword based with interpretable factors. To add embeddings, implement a service that stores
vectors (for example with the `pgvector` extension) and add a new factor to `matching/matcher.js`; do not label keyword
matching as embeddings.

## Internationalisation

UI strings for navigation and common actions come from `client/src/i18n/en.json` via `t()`. To add a language, add
`<code>.json` with the same keys and register it in `i18n/index.js`. Page copy is still inline English and should be moved
to catalogues as part of a translation effort.
