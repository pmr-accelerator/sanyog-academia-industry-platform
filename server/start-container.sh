#!/bin/sh
set -eu
SCHEMA="/app/prisma/schema.prisma"
MIGRATIONS="/app/prisma/migrations"
if find "$MIGRATIONS" -type f -name migration.sql -print -quit 2>/dev/null | grep -q .; then
  echo "Applying committed Prisma migrations..."
  npx prisma migrate deploy --schema "$SCHEMA"
else
  if [ "${NODE_ENV:-development}" = "production" ]; then
    echo "ERROR: production startup requires committed Prisma migrations. Refusing to run db push." >&2
    exit 1
  fi
  echo "WARNING: no committed Prisma migrations found; using db push for local demo only."
  npx prisma db push --schema "$SCHEMA"
fi
exec node /app/server/src/server.js
