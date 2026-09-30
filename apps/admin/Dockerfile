# Production image for the smartbudget admin dashboard (Next.js standalone)
# on Cloud Run.
#
# Build from the REPO ROOT (npm-workspaces monorepo; the root .dockerignore
# allowlists the build context and keeps every .env file out).
#
# NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time —
# setting them on the Cloud Run service at run time has NO effect. Pass them
# as build args and build ONE IMAGE PER ENVIRONMENT (staging, production):
#
#   docker build -f apps/admin/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD=50 \
#     --build-arg NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT=2000 \
#     -t smartbudget-admin:production .
#
# For Cloud Run (x86_64) from an Apple Silicon Mac add
# `docker buildx build --platform linux/amd64 ... --push`.
# These values are public (they ship to every browser): never pass secrets
# as NEXT_PUBLIC_* build args.
#
# Base: node:20-alpine, same reasoning as the backend (no native runtime
# deps; smallest official Node 20 base). Next's SWC compiler has musl
# builds, used only in the build stage. Plain Dockerfile syntax only.

ARG NODE_IMAGE=node:20-alpine

# ---------------------------------------------------------------- build ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
# Optional platform packages (e.g. @next/swc-linux-*-musl) must be installed,
# so no --omit=optional; --ignore-scripts is safe (Next needs no postinstall).
RUN npm ci --workspace=apps/admin --ignore-scripts --no-audit --no-fund

COPY apps/admin/ apps/admin/

ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD
ARG NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD=${NEXT_PUBLIC_CLAUDE_MONTHLY_BUDGET_USD} \
    NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT=${NEXT_PUBLIC_CLAUDE_DAILY_CALL_LIMIT} \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/admin
RUN npx next build

# -------------------------------------------------------------- runtime ----
# Only the traced standalone server + static assets; no npm install here.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# outputFileTracingRoot is the monorepo root, so the standalone tree mirrors
# it: server.js lives at apps/admin/server.js.
COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
# (no apps/admin/public directory exists today; copy it here if one is added)
# App files stay root-owned/read-only; only Next's runtime cache is writable.
RUN mkdir -p apps/admin/.next/cache && chown node:node apps/admin/.next/cache

USER node
EXPOSE 8080
CMD ["node", "apps/admin/server.js"]
