# Backend API Internship Assessment — Implementation Playbook

**Prepared for:** Jenni
**Target environment:** Antigravity IDE + Claude (coding assistant)
**Source document:** `Backend.pdf` (Backend API Internship Assessment brief + "Delivery Buddy" Design Guide)

---

## 0. How to Use This Playbook

This is a step-by-step build guide for the assessment in `Backend.pdf`. Each of the five tasks in the brief is broken into: what's being asked, how to design it, how to build it in Antigravity, exact prompts to paste into Claude, architecture reasoning, a test plan, risks, and a done-checklist. Section 11 has a day-by-day schedule that fits the 5-day timeframe stated in the brief.

Work top to bottom — Section 3 (domain model) and Section 5 (architecture) are referenced by every task section that follows, so read those once before starting Task 1.

---

## 1. What the PDF Actually Contains

The brief has two parts:

1. **The assessment text** (pages 1–2): overview, 5 objectives, 5 tasks, deliverables list, and a 5-day timeframe.
2. **A "Design Guide"** (pages 3–4): UI mockups for a mobile app called **Delivery Buddy** — a courier/gig-driver app, not a customer-facing food-ordering app. The screens shown are: onboarding/login, a driver dashboard (idle and active shift states), a multi-step "personal info" onboarding form, a wallet/earnings screen with transaction history, a profile/settings screen, an order-detail screen, a live delivery-tracking/map screen, and an in-app chat screen.

There is no written API spec — the UI mockups **are** the requirements. Task 1 of the brief explicitly asks you to reverse-engineer a requirements spec and data model from them, so that's the starting point for everything else in this playbook.

---

## 2. Global Requirement Analysis

### 2.1 Functional requirements (from the brief)

| # | Requirement | Source |
|---|---|---|
| 1 | RESTful API that fulfills the data needs of every screen in the Design Guide | Objective 1 |
| 2 | Documented, versioned data schemas | Objective 2 |
| 3 | Written requirements spec + ERD/architecture diagrams | Objective 3, Task 1 |
| 4 | Automated unit + integration tests for core functionality | Objective 4, Task 4 |
| 5 | Public deployment with setup instructions | Objective 5, Task 5 |
| 6 | Swagger/OpenAPI docs for every endpoint | Task 2 |
| 7 | A caching/persistence strategy for frequently-reused data | Task 3 |

### 2.2 Functional requirements (inferred from the UI — see Section 3 for the full entity breakdown)

- Driver signup/login (email/password or work-ID based)
- Multi-step onboarding: work ID, name, team selection, transportation type (bicycle/car/truck), vehicle number
- Shift lifecycle: start shift, stop shift, view current shift stats, view last/past shifts
- Delivery lifecycle: view current delivery, view next delivery in queue, view order details (items, pricing, payment method), update delivery status (e.g., "at the door" → delivered)
- Live tracking data per delivery: ETA, distance remaining, route, traffic alerts
- Earnings: running balance, tips, per-delivery earning breakdown, transaction history, withdraw funds
- Profile/gamification: level, commission rate, transportation info, editable profile
- Settings: fuel management, billing method, location, notifications, support
- In-app messaging tied to a specific delivery (driver ↔ support/customer)

### 2.3 Non-functional requirements

- Request validation on all inputs (explicitly required by Task 4)
- Secrets/config via environment variables, never committed (Task 5)
- API must be reachable at a public base URL (Task 5)
- Reasonable response times for a mobile client — caching for anything hit repeatedly (Task 3)
- Documentation good enough that a third party (the evaluator) can run and test the API with no help

### 2.4 Inputs / Outputs / Dependencies

- **Inputs:** driver-submitted forms (onboarding, profile edits), shift start/stop actions, delivery status updates, chat messages, withdrawal requests
- **Outputs:** JSON responses per the OpenAPI spec you write in Task 1; real-time tracking/chat updates if you implement the live screens fully
- **External dependencies (likely, not explicit in the brief):** a maps/geocoding provider for distance, ETA, and traffic data (the tracking screen shows a live map, route line, and a "Traffic start 2 min away" alert); a payment/payout rail for the "Withdraw funds" action, if implemented for real rather than mocked

### 2.5 Constraints

- Node.js backend, framework of choice (Express or NestJS suggested)
- 5-day timeframe
- Solo deliverable — no team collaboration workflows required

### 2.6 Ambiguities in the brief — flagged, not guessed

The brief leaves several things open. Do not silently assume — pick one option below and **state your choice explicitly in the requirements spec deliverable**, so the evaluator sees you identified the gap.

| Ambiguity | Why it's ambiguous | Recommended default |
|---|---|---|
| Task 3 says cache "frequently used data (e.g. coin list)" | "Coin list" doesn't match anything in the Delivery Buddy UI — it reads like leftover boilerplate from a different (crypto-related) assessment template. | Treat it as a generic example of "any reference/lookup data hit on every request." Cache things that actually appear in this UI: teams list, transportation types, and third-party map/geocode responses. Say so explicitly in your spec so the evaluator sees you caught the mismatch rather than copying it blindly. |
| Is the map/routing data from a real third-party API (Google Maps, Mapbox) or mocked? | Brief never mentions a maps provider, but the tracking screen requires ETA, distance, route line, and traffic state. | Mock a `RouteProvider` interface with a fake implementation for the assessment; document that a real provider (Mapbox/Google Maps Directions API) would sit behind the same interface in production. This keeps the deliverable self-contained and free of paid API keys. |
| Is chat driver↔customer, driver↔support, or both? | The sample conversation in the mockup reads like driver-to-support (routing/order-return decision), but the icon set (phone + message on the tracking screen) implies driver↔customer too. | Model messages generically against a `deliveryId` with a `senderType` enum (`driver`, `customer`, `support`). Implement the driver↔support thread fully; stub the customer channel with the same schema. |
| Is "Withdraw funds" a real payout (Stripe Connect, bank transfer) or a ledger-only mock? | Brief doesn't mention a payment processor. | Mock it: create a `withdrawal` transaction row and decrement the ledger balance. Document that a real implementation would integrate Stripe Connect payouts or similar behind a `PayoutProvider` interface. |
| What is "Fuel Management" in Settings? | Only appears as an unlabeled menu item, no screen shown. | Treat as out-of-scope for full implementation; stub a placeholder endpoint (`GET /drivers/me/fuel-settings`) returning a "not yet configured" shape, and note this as an open question in the spec. |
| Auth mechanism | Not specified. | JWT access + refresh token pair, since the mobile client needs to stay logged in across app restarts. |
| "Team" field in onboarding | Shown as a dropdown, no options visible. | Model as a simple `Team` lookup table (id, name) seeded with placeholder values; flag as needing real business input. |

---

## 3. Inferred Domain Model

This is the data model you'll draw as an ERD in Task 1 and implement in Task 3. It's derived directly from the fields visible in the Design Guide screens.

### 3.1 Entities

| Entity | Key fields | Derived from screen |
|---|---|---|
| `Driver` | id, workId, firstName, lastName, email, passwordHash, teamId, transportationType (enum: bicycle/car/truck), vehicleNumber, level, commissionRate, avatarUrl, status | Onboarding form, profile/settings screen |
| `Team` | id, name | Onboarding "Choose team" dropdown |
| `Shift` | id, driverId, startedAt, endedAt, status (active/completed), earnings, tips, deliveriesCompleted | Dashboard idle/active states, "My last shift" |
| `Delivery` | id, orderNumber, status (pending/in_progress/at_door/delivered/cancelled), driverId, shiftId, pickupName, pickupAddress, destinationCustomerName, destinationAddress, destinationPhone, totalAmount, driverEarning, tipAmount, paymentMethod, eta, distanceRemainingKm, createdAt, deliveredAt | Order-detail screen, tracking screen, "Currently delivering" / "Next in the list" |
| `OrderItem` | id, deliveryId, name, basePrice, modifiersDescription, extraPrice, quantity, lineTotal | Order Info list (e.g. "Ham and Cheese Pizza 11 inch $12+2") |
| `Transaction` | id, driverId, deliveryId (nullable), type (earning/tip/withdrawal), amount, occurredAt | Wallet transaction list |
| `Message` | id, deliveryId, senderId, senderType (driver/customer/support), body, attachmentUrl, sentAt, seenAt | Chat screen |
| `Notification` | id, driverId, type, body, isRead, createdAt | Settings → Notifications menu item |
| `BillingMethod` | id, driverId, type, details (tokenized) | Settings → Billing method |

### 3.2 Relationships (ERD summary)

```
Team (1) ──< (N) Driver
Driver (1) ──< (N) Shift
Driver (1) ──< (N) Delivery
Shift (1) ──< (N) Delivery
Delivery (1) ──< (N) OrderItem
Delivery (1) ──< (N) Message
Driver (1) ──< (N) Transaction
Delivery (0..1) ──< (N) Transaction   (nullable FK — withdrawals have no delivery)
Driver (1) ──< (N) Notification
Driver (1) ──< (1) BillingMethod
```

Draw this as a proper ERD (dbdiagram.io, Mermaid, or draw.io) for the Task 1 deliverable — the block above is the content, not the final artifact.

---

## 4. Recommended Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **NestJS** (TypeScript) | Brief explicitly allows it; gives you DI, modules, guards, and decorators out of the box, which maps directly onto the Clean Architecture / SOLID requirements in the project instructions. Express is lighter but you'd hand-roll all of this. |
| Database | **PostgreSQL** | Relational data (drivers, shifts, deliveries, transactions) with real foreign keys — a better fit than MongoDB for this domain's integrity requirements. |
| ORM | **Prisma** | Fast to scaffold, generates types, has a built-in migration tool — good for a 5-day solo build. |
| Cache | **Redis** | Task 3 explicitly names it as an option; also the natural home for lookup-data caching and future rate-limiting. |
| Auth | **JWT** (access + refresh) via `@nestjs/passport` + `passport-jwt` | Stateless, mobile-friendly. |
| Realtime (optional stretch) | **Socket.IO** via `@nestjs/websockets` | Needed only if you implement live chat/tracking push updates rather than polling. |
| API docs | **`@nestjs/swagger`** | Auto-generates OpenAPI from decorators — satisfies Task 2's Swagger requirement with minimal extra work. |
| Testing | **Jest** + **Supertest** | Ships with NestJS's default project scaffold. |
| Deployment | **Railway** or **Render** | Free/cheap, trivial Postgres + Redis add-ons, matches the brief's suggested platforms. |

If you'd rather use plain Express, everything in this playbook still applies — swap NestJS modules/providers for Express routers/services and use `express-validator` + `swagger-jsdoc` instead of Nest's decorators. The domain model, endpoint list, and test plan don't change.

---

## 5. Global Architecture Recommendations

- **Clean Architecture / layered modules:** each domain area (`auth`, `drivers`, `shifts`, `deliveries`, `wallet`, `chat`) is its own Nest module with `controller → service → repository` layers. Controllers only handle HTTP concerns (validation, status codes); services hold business logic; repositories (Prisma) handle persistence. This keeps business logic testable without spinning up a database.
- **Repository pattern:** wrap Prisma calls behind repository classes/interfaces (e.g. `DeliveryRepository`) rather than injecting `PrismaService` directly into business logic. Makes it trivial to mock in unit tests and swap persistence later.
- **Dependency Injection:** use Nest's built-in DI container for everything — services, repositories, the mocked `RouteProvider` and `PayoutProvider` from Section 2.6. This is what makes "swap the mock for a real Mapbox client later" a one-line change instead of a rewrite.
- **DTO + validation:** every endpoint gets a request DTO with `class-validator` decorators (`@IsString()`, `@IsEnum()`, etc.) and a `ValidationPipe` applied globally. This directly satisfies Task 4's "correctness of request validation" test requirement.
- **Config management:** `@nestjs/config` loading from `.env`, with a typed config schema (`Joi` or `zod`) validated at boot so a missing env var fails fast instead of causing a runtime 500 later.
- **Logging:** structured logging (Nest's built-in `Logger`, or `pino` for JSON logs) — log request method/path/status/duration at minimum; log errors with stack traces server-side only, never in the response body.
- **Error handling:** a global `HttpExceptionFilter` that maps domain errors to consistent JSON error shapes (`{ statusCode, message, error }`), so every failure case in Task 4's test plan has one shape to assert against.
- **Security:** hash passwords with `bcrypt`; rate-limit auth endpoints (`@nestjs/throttler`); validate/whitelist all DTO fields (`forbidNonWhitelisted: true`) so extra fields in a request body are rejected, not silently accepted; never log secrets or full JWTs.

---

## 6. Antigravity IDE Global Workspace Plan

### 6.1 Folder structure

```
delivery-buddy-api/
├── src/
│   ├── auth/
│   ├── drivers/
│   ├── shifts/
│   ├── deliveries/
│   ├── wallet/
│   ├── chat/
│   ├── common/          # filters, pipes, guards, decorators
│   ├── config/
│   ├── prisma/
│   └── main.ts
├── prisma/
│   └── schema.prisma
├── test/
│   └── *.e2e-spec.ts
├── docs/
│   ├── requirements-spec.md
│   └── erd.png (or .mmd)
├── .env.example
├── README.md
└── package.json
```

### 6.2 Build order (file creation order)

1. `prisma/schema.prisma` — the whole data model first, since every module depends on it.
2. `common/` — global filters, pipes, guards, config module (shared by everything after).
3. `auth/` — nothing else works without login.
4. `drivers/` — onboarding + profile, depends on `auth`.
5. `shifts/` — depends on `drivers`.
6. `deliveries/` — the largest module; depends on `shifts`, introduces `RouteProvider` mock.
7. `wallet/` — depends on `deliveries` (transactions reference deliveries).
8. `chat/` — depends on `deliveries`.
9. `test/` — e2e specs, written alongside each module, not deferred to the end.

### 6.3 Keeping Claude focused in Antigravity

- **One module, one conversation.** Start a fresh Claude conversation per module (`auth`, then `drivers`, etc.) once the previous module's code is committed. This keeps context small and prevents Claude from re-explaining or re-generating unrelated modules.
- **Paste the schema, not the whole repo, as context.** When starting a new module conversation, give Claude `prisma/schema.prisma` and the relevant slice of the requirements spec — not the entire codebase. Full-repo context burns the context window on files Claude doesn't need for the task at hand.
- **Split "write code" from "write tests" into separate turns**, even within the same module conversation — asking for both at once tends to produce shallower tests.
- **Refactor in a dedicated pass**, not inline while building. After all modules exist, open one conversation scoped only to `common/` + a description of duplicated logic you've spotted, and ask Claude to extract shared code.
- **When to split into a new conversation:** any time you're about to change domain (e.g., moving from REST endpoints to the Swagger config, or from feature code to deployment config) — those are different enough contexts that reusing the same thread just adds noise.

---

## 7. Task-by-Task Implementation Guide

## Task 1 — Design & Specification

### 7.1.1 Requirement Analysis

**What's being requested:** an ERD/schema diagram for persistent storage, plus a requirements spec document listing every endpoint (purpose, URL, method, params, response shape).

**Functional requirements:** produce two artifacts — a diagram and a written spec — that together fully describe the API surface before any code is written.

**Inputs:** the Design Guide screens (your only source of truth, since no formal requirements exist yet).

**Outputs:** `docs/erd.png` (or `.mmd` Mermaid source) and `docs/requirements-spec.md`.

**Dependencies:** none — this is the first task and gates everything else.

**Constraints:** must be readable by someone who has not seen the UI mockups.

### 7.1.2 Technical Breakdown

- **Data modeling:** formalize Section 3's entity table into a real ERD.
- **API surface design:** walk every screen in the Design Guide, list the data it needs to render and the actions it can trigger, and turn each into an endpoint. (Section 8 of this playbook has the consolidated table to check your work against — build your own first, don't just copy it.)
- **Documentation format:** Markdown with tables reads cleanly in any Git host and copy-pastes well into Swagger descriptions later.

### 7.1.3 Implementation Roadmap

**Phase 1 — Screen-to-data extraction:** for each of the 8 mockup screens, write down every visible field and every button/action.
**Phase 2 — Entity consolidation:** merge duplicate fields across screens into the entity table (Section 3).
**Phase 3 — ERD diagram:** turn the entity table into a diagram (Mermaid `erDiagram` renders directly on GitHub, no extra tooling needed).
**Phase 4 — Endpoint spec:** for each screen action, write the endpoint row (method, path, params, request/response JSON example).
**Phase 5 — Review pass:** re-check the spec against every screen once more; flag anything still ambiguous per Section 2.6 instead of guessing.

### 7.1.4 Antigravity IDE Development Plan

Do this task in `docs/` only — no `src/` code yet. Keep it in its own conversation; you'll reference the finished spec from every later conversation, so it needs to be complete and stable before Task 2 begins.

### 7.1.5 Claude Prompt Generation

> **Prompt 1 — ERD generation**
> "I'm building the backend for a courier/delivery-driver app called Delivery Buddy. Here is my inferred domain model as a list of entities and fields: [paste Section 3.1 table]. And here are the relationships: [paste Section 3.2]. Generate a Mermaid `erDiagram` diagram from this that I can render directly on GitHub. Use proper cardinality notation (||--o{, etc.) and include primary/foreign keys explicitly in each entity block."

> **Prompt 2 — Requirements spec**
> "Using this domain model [paste ERD] and this list of screens and their visible fields/actions [paste your Phase 1 notes], write a requirements specification document in Markdown. For every endpoint include: purpose (one sentence), HTTP method, URL path (RESTful, versioned under /api/v1), path/query parameters, request body JSON schema, and an example success response. Group endpoints by domain module (auth, drivers, shifts, deliveries, wallet, chat). Flag anywhere the screens are ambiguous about what an endpoint needs, rather than inventing a field that isn't shown."

### 7.1.6 Architecture Recommendations

Version the API from day one (`/api/v1/...`) — costs nothing now, avoids a breaking change later. Keep the spec doc and the eventual Swagger output in sync by treating the Markdown spec as the source of truth you translate into Nest decorators, not a separate parallel document that drifts.

### 7.1.7 Testing Strategy

Not applicable in the traditional sense — the "test" for this task is a manual review: does every field shown in every screen have a source endpoint in the spec? Do it as a checklist pass, screen by screen.

### 7.1.8 Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Spec drifts from actual implementation as Task 2 progresses | Update the spec doc in the same commit as any endpoint change |
| Over-modeling — inventing entities/fields not shown anywhere in the UI | Every field in Section 3 traces back to a specific screen; keep that discipline for anything you add |

### 7.1.9 Definition of Done

- [ ] ERD covers every entity in Section 3, renders correctly
- [ ] Every endpoint in the spec has method, path, params, and example response
- [ ] Every action button visible in the Design Guide maps to at least one endpoint
- [ ] Ambiguities from Section 2.6 are documented in the spec, not silently resolved

---

## Task 2 — Endpoint Implementation

### 7.2.1 Requirement Analysis

**What's being requested:** working implementations of every endpoint from the Task 1 spec, documented and testable via Swagger.

**Functional requirements:** CRUD/action endpoints for auth, driver profile/onboarding, shifts, deliveries, wallet, and chat (per Section 8's consolidated table).

**Non-functional requirements:** input validation on every endpoint (explicit Task 4 requirement, but the contract needs to exist here first); consistent JSON error shape.

### 7.2.2 Technical Breakdown

| Component | Role |
|---|---|
| Backend (Nest modules) | business logic per domain |
| Database (Postgres via Prisma) | persistence for all entities in Section 3 |
| Auth | JWT guard protecting all non-auth routes |
| APIs | REST, versioned, documented via Swagger decorators |
| External services (mocked) | `RouteProvider` (map/ETA data), `PayoutProvider` (withdrawals) |

### 7.2.3 Implementation Roadmap

**Phase 1 — Auth module:** signup, login, refresh, JWT guard + strategy.
**Phase 2 — Drivers module:** onboarding endpoint (multi-step form fields in one payload, or one endpoint per step — see prompt below for the tradeoff), profile GET/PATCH, teams lookup.
**Phase 3 — Shifts module:** start/stop, current shift, shift history.
**Phase 4 — Deliveries module:** current/next delivery, delivery detail with items, status update, route/tracking sub-resource.
**Phase 5 — Wallet module:** balance summary, transaction list (paginated), withdraw action.
**Phase 6 — Chat module:** message list + create, per delivery.
**Phase 7 — Swagger wiring:** `@nestjs/swagger` decorators across every controller/DTO; serve at `/api/docs`.

### 7.2.4 Antigravity IDE Development Plan

Follow the build order in Section 6.2. Within each module folder, create files in this order: `*.dto.ts` (request/response contracts) → `*.entity.ts` or Prisma types → `*.repository.ts` → `*.service.ts` → `*.controller.ts` → `*.module.ts`. Writing DTOs first forces you to nail down the contract before logic, which keeps the controller thin.

### 7.2.5 Claude Prompt Generation

> **Prompt 3 — Scaffold a module**
> "In a NestJS project using Prisma and PostgreSQL, generate the `shifts` module. Requirements: [paste the shifts rows from your Task 1 spec]. Follow clean architecture: DTOs with class-validator decorators for `StartShiftDto` (no body needed) and shift response shapes; a `ShiftsRepository` wrapping PrismaService (no direct Prisma calls in the service); a `ShiftsService` with `startShift(driverId)`, `stopShift(shiftId)`, `getCurrentShift(driverId)`, `getShiftHistory(driverId)` — throw a typed `ConflictException` if a driver tries to start a shift while one is already active; a `ShiftsController` with JWT-guarded routes matching the spec's paths exactly. Include full `@nestjs/swagger` decorators (@ApiTags, @ApiOperation, @ApiResponse) on every route. Add inline comments explaining any non-obvious business rule. Do not implement other modules — only `shifts`."

> **Prompt 4 — Onboarding multi-step endpoint**
> "Design and implement a driver onboarding endpoint for a NestJS + Prisma app. The mobile UI collects: work ID, full name, team (selected from a lookup list), transportation type (enum: bicycle, car, truck), and vehicle number, across a multi-step form, with a 'Next' button per step. Propose two implementation options — (a) a single `PATCH /drivers/me/onboarding` endpoint accepting a partial DTO that the client calls once per step, merging into the driver record, vs. (b) a single endpoint that accepts the whole payload at the final step — explain the tradeoff in a comment block, then implement option (a) with a DTO where every field is optional but validated when present, and a service method that upserts only the provided fields. Include a `GET /drivers/me/onboarding-status` endpoint that reports which required fields are still missing."

> **Prompt 5 — Mocked external provider**
> "Create a `RouteProvider` interface and a `MockRouteProvider` implementation for a NestJS app, injected via DI. The interface should expose `getRoute(pickup: LatLng, destination: LatLng): Promise<{ etaMinutes: number; distanceKm: number; polyline: string; trafficAlert: string | null }>`. The mock should return deterministic-but-plausible values based on straight-line distance between the two points (haversine formula) so tests are stable. Add a comment documenting that a production implementation would call Mapbox Directions API or Google Maps Directions API behind this same interface, with the API key sourced from config."

### 7.2.6 Architecture Recommendations

Guard everything behind a global `JwtAuthGuard` except `/auth/*` routes — use a `@Public()` decorator + `Reflector` to opt specific routes out, rather than remembering to add the guard everywhere manually. Return DTOs, not raw Prisma entities, from every controller — this is what prevents password hashes or internal IDs from leaking into responses.

### 7.2.7 Testing Strategy

Covered fully in Task 4 — but write each endpoint's happy-path test in the same PR/commit as the endpoint itself rather than deferring all testing to the end; it's much cheaper to catch a validation bug immediately.

### 7.2.8 Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Onboarding as a multi-step form is genuinely ambiguous (see Prompt 4) | Document the chosen option in the requirements spec, not just the code |
| Swagger docs drift from actual behavior | Generate Swagger from the same DTOs used for validation — single source of truth, not hand-written docs |
| N+1 queries when loading delivery + items + driver | Use Prisma's `include`/`select` to fetch related data in one query; check with `prisma.$on('query')` logging during dev |

### 7.2.9 Definition of Done

- [ ] Every endpoint in the Task 1 spec exists and returns the documented shape
- [ ] All routes except `/auth/*` require a valid JWT
- [ ] Swagger UI at `/api/docs` reflects every endpoint with request/response examples
- [ ] No endpoint returns a raw ORM entity (passwords, internal fields excluded)

---

## Task 3 — Data Layer & Caching

### 7.3.1 Requirement Analysis

**What's being requested:** a storage/caching strategy for frequently-used data, to avoid redundant third-party calls (see Section 2.6 for why "coin list" doesn't map literally onto this app).

**In this app, the actual candidates for caching are:**
- `Team` list and transportation-type enum (near-static lookup data, read on every onboarding screen load)
- `RouteProvider` responses (ETA/distance/traffic) for a given delivery, so the tracking screen doesn't hit the mocked/real provider on every poll
- Driver profile summary (level, rate) — read-heavy, write-light

### 7.3.2 Technical Breakdown

Persistence: Postgres via Prisma (already covered in Task 2). Caching: Redis, accessed through a thin `CacheService` wrapper (get/set/invalidate), not scattered `redis.get()` calls across services.

### 7.3.3 Implementation Roadmap

**Phase 1 — Redis setup:** add Redis to `docker-compose.yml` for local dev; add `@nestjs/cache-manager` + `cache-manager-redis-store` (or a raw `ioredis` client wrapped in a service, for more control over TTL/keys).
**Phase 2 — Lookup-data caching:** cache `GET /teams` response with a long TTL (e.g., 1 hour), invalidate on any admin write (out of scope here, so TTL-only is fine).
**Phase 3 — Route/tracking caching:** cache `RouteProvider.getRoute()` results keyed by `deliveryId`, short TTL (e.g., 30s), so rapid polling from the tracking screen doesn't hammer the provider.
**Phase 4 — Cache-aside pattern documentation:** write down (in `docs/requirements-spec.md`) which endpoints are cached, their TTL, and invalidation triggers.

### 7.3.4 Antigravity IDE Development Plan

Build `common/cache/cache.module.ts` and `cache.service.ts` once, early, so every later module can inject it rather than each module reinventing Redis access.

### 7.3.5 Claude Prompt Generation

> **Prompt 6 — Cache service**
> "Create a `CacheService` for a NestJS app wrapping `cache-manager` with a Redis store. Expose `get<T>(key: string): Promise<T | null>`, `set<T>(key: string, value: T, ttlSeconds: number): Promise<void>`, and `invalidate(key: string): Promise<void>`. Then show how to use it inside a `TeamsService.findAll()` method with a cache-aside pattern: check cache, on miss query Prisma and populate the cache with a 3600s TTL, on hit return directly. Include a unit test using a mocked cache service that asserts the database is not queried on a cache hit."

> **Prompt 7 — Route caching**
> "Extend the `RouteProvider`/`MockRouteProvider` from before with a caching decorator: `CachedRouteProvider` that wraps any `RouteProvider` implementation, checks `CacheService` for a `route:{deliveryId}` key before calling the inner provider, and caches the result for 30 seconds. Wire it up via NestJS DI so `DeliveriesService` depends only on the `RouteProvider` interface token, unaware it's being cached underneath."

### 7.3.6 Architecture Recommendations

Cache-aside (lazy loading) over write-through here — the data in question (lookups, route pings) is read far more than written, so cache-aside's simplicity wins. Keep cache keys namespaced (`team:list`, `route:{deliveryId}`) so you can wildcard-invalidate a category later if needed.

### 7.3.7 Testing Strategy

Unit test the cache-aside logic with a mocked cache client (assert DB is skipped on hit, called on miss). Integration test against a real (or `redis-mock`) Redis instance to confirm TTL expiry behaves as expected. Edge case: cache and DB disagree (e.g., stale cached team list after a rename) — acceptable given TTL, but document the staleness window.

### 7.3.8 Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Redis unavailable in production | Fail open — catch cache errors, fall through to the DB/provider, log a warning rather than 500ing |
| Cache stampede on TTL expiry under load | Not a real concern at this app's scale; note it as a future improvement (e.g., jittered TTLs) rather than over-engineering now |

### 7.3.9 Definition of Done

- [ ] Redis wired up locally via docker-compose and in the deployed environment
- [ ] At least the teams lookup and route/tracking data are cached with documented TTLs
- [ ] Cache failures don't crash the request — they fall through to the source of truth
- [ ] Caching strategy is written down in the requirements spec, including the Section 2.6 note on the "coin list" phrasing

---

## Task 4 — Testing

### 7.4.1 Requirement Analysis

**What's being requested:** automated unit + integration tests covering request-validation correctness, accurate data for valid requests, and proper error responses for invalid ones, using Jest/Mocha/Jasmine + Supertest.

### 7.4.2 Technical Breakdown

- **Unit tests:** services and repositories in isolation, dependencies mocked (Jest mocks/`jest-mock-extended` for Prisma).
- **Integration/e2e tests:** Supertest against a running Nest app instance, hitting a real (test) database via Prisma, exercising full request→response cycles including the `ValidationPipe` and `JwtAuthGuard`.

### 7.4.3 Implementation Roadmap

**Phase 1 — Test infrastructure:** a separate test database (or `sqlite`/`postgres` in a Docker test container), a `jest-e2e.json` config, a seed script for fixture data (a test driver, team, delivery).
**Phase 2 — Unit tests per service:** one `*.spec.ts` per service, covering the business-rule branches (e.g., "cannot start a shift while one is active").
**Phase 3 — e2e tests per module:** one `*.e2e-spec.ts` per module, covering: valid request → 2xx + correct shape; missing/invalid field → 400 with the standard error shape; unauthenticated request → 401; accessing another driver's resource → 403/404.
**Phase 4 — CI wiring:** GitHub Actions workflow running `npm test` and `npm run test:e2e` on every push, producing the "CI badge" the Deliverables section asks for.

### 7.4.4 Antigravity IDE Development Plan

Write the unit test for a service in the same conversation/turn as the service itself (see Section 6.3) — don't batch all testing into a single end-of-project conversation, since Claude writes noticeably better tests when the implementation is still in its immediate context.

### 7.4.5 Claude Prompt Generation

> **Prompt 8 — Unit tests**
> "Write Jest unit tests for this `ShiftsService` [paste the service code]. Mock `ShiftsRepository` with `jest-mock-extended`. Cover: successfully starting a shift when none is active; throwing `ConflictException` when a shift is already active; successfully stopping an active shift and computing final earnings/tips/deliveriesCompleted; throwing `NotFoundException` when stopping a shift that doesn't belong to the driver. Use `describe`/`it` blocks with clear names, and assert both the return value and that the repository was called with the expected arguments."

> **Prompt 9 — e2e tests**
> "Write a Supertest e2e test file for the `deliveries` module of a NestJS app [paste the controller]. Bootstrap a full Nest `TestingModule` with the real `ValidationPipe` and `JwtAuthGuard` applied, backed by a test Postgres database via Prisma (assume a `seedTestData()` helper exists that creates a driver, team, and one delivery, and returns a valid JWT for that driver). Cover: GET current delivery returns 200 and the correct shape for the authenticated driver; GET current delivery returns 401 with no token; PATCH delivery status with an invalid status enum value returns 400 with the standard error body; PATCH delivery status on a delivery belonging to a different driver returns 403 or 404 (justify which, in a comment). Clean up test data in an `afterAll` hook."

> **Prompt 10 — CI workflow**
> "Write a GitHub Actions workflow (`.github/workflows/ci.yml`) that spins up Postgres and Redis service containers, runs `npm ci`, `npx prisma migrate deploy`, `npm run test`, and `npm run test:e2e` on every push and pull request to `main`. Fail the job if any test fails. Include a status badge snippet for the README."

### 7.4.6 Architecture Recommendations

Keep unit and e2e tests in separate directories/configs (Nest's default `test/` for e2e, colocated `*.spec.ts` for unit) so `npm test` stays fast for local iteration and `npm run test:e2e` is reserved for the slower, DB-backed suite.

### 7.4.7 Testing Strategy (meta — how to test the tests)

| Category | Coverage target |
|---|---|
| Unit | Every service method's branches (happy path + each thrown exception) |
| Integration/e2e | Every endpoint: 1 happy path, 1 validation failure, 1 auth failure, 1 authorization failure where relevant |
| Edge cases | Empty transaction list, withdrawing more than balance, starting a shift with an already-active shift, delivery with zero items |
| Failure scenarios | DB connection drop (mock Prisma throwing), cache unavailable (Task 3) |
| Performance | Not a hard requirement here — note in README as a known gap rather than over-building load tests for a 5-day assessment |
| Security testing | Confirm password never appears in any response; confirm JWT required on protected routes; basic SQL-injection-style input in a text field (Prisma's parameterization should neutralize it — assert the request still returns a normal 200/400, not a 500) |
| Acceptance criteria | All tests green in CI; CI badge in README |

### 7.4.8 Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Tests pass locally but fail in CI (env differences) | Run tests against the same containerized Postgres/Redis versions locally and in CI (docker-compose mirrors the CI service containers) |
| Flaky e2e tests from shared test data across test files | Isolate fixtures per test file (unique driver emails, transactional rollback or full DB reset between files) |

### 7.4.9 Definition of Done

- [ ] Unit tests exist for every service
- [ ] e2e tests exist for every module covering valid/invalid/unauthenticated/unauthorized cases
- [ ] `npm test` and `npm run test:e2e` both pass locally and in CI
- [ ] CI badge added to README

---

## Task 5 — Deployment

### 7.5.1 Requirement Analysis

**What's being requested:** a public, reachable deployment with secure env/config handling and a documented base URL.

### 7.5.2 Technical Breakdown

- **Infrastructure:** Railway or Render, both of which offer managed Postgres and Redis add-ons that plug into the stack from Sections 4–7.3 with minimal config.
- **Configuration management:** all secrets (DB URL, Redis URL, JWT secret, any provider API keys) via platform-injected environment variables — `.env` is for local dev only and is git-ignored.

### 7.5.3 Implementation Roadmap

**Phase 1 — Containerize:** a `Dockerfile` (multi-stage: build → slim runtime image) so the deploy target is identical to local Docker dev.
**Phase 2 — Provision:** create the Postgres and Redis instances on the chosen platform; run `prisma migrate deploy` against production as part of the deploy step, not manually.
**Phase 3 — Env wiring:** set all required env vars in the platform dashboard; validate on boot (Section 5's config schema) so a missing var fails the deploy loudly instead of serving broken requests.
**Phase 4 — Health check + smoke test:** a `GET /health` endpoint the platform can poll; after deploy, manually hit `/api/docs` and 2–3 real endpoints against the public URL.
**Phase 5 — Documentation:** base URL, and how to obtain a test JWT (e.g., a seeded demo driver account), written into the README.

### 7.5.4 Antigravity IDE Development Plan

This task is mostly platform configuration, not code generation — use Claude for the Dockerfile and CI/CD wiring, but do the actual dashboard provisioning (creating the Postgres instance, setting env vars) yourself, since Claude can't click through a hosting dashboard on your behalf.

### 7.5.5 Claude Prompt Generation

> **Prompt 11 — Dockerfile**
> "Write a multi-stage Dockerfile for a NestJS + Prisma app. Stage 1: install dependencies and build with `npm ci && npm run build`. Stage 2: a slim `node:20-alpine` runtime image that copies only the built `dist/`, `node_modules` (production-only, via `npm ci --omit=dev` in the final stage or copying pruned node_modules), and `prisma/` (needed for `prisma migrate deploy` at container start). Add a non-root user for runtime. Expose the app port from an env var (default 3000). Add a `CMD` that runs `npx prisma migrate deploy && node dist/main.js`."

> **Prompt 12 — Health check + config validation**
> "Add a `GET /health` endpoint to a NestJS app that returns 200 with `{ status: 'ok', uptime, timestamp }` and checks Postgres and Redis connectivity, returning 503 if either is unreachable. Also write a `config.schema.ts` using `Joi` (or `zod`) validating required env vars (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`) at bootstrap, throwing a clear error naming the missing variable if validation fails, before the app starts listening."

> **Prompt 13 — README deploy section**
> "Write the 'Setup, Run, Test, and Deploy' section of a README.md for a NestJS + Prisma + Redis backend. Include: prerequisites (Node version, Docker), local setup steps (clone, `npm install`, `.env` from `.env.example`, `docker-compose up -d` for Postgres/Redis, `npx prisma migrate dev`, `npm run start:dev`), how to run tests (`npm test`, `npm run test:e2e`), and deployment steps for Railway/Render including required environment variables (list them without values) and where to find the live base URL and Swagger docs path once deployed."

### 7.5.6 Architecture Recommendations

Run migrations as an explicit deploy step (`prisma migrate deploy`), never `prisma db push` in production — `migrate deploy` applies versioned, reviewable migration files instead of diffing schema state live. Keep `.env.example` in the repo (with placeholder values) so the evaluator knows exactly which variables to set without exposing real secrets.

### 7.5.7 Testing Strategy

Post-deploy smoke test: hit `/health`, `/api/docs`, and one authenticated endpoint (using a seeded demo account) against the live URL before calling deployment done. If CI is wired (Task 4), gate deployment on CI passing rather than deploying an untested commit.

### 7.5.8 Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Free-tier hosting spins down on inactivity, causing a slow first request during evaluation | Note this in the README as expected behavior ("first request may take ~10s to cold-start") rather than let it look like a bug |
| Migration fails on deploy against production data | Test the exact `prisma migrate deploy` command against a staging DB with the same schema history before the real deploy |
| Secrets accidentally committed | `.gitignore` covers `.env`; do a final `git log -p | grep -i secret`-style check before making the repo public |

### 7.5.9 Definition of Done

- [ ] API reachable at a public base URL
- [ ] `/health` returns 200 with dependent services confirmed reachable
- [ ] All secrets via env vars, `.env` git-ignored, `.env.example` present
- [ ] README documents the live URL and Swagger docs path
- [ ] Deploy is reproducible from a clean clone using only the README

---

## 8. Master Endpoint Reference

Use this to cross-check your Task 1 spec — build yours independently first (Section 7.1), then diff against this.

| Module | Method | Path | Purpose |
|---|---|---|---|
| Auth | POST | `/api/v1/auth/signup` | Create a driver account |
| Auth | POST | `/api/v1/auth/login` | Authenticate, return access + refresh token |
| Auth | POST | `/api/v1/auth/refresh` | Exchange refresh token for new access token |
| Auth | POST | `/api/v1/auth/logout` | Invalidate refresh token |
| Drivers | GET | `/api/v1/teams` | List selectable teams (cached) |
| Drivers | PATCH | `/api/v1/drivers/me/onboarding` | Submit/update onboarding fields |
| Drivers | GET | `/api/v1/drivers/me/onboarding-status` | Which onboarding fields are still missing |
| Drivers | GET | `/api/v1/drivers/me` | Current driver profile |
| Drivers | PATCH | `/api/v1/drivers/me` | Update editable profile fields |
| Drivers | GET/PATCH | `/api/v1/drivers/me/billing-method` | Payout method |
| Drivers | GET/PATCH | `/api/v1/drivers/me/notification-settings` | Notification prefs |
| Shifts | POST | `/api/v1/shifts/start` | Start a shift |
| Shifts | POST | `/api/v1/shifts/:id/stop` | End a shift |
| Shifts | GET | `/api/v1/shifts/me/current` | Active shift stats |
| Shifts | GET | `/api/v1/shifts/me/history` | Past shifts |
| Deliveries | GET | `/api/v1/deliveries/me/current` | The in-progress delivery |
| Deliveries | GET | `/api/v1/deliveries/me/next` | Next delivery in queue |
| Deliveries | GET | `/api/v1/deliveries/:id` | Order detail (items, pricing, payment) |
| Deliveries | PATCH | `/api/v1/deliveries/:id/status` | Advance delivery status |
| Deliveries | GET | `/api/v1/deliveries/:id/route` | ETA/distance/traffic (cached) |
| Wallet | GET | `/api/v1/wallet/me` | Balance, tips, rate, level |
| Wallet | GET | `/api/v1/wallet/me/transactions` | Paginated transaction history |
| Wallet | POST | `/api/v1/wallet/me/withdraw` | Withdraw funds (mocked payout) |
| Chat | GET | `/api/v1/deliveries/:id/messages` | Message thread for a delivery |
| Chat | POST | `/api/v1/deliveries/:id/messages` | Send a message |
| Notifications | GET | `/api/v1/notifications/me` | List notifications |
| Notifications | PATCH | `/api/v1/notifications/:id/read` | Mark read |
| System | GET | `/health` | Liveness/readiness check |

---

## 9. Prompt Library Index

All 13 prompts from Section 7, grouped by when to use them:

| # | Prompt | Use during |
|---|---|---|
| 1 | ERD generation | Task 1 |
| 2 | Requirements spec | Task 1 |
| 3 | Scaffold a module | Task 2, repeat per module |
| 4 | Onboarding multi-step endpoint | Task 2 |
| 5 | Mocked external provider | Task 2 |
| 6 | Cache service | Task 3 |
| 7 | Route caching | Task 3 |
| 8 | Unit tests | Task 4, repeat per service |
| 9 | e2e tests | Task 4, repeat per module |
| 10 | CI workflow | Task 4 |
| 11 | Dockerfile | Task 5 |
| 12 | Health check + config validation | Task 5 |
| 13 | README deploy section | Task 5 |

---

## 10. Overall Definition of Done (maps to the brief's Deliverables list)

| Brief deliverable | Where it's covered here | Done when |
|---|---|---|
| Code Repository (public GitHub/GitLab link) | Sections 6, 7.2–7.5 | Repo public, README present, matches folder structure in 6.1 |
| README.md | Task 5, Prompt 13 | Setup/run/test/deploy instructions verified against a clean clone |
| Requirements spec doc | Task 1 | Section 7.1.9 checklist complete |
| OpenAPI/Swagger spec | Task 2 | `/api/docs` live and matches every implemented endpoint |
| ERD/schema diagrams | Task 1 | Section 7.1.9 checklist complete |
| Test results (CI badge or output) | Task 4 | CI green, badge in README |
| Live API URL | Task 5 | Section 7.5.9 checklist complete |

---

## 11. Suggested 5-Day Schedule

| Day | Focus |
|---|---|
| 1 | Task 1 in full (spec + ERD) + project scaffold (NestJS init, Prisma schema, Docker Compose for local Postgres/Redis) |
| 2 | Task 2: auth, drivers, shifts modules + Swagger wiring |
| 3 | Task 2 cont'd: deliveries, wallet, chat modules + mocked providers; start Task 3 (cache service) |
| 4 | Finish Task 3; Task 4 (unit + e2e tests, CI workflow) |
| 5 | Task 5 (Dockerfile, deploy, smoke test, README polish); final pass on all Definition of Done checklists |

---

*This playbook is built entirely from `Backend.pdf`. Every entity, endpoint, and requirement above traces back to either the assessment text or a specific field/action visible in the Design Guide mockups. Ambiguities are flagged in Section 2.6 rather than resolved by invention — revisit that table before finalizing your Task 1 spec.*
