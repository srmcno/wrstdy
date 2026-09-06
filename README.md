# Water Rate Study Tool — Choctaw Nation OWRM

Internal tool for the Choctaw Nation Office of Water Resource Management to help
tribal public water systems set rates: budget review, financial scorecard,
5-year projections, scenario modelling, and a board-ready report.

It ships in two forms from one codebase:

| | Standalone web app | Power Apps code component |
| --- | --- | --- |
| Where it runs | Any browser; a static host, or one self-contained HTML file | Inside a canvas app, on any device Power Apps runs on |
| Persistence | This browser's `localStorage` | The canvas app → SharePoint |
| Files | Downloads directly | Handed to Power Apps to file in a document library |
| Map | Full Leaflet map with council districts | Provided by the canvas app |
| Analysis | Direct or via the bundled proxy | A Power Automate flow the app owns |
| Best for | Field work, no licence needed, the map | Shared team caseload, audit trail, SharePoint |

- **[`docs/SHAREPOINT-BACKEND.md`](docs/SHAREPOINT-BACKEND.md)** — the lists,
  libraries, columns, indexes, permissions, and flows behind the canvas app,
  plus a PnP provisioning script.
- **[`docs/POWER-APPS-INTEGRATION.md`](docs/POWER-APPS-INTEGRATION.md)** — how
  to build, deploy, and wire the code component, with the canvas formulas.

## Stack

- **Vite** — build tooling for all three outputs
- **React 18** — UI
- **Chart.js 4** — projection charts
- **Leaflet** — the system map (standalone build only)
- **jsPDF / docx** — board report exports
- **Power Apps component framework** — the canvas app packaging

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # calculation and data-check unit tests
npm run test:browser # end-to-end checks in Chromium (needs Playwright — see below)
```

`npm test` runs the unit tests with `node --test`; they cover the billing
engine, the financial ratios, the projection, the number formatting, the data
checks, and the Power Apps bridge.

`npm run test:browser` renders the real application and the code component in a
headless browser to catch what unit tests cannot: a step that fails to render,
CSS leaking out of the component into its host page, or the Power Apps bridge
echoing its own output. Playwright is not a project dependency (~200 MB); install
it when you want to run it:

```bash
npm i -D playwright && npx playwright install chromium
npm run build && npm run build:pcf && npm run test:browser
```

## Build

```bash
# Standard chunked build → dist/  (deploy to any web server)
npm run build

# Single self-contained HTML → dist-single/index.html
# (~600 KB, all JS/CSS/images inlined; works via file://, email attachment,
#  USB stick, or dropped into a SharePoint folder)
npm run build:single

# Power Apps component bundle → pcf/WaterRateStudyTool/app/wrs-app.js
npm run build:pcf
```

See [`docs/POWER-APPS-INTEGRATION.md`](docs/POWER-APPS-INTEGRATION.md) for the
full code-component build and deploy sequence (`pac pcf push`, solution
packaging, adding it to an app).

## Features

- **8-step guided workflow**: System Info → Customer Classes/Rates → Budget →
  Financial Metrics → 5-Year Projection → Scenarios → AI Analysis → Final Report
- **Usage-distribution revenue engine** — enter how many customers fall at each
  monthly usage level and revenue is billed bracket-by-bracket through the tier
  structure, so raising a high block's rate correctly raises projected revenue
  (without a distribution the tool falls back to class averages and says so)
- **Fully configurable tier blocks** — add/remove blocks, custom breakpoints
  (including sub-1,000 gal), optional block names; usage past the final block
  always continues at the final rate, so 20k/30k/40k-gal users are billed in full
- **Custom customer classes** — every class is renameable (e.g. sewer classes)
- **True Cost of Service** — cost vs. revenue per 1,000 gallons and the
  across-the-board adjustment needed to break even
- **Operating Ratio, DSCR, Affordability Index, Debt-to-Income, Base Coverage**
  scorecard with insufficient-data handling (N/A instead of a red 0)
- **USDA RD / EPA affordability benchmarks** with one-click base-rate suggestions
  (an index *above* 1.5% of MHI supports USDA RD grant eligibility)
- **Data Check** — an automated pre-publication review that flags the mistakes
  that actually reach board packets: an annual MHI in the monthly field, a
  proposed side with rates but no customers, a usage distribution that
  contradicts the class totals, declining block rates, a projection that runs
  the fund balance negative. Blocking findings are surfaced on the step tabs.
- **Fund balance projection** — current rates vs. current budget and proposed vs.
  proposed, per-year debt service schedule, known one-time items (grants/capital)
- **Customer bill impact** — what the change means at 1k / 2k / 5k / 10k gallons,
  per class, for board and public communication
- **Scenario modelling** (rate multipliers per class, presets; persisted to the report)
- **Multi-study workspace** with sidebar, dashboard, and a map of Choctaw Nation
  water systems and council districts (standalone build)
- **Print-ready report**, **PDF** and **Word** exports, **CSV** rate tables
- **Import/Export studies** as JSON — the same format the code component reads

## Repository layout

```
src/
  lib/          calculations, validation, state, exporters — no UI, fully tested
  components/   shared UI
  steps/        the eight workflow steps
  platform/     host abstraction: web (localStorage/downloads) vs Power Apps
  main.jsx      standalone entry point
  pcf-entry.jsx code-component entry point (mountWaterRateStudy)
pcf/            the Power Apps component framework project + solution
docs/           SharePoint back end and Power Apps integration
scripts/        AI proxy, geocode proxy, browser smoke test
```

`src/platform/host.js` is the seam that lets one codebase serve both hosts.
Nothing in `steps/`, `components/`, or `lib/` knows which container it is in;
they ask the host to persist studies, deliver a file, or print, and the host
decides how.

## Data and persistence

**Standalone build.** Studies live in this browser's `localStorage` under
`wrs-studies-v2`. That is the only copy — use **Export Study (.json)** to back
up or move a study between machines. The workspace bar shows a warning once a
study with real data has gone a week without a backup.

**Power Apps build.** The canvas app owns persistence; see
[`docs/SHAREPOINT-BACKEND.md`](docs/SHAREPOINT-BACKEND.md). The component
writes nothing to browser storage — the component framework forbids it.

## Automated builds (GitHub Actions)

Every push to `main` or a `claude/**` branch runs `.github/workflows/build.yml`,
which runs the tests and produces three downloadable artifacts on the run's
summary page:

- `water-rate-study-tool-single-file` — the standalone `index.html`
- `water-rate-study-tool-dist` — the chunked `dist/` for normal hosting
- `water-rate-study-tool-pcf-app-bundle` — the code component's app bundle

The workflow does **not** inject `VITE_ANTHROPIC_KEY` into artifacts. To enable
AI in hosted artifacts, add a repository/environment variable
`VITE_AI_PROXY_URL` pointing at the deployed proxy. Keep the provider API key
only in the proxy's server-side secret store.

You can also trigger a build from the **Actions** tab via **Run workflow**.

## Geocoding

Step 1 can look up latitude/longitude from the address or system name using
OpenStreetMap Nominatim. The default browser-only build calls Nominatim directly
and cannot set a custom `User-Agent` header, so treat direct browser geocoding
as best-effort, low-volume convenience behaviour for internal use; the app
throttles to about one request per second and debounces the button.

For production deployments where geocoding reliability matters, run the included
server-side proxy so requests carry a compliant `User-Agent` with contact
information:

```bash
GEOCODE_CONTACT=water@example.org npm run geocode-proxy
VITE_GEOCODE_ENDPOINT=/api/geocode npm run build
```

If the proxy is on a different origin during development, use its full URL
instead (e.g. `http://localhost:8787/api/geocode`). The proxy exposes
`/healthz`, forwards `/api/geocode` to Nominatim, and applies a
one-request-per-second server-side throttle. Set `GEOCODE_CORS_ORIGIN` to
restrict browser origins.

## AI Analysis

Steps 1, 2, 3, and 7 can use AI (system-info estimates, rate suggestions,
budget review, and the board-ready analysis). **Three** modes, and the app
picks whichever the host provides:

1. **Host-brokered (Power Apps).** The component emits an analysis *request*;
   the canvas app fulfils it with a Power Automate flow against the
   organisation's approved model. No key or endpoint exists inside the
   component — which is what the framework requires, since canvas code
   components cannot do custom auth.
2. **Server-side proxy (recommended for the standalone build).** Run
   `scripts/ai-proxy.js` and build with `VITE_AI_PROXY_URL` pointing at it.
   Provider keys stay on the server, and the proxy can expose any mix of
   Anthropic and OpenAI models — staff pick one in Step 7 → Settings.
3. **Direct browser (local/internal only, Anthropic only).** A per-device key
   entered in Step 7 → Settings, or a build-time `VITE_ANTHROPIC_KEY`.

### Quick start — the bundled AI proxy

A single dependency-free Node 18+ script:

```bash
ANTHROPIC_API_KEY=sk-ant-... \
OPENAI_API_KEY=sk-... \
AI_AUTH_TOKEN=some-shared-access-code \
npm run ai-proxy          # listens on :8788
```

Then build the app against it:

```bash
echo 'VITE_AI_PROXY_URL=https://your-internal-host.example.com:8788/api/ai/messages' > .env.local
npm run build             # or npm run build:single
```

What the proxy provides:

- `GET /api/ai/config` — the enabled models (`id`, `label`, `provider`), the
  default model, and whether an access code is required. Step 7's Settings
  panel reads this to build the model picker.
- `POST /api/ai/messages` — provider-neutral chat endpoint. The body is
  Anthropic-Messages-shaped (`{ model, max_tokens, system, messages }`); the
  proxy translates to OpenAI's Chat Completions API when the chosen model is an
  OpenAI model, and returns a normalized
  `{ text, model, provider, stop_reason, usage }`.
- `GET /healthz` — liveness check.
- Guardrails: model allowlist, `max_tokens` cap, request-size cap, per-IP rate
  limiting, upstream timeout with one retry, optional shared access code
  (`AI_AUTH_TOKEN`, sent as `Authorization: Bearer`), and structured logs that
  never include prompt or response content.

Key environment variables (see `.env.example` for the full list):

| Variable | Purpose | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | enable Claude models | — |
| `OPENAI_API_KEY` | enable OpenAI models | — |
| `ANTHROPIC_MODELS` | allowlist, `id=Label` csv | Opus 4.8 / Sonnet 5 / Haiku 4.5 |
| `OPENAI_MODELS` | allowlist, `id=Label` csv | GPT-5.1 / GPT-5.1 mini |
| `AI_DEFAULT_MODEL` | model when staff haven't picked | first configured (Anthropic first when both are enabled) |
| `AI_LIGHT_MODEL` | cheap model for quick suggestions | Haiku / mini |
| `AI_AUTH_TOKEN` | shared access code for staff | off (set it!) |
| `AI_TRUST_PROXY` | honour `X-Forwarded-For` for rate limiting — only behind a trusted reverse proxy that overwrites it | off |
| `AI_STATIC_DIR` | also serve the built app from the proxy | off |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoints (Azure, gateways) | api.openai.com |

### One-container deployment (Docker)

The included `Dockerfile` builds the app with `VITE_AI_PROXY_URL=/api/ai/messages`
and serves both the static app and the AI endpoint from the proxy on one port —
no CORS setup, one thing to run:

```bash
docker build -t wrstdy .
docker run -p 8788:8788 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e AI_AUTH_TOKEN=some-shared-access-code \
  wrstdy
# open http://your-host:8788
```

> **Serve over TLS before exposing beyond localhost.** The proxy speaks plain
> HTTP and the access code travels as a bearer token, so anything reachable from
> other machines should sit behind a TLS-terminating reverse proxy or load
> balancer. When you add one, set `AI_TRUST_PROXY=true` so per-IP rate limiting
> uses the forwarded address.

Without Docker, the same shape works on any box with Node:
`npm run build && AI_STATIC_DIR=./dist ANTHROPIC_API_KEY=... node scripts/ai-proxy.js`.

### Operational recommendations

- **Key storage:** provider keys only as server-side secrets (or, in Power Apps,
  inside the flow's connection / Key Vault). The proxy never echoes them and
  never logs prompt or response content — rate studies include sensitive system
  finances.
- **Access control:** set `AI_AUTH_TOKEN` for anything beyond localhost. For
  stronger control, put the proxy behind your SSO/VPN.
- **CORS:** set `AI_CORS_ORIGIN` to the app's origin (not needed for the
  one-container deploy, which is same-origin).
- **Limits:** tune `AI_RATE_LIMIT_PER_MIN` and `AI_MAX_TOKENS_CAP` to your budget;
  the cap is enforced server-side regardless of the browser payload.

⚠️ **Anyone with access to a build made with `VITE_ANTHROPIC_KEY` can extract the
key.** Do not use it for externally distributed artifacts.
