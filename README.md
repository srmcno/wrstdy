# Water Rate Study Tool — Choctaw Nation OWRM

Internal tool for the Choctaw Nation Office of Water Resource Management to assist
public water systems with rate study analysis, budget review, financial scorecard
metrics, 5-year projections, scenario modeling, and board-ready reporting.

## Stack

- **Vite** — build/dev tooling
- **React 18** — UI
- **Chart.js 4** — projection charts
- **localStorage** — persistence (no backend required for study data)
- **AI analysis** (optional) — Anthropic (Claude) and/or OpenAI models through the
  bundled server-side proxy (`scripts/ai-proxy.js`); direct-browser Anthropic mode
  remains available for local/internal use.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Build

Two build modes are available:

```bash
# Standard chunked build → dist/  (deploy to any web server)
npm run build
npm run preview

# Single self-contained HTML → dist-single/index.html
# (one ~585KB file with all JS/CSS/images inlined; works via file://,
#  email attachment, USB stick, or dropping into a SharePoint folder)
npm run build:single
```

## Features

- **Multi-study workspace** with sidebar navigation
- **8-step guided workflow**: System Info → Customer Classes/Rates → Budget →
  Financial Metrics → 5-Year Projection → Scenarios → AI Analysis → Final Report
- **Usage-distribution revenue engine** — enter how many customers fall at each
  monthly usage level and revenue is billed bracket-by-bracket through the tier
  structure, so raising a high block's rate correctly raises projected revenue
  (without a distribution the tool falls back to class averages and says so)
- **Fully configurable tier blocks** — add/remove blocks, custom breakpoints
  (including sub-1,000 gal), optional block names; usage past the final block
  always continues at the final rate (20k/30k/40k-gal users are billed in full)
- **Custom customer classes** — every class is renameable (e.g. sewer classes)
- **True Cost of Service** — cost vs. revenue per 1,000 gallons and the
  across-the-board adjustment needed to break even, for board conversations
- **Operating Ratio, DSCR, Affordability Index, Debt-to-Income, Base Coverage**
  scorecard with insufficient-data handling (N/A instead of a red 0)
- **USDA RD / EPA affordability benchmarks** with one-click base-rate suggestions
  (an index *above* 1.5% of MHI supports USDA RD grant eligibility)
- **Fund balance projection** — current rates vs. current budget and proposed vs.
  proposed, per-year debt service schedule, known one-time items (grants/capital)
- **Scenario modeling** (rate multipliers per class, presets; persisted to the report)
- **Data-quality statement** on every report (screen, PDF, DOCX)
- **Print-ready report** (uses CSS print media)
- **Import/Export studies** as JSON

## Automated builds (GitHub Actions)

Every push to `main` or a `claude/**` branch triggers `.github/workflows/build.yml`,
which produces two downloadable artifacts on the run's summary page:

- `water-rate-study-tool-single-file` — the standalone `index.html`
- `water-rate-study-tool-dist` — the chunked `dist/` for normal hosting

The workflow does **not** inject `VITE_ANTHROPIC_KEY` into artifacts. If AI should
be enabled in hosted artifacts, add a repository/environment variable named
`VITE_AI_PROXY_URL` that points at the deployed proxy endpoint. Keep the Anthropic
API key only in the proxy's server-side secret store.

You can also trigger a build manually from the **Actions** tab via
**Run workflow**.


## Geocoding

Step 1 can look up latitude/longitude from the address or system name using
OpenStreetMap Nominatim. The default browser-only build calls Nominatim directly
and cannot set a custom `User-Agent` header because browsers block that header.
Treat direct browser geocoding as best-effort, low-volume convenience behavior for
internal use; the app also throttles geocoding calls to about one request per
second and debounces the Geocode button to avoid accidental repeat requests.

For production deployments where geocoding reliability matters, run the included
server-side proxy so requests can include a compliant `User-Agent` with contact
information:

```bash
GEOCODE_CONTACT=water@example.org npm run geocode-proxy
```

Then build or run the Vite app with the proxy endpoint configured:

```bash
VITE_GEOCODE_ENDPOINT=/api/geocode npm run build
```

If the proxy is hosted on a different origin during development, use its full
URL instead, for example `VITE_GEOCODE_ENDPOINT=http://localhost:8787/api/geocode`.
The proxy exposes `/healthz`, forwards `/api/geocode` to Nominatim, and applies a
one-request-per-second server-side throttle. Set `GEOCODE_CORS_ORIGIN` if you need
to restrict browser origins.

## AI Analysis

Steps 1, 2, 3, and 7 can use AI (system-info estimates, rate suggestions,
budget review, and the board-ready analysis). Two modes:

1. **Server-side proxy mode (recommended).** Run the bundled multi-provider
   proxy (`scripts/ai-proxy.js`) and build the app with `VITE_AI_PROXY_URL`
   pointing at it. Provider API keys stay on the server, and the proxy can
   expose **any mix of Anthropic (Claude) and OpenAI models** — staff pick the
   model in Step 7 → Settings.
2. **Direct-browser mode (local/internal only, Anthropic only).** If
   `VITE_AI_PROXY_URL` is not set, the app calls Anthropic directly from the
   browser with a per-device key entered in Step 7 → Settings (or a build-time
   `VITE_ANTHROPIC_KEY`).

### Quick start — the bundled AI proxy

The proxy is a single dependency-free Node 18+ script:

```bash
# Anthropic and/or OpenAI — set whichever keys you have
ANTHROPIC_API_KEY=sk-ant-... \
OPENAI_API_KEY=sk-... \
AI_AUTH_TOKEN=some-shared-access-code \
npm run ai-proxy          # listens on :8788
```

Then build the app against it:

```bash
echo 'VITE_AI_PROXY_URL=https://your-internal-host.example.com:8788/api/ai/messages' > .env.local
npm run build           # or npm run build:single
```

What the proxy provides:

- `GET /api/ai/config` — the enabled models (`id`, `label`, `provider`), the
  default model, and whether an access code is required. Step 7's Settings
  panel reads this to build the model picker.
- `POST /api/ai/messages` — provider-neutral chat endpoint. The body is
  Anthropic-Messages-shaped (`{ model, max_tokens, system, messages }`); the
  proxy translates to OpenAI's Chat Completions API automatically when the
  chosen model is an OpenAI model, and returns a normalized
  `{ text, model, provider, stop_reason, usage }`.
- `GET /healthz` — liveness check.
- Built-in guardrails: model allowlist, `max_tokens` cap, request-size cap,
  per-IP rate limiting, upstream timeout with one retry, optional shared
  access code (`AI_AUTH_TOKEN`, sent by the app as `Authorization: Bearer`),
  and structured logs that never include prompt or response content.

Key environment variables (see `.env.example` for the full list):

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | enable Claude models | — |
| `OPENAI_API_KEY` | enable OpenAI models | — |
| `ANTHROPIC_MODELS` | allowlist, `id=Label` csv | Opus 4.8 / Sonnet 5 / Haiku 4.5 |
| `OPENAI_MODELS` | allowlist, `id=Label` csv | GPT-5.1 / GPT-5.1 mini |
| `AI_DEFAULT_MODEL` | model when staff haven't picked | first Anthropic model |
| `AI_LIGHT_MODEL` | cheap model for quick suggestions | Haiku / mini |
| `AI_AUTH_TOKEN` | shared access code for staff | off (set it!) |
| `AI_STATIC_DIR` | also serve the built app from the proxy | off |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoints (Azure, etc.) | api.openai.com |

Because `OPENAI_BASE_URL` is configurable, any OpenAI-compatible endpoint
(Azure OpenAI, a gateway, etc.) works by pointing the base URL at it and
listing its model ids in `OPENAI_MODELS`.

### One-container deployment (Docker)

The included `Dockerfile` builds the app with `VITE_AI_PROXY_URL=/api/ai/messages`
and serves both the static app and the AI endpoint from the proxy on one port —
no CORS setup, one thing to run:

```bash
docker build -t wrstdy .
docker run -p 8788:8788 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e OPENAI_API_KEY=sk-... \
  -e AI_AUTH_TOKEN=some-shared-access-code \
  wrstdy
# open http://your-host:8788
```

Without Docker, the same shape works on any box with Node:
`npm run build && AI_STATIC_DIR=./dist ANTHROPIC_API_KEY=... node scripts/ai-proxy.js`.

### Operational recommendations

- **Key storage:** store provider keys only as server-side secrets. The proxy
  never echoes them and never logs prompt/response content (rate studies can
  include sensitive system finances).
- **Access control:** set `AI_AUTH_TOKEN` for anything beyond localhost —
  staff enter the code once in Step 7 → Settings. For stronger control, put
  the proxy behind your SSO/VPN.
- **CORS:** set `AI_CORS_ORIGIN` to the app's origin (not needed for the
  one-container deploy, which is same-origin).
- **Limits:** tune `AI_RATE_LIMIT_PER_MIN` and `AI_MAX_TOKENS_CAP` to your
  budget; the cap is enforced server-side regardless of the browser payload.

### Direct-browser mode for local/internal use

A per-device Anthropic key can be entered via the Step 7 ⚙ Settings panel and
is saved to that browser's `localStorage` only. A model picker (Opus / Sonnet /
Haiku) is available in the same panel.

For trusted local/internal builds only, you may also set a build-time key:

```bash
echo 'VITE_ANTHROPIC_KEY=sk-ant-...' > .env.local
npm run build           # or npm run build:single
```

⚠️ **Anyone with access to the built `dist/` (or `dist-single/index.html`) can
extract `VITE_ANTHROPIC_KEY`.** Do not use this for externally distributed or
public artifacts. Prefer `VITE_AI_PROXY_URL` so provider keys remain on the
server.

## Data

All studies are stored in browser `localStorage` under the key `wrs-studies-v2`.
Use **Export Study (.json)** in the sidebar to back up or transfer studies
between machines.
