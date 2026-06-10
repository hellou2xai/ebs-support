# Alice AMS Assist

An agentic support application for Vertiv's Oracle E-Business Suite Application Management
Services (the "Alice" programme). Built by U2xAI as a demo.

It triages support incidents, diagnoses them, traces each to its root cause, proposes the
immediate fix and the permanent fix at source, and shows the business and cost context.
It runs **offline by default** (a deterministic agent over a knowledge graph) and uses the
**Claude API** when a key is set.

## What it does

- **Incident queue** with EBS metadata (module, priority, state, opened by, assignee, SLA)
  and business flags (invoice value, customer/supplier tier, quarter-close risk).
- **Pre-start insights** on every incident before you do anything: predicted pattern, root
  cause, recurrence, tier, SLA risk, financial exposure, and the recommended first action.
- **Agent pipeline** of six agents (Intake, Triage, Diagnostic, Problem/RCA, Remediation,
  Communications). Run the full sequence or each step independently.
- **Resolution detail** for any incident: how it was resolved, the object-level EBS detail,
  the agent sequence, the permanent fix, and next steps.
- **Per-persona dashboards** (L1, L2, L3, Finance Controller, Change Approver, AMS Service
  Manager). Switch persona to land on that role's tailored view.
- **AI chat assistant** with full estate scope and object-level grounding; deeplinks to
  incidents, patterns and root causes.
- **Observability** dashboard: queries, tokens, latency and cost per Claude call.
- **AR/AP interface error** incidents enriched with invoice amount and customer/supplier
  classification.

## Stack

- Backend: Node + TypeScript (Express), a real MCP tool layer over CSV data, Claude API.
- Frontend: React + Vite.
- Data: synthetic CSVs in `data/` (deterministic generator in `generate_synthetic_data.py`).

## Run locally

Two terminals:

```bash
# backend (http://localhost:8787)
cd server && npm install && npm run dev

# frontend (http://localhost:5173)
cd web && npm install && npm run dev
```

Open http://localhost:5173. Sign in with `admin` / `admin`.

To use live Claude, copy `server/.env.example` to `server/.env` and set
`ANTHROPIC_API_KEY`. Blank = offline deterministic mode.

## Deploy to Render (free)

This repo includes `render.yaml`. One web service builds the React app and serves it from
the backend.

1. Push to GitHub.
2. In Render: New > Blueprint, point at the repo. It reads `render.yaml`.
3. Set `ANTHROPIC_API_KEY` in the Render dashboard (Environment). Leave unset for offline.
4. Deploy. Render builds with `npm run build` and starts with `npm start`.

Render sets `PORT` automatically; the server respects it and serves the frontend at the
root with the API under `/api`.

## Login and personas

- Demo login: `admin` / `admin`.
- The admin can switch persona (top right) to demo each role's dashboard. Switching persona
  lands on that persona's home view; all tabs stay accessible.

## Data and privacy

- All data in `data/` is synthetic, except the 20 rows marked `DATA_ORIGIN=REAL` in
  `data/incidents.csv` (and `data/incidents_real.csv`), which come from the original ticket
  export. If this repository is public, review those before publishing or keep the repo
  private. The source `.xlsx` is gitignored.
- Never commit API keys. `.env` is gitignored. Rotate any key that has been shared.

## Regenerate data

```bash
python generate_synthetic_data.py
```

## Repo layout

```
data/                        synthetic + real CSV data (see data/README.md)
generate_synthetic_data.py   deterministic data generator
server/                      Node/TS backend: API, agent, MCP server, personas, insights
web/                         React (Vite) frontend
render.yaml                  Render blueprint (single web service)
package.json                 root build/start orchestration for Render
```
