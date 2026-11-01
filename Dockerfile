# syntax=docker/dockerfile:1
FROM node:26.13.0-bookworm-slim AS base
WORKDIR /app

# SQLite's native addon may need compilation when no prebuilt binary is available.
FROM base AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY packages/engine/package.json packages/engine/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/scenario/package.json apps/scenario/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json ./
COPY packages/engine packages/engine
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build --workspace @rohirrim/engine \
    && npm run build --workspace @rohirrim/api \
    && npm run build --workspace @rohirrim/web

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM base AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/fleet-floor.sqlite
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/engine/package.json ./packages/engine/package.json
COPY --from=build /app/packages/engine/dist ./packages/engine/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/migrations ./apps/api/migrations
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "--input-type=module", "-e", "import { connect } from 'node:net'; const s = connect({ host: '127.0.0.1', port: Number(process.env.PORT) }); s.setTimeout(2000); s.on('connect', () => { s.end(); process.exit(0); }); s.on('error', () => process.exit(1)); s.on('timeout', () => process.exit(1));"]
CMD ["node", "apps/api/dist/main.js"]

FROM nginx:stable-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
