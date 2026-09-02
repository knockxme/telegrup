FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg openssl && rm -rf /var/lib/apt/lists/*

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Separate prod-only install so the runner stage doesn't ship eslint,
# typescript, tailwind, etc. — those are only needed to build. Still needs the
# native build toolchain: gramJS's optional ws accelerators (utf-8-validate,
# bufferutil) compile from source and are real (prod) dependencies, not dev-only.
FROM base AS prod-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma7.config.ts ./prisma7.config.ts

RUN mkdir -p /app/tmp/uploads /app/tmp/hls /app/public/thumbnails /app/public/captions \
  && chown -R node:node /app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
# Stays root at container start (needed to chown volume mounts, which land
# owned by root the same way the pre-existing named volumes on any prior
# deployment already are — a build-time chown alone can't fix that, since a
# volume mount shadows whatever the image had at that path) — the entrypoint
# fixes ownership every boot, then drops to the non-root "node" user before
# ever running application code.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npx prisma migrate deploy && npm run start"]
