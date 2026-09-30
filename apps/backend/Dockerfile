# Production image for the smartbudget backend (Express API) on Cloud Run.
#
# Build from the REPO ROOT (npm-workspaces monorepo; the root .dockerignore
# allowlists the build context and keeps every .env file out):
#   docker build -f apps/backend/Dockerfile -t smartbudget-backend .
# For Cloud Run (x86_64) from an Apple Silicon Mac:
#   docker buildx build --platform linux/amd64 -f apps/backend/Dockerfile -t <region>-docker.pkg.dev/<project>/<repo>/backend:<tag> --push .
#
# Secrets are NEVER baked in: pass them at run time (Cloud Run env vars /
# Secret Manager, or `docker run --env-file apps/backend/.env` locally).
#
# Base: node:20-alpine. Every runtime dependency is pure JavaScript (express,
# supabase-js, @anthropic-ai/sdk, ws, cors, dotenv, express-rate-limit), so
# musl vs glibc is irrelevant and alpine is the smallest official Node 20
# base (~45 MB compressed vs ~70 MB for node:20-slim). Switch NODE_IMAGE to
# node:20-slim if a native (glibc-only) dependency is ever added.
# Plain Dockerfile syntax only (no RUN --mount): works with the legacy
# builder, BuildKit and Cloud Build alike.

ARG NODE_IMAGE=node:20-alpine

# ---------------------------------------------------------------- build ----
# Full install (incl. TypeScript) + compile backend and shared package.
FROM ${NODE_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN npm ci --workspace=apps/backend --workspace=packages/shared \
      --ignore-scripts --no-audit --no-fund

COPY packages/shared/ packages/shared/
COPY apps/backend/ apps/backend/

# Shared: today dev/Jest run it as .ts via ts-node. Compile it to CommonJS at
# the same relative paths (lib/*.js, src/**/*.js) so the backend's
# `require('@smartbudget/shared/lib/supabase')` resolves to plain JS, and
# point package.json main at the compiled entry.
RUN npx tsc -p packages/shared/tsconfig.build.json \
 && cp packages/shared/package.json packages/shared/dist/ \
 && cd packages/shared/dist \
 && npm pkg set main=src/index.js \
 && npm pkg delete types devDependencies

# Backend: dist/ without tests (tsconfig.build.json).
RUN npx tsc -p apps/backend/tsconfig.build.json

# ----------------------------------------------------------------- deps ----
# Production dependencies only, for the backend workspace (and the shared
# package it depends on). No dev deps, no ts-node, no TypeScript.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN npm ci --workspace=apps/backend --omit=dev \
      --ignore-scripts --no-audit --no-fund \
 && mkdir -p apps/backend/node_modules \
 && npm cache clean --force

# -------------------------------------------------------------- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    DOTENV_CONFIG_QUIET=true
WORKDIR /app

# Files stay root-owned (read-only for the app user); the process runs as
# the image's built-in unprivileged `node` user.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY apps/backend/package.json ./apps/backend/

USER node
WORKDIR /app/apps/backend
EXPOSE 8080
# Cloud Run: probe GET /health (no auth, no Supabase/Claude calls).
CMD ["node", "dist/index.js"]
