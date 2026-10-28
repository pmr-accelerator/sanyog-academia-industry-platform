
# Production image for the API
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY server/package.json server/
COPY client/package.json client/

# Copy Prisma schema BEFORE installing dependencies
COPY prisma prisma

RUN npm install --workspace server --include-workspace-root=false --omit=dev || npm install --workspace server --omit=dev

COPY server server
COPY server/start-container.sh /app/start-container.sh

RUN chmod +x /app/start-container.sh && npx prisma generate --schema prisma/schema.prisma

ENV NODE_ENV=production
EXPOSE 4000

CMD ["/app/start-container.sh"]

