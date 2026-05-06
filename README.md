# Water Rate Study Tool — Choctaw Nation OWRM

Internal tool for the Choctaw Nation Office of Water Resource Management to assist
public water systems with rate study analysis, budget review, financial scorecard
metrics, 5-year projections, scenario modeling, and board-ready reporting.

## Stack

- **Vite** — build/dev tooling
- **React 18** — UI
- **Chart.js 4** — projection charts
- **localStorage** — persistence (no backend required for study data)
- **Anthropic API** (optional) — AI analysis section. Hosted deployments should use a server-side proxy.

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
- **Tiered rate calculation** with auto-cumulative bill display
- **USDA RD / EPA affordability benchmarks** with one-click base-rate suggestions
- **Operating Ratio, Affordability Index, Debt-to-Income, Base Coverage** scorecard
- **Fund balance projection** with chart visualizations
- **Scenario modeling** (rate multipliers per class, presets)
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

## AI Analysis

Step 7 can call Anthropic in two modes:

1. **Server-side proxy mode (recommended for hosted or externally distributed builds).**
   Set `VITE_AI_PROXY_URL` at build time. The browser sends `ask` and `chat`
   payloads to that URL instead of calling `https://api.anthropic.com/v1/messages`
   directly, and no browser-visible Anthropic key is required.
2. **Direct-browser mode (local/internal only).** If `VITE_AI_PROXY_URL` is not
   set, the app calls Anthropic directly from the browser using the
   `anthropic-dangerous-direct-browser-access` header. This mode requires either
   a per-device key entered in Step 7 → Settings or a build-time
   `VITE_ANTHROPIC_KEY`.

### Configure proxy mode

Set the proxy URL before building:

```bash
echo 'VITE_AI_PROXY_URL=https://your-internal-host.example.com/api/ai/messages' > .env.local
npm run build           # or npm run build:single
```

The proxy should accept a `POST` with an Anthropic Messages API-compatible JSON
body:

```json
{
  "model": "claude-haiku-4-5-20251001",
  "max_tokens": 1200,
  "system": "...",
  "messages": [{ "role": "user", "content": "..." }]
}
```

The proxy can return Anthropic's normal response (`content: [{ text: "..." }]`) or
a simplified response such as `{ "text": "..." }`.

Proxy deployment recommendations:

- **Key storage:** store `ANTHROPIC_API_KEY` only as a server-side secret
  (platform secret manager, encrypted environment variable, or equivalent). Do
  not echo it in responses, logs, client-rendered HTML, or source maps.
- **Authentication and authorization:** restrict the proxy to approved staff,
  internal networks, SSO, or another access-control layer. Do not leave an
  unauthenticated public endpoint that can spend your Anthropic credits.
- **Rate limiting:** enforce per-user/per-IP quotas and request-size limits.
  Return `429` when callers exceed expected usage, and cap `max_tokens` to a
  safe value server-side rather than trusting the browser payload.
- **Request validation:** allow only expected models and fields, and normalize
  or reject unsupported payloads before forwarding to Anthropic.
- **Logging:** log timestamp, authenticated user or client identifier, status,
  latency, model, token counts, and request IDs for operations and cost review.
  Avoid logging full prompts/responses unless you have explicit approval because
  rate studies may include sensitive system finances and customer data.
- **Error handling:** map Anthropic errors to concise client errors and avoid
  leaking server stack traces or secrets.
- **CORS:** allow the Water Rate Study Tool origin(s) only.

### Direct-browser mode for local/internal use

A per-device key can be entered via the Step 7 ⚙ Settings panel and is saved to
that browser's `localStorage` only.

For trusted local/internal builds only, you may also set a build-time key:

```bash
echo 'VITE_ANTHROPIC_KEY=sk-ant-...' > .env.local
npm run build           # or npm run build:single
```

⚠️ **Anyone with access to the built `dist/` (or `dist-single/index.html`) can
extract `VITE_ANTHROPIC_KEY`.** Do not use this for externally distributed or
public artifacts. Prefer `VITE_AI_PROXY_URL` so the Anthropic key remains on the
server.

## Data

All studies are stored in browser `localStorage` under the key `wrs-studies-v2`.
Use **Export Study (.json)** in the sidebar to back up or transfer studies
between machines.
