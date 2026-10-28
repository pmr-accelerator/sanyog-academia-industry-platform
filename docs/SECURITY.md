# Security notes

Status words used here: **Implemented** = present in the code. **Not independently tested** = no penetration test or
automated security scan has been run. Nothing in this document is a compliance claim.

## Implemented controls

| Area | Control |
|---|---|
| Passwords | bcrypt (cost 12, pure-JS `bcryptjs`); min. 10 chars with letter + digit; constant-time dummy compare for unknown emails; lock for 15 min after 5 failures |
| Sessions | Random 256-bit token in an HTTP-only cookie; only an HMAC of it is stored; 7-day absolute and 8-hour idle expiry; all sessions revoked on password reset/suspension |
| CSRF | Per-session token required in `X-CSRF-Token` for state-changing requests + strict `Origin` check against `CLIENT_ORIGIN` + SameSite cookie |
| Authorisation | Server-side on every route: role → scope loader → ownership/consent check; admin permissions are per-endpoint; cross-scope records return 404 |
| Privileged demo accounts | Seeded admin/college accounts have `mustChangePassword`; all APIs except change-password are refused until changed; no password is hardcoded (`SEED_DEMO_PASSWORD` from `.env`) |
| Validation | zod schemas on every body; output is JSON, React escapes text; no raw SQL (Prisma parameterises) |
| Uploads | Allow-list (PDF/PNG/JPEG), size limit, magic-byte check, random private filenames, no public static serving, per-request authorised streaming with `nosniff` and `no-store` |
| Headers / CORS | helmet; CORS limited to `CLIENT_ORIGIN` with credentials; API CSP `default-src 'none'`; nginx sample adds frame/ referrer headers |
| Rate limiting | Global, auth, sensitive, public-form and per-user AI limits (in-memory: per process) |
| Errors | Generic 500 messages; stack traces only in the server log; error ring buffer shows code/path only |
| Audit | Login failures, verification decisions, partnership decisions, admin actions, exports, privacy actions, takedowns |
| Privacy | Consent grants with field lists and revocation; export; deletion by anonymisation; alumni discovery opt-in; recruiters get only consented fields |
| Production guard | Server refuses to start in production without 32+ char secrets, `COOKIE_SECURE=true`, and with `DEMO_MODE=true`; seeding is refused unless explicitly overridden |
| CSV | Formula-injection neutralised in exports |

## Not implemented / needs attention before a public launch

* Independent penetration test and dependency audit (`npm audit`).
* Malware scanning of uploaded files; object storage with encryption at rest.
* Two-factor authentication; admin IP allow-listing; account-recovery review process.
* Distributed rate limiting (use Redis or a gateway if you run several API instances).
* Automatic link checking of learning resources (SSRF-safe checker not built).
* Formal data-protection review. The privacy policy, terms and accessibility texts are **drafts** that need legal review.
  Review obligations under India's Digital Personal Data Protection Act, 2023 and any institution-specific rules,
  including parental-consent rules if minors can register.
* The platform stores agreement documents as records only; it does not provide legally valid e-signatures.

## Backups and recovery

* Database: `pg_dump -Fc` on a schedule (managed providers usually offer point-in-time recovery). Test a restore.
* Uploads: back up the `UPLOAD_DIR` volume together with the database; documents reference files by `storageKey`.
* Secrets: store `.env` values in your host's secret manager. Rotating `SESSION_SECRET` signs everyone out; rotating
  `CREDENTIAL_SIGNING_KEY` invalidates all issued credential tokens.
