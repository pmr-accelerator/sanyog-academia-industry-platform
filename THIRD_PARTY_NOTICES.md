# Third-party dependencies

Direct dependencies and the licences they are generally published under. **These licences are listed from general
knowledge and were not machine-verified in the build environment.** Before distributing, generate an authoritative
report after `npm install`, for example:

```
npx license-checker --production --summary
```

| Package | Used for | Typical licence |
|---|---|---|
| react, react-dom | UI | MIT |
| react-router-dom | routing | MIT |
| vite, @vitejs/plugin-react | build tooling | MIT |
| express, cookie-parser, cors | HTTP server | MIT |
| helmet | security headers | MIT |
| express-rate-limit | rate limiting | MIT |
| zod | input validation | MIT |
| multer | file upload parsing | MIT |
| bcryptjs | password hashing (pure JavaScript) | MIT |
| nodemailer | SMTP email | MIT-0 / MIT |
| pdfkit | PDF reports | MIT |
| dotenv, dotenv-cli | environment files | BSD-2-Clause / MIT |
| prisma, @prisma/client | ORM and migrations | Apache-2.0 |
| concurrently | run dev servers together | MIT |
| PostgreSQL (Docker image) | database | PostgreSQL Licence |

Learning-library entries are links to third-party websites. Their content is not redistributed by this project and
remains under the providers' own licences and terms.
