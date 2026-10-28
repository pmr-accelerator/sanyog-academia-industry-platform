# API reference

Base URL in development: `http://localhost:5173/api` (proxied) or `http://localhost:4000/api` (direct).

This list of endpoints is generated from the route files, so it matches the code. Request bodies are validated with zod on the server (see `server/src/validators`), so the server response to an invalid body lists exactly which fields failed.

## Conventions

**Success**: `{ "ok": true, "data": <payload>, "meta": { "page", "pageSize", "total", "totalPages" } }` (`meta` only on paginated lists; use `?page=` and `?pageSize=`).

**Error**: `{ "ok": false, "error": { "code": "FORBIDDEN", "message": "…", "details": [ { "path": "email", "message": "Invalid email" } ] } }`

| HTTP | code | meaning |
|---|---|---|
| 400 | BAD_REQUEST / BAD_JSON | validation failed (`details` lists fields) |
| 401 | UNAUTHENTICATED / SESSION_EXPIRED / INVALID_CREDENTIALS | not signed in or session ended |
| 403 | FORBIDDEN / CSRF_INVALID / ACCOUNT_PENDING / PASSWORD_CHANGE_REQUIRED / EMAIL_NOT_VERIFIED / ACCOUNT_SUSPENDED | not allowed |
| 404 | NOT_FOUND | missing, or deliberately hidden because it belongs to someone else |
| 409 | CONFLICT / DUPLICATE | e.g. duplicate application or referral |
| 422 | NOT_ELIGIBLE | eligibility rules not met; `details.checks` explains each criterion |
| 429 | RATE_LIMITED / AI_LIMIT / ACCOUNT_LOCKED | too many requests |
| 500 | INTERNAL_ERROR | generic message; details are only in the server log |

## Authentication and CSRF

1. `POST /api/auth/login` sets an HTTP-only session cookie and returns `data.csrfToken`.
2. Send that token in the `X-CSRF-Token` header on every `POST`, `PUT`, `PATCH` and `DELETE`.
3. Browser requests must come from `CLIENT_ORIGIN`; other origins are rejected.

### Example: sign in
```http
POST /api/auth/login
Content-Type: application/json

{ "email": "student1@demo.sanyog.invalid", "password": "<SEED_DEMO_PASSWORD>" }
```
```json
{ "ok": true, "data": { "platformName": "Sanyog", "csrfToken": "k3…", "user": { "id": "…", "email": "…", "fullName": "Demo Student One", "role": "STUDENT", "status": "ACTIVE", "mustChangePassword": false }, "profile": { "institutionName": "Demo Institute of Technology (Demo)", "registrationStatus": "VERIFIED" } } }
```

### Example: explainable eligibility
```http
GET /api/student/opportunities/{id}
```
```json
{ "ok": true, "data": { "title": "Graduate Backend Engineer (Demo)", "eligibility": "REQUIRES_REVIEW", "matchScore": 82,
  "checks": [ { "key": "cgpa", "label": "Minimum CGPA", "status": "MET", "detail": "8.6 meets the minimum of 7.", "blocking": true },
             { "key": "skill:…", "label": "Skill: Python Programming", "status": "REVIEW", "detail": "Level 4 meets 3, but it is self-declared and not yet verified.", "improvement": "Submit Python Programming evidence for verification." } ],
  "readiness": { "blockers": [ … ], "wouldQualifyIfActionableDone": true } } }
```

### Example: apply (and the explained refusal)
```http
POST /api/student/opportunities/{id}/apply
{ "coverNote": "…", "shareFields": ["academics","skills"] }
```
`201` on success. If the criteria are not met: `422 { "error": { "code": "NOT_ELIGIBLE", "details": { "checks": [ … ] } } }`. A second application returns `409`.

### Example: verification decision (college)
```http
POST /api/college/verification/{id}/decide
{ "decision": "CHANGES_REQUESTED", "reason": "Marksheet page 2 is unreadable." }
```
The reviewer, time and reason are stored in `VerificationReview`, the student is notified, and an audit event is written.

### Example: generate a roadmap
```http
POST /api/student/roadmap/generate
{ "targetRole": "Backend Software Engineer", "weeklyLearningHours": 8 }
```
`GET /api/student/roadmap` returns `source` (`AI_PROVIDER` or `RULE_BASED_FALLBACK`), `sourceLabel`, milestones with linked library resources, `gaps`, and the advisory `disclaimer`.

## Endpoints

### `/api/auth`

*Access:* Public (some endpoints need a session).

| Method | Path | Extra requirement |
|---|---|---|
| POST | `/api/auth/register/student` |  |
| POST | `/api/auth/register/college` |  |
| POST | `/api/auth/register/industry` |  |
| POST | `/api/auth/register/alumni` |  |
| POST | `/api/auth/login` |  |
| POST | `/api/auth/logout` |  |
| GET | `/api/auth/me` |  |
| POST | `/api/auth/verify-email` |  |
| POST | `/api/auth/resend-verification` |  |
| POST | `/api/auth/forgot-password` |  |
| POST | `/api/auth/reset-password` |  |
| POST | `/api/auth/change-password` |  |

### `/api/public`

*Access:* Public, no sign-in.

| Method | Path | Extra requirement |
|---|---|---|
| GET | `/api/public/config` |  |
| GET | `/api/public/stats` |  |
| GET | `/api/public/institutions` |  |
| GET | `/api/public/disciplines` |  |
| GET | `/api/public/tracks` |  |
| GET | `/api/public/graph` |  |
| GET | `/api/public/skill-demand` |  |
| GET | `/api/public/demo-accounts` |  |
| GET | `/api/public/opportunities` |  |
| GET | `/api/public/opportunities/:id` |  |
| GET | `/api/public/resources` |  |
| GET | `/api/public/skills` |  |
| GET | `/api/public/credentials/:jti` |  |
| POST | `/api/public/contact` |  |

### `/api/student`

*Access:* Role STUDENT. Pending students may call only `/status` and `/enrollment/resubmit`.

| Method | Path | Extra requirement |
|---|---|---|
| GET | `/api/student/status` |  |
| POST | `/api/student/enrollment/resubmit` |  |
| GET | `/api/student/dashboard` |  |
| GET | `/api/student/profile` |  |
| PUT | `/api/student/profile` |  |
| PUT | `/api/student/experience` |  |
| POST | `/api/student/records` |  |
| DELETE | `/api/student/records/:id` |  |
| POST | `/api/student/skills` |  |
| DELETE | `/api/student/skills/:id` |  |
| POST | `/api/student/projects` |  |
| PUT | `/api/student/projects/:id` |  |
| DELETE | `/api/student/projects/:id` |  |
| POST | `/api/student/certifications` |  |
| PUT | `/api/student/certifications/:id` |  |
| DELETE | `/api/student/certifications/:id` |  |
| POST | `/api/student/verification/submit` |  |
| GET | `/api/student/verification` |  |
| GET | `/api/student/opportunities` |  |
| GET | `/api/student/opportunities/:id` |  |
| POST | `/api/student/opportunities/:id/simulate` |  |
| POST | `/api/student/opportunities/:id/save` |  |
| POST | `/api/student/opportunities/:id/apply` |  |
| GET | `/api/student/applications` |  |
| POST | `/api/student/applications/:id/withdraw` |  |
| POST | `/api/student/applications/:id/offer` |  |
| GET | `/api/student/career/tracks` |  |
| GET | `/api/student/career/compare` |  |
| GET | `/api/student/roadmap` |  |
| GET | `/api/student/roadmap/history` |  |
| GET | `/api/student/roadmap/opportunities` |  |
| POST | `/api/student/roadmap/generate` |  |
| PATCH | `/api/student/roadmap/milestones/:id` |  |
| GET | `/api/student/resources` |  |
| GET | `/api/student/resources/recommended` |  |
| POST | `/api/student/resources/:id/bookmark` |  |
| POST | `/api/student/resources/:id/complete` |  |
| GET | `/api/student/placement` |  |
| POST | `/api/student/placement` |  |
| GET | `/api/student/placement/:id` |  |
| POST | `/api/student/placement/:id/messages` |  |
| POST | `/api/student/placement/:id/checklist/:index` |  |
| POST | `/api/student/placement/:id/feedback` |  |
| GET | `/api/student/referrals` |  |
| POST | `/api/student/referrals/:id/respond` |  |
| GET | `/api/student/consents` |  |
| PUT | `/api/student/consents/discovery` |  |
| DELETE | `/api/student/consents/:id` |  |
| GET | `/api/student/credentials` |  |
| POST | `/api/student/credentials` |  |
| DELETE | `/api/student/credentials/:jti` |  |
| GET | `/api/student/passport` |  |
| GET | `/api/student/sessions` |  |
| POST | `/api/student/sessions/:id/enroll` |  |

### `/api/college`

*Access:* Role COLLEGE_AUTHORITY, approved member of a VERIFIED institution; institution-scoped.

| Method | Path | Extra requirement |
|---|---|---|
| GET | `/api/college/dashboard` |  |
| GET | `/api/college/verification` | canVerifyCredentials |
| GET | `/api/college/verification/:id` |  |
| POST | `/api/college/verification/:id/claim` |  |
| POST | `/api/college/verification/:id/decide` |  |
| POST | `/api/college/verification/:id/revoke` |  |
| GET | `/api/college/students` |  |
| GET | `/api/college/alumni` |  |
| GET | `/api/college/departments` |  |
| POST | `/api/college/departments` | canManagePartnerships |
| PUT | `/api/college/departments/:id` | canManagePartnerships |
| DELETE | `/api/college/departments/:id` | canManagePartnerships |
| GET | `/api/college/settings` |  |
| PUT | `/api/college/settings` | canManagePartnerships |
| GET | `/api/college/team` |  |
| POST | `/api/college/team/:id/decision` |  |
| GET | `/api/college/partnerships` |  |
| POST | `/api/college/partnerships/:pid/agreements/:aid/decide` |  |
| POST | `/api/college/partnerships/:pid/terminate` |  |
| GET | `/api/college/opportunities` |  |
| POST | `/api/college/opportunities` |  |
| PUT | `/api/college/opportunities/:id` |  |
| POST | `/api/college/opportunities/:id/publish` |  |
| POST | `/api/college/opportunities/:id/close` |  |
| GET | `/api/college/applications` |  |
| GET | `/api/college/applications/:id` |  |
| POST | `/api/college/applications/:id/status` |  |
| GET | `/api/college/placement` | placement officer |
| GET | `/api/college/placement/:id` | placement officer |
| POST | `/api/college/placement/:id/messages` | placement officer |
| POST | `/api/college/placement/:id/assign` | placement officer |
| POST | `/api/college/placement/:id/appointments` | placement officer |
| POST | `/api/college/placement/:id/status` | placement officer |
| POST | `/api/college/placement/:id/checklist/:index` | placement officer |
| GET | `/api/college/reports/:kind.csv` |  |
| GET | `/api/college/reports/:kind.pdf` |  |

### `/api/industry`

*Access:* Role INDUSTRY; organization-scoped. Pending accounts may call `GET/…/organization`, `GET /institutions`.

| Method | Path | Extra requirement |
|---|---|---|
| GET | `/api/industry/organization` |  |
| PUT | `/api/industry/organization` |  |
| GET | `/api/industry/institutions` |  |
| GET | `/api/industry/dashboard` |  |
| GET | `/api/industry/partnerships` |  |
| POST | `/api/industry/partnerships` |  |
| POST | `/api/industry/partnerships/:id/agreements` |  |
| GET | `/api/industry/opportunities` |  |
| GET | `/api/industry/opportunities/:id` |  |
| POST | `/api/industry/opportunities` |  |
| PUT | `/api/industry/opportunities/:id` |  |
| POST | `/api/industry/opportunities/:id/publish` |  |
| POST | `/api/industry/opportunities/:id/close` |  |
| GET | `/api/industry/applicants` |  |
| GET | `/api/industry/applicants/:id` |  |
| POST | `/api/industry/applicants/:id/status` |  |
| POST | `/api/industry/applicants/:id/interviews` |  |
| PATCH | `/api/industry/applicants/:id/interviews/:iid` |  |
| POST | `/api/industry/applicants/:id/offer` |  |
| POST | `/api/industry/applicants/:id/offer/withdraw` |  |
| GET | `/api/industry/referrals` |  |
| POST | `/api/industry/referrals/:id/decision` |  |

### `/api/alumni`

*Access:* Role ALUMNI. Only `GET /profile` and `POST /evidence` work before graduation is verified.

| Method | Path | Extra requirement |
|---|---|---|
| GET | `/api/alumni/profile` |  |
| POST | `/api/alumni/evidence` |  |
| PUT | `/api/alumni/profile` |  |
| POST | `/api/alumni/employment` |  |
| DELETE | `/api/alumni/employment/:id` |  |
| GET | `/api/alumni/dashboard` |  |
| GET | `/api/alumni/students` |  |
| GET | `/api/alumni/opportunities` |  |
| GET | `/api/alumni/referrals` |  |
| POST | `/api/alumni/referrals` |  |
| GET | `/api/alumni/sessions` |  |
| POST | `/api/alumni/sessions` |  |
| PUT | `/api/alumni/sessions/:id` |  |
| DELETE | `/api/alumni/sessions/:id` |  |

### `/api/admin`

*Access:* Role ADMIN plus the per-endpoint permission shown.

| Method | Path | Extra requirement |
|---|---|---|
| GET | `/api/admin/analytics` | VIEW_ANALYTICS |
| GET | `/api/admin/fairness` | VIEW_ANALYTICS |
| GET | `/api/admin/health` | VIEW_SYSTEM_HEALTH |
| GET | `/api/admin/users` | MANAGE_USERS |
| POST | `/api/admin/users/:id/status` | MANAGE_USERS |
| PUT | `/api/admin/users/:id/permissions` | MANAGE_USERS |
| GET | `/api/admin/institutions` | VERIFY_INSTITUTIONS |
| POST | `/api/admin/institutions/:id/decision` | VERIFY_INSTITUTIONS |
| GET | `/api/admin/memberships/pending` | VERIFY_INSTITUTIONS |
| GET | `/api/admin/organizations` | VERIFY_ORGANIZATIONS |
| POST | `/api/admin/organizations/:id/decision` | VERIFY_ORGANIZATIONS |
| GET | `/api/admin/audit` | VIEW_AUDIT |
| GET | `/api/admin/taxonomies` | MANAGE_TAXONOMY |
| POST | `/api/admin/taxonomies` | MANAGE_TAXONOMY |
| GET | `/api/admin/taxonomies/:id/skills` | MANAGE_TAXONOMY |
| POST | `/api/admin/skills` | MANAGE_TAXONOMY |
| PUT | `/api/admin/skills/:id` | MANAGE_TAXONOMY |
| DELETE | `/api/admin/skills/:id` | MANAGE_TAXONOMY |
| GET | `/api/admin/settings` | MANAGE_CONFIG |
| PUT | `/api/admin/settings/:key` | MANAGE_CONFIG |
| GET | `/api/admin/ai-usage` | VIEW_AI_USAGE |
| GET | `/api/admin/resources` | MANAGE_RESOURCES |
| POST | `/api/admin/resources` | MANAGE_RESOURCES |
| PUT | `/api/admin/resources/:id` | MANAGE_RESOURCES |
| POST | `/api/admin/resources/:id/status` | MANAGE_RESOURCES |
| GET | `/api/admin/moderation/opportunities` | MODERATE_CONTENT |
| POST | `/api/admin/moderation/opportunities/:id/takedown` | MODERATE_CONTENT |
| GET | `/api/admin/moderation/messages` | MODERATE_CONTENT |
| POST | `/api/admin/moderation/messages/:id/handled` | MODERATE_CONTENT |

### `/api`

*Access:* Any signed-in user (pending accounts allowed).

| Method | Path | Extra requirement |
|---|---|---|
| GET | `/api/notifications` |  |
| POST | `/api/notifications/read-all` |  |
| POST | `/api/notifications/:id/read` |  |
| POST | `/api/documents` |  |
| GET | `/api/documents` |  |
| GET | `/api/documents/:id/download` |  |
| DELETE | `/api/documents/:id` |  |
| GET | `/api/privacy/export` |  |
| POST | `/api/privacy/delete` |  |

`GET /api/healthz` — liveness probe, no authentication.

Downloads (`/api/documents/:id/download`, `/api/college/reports/:kind.csv|.pdf`) stream files and are authorised per request.
