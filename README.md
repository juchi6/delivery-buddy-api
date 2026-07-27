# Delivery Buddy API

[![CI](https://github.com/juchi6/delivery-buddy-api/actions/workflows/ci.yml/badge.svg)](https://github.com/juchi6/delivery-buddy-api/actions/workflows/ci.yml)

A production-ready REST API backend for a last-mile delivery driver application. Built as a backend engineering internship assessment, it powers all driver-facing screens — from onboarding and shift management through real-time delivery tracking, in-app chat, wallet/earnings, and push notifications.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | NestJS 11 (TypeScript) |
| ORM | Prisma 7 (driver-adapter mode) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 via ioredis |
| Auth | JWT (access + refresh tokens), bcrypt |
| Validation | class-validator / class-transformer, Joi config schema |
| API Docs | Swagger / OpenAPI (`@nestjs/swagger`) |
| Testing | Jest 30 — unit tests + supertest e2e tests |
| CI | GitHub Actions |
| Containerisation | Docker (multi-stage build), docker-compose |

---

## Features

### Auth
- `POST /api/v1/auth/signup` — register a new driver account
- `POST /api/v1/auth/login` — returns access + refresh JWT pair
- `POST /api/v1/auth/refresh` — rotate tokens using a valid refresh token
- `POST /api/v1/auth/logout` — invalidate the current session

### Driver Profile & Onboarding
- `GET  /api/v1/drivers/me` — fetch full driver profile
- `PATCH /api/v1/drivers/me` — update editable profile fields
- `PATCH /api/v1/drivers/me/onboarding` — set team, transport type, vehicle number
- `GET  /api/v1/drivers/me/onboarding-status` — returns completed/missing fields and `isComplete` flag
- `GET  /api/v1/teams` — list all selectable teams (Redis-cached, 1-hour TTL)

### Shifts
- `POST /api/v1/shifts/start` — start a new shift
- `POST /api/v1/shifts/:id/stop` — end an active shift
- `GET  /api/v1/shifts/me/current` — current active shift
- `GET  /api/v1/shifts/me/history` — paginated shift history

### Deliveries
- `GET  /api/v1/deliveries/me/current` — active delivery for the driver
- `GET  /api/v1/deliveries/me/next` — next queued delivery
- `GET  /api/v1/deliveries/:id` — delivery detail with order items
- `PATCH /api/v1/deliveries/:id/status` — update delivery status
- `GET  /api/v1/deliveries/:id/route` — ETA + distance remaining (Redis-cached, 30-second TTL)

### In-App Chat
- `GET  /api/v1/deliveries/:id/messages` — chronological message thread for a delivery
- `POST /api/v1/deliveries/:id/messages` — send a message (`senderType` is always `DRIVER`, set from the JWT)

### Wallet & Earnings
- `GET  /api/v1/wallet/me` — current balance
- `GET  /api/v1/wallet/me/transactions` — paginated earnings/tips/withdrawals history
- `POST /api/v1/wallet/me/withdraw` — request a withdrawal

### Notifications
- `GET  /api/v1/notifications/me` — paginated notification list, newest first
- `PATCH /api/v1/notifications/:id/read` — mark a notification as read (idempotent)

### Infrastructure
- `GET  /health` — liveness probe; reports postgres + redis status; returns `503` if either is unreachable

All routes except `/auth/*` and `/health` are protected by a global JWT guard. Cross-driver resource access returns `404` (not `403`) to avoid leaking existence.

---

## The Process

The API was designed module-by-module following the domain entities in the schema:

1. **Schema first** — a single Prisma schema captures all domain models (Driver, Shift, Delivery, Message, Transaction, Notification) with indexes on every FK and common query pattern.
2. **Repository → Service → Controller** — each module is fully self-contained with no cross-module ORM leakage; controllers never touch Prisma directly.
3. **Global auth guard** — `JwtAuthGuard` is registered at the app level via `APP_GUARD`; individual routes opt out with `@Public()` rather than opting in.
4. **Fail-open caching** — every `CacheService` method wraps ioredis calls in try/catch and returns safe defaults (`null` / `void` / `false`) so a Redis outage degrades gracefully rather than returning 500s.
5. **Test pyramid** — unit tests mock the repository layer; e2e tests run against a real PostgreSQL + Redis instance using the same docker-compose stack as local dev. E2e suites run serially (`maxWorkers: 1`) to avoid connection exhaustion.
6. **Production Dockerfile** — multi-stage build: stage 1 compiles TypeScript and generates the Prisma client; stage 2 is a slim Alpine runtime running as a non-root user under `dumb-init` for correct signal forwarding. `prisma migrate deploy` runs at container startup.
7. **CI** — GitHub Actions runs the full test suite (unit + e2e) on every push and PR to `main`, with PostgreSQL 16 and Redis 7 service containers matching the local dev stack exactly.

---

## Running the Project Locally

### Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL + Redis)

### 1. Clone and install

```bash
git clone https://github.com/juchi6/delivery-buddy-api.git
cd delivery-buddy-api
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` match the docker-compose credentials — no edits needed for local dev.

### 3. Start the database and cache

```bash
docker-compose up -d
```

This spins up:
- **PostgreSQL 16** on `localhost:5433`
- **Redis 7** on `localhost:6379`

### 4. Run migrations and seed

```bash
npx prisma migrate deploy
npx prisma db seed
```

The seed populates the `teams` table (Alpha, Beta, Gamma, Delta Team) which the onboarding flow requires.

### 5. Start the API

```bash
# development (watch mode)
npm run start:dev

# or production build
npm run build && npm run start:prod
```

The server starts on `http://localhost:3000`.

### 6. Explore the API

Swagger UI — full interactive docs:

```
http://localhost:3000/api/docs
```

Health check:

```
http://localhost:3000/health
```

**To authenticate in Swagger:**
1. `POST /api/v1/auth/signup` with the body below to create a driver account
2. `POST /api/v1/auth/login` with the same credentials — copy the `accessToken` from the response
3. Click **Authorize** at the top of the Swagger page, paste `Bearer <accessToken>`, confirm

Example signup body:
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "password": "password123",
  "workId": "WK-001"
}
```

---

## Running with Docker

Stop the local dev server first if it's running on port 3000, then build and run the production image against the docker-compose services:

```bash
docker build -t delivery-buddy-api .

docker run --env-file .env \
  -e DATABASE_URL="postgresql://delivery_buddy:delivery_buddy_secret@host.docker.internal:5433/delivery_buddy_db?schema=public" \
  -e REDIS_URL="redis://host.docker.internal:6379" \
  -p 3000:3000 \
  delivery-buddy-api
```

> `host.docker.internal` resolves to the host machine from inside the container (Docker Desktop on Mac/Windows). On Linux use `--network host` and `localhost` instead.

---

## Running Tests

Ensure docker-compose services are running before running e2e tests.

```bash
# Unit tests
npm test

# E2e tests
npm run test:e2e

# Coverage report
npm run test:cov
```

---

## Project Structure

```
src/
├── auth/              # JWT signup, login, refresh, logout
├── chat/              # Delivery message threads
├── common/
│   ├── cache/         # ioredis wrapper (fail-open)
│   └── decorators/    # @Public(), @CurrentDriver()
├── config/            # Joi env-var validation schema
├── deliveries/        # Delivery detail, status, route
├── drivers/           # Profile, onboarding, teams
├── health/            # Liveness probe
├── notifications/     # In-app notifications
├── prisma/            # PrismaService + PrismaModule
├── shifts/            # Shift start/stop/history
└── wallet/            # Balance, transactions, withdrawal
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Secret for signing JWTs |
| `JWT_ACCESS_EXPIRES_IN` | No | Access token TTL (default `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | No | Refresh token TTL (default `7d`) |
| `PORT` | No | HTTP port (default `3000`) |
