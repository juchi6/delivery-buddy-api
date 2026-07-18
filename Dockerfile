# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage Dockerfile for Delivery Buddy API
# NestJS 11 + Prisma 7 + ioredis (bcrypt native module)
#
# Stage 1 — builder   : installs all deps (including devDeps for nest build),
#                        generates the Prisma client, compiles TypeScript.
# Stage 2 — production: slim runtime image; copies compiled output + deps from
#                        builder, runs as a non-root user.
#
# NOTE — prisma CLI in devDependencies
#   `prisma migrate deploy` is required at container startup. Because the `prisma`
#   CLI package lives in devDependencies (standard NestJS scaffold convention),
#   we copy the FULL node_modules from the builder rather than pruning. In a
#   production project the fix is to move `prisma` to dependencies so a clean
#   `npm ci --omit=dev` install retains the CLI. For this assessment the full
#   copy is the pragmatic choice and is documented here explicitly.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install & build ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

# python3 / make / g++ are needed to compile bcrypt's native C++ bindings.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package manifests first — Docker caches this layer until they change,
# so unchanged dependencies don't trigger a full reinstall on every build.
COPY package*.json ./

# Copy Prisma schema, config, and migrations before npm ci so that the
# postinstall hook (`prisma generate`) can find schema.prisma.
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install all dependencies (dev included — required for nest build).
RUN npm ci

# Generate the Prisma client so the TypeScript import resolves at build time.
RUN npx prisma generate

# Copy remaining source files and compile.
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS production

# dumb-init: a minimal PID-1 that forwards signals (SIGTERM, SIGINT) correctly
# to the Node.js process, enabling graceful shutdown inside a container.
RUN apk add --no-cache dumb-init

WORKDIR /app

# Create a non-root user and group for runtime security.
RUN addgroup --system --gid 1001 appgroup \
 && adduser  --system --uid 1001 --ingroup appgroup appuser

# ── Copy artefacts from builder ────────────────────────────────────────────────
# node_modules: full copy (includes prisma CLI — see NOTE at top).
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
# Compiled NestJS application.
COPY --from=builder --chown=appuser:appgroup /app/dist         ./dist
# Prisma schema + migrations (needed by `migrate deploy` at startup).
COPY --from=builder --chown=appuser:appgroup /app/prisma       ./prisma
# Prisma 7 TypeScript config (the CLI picks this up automatically at startup).
COPY --from=builder --chown=appuser:appgroup /app/prisma.config.ts ./
# package.json gives Prisma the project name and engines metadata at runtime.
COPY --chown=appuser:appgroup package*.json ./

USER appuser

# PORT is injected by the platform (Railway/Render). Defaults to 3000.
EXPOSE ${PORT:-3000}

# dumb-init wraps the CMD so signals are forwarded to the Node process.
ENTRYPOINT ["dumb-init", "--"]

# Startup sequence:
#   1. Apply any pending migrations (`migrate deploy` is a no-op when up to date).
#   2. Boot the compiled NestJS app.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main"]
