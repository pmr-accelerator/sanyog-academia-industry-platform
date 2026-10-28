# Tests

| Suite | Location | Command | Needs |
|---|---|---|---|
| Server unit (eligibility, matching, AI adapter + fallback, profile completion) | `server/tests/unit` | `npm run test:unit` | Node only |
| Server integration (auth, CSRF, role & institution isolation, eligibility API, duplicate application, consent view, upload validation, roadmap fallback) | `server/tests/integration` | `npm run test:integration` | Migrated + seeded PostgreSQL, `.env` with the same `SEED_DEMO_PASSWORD` |
| Client (API wrapper, CSRF header, error mapping) | `client/tests` | `npm test --workspace client` | Node only |
| Everything | | `npm test` | as above |

`npm test` at the root runs server unit + integration, then client tests.
