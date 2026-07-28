# AWS Deployment Guide — App Runner + RDS + ElastiCache

**Companion to:** `Backend_API_Implementation_Playbook.md` and `Module_Build_Sequence.md`
**Replaces:** Step 13's "Provision on Railway/Render" section — use this guide instead if you're deploying to AWS.
**Assumes:** Step 12 is done (you have a working, tested Dockerfile that runs `npx prisma migrate deploy && node dist/main.js` on container start).

---

## Architecture

```
Internet
   │
   ▼
AWS App Runner (public HTTPS endpoint, runs your Docker image from ECR)
   │
   │  via VPC Connector (private networking)
   ▼
┌─────────────────────────────┐
│  Your VPC                   │
│  ┌────────────┐ ┌─────────┐ │
│  │ RDS         │ │ ElastiCache│
│  │ (Postgres)  │ │ (Redis)    │
│  └────────────┘ └─────────┘ │
└─────────────────────────────┘
```

App Runner itself is public-facing by design — that's what gives you the HTTPS URL. RDS and ElastiCache stay private inside your VPC. The **VPC Connector** is the one piece of plumbing that lets your public App Runner service reach into that private network to talk to the database and cache. This is the extra step AWS requires that Render/Railway hide from you.

**A note before you start:** unlike Render's free tier, none of App Runner, RDS, or ElastiCache fully stop billing when idle — App Runner charges per vCPU/memory-second while your service is running, and RDS/ElastiCache bill per hour whether they're getting traffic or not (only the *first 12 months* are free-tier-eligible, and only if your AWS account predates July 15, 2025 — otherwise this draws from your one-time $200/6-month credit). **Set a reminder to pause or delete these three resources once your assessment is evaluated**, or they'll keep charging.

---

## Prerequisites

- An AWS account, logged into the console
- AWS CLI installed and configured (`aws configure`) if you want the agent to run the ECR push commands for you — otherwise do those steps from any terminal with AWS CLI access
- Your Dockerfile from Step 12, already tested locally with `docker build` + `docker run`

---

## Step A — Security Groups (do this first — everything else references these)

In the EC2 console → **Security Groups** → Create security group, three times:

1. **`apprunner-connector-sg`** — no inbound rules needed yet. This represents your App Runner service's network identity.
2. **`rds-sg`** — inbound rule: Type = PostgreSQL, Port = 5432, Source = `apprunner-connector-sg` (select it by name/ID, not an IP range).
3. **`redis-sg`** — inbound rule: Type = Custom TCP, Port = 6379, Source = `apprunner-connector-sg`.

This is what actually enforces "only my App Runner service can reach the database," regardless of subnet type.

---

## Step B — RDS (PostgreSQL)

RDS console → **Create database**:

- Choose **Standard create** → Engine: **PostgreSQL**
- Templates: **Free tier** if your account is eligible, otherwise **Dev/Test**
- DB instance identifier: `delivery-buddy-db`
- Master username/password: set and **save these** — you'll build the connection string from them
- Instance class: `db.t3.micro` (or `db.t4g.micro`)
- Storage: default (20GB gp2/gp3 is plenty)
- Connectivity → VPC: your default VPC → VPC security group: choose existing → select `rds-sg` (remove the default one) → **Public access: No**
- Additional configuration → Initial database name: `deliverybuddy`
- Create database, then wait ~5–10 minutes for status to become "Available"

Once available, copy the **endpoint** (hostname) from the RDS console — you'll need it for `DATABASE_URL`.

---

## Step C — ElastiCache (Redis)

ElastiCache console → **Redis OSS caches** (naming may show as "Valkey/Redis" depending on when you're reading this — pick the Redis-compatible option) → **Create**:

- Deployment option: **Design your own cache** → Cluster mode: **Disabled** (simplest, one primary node — fine for this app's scale)
- Node type: `cache.t3.micro`
- Number of replicas: 0
- VPC: your default VPC, same subnets as RDS
- Security group: select existing → `redis-sg`
- Create, wait ~5–10 minutes

Copy the **primary endpoint** once it's available — you'll need it for `REDIS_URL`.

---

## Step D — Push your image to ECR

Console: ECR → **Create repository** → name it `delivery-buddy-api` → **Private** → Create.

Then, from a terminal with AWS CLI + Docker (ask the Antigravity agent to run these — they're plain CLI commands, no console clicking involved):

```
aws ecr get-login-password --region <your-region> | docker login --username AWS --password-stdin <your-account-id>.dkr.ecr.<your-region>.amazonaws.com

docker build -t delivery-buddy-api .

docker tag delivery-buddy-api:latest <your-account-id>.dkr.ecr.<your-region>.amazonaws.com/delivery-buddy-api:latest

docker push <your-account-id>.dkr.ecr.<your-region>.amazonaws.com/delivery-buddy-api:latest
```

(Find `<your-account-id>` and `<your-region>` in the top-right of the AWS console, or via `aws sts get-caller-identity`.)

---

## Step E — VPC Connector

App Runner console → **VPC connectors** (usually under a "Networking" section) → **Create VPC connector**:

- Name: `delivery-buddy-connector`
- VPC: your default VPC
- Subnets: select one per Availability Zone (2–3 subnets) — the same ones RDS/ElastiCache are in
- Security group: `apprunner-connector-sg`
- Create

---

## Step F — Create the App Runner service

App Runner console → **Create service**:

1. **Source**: Container registry → Amazon ECR → browse to the `delivery-buddy-api` image you just pushed. Deployment trigger: Manual (or automatic, if you later wire your CI to push + redeploy).
2. **Service settings**: name it `delivery-buddy-api`; vCPU/memory: 0.25 vCPU / 0.5GB is enough and cheapest for an assessment.
3. **Environment variables**:
   - `DATABASE_URL` = `postgresql://<master-user>:<master-password>@<rds-endpoint>:5432/deliverybuddy`
   - `REDIS_URL` = `redis://<elasticache-endpoint>:6379`
   - `JWT_SECRET` = a real random secret (not your local dev one)
   - `PORT` = `3000`
4. **Port**: `3000` (must match your Dockerfile's `EXPOSE`)
5. **Networking** → Outgoing network traffic: **Custom VPC** → select the `delivery-buddy-connector` VPC connector from Step E. This is the step that's easy to miss — without it, your container starts but can't reach RDS/ElastiCache at all.
6. **Health check**: path `/health`
7. Create & deploy — first deploy takes several minutes.

Because your Dockerfile's `CMD` already runs `npx prisma migrate deploy && node dist/main.js` (from Step 12), the migration runs automatically inside the VPC the moment the container starts — no need to expose RDS publicly or run migrations from your laptop.

---

## Step G — Smoke test

App Runner gives you a default URL like `https://xxxxxxxxxx.<region>.awsapprunner.com`. Check:

- `GET https://<app-runner-url>/health` → 200
- `GET https://<app-runner-url>/api/docs` → Swagger UI loads
- Sign up a demo driver through Swagger UI and hit one authenticated endpoint end-to-end

---

## Step H — Update README + commit

**Prompt for the agent:**
> Update the README's deployment section to reflect AWS App Runner + RDS + ElastiCache instead of Render/Railway. Include: the App Runner URL, the required environment variables (names only), a one-paragraph note on the VPC connector architecture (App Runner reaches RDS/ElastiCache only via the VPC connector — nothing is publicly exposed), and a reminder that App Runner/RDS/ElastiCache bill continuously while running, unlike a serverless free tier — so they should be paused or deleted once evaluation is complete.

**Commit:**
```
git add -A && git commit -m "docs: AWS App Runner + RDS + ElastiCache deployment" && git push
```

---

## Before you consider Task 5 done

- [ ] `apprunner-connector-sg`, `rds-sg`, `redis-sg` created with the correct source-based inbound rules
- [ ] RDS status: Available, not publicly accessible
- [ ] ElastiCache status: Available
- [ ] Image pushed to ECR
- [ ] VPC connector attached to the App Runner service (Networking tab shows "Custom VPC")
- [ ] `/health` and `/api/docs` respond on the public App Runner URL
- [ ] README updated with the AWS-specific deployment details
- [ ] **You've noted a reminder to pause/delete App Runner, RDS, and ElastiCache after evaluation** — none of these have a real "spin down to zero cost" free tier the way Render's web service does

---

## Cleanup (do this once you're done being evaluated)

To stop billing: App Runner console → your service → **Pause** (or delete). RDS console → your instance → **Delete** (skip the final snapshot unless you want to keep it — it also costs to store). ElastiCache console → your cluster → **Delete**. Also delete the VPC connector and the three security groups if you want a fully clean account.
