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

```bash
npm run build
npm run preview
```

The `dist/` output is fully static — deploy on any web server.

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

## AI Analysis

Step 7 calls the Anthropic API directly from the browser using the
`anthropic-dangerous-direct-browser-access` header. The user supplies their own
API key via the Settings panel; the key is stored only in their browser's
`localStorage`. For production deployment to non-staff users, replace this with
a server-side proxy.

## Data

All studies are stored in browser `localStorage` under the key `wrs-studies-v2`.
Use **Export Study (.json)** in the sidebar to back up or transfer studies
between machines.
