# Module Build Sequence — Delivery Buddy API

**Companion to:** `Backend_API_Implementation_Playbook.md`
**Purpose:** a copy-paste-ready sequence of Antigravity prompts, one per module, in strict dependency order. Run these as **separate agent conversations**, one at a time — don't start the next step until the current one's checklist passes. This is Section 6.2/6.3 of the main playbook, operationalized.

**Before you start each step:** open a fresh Antigravity conversation and make sure `@Backend_API_Implementation_Playbook.md` is in the project so you can `@mention` it.

**Commit convention** — every step ends with a commit + push using this message, so your GitHub history reads as one commit per module:

| Step | Commit message |
|---|---|
| 0 | `chore: initial NestJS scaffold + Prisma schema + docker-compose` |
| 1 | `feat(common): config, validation, exception filter, cache service, health check` |
| 2 | `feat(auth): signup/login/refresh/logout with JWT guard` |
| 3 | `feat(drivers): profile, onboarding, teams (cached)` |
| 4 | `feat(shifts): shift lifecycle with conflict handling` |
| 5 | `feat(deliveries): delivery lifecycle, route provider, caching` |
| 6 | `feat(wallet): balance, transactions, withdraw` |
| 7 | `feat(chat): delivery message threads` |
| 8 | `feat(notifications): notification list + read state` |
| 9 | `test: final integration pass, endpoint audit, full suite green` |
| 10 | `feat(cache): fail-open behavior + TTL hardening` |
| 11 | `test: edge-case coverage + CI workflow (GitHub Actions)` |
| 12 | `chore: production Dockerfile` |
| 13 | `docs: live URL, Swagger path, and deploy instructions in README` |

---

## Step -1 — One-Time GitHub Setup

Do this once, before Step 0.

**1. Create the remote repo**
Go to github.com → **New repository** → name it `delivery-buddy-api` → **Public** → do **not** initialize with a README/.gitignore/license (your project folder will already have files) → **Create repository**. Copy the URL it gives you, e.g. `https://github.com/<you>/delivery-buddy-api.git`.

If you have the GitHub CLI installed and already logged in (`gh auth status`), you can skip the website and just have the agent run `gh repo create delivery-buddy-api --public --source=. --remote=origin` instead — same result.

**2. Add a `.gitignore` before your first commit** (so `node_modules`, secrets, and build output never get pushed):
```
node_modules/
dist/
.env
*.log
coverage/
.DS_Store
```

**3. Wire the local repo to the remote** — this happens as the last part of Step 0 below, once the scaffold exists.

---

## Step 0 — Project Scaffold + Prisma Schema

**Depends on:** nothing (this is the foundation).

**Prompt:**
> Initialize a new NestJS (TypeScript) project called `delivery-buddy-api`. Add Prisma with a PostgreSQL datasource. Using the domain model in @Backend_API_Implementation_Playbook.md Section 3.1 (entities) and 3.2 (relationships), write the complete `prisma/schema.prisma` covering `Driver`, `Team`, `Shift`, `Delivery`, `OrderItem`, `Transaction`, `Message`, `Notification`, and `BillingMethod`, with correct foreign keys, enums (`TransportationType`, `DeliveryStatus`, `TransactionType`, `MessageSenderType`), and sensible `@@index`/`@@unique` constraints. Add a `docker-compose.yml` with Postgres and Redis services for local development, a `.env.example` listing `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`, and a `.gitignore` covering `node_modules/`, `dist/`, `.env`, `*.log`, `coverage/`. Do not write any application/module code yet — schema and infra only.

**Before advancing, confirm:**
- [ ] `docker-compose up -d` brings up Postgres + Redis cleanly
- [ ] `npx prisma migrate dev --name init` runs without error
- [ ] Every entity from Section 3.1 exists in the schema with the right relations
- [ ] **Git init + first push:** ask the agent to run `git init && git add -A && git commit -m "chore: initial NestJS scaffold + Prisma schema + docker-compose" && git branch -M main && git remote add origin <your-repo-url> && git push -u origin main`

---

## Step 1 — `common/` Foundation

**Depends on:** Step 0 (schema must exist).

**Prompt:**
> Using @Backend_API_Implementation_Playbook.md Section 5 (Global Architecture Recommendations) and Section 7.3.5 (Prompt 6 — cache service), build the `common/` layer: a global `ValidationPipe` in `main.ts` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`); an `HttpExceptionFilter` returning the `{ statusCode, message, error }` shape on every error; a `PrismaModule`/`PrismaService` wrapping `PrismaClient` as an injectable with connection lifecycle hooks; a `ConfigModule` setup validated at boot with a Joi schema for `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT` (throw a clear error naming the missing var if validation fails); and a `CacheModule`/`CacheService` wrapping `cache-manager` + Redis with `get<T>`, `set<T>`, and `invalidate` methods. Add a `GET /health` endpoint that checks Postgres and Redis connectivity and returns 503 if either is down. Wire all of this into `AppModule`. No feature modules yet.

**Before advancing, confirm:**
- [ ] `npm run start:dev` boots cleanly
- [ ] `GET /health` returns 200 with both dependencies confirmed reachable
- [ ] Deleting a required env var causes a clear startup failure, not a silent one
- [ ] **Commit + push:** `git add -A && git commit -m "feat(common): config, validation, exception filter, cache service, health check" && git push`

---

## Step 2 — `auth/`

**Depends on:** `common/` (config, exception filter, Prisma).

**Prompt:**
> Build the `auth` module for a NestJS + Prisma app, following clean architecture (DTO → repository → service → controller → module per @Backend_API_Implementation_Playbook.md Section 7.2.4). Implement `POST /api/v1/auth/signup`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` against the `Driver` entity. Hash passwords with bcrypt. Issue a JWT access token (short-lived, e.g. 15m) and a refresh token (long-lived, e.g. 7d) on login/signup. Build a `JwtAuthGuard` applied globally in `AppModule`, plus a `@Public()` decorator + custom `Reflector` check so `/auth/*` routes opt out of it (per Section 7.2.6). Add full `@nestjs/swagger` decorators. Never return the password hash in any response — use a response DTO. Write unit tests for `AuthService` (duplicate email on signup, wrong password on login, expired/invalid refresh token) and e2e tests for all four endpoints.

**Before advancing, confirm:**
- [ ] Can signup + login via `/api/docs` (Swagger UI) and receive a valid JWT
- [ ] A protected route (temporarily test with `/health` if you removed `@Public()` from it, or any dummy route) rejects requests with no token
- [ ] Unit + e2e tests pass
- [ ] **Commit + push:** `git add -A && git commit -m "feat(auth): signup/login/refresh/logout with JWT guard" && git push`

---

## Step 3 — `drivers/` (profile, onboarding, teams)

**Depends on:** `auth/` (JwtAuthGuard, authenticated driver context), `common/` (CacheService).

**Prompt:**
> Build the `drivers` module. Implement `GET /api/v1/teams` (cached via `CacheService`, 3600s TTL, cache-aside pattern per @Backend_API_Implementation_Playbook.md Section 7.3.5 Prompt 6). Implement onboarding per Section 7.2.5 Prompt 4: `PATCH /api/v1/drivers/me/onboarding` accepting a partial DTO (workId, firstName, lastName, teamId, transportationType enum, vehicleNumber — all optional but validated when present) that upserts only provided fields, plus `GET /api/v1/drivers/me/onboarding-status` reporting which required fields are still missing. Implement `GET /api/v1/drivers/me` and `PATCH /api/v1/drivers/me` for profile editing, returning level/commissionRate/transportationType as shown on the profile screen. Add stub endpoints `GET/PATCH /api/v1/drivers/me/billing-method`, `GET/PATCH /api/v1/drivers/me/notification-settings`, and `GET /api/v1/drivers/me/fuel-settings` returning a "not yet configured" placeholder shape (per Section 2.6 — fuel management is out of scope for full implementation). All routes require a valid JWT and resolve `driverId` from the token, never from a request param. Add Swagger decorators and unit + e2e tests.

**Before advancing, confirm:**
- [ ] `onboarding-status` correctly reflects which fields are still missing after a partial update
- [ ] Second call to `GET /teams` hits the cache, not the database (check via Prisma query logging)
- [ ] Driver can only ever read/edit their own profile (id comes from the JWT, not the URL)
- [ ] **Commit + push:** `git add -A && git commit -m "feat(drivers): profile, onboarding, teams (cached)" && git push`

---

## Step 4 — `shifts/`

**Depends on:** `drivers/` (an onboarded, authenticated driver).

**Prompt:**
> Build the `shifts` module exactly as specified in @Backend_API_Implementation_Playbook.md Section 7.2.5 Prompt 3: `StartShiftDto` (empty body), a `ShiftsRepository` wrapping `PrismaService`, a `ShiftsService` with `startShift(driverId)`, `stopShift(shiftId)`, `getCurrentShift(driverId)`, `getShiftHistory(driverId)` — throw `ConflictException` if a driver tries to start a shift while one is already active, throw `NotFoundException` if stopping a shift that doesn't belong to the driver. Build the `ShiftsController` with JWT-guarded routes matching Section 8's endpoint table (`POST /api/v1/shifts/start`, `POST /api/v1/shifts/:id/stop`, `GET /api/v1/shifts/me/current`, `GET /api/v1/shifts/me/history`). Full Swagger decorators, inline comments on the business rules, and unit + e2e tests per Section 7.4.5 Prompt 8's coverage list.

**Before advancing, confirm:**
- [ ] Starting a second shift while one is active returns 409, not a silent success
- [ ] Stopping a shift correctly totals `earnings`/`tips`/`deliveriesCompleted` from its linked deliveries (even if that total is 0 for now — `deliveries/` doesn't exist yet)
- [ ] Unit + e2e tests pass
- [ ] **Commit + push:** `git add -A && git commit -m "feat(shifts): shift lifecycle with conflict handling" && git push`

---

## Step 5 — `deliveries/`

**Depends on:** `shifts/` (deliveries link to an active shift), `common/` (CacheService).

**Prompt (part A — mocked provider):**
> Per @Backend_API_Implementation_Playbook.md Section 7.2.5 Prompt 5 and Section 7.3.5 Prompt 7: create a `RouteProvider` interface exposing `getRoute(pickup: LatLng, destination: LatLng): Promise<{ etaMinutes: number; distanceKm: number; polyline: string; trafficAlert: string | null }>`, a `MockRouteProvider` implementation using the haversine formula for deterministic values, and a `CachedRouteProvider` decorator that checks `CacheService` for a `route:{deliveryId}` key (30s TTL) before calling the inner provider. Wire it via DI so consumers depend only on the `RouteProvider` interface token.

**Prompt (part B — the module):**
> Now build the `deliveries` module against the endpoints in Section 8: `GET /api/v1/deliveries/me/current`, `GET /api/v1/deliveries/me/next`, `GET /api/v1/deliveries/:id` (include `OrderItem`s and computed `lineTotal` per item), `PATCH /api/v1/deliveries/:id/status` (validate legal status transitions — pending → in_progress → at_door → delivered, reject skipping states), and `GET /api/v1/deliveries/:id/route` (using the `RouteProvider` from part A). Enforce that a driver can only access their own deliveries — throw `NotFoundException` (not `ForbiddenException`, to avoid leaking existence of other drivers' orders) if a driver requests a delivery that isn't theirs. Use Prisma `include`/`select` to avoid N+1 queries when loading delivery + items + driver together. Full Swagger decorators, unit + e2e tests covering the status-transition validation and the cross-driver access check.

**Before advancing, confirm:**
- [ ] Order item `lineTotal`s and the delivery total match what's shown in the order-detail mockup logic (base price + modifiers × quantity)
- [ ] Calling `/route` twice within 30s for the same delivery hits the cache (confirm via logging), not `MockRouteProvider` again
- [ ] Requesting another driver's delivery returns 404, not 200 with someone else's data
- [ ] Invalid status transition (e.g. `pending` → `delivered` directly) is rejected
- [ ] **Commit + push:** `git add -A && git commit -m "feat(deliveries): delivery lifecycle, route provider, caching" && git push`

---

## Step 6 — `wallet/`

**Depends on:** `deliveries/` (transactions reference deliveries).

**Prompt:**
> Build the `wallet` module. Create a mocked `PayoutProvider` interface (per Section 2.6) with a `withdraw(driverId, amount): Promise<{ success: boolean; reference: string }>` mock implementation. Implement `GET /api/v1/wallet/me` (balance + tips, derived by summing `Transaction` rows for the driver — earnings and tips add, withdrawals subtract), `GET /api/v1/wallet/me/transactions` (paginated, newest first), and `POST /api/v1/wallet/me/withdraw` (validate the requested amount does not exceed the current balance — throw `BadRequestException` if it does — then create a `withdrawal`-type `Transaction` row via `PayoutProvider`). Full Swagger decorators, unit tests (insufficient balance, successful withdrawal decrements balance correctly), e2e tests.

**Before advancing, confirm:**
- [ ] Withdrawing more than the current balance returns 400, not a negative balance
- [ ] Transaction list is correctly paginated and ordered newest-first
- [ ] Balance calculation matches the sum of all transactions exactly (write a test asserting this invariant)
- [ ] **Commit + push:** `git add -A && git commit -m "feat(wallet): balance, transactions, withdraw" && git push`

---

## Step 7 — `chat/`

**Depends on:** `deliveries/` (messages attach to a delivery).

**Prompt:**
> Build the `chat` module. Implement `GET /api/v1/deliveries/:id/messages` and `POST /api/v1/deliveries/:id/messages` against the `Message` entity (`senderType` enum: driver/customer/support, per Section 2.6's resolution of the chat-scope ambiguity). Only the delivery's assigned driver (or an internal "support" role, if you want to stub that concept) may read or post to a thread — return 404 for a driver requesting another driver's delivery thread, consistent with the `deliveries` module's pattern. Full Swagger decorators, unit + e2e tests including the cross-driver access check.

**Before advancing, confirm:**
- [ ] A driver cannot read or post into a delivery thread that isn't theirs
- [ ] Message list returns in chronological order
- [ ] **Commit + push:** `git add -A && git commit -m "feat(chat): delivery message threads" && git push`

---

## Step 8 — `notifications/` (small — do last among features)

**Depends on:** `drivers/`.

**Prompt:**
> Build a lightweight `notifications` module: `GET /api/v1/notifications/me` (paginated, newest first) and `PATCH /api/v1/notifications/:id/read`. JWT-guarded, driver can only touch their own notifications. Swagger decorators, unit + e2e tests.

**Before advancing, confirm:**
- [ ] Marking as read persists and reflects in the next `GET`
- [ ] **Commit + push:** `git add -A && git commit -m "feat(notifications): notification list + read state" && git push`

---

## Step 9 — Final Integration Pass

**Depends on:** every module above.

**Prompt:**
> Review the entire codebase against @Backend_API_Implementation_Playbook.md Section 8 (Master Endpoint Reference). List any endpoint from that table that is missing or has a mismatched path/method. Then verify `/api/docs` (Swagger) renders every implemented endpoint with request/response examples and no endpoint returns a raw Prisma entity (check specifically for password hashes or internal-only fields leaking through). Run the full test suite (`npm test` and `npm run test:e2e`) and report any failures.

**Before moving on to Task 3/4/5 hardening:**
- [ ] Every row in Section 8's table is implemented
- [ ] Full test suite green
- [ ] No raw ORM entities in any response
- [ ] **Commit + push:** `git add -A && git commit -m "test: final integration pass, endpoint audit, full suite green" && git push`

---

## Step 10 — Harden Caching (Task 3)

**Depends on:** Step 9 (all modules, including the caching added in-line at Steps 1/3/5).

You already have a working cache — `CacheService`, teams cached at 3600s, route data cached at 30s via `CachedRouteProvider`. What's missing is resilience: right now, if Redis goes down, does the API 500, or does it fall through to the database/provider? Section 7.3.8 of the playbook calls this out as a risk.

**Prompt:**
> Per @Backend_API_Implementation_Playbook.md Section 7.3.6 and 7.3.8: harden `CacheService` so that any Redis error (connection refused, timeout) is caught internally, logged as a warning, and causes `get()` to return `null` (a cache miss) rather than throwing — so every caller that already has cache-aside logic (teams lookup, route provider) automatically falls through to the database/provider on a Redis outage instead of failing the request. Do the same for `set()` and `invalidate()` — swallow and log, never let a cache write failure break the response. Write a test that mocks the Redis client to throw on every call and asserts `GET /teams` and `GET /deliveries/:id/route` both still return 200 with correct data (just uncached). Also confirm and document the two TTLs currently in use (teams: 3600s, route: 30s) in a comment block explaining the reasoning.

**Before advancing, confirm:**
- [ ] Simulate Redis being unreachable (stop the container: `docker compose stop redis`) and confirm `GET /teams` and `GET /deliveries/:id/route` still return 200, just slower
- [ ] `GET /health` correctly reports Redis as down (503 or a partial-status field) even while the rest of the API keeps working
- [ ] Restart Redis (`docker compose start redis`) and confirm caching resumes
- [ ] **Commit + push:** `git add -A && git commit -m "feat(cache): fail-open behavior + TTL hardening" && git push`

---

## Step 11 — Test Hardening + CI (Task 4)

**Depends on:** Step 10.

Each module already got unit + e2e tests as it was built. This step closes the specific gaps Task 4 calls out by name — edge cases, failure scenarios, and CI — per Section 7.4.7's coverage table.

**Prompt (part A — edge cases):**
> Review the existing test suite against this coverage list from @Backend_API_Implementation_Playbook.md Section 7.4.7 and add any missing test: empty transaction list on `GET /wallet/me/transactions` for a brand-new driver; withdrawing more than the current balance; starting a shift while one is already active; a delivery with zero `OrderItem`s; an invalid enum value sent to `PATCH /deliveries/:id/status`; a plausible SQL-injection-style string (e.g. `' OR 1=1 --`) submitted in a text field like `firstName`, asserting the request returns a normal 400/200 (not a 500, and not actually executing as SQL, since Prisma parameterizes queries). Report which of these were already covered and which you added.

**Prompt (part B — CI):**
> Per Section 7.4.5 Prompt 10: write a GitHub Actions workflow (`.github/workflows/ci.yml`) that spins up Postgres and Redis service containers, runs `npm ci`, `npx prisma migrate deploy`, `npm run test`, and `npm run test:e2e` on every push and pull request to `main`, failing the job if anything fails. Add the resulting status badge markdown snippet to the top of `README.md`.

**Before advancing, confirm:**
- [ ] Every item in the edge-case list above has a passing test
- [ ] Push a commit and confirm the GitHub Actions workflow actually runs (check the Actions tab on your repo) and goes green
- [ ] CI badge renders correctly at the top of `README.md`
- [ ] **Commit + push:** `git add -A && git commit -m "test: edge-case coverage + CI workflow (GitHub Actions)" && git push`

---

## Step 12 — Production Dockerfile (Task 5, part 1)

**Depends on:** Step 11 (CI green — don't containerize code that isn't verified).

**Prompt:**
> Per @Backend_API_Implementation_Playbook.md Section 7.5.5 Prompt 11: write a multi-stage Dockerfile for this NestJS + Prisma app. Stage 1 installs dependencies and runs `npm run build`. Stage 2 is a slim `node:20-alpine` runtime image copying only the built `dist/`, production `node_modules`, and `prisma/` (needed for `prisma migrate deploy` at container start). Add a non-root user for runtime. Read the app port from an env var (default 3000). Set `CMD` to run `npx prisma migrate deploy && node dist/main.js`. Also confirm the `GET /health` endpoint and the Joi/zod config validation from Step 1 are both still intact — Task 5 depends on both (health checks for the platform, fail-fast config for catching a missing env var immediately instead of a mysterious runtime failure).

**Before advancing, confirm:**
- [ ] `docker build -t delivery-buddy-api .` succeeds locally
- [ ] `docker run --env-file .env -p 3000:3000 delivery-buddy-api` boots and `GET /health` responds correctly from inside the container's network
- [ ] Removing a required env var from the container run causes an immediate, clear startup failure — not a silent crash later
- [ ] **Commit + push:** `git add -A && git commit -m "chore: production Dockerfile" && git push`

---

## Step 13 — Provision, Deploy, and Document (Task 5, part 2)

**Depends on:** Step 12.

This step is mostly dashboard work outside the agent — Antigravity can write the config, but you have to click through the hosting provider yourself.

**Going with AWS (App Runner + RDS + ElastiCache)?** Use `AWS_Deployment_Guide.md` instead of the Render walkthrough below — it covers the VPC connector, security groups, RDS/ElastiCache provisioning, and ECR push in full detail, then rejoins this checklist at the bottom.

**1. Provision on Railway (or Render):**
- Create a new project, connect it to your GitHub repo (`delivery-buddy-api`).
- Add a **Postgres** and a **Redis** add-on/plugin from the platform's marketplace — this gives you managed `DATABASE_URL`/`REDIS_URL` values automatically.
- In the service's environment variables, set `JWT_SECRET` (generate a real random secret, don't reuse your local dev one) and `PORT` if the platform requires you to set it explicitly (Railway usually injects this itself).
- Trigger a deploy from the `main` branch.

**2. Smoke test the live URL** once it's up:
- `GET https://<your-app>.up.railway.app/health` → should return 200
- `GET https://<your-app>.up.railway.app/api/docs` → Swagger UI should load
- Use Swagger UI to sign up a demo driver and hit one authenticated endpoint end-to-end

**Prompt (README update):**
> Per Section 7.5.5 Prompt 13: write the "Setup, Run, Test, and Deploy" section of `README.md`. Include prerequisites, local setup steps (clone, install, `.env` from `.env.example`, `docker compose up -d`, `prisma migrate dev`, `npm run start:dev`), how to run tests, and the deployment section listing required environment variables (names only, no real values) plus the live base URL `https://<your-app>.up.railway.app` and the Swagger docs path `/api/docs`. Note that a free-tier deploy may cold-start slowly on the first request after inactivity.

**Before calling the whole playbook done, confirm (Section 10's Definition of Done):**
- [ ] Live URL responds to `/health` and `/api/docs` publicly
- [ ] README documents the live URL, required env vars, and setup/run/test/deploy steps
- [ ] Repo is public
- [ ] CI badge is green in the README
- [ ] **Commit + push:** `git add -A && git commit -m "docs: live URL, Swagger path, and deploy instructions in README" && git push`

---

## Notes on the commit workflow

- **Let the agent run the git commands** — since it has terminal access in Antigravity, just add the "Commit + push" line to the same conversation once the checklist above it passes, e.g.: *"All checks pass. Stage all changes, commit with message 'feat(auth): signup/login/refresh/logout with JWT guard', and push to origin main."* You don't need to switch to a terminal yourself.
- **Never commit `.env`** — only `.env.example`. The `.gitignore` from Step 0 handles this, but do a quick `git status` glance before your first push to be sure a real secret didn't sneak in.
- **One module = one commit** is intentional — it gives the evaluator (and you) a clean, readable history that maps directly onto Section 6.2's dependency order, which doubles as evidence of a structured build process.
- If a module's tests fail after you thought it was done, just amend and re-push rather than adding a string of "fix typo" commits: `git add -A && git commit --amend --no-edit && git push --force-with-lease`.

---

*Once Step 9 passes, you're through Task 2 of the main playbook in full. Steps 10–13 above take you through Task 3 (caching hardening), Task 4 (test hardening + CI), and Task 5 (deployment) in the same one-step-at-a-time, one-commit-per-step format. Once Step 13's checklist is green, cross-check the whole repo one final time against Section 10 (Overall Definition of Done) of the main playbook — every row there should now be checked off.*
