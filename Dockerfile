################################################################################
# Stage 1 — build
################################################################################
# Microsoft devcontainers image instead of node:24-alpine because (a) Node 20
# is EOL as of 2026-04-30, and (b) Docker Hub anonymous-pull rate limits hit
# ACR builds. MCR has no equivalent rate limit and mirrors the rest of the
# LettrLabs services' base-image pattern (.NET ones use mcr.microsoft.com).
FROM mcr.microsoft.com/devcontainers/javascript-node:24 AS builder

WORKDIR /app

# devcontainers image runs as the 'node' user (uid 1000) by default; switch
# to root for npm install so it can write to global caches if needed.
USER root

# Install deps with a clean cache for reproducible builds.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Prune dev dependencies — only the runtime closure goes into the final image.
RUN npm prune --omit=dev

################################################################################
# Stage 2 — runtime
################################################################################
FROM gcr.io/distroless/nodejs24-debian12:nonroot AS runtime

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

# Distroless images run as nonroot by default (uid 65532).
USER nonroot

CMD ["dist/index.js"]
