# Water Rate Study Tool — Choctaw Nation OWRM

Internal tool for the Choctaw Nation Office of Water Resource Management to assist
public water systems with rate study analysis, budget review, financial scorecard
metrics, 5-year projections, scenario modeling, and board-ready reporting.

## Stack

- **Vite** — build/dev tooling
- **React 18** — UI
- **Chart.js 4** — projection charts
- **localStorage** — persistence (no backend required)
- **Anthropic API** (optional) — AI analysis section. Requires user-provided API key.

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

To bake an Anthropic API key into the artifacts, add it as a repo secret:

> **Settings → Secrets and variables → Actions → New repository secret**
> Name: `VITE_ANTHROPIC_KEY`  Value: `sk-ant-...`

The workflow injects it at build time. The key is encrypted at rest, isn't
visible in workflow logs, and isn't readable from forked-PR runs.

You can also trigger a build manually from the **Actions** tab via
**Run workflow**.

## AI Analysis

Step 7 calls the Anthropic API directly from the browser using the
`anthropic-dangerous-direct-browser-access` header.

The key can come from two places (in priority order):

1. **A per-device key** entered via the Step 7 ⚙ Settings panel — saved to
   `localStorage` only on that browser.
2. **A build-time key** in a `VITE_ANTHROPIC_KEY` env var — baked into the
   bundle so staff don't have to enter anything.

To bake in a key:

```bash
echo 'VITE_ANTHROPIC_KEY=sk-ant-...' > .env.local
npm run build           # or npm run build:single
```

⚠️ **Anyone with access to the built `dist/` (or `dist-single/index.html`)
can extract that key.** Only do this for builds distributed to trusted OWRM
staff on internal infrastructure. For external/public deployment, leave the
env var unset and put a server-side proxy in front of the Anthropic API
instead.

## Data

All studies are stored in browser `localStorage` under the key `wrs-studies-v2`.
Use **Export Study (.json)** in the sidebar to back up or transfer studies
between machines.
