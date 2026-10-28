# Static build served by nginx; /api is proxied to the API container.  docker build -f client/Dockerfile -t sanyog-web .
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm install --workspace client
COPY client client
ARG VITE_PLATFORM_NAME=Sanyog
ENV VITE_PLATFORM_NAME=$VITE_PLATFORM_NAME
RUN npm run build --workspace client

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
