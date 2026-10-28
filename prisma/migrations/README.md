# Prisma migrations

For a fresh checkout, generate the initial SQL migration once after installing dependencies:

```sh
npm install
npm run db:migration:baseline
```

Review the generated SQL in `prisma/migrations/<timestamp>_init/migration.sql` and commit it together with `prisma/migrations/migration_lock.toml`. The generator intentionally refuses to overwrite an existing initial migration. Do not run it against a project that already has migration history.

Then start PostgreSQL, configure `.env`, and apply the committed migration:

```sh
npm run db:up
npm run db:migrate
npm run db:seed
```

Deployments should use `prisma migrate deploy`; production containers refuse to fall back to `prisma db push`. `db push` is retained only as a development/demo fallback when no migration has yet been generated. Review migrations and test them against a clean database before release.
