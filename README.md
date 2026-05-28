# Deal Match

A Chrome extension + Next.js backend that answers "Is this a good deal?" for any product page on the web.

## Architecture

```
   ┌─────────────┐         ┌────────────────────┐         ┌───────────────────────┐
   │  Chrome     │  HTTPS  │  Vercel            │  HTTPS  │  VPS (KVM 2)          │
   │  extension  │────────▶│  Next.js app       │────────▶│  ┌─────────────────┐  │
   │             │         │  /api/analyze      │         │  │ Caddy (auto-TLS)│  │
   └─────────────┘         │  /api/jobs/[id]    │         │  └────────┬────────┘  │
                           │                    │         │           │           │
                           │  Stateless. Calls  │         │  ┌────────▼────────┐  │
                           │  the VPS for both  │         │  │ Runner          │  │
                           │  scraping + DB.    │         │  │ (Express +      │  │
                           └─────────┬──────────┘         │  │  Playwright)    │  │
                                     │                    │  └────────┬────────┘  │
                                     │ Postgres wire      │           │           │
                                     └───────────────────▶│  ┌────────▼────────┐  │
                                                          │  │ Postgres 17     │  │
                                                          │  └─────────────────┘  │
                                                          └───────────────────────┘
```

- **Browser extension** (`apps/extension/`): MV3, content script injects a verdict badge.
- **Web** (`apps/web/`): Vercel-hosted Next.js. Owns the public API. Stateless.
- **Runner** (`apps/runner/`): Express + Playwright. Lives on your VPS. The expensive scraping + LLM extraction runs here, on flat-rate hardware.
- **Postgres** (in `docker-compose.yml`): also on your VPS. Cache of products, observations, and analyses.

## Repo layout

```
apps/
  web/         Next.js 15 — deploys to Vercel
  extension/   Chrome MV3 (Vite + CRXJS)
  runner/      Express + Playwright service for the VPS
packages/
  shared/      TS types shared by all three
docker-compose.yml   Postgres + runner + Caddy reverse-proxy
Caddyfile            TLS termination + reverse-proxy config
.env.example         VPS-side env vars
```

## Local development

```bash
pnpm install

# Terminal 1 — web (Next.js)
cp apps/web/.env.local.example apps/web/.env.local   # leave blank for stubbed mode
pnpm dev:web

# Terminal 2 — runner (optional locally; web has a stub fallback)
pnpm dev:runner    # listens on :8080

# Terminal 3 — extension
pnpm dev:ext       # builds to apps/extension/dist/
# Chrome → chrome://extensions → "Load unpacked" → apps/extension/dist
```

The extension defaults to `http://localhost:3000`. To point it at your deployed Vercel URL, set `DEAL_MATCH_API_BASE` before `pnpm build:ext`.

## Production deployment

### 1. VPS — bring up Postgres + Runner + Caddy

Prereqs on the VPS: Docker + Compose plugin, plus a domain pointing at the box (A record).

```bash
git clone <this repo> ~/deal-match
cd ~/deal-match
cp .env.example .env

# Generate secrets
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" >> .env
echo "RUNNER_TOKEN=$(openssl rand -hex 32)"     >> .env

# Edit .env to set DOMAIN= and (optionally) ANTHROPIC_API_KEY=
$EDITOR .env

pnpm stack:up   # or: docker compose up -d --build
pnpm stack:logs # tail until you see "runner listening on :8080"
```

Caddy auto-provisions a Let's Encrypt cert for `$DOMAIN`. Verify:

```bash
curl https://$DOMAIN/health   # → {"ok":true}
```

Postgres is reachable on `5432`. **Lock it down at the firewall.** Either:

- Restrict inbound `:5432` to Vercel's egress IP ranges (preferred), or
- Comment out the `ports:` mapping on the `postgres` service and run the web app from a place that can reach the Docker network (less convenient).

### 2. Vercel — deploy the web app

```bash
cd apps/web
vercel link
vercel env add DATABASE_URL          # postgres://dealmatch:PASSWORD@DOMAIN:5432/dealmatch
vercel env add WEBWRIGHT_RUNNER_URL  # https://DOMAIN/run
vercel env add WEBWRIGHT_RUNNER_TOKEN # same RUNNER_TOKEN from your VPS .env
vercel env add ANTHROPIC_API_KEY     # optional, enables LLM verdicts
vercel deploy --prod
```

### 3. Chrome extension — point at production

```bash
DEAL_MATCH_API_BASE=https://your-app.vercel.app pnpm build:ext
# Zip apps/extension/dist/ and upload to the Chrome Web Store dashboard.
```

## Database schema

Auto-applied on first Postgres boot via `docker-entrypoint-initdb.d`. To re-apply manually:

```bash
docker compose exec -T postgres psql -U dealmatch -d dealmatch < apps/web/db/schema.sql
```

Tables: `products`, `price_observations`, `analyses` (see `apps/web/db/schema.sql`).

## How a request flows

1. User visits a product page. Content script extracts JSON-LD + OpenGraph + visible price → POSTs to **Vercel** `/api/analyze`.
2. Vercel hashes a stable product identity, checks `analyses` table:
   - cache hit (< 24h) → returns inline. Total time: ~100ms.
   - cache miss → starts a background job, returns `jobId`. Badge enters polling state.
3. Background job calls the **VPS runner** at `POST https://<vps>/run` with the signals.
4. Runner: DuckDuckGo search for the product, filter to known retailers, parallel Playwright visits, LLM verifies same-SKU and extracts price.
5. Runner returns `{ observations: [...] }`. Vercel writes through to `price_observations`, synthesises a verdict via AI Gateway, writes to `analyses`.
6. Extension's poll picks up the result, badge turns green/yellow/red, popup shows the breakdown.

## Environment variables — quick reference

| Where | Var | Purpose |
|---|---|---|
| VPS `.env` | `DOMAIN` | Caddy auto-TLS domain |
| VPS `.env` | `POSTGRES_PASSWORD` | Postgres superuser password |
| VPS `.env` | `RUNNER_TOKEN` | Shared secret for `/run` auth |
| VPS `.env` | `ANTHROPIC_API_KEY` | Enables LLM-driven same-SKU verification |
| Vercel | `DATABASE_URL` | `postgres://...@<vps>:5432/dealmatch` |
| Vercel | `WEBWRIGHT_RUNNER_URL` | `https://<vps>/run` |
| Vercel | `WEBWRIGHT_RUNNER_TOKEN` | Same value as `RUNNER_TOKEN` |
| Vercel | `ANTHROPIC_API_KEY` | Enables LLM-driven verdict synthesis |

Without any env vars set, everything still runs end-to-end against deterministic stubs so you can develop offline.

## Cost model

| Component | Where | Cost shape |
|---|---|---|
| Next.js API | Vercel | Hobby tier is generally free; near-zero per-request CPU |
| Scraping + Playwright | Your VPS | Flat-rate (the whole point of moving it here) |
| Postgres | Your VPS | Flat-rate |
| Anthropic API (verdict + same-SKU LLM) | Pay-per-token | Bounded: ~1 LLM call per cache miss, ~6 candidate-verifications per miss |

A KVM-2 (2 vCPU / 2 GB) comfortably runs ~2–3 concurrent Playwright sessions. The Postgres cache means each product only needs one scrape per 24 h regardless of how many users hit it.
# deal-match
