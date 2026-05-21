################################################################################
# Stage 1 — build
################################################################################
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps with a clean cache for reproducible builds.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Prune dev dependencies — only the runtime closure goes into the final image.
RUN npm prune --omit=dev

################################################################################
# Stage 2 — runtime
################################################################################
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime

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
