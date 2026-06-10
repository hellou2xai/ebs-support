# Alice AMS Assist: how to run the demo

A vertical slice of the Vertiv Oracle EBS AMS support agentic app. React frontend,
Node/TypeScript backend, Claude API orchestration over an MCP tool layer backed by the
synthetic data in `data/`.

It runs **offline by default** (a deterministic agent driven by the knowledge graph and
root-cause data, no API key needed). Add an Anthropic key to switch the diagnosis
narration to **live Claude**.

## Prerequisites

- Node.js 18+ and npm.
- (Optional) an Anthropic API key for live mode.

## 1. Set the API key (optional)

The key file is already created at `server/.env`. Open it and paste your key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Get a key at https://console.anthropic.com/settings/keys. Leave it blank to run offline.

## 2. Start the backend

```powershell
cd server
npm install
npm run dev
```

Backend serves on http://localhost:8787. The console prints `[OFFLINE mode]` or
`[LIVE mode]`.

## 3. Start the frontend (a second terminal)

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend.

## 4. Use it

1. Pick a persona (top right). L2/L3 can approve; L1 can only diagnose.
2. Click an incident in the queue. Real ones are tagged `real`; recurring ones `recurring`.
   A good showcase is the revision-sync incident **INC0903826** (Item-MDM).
3. Click **Run agent**. Watch the stages stream: classify, gather evidence, trace to
   source, check recurrence, propose action.
4. Read the diagnosis. The **Resolve at source** card shows the root cause and the
   permanent fix, with how many incidents share that root cause.
5. As L2/L3, click **Approve & execute** (immediate fix) or, as L3 / Service Manager,
   **Raise problem (fix at source)**. Both write to `data/agent_worklog.csv`.
6. The **Track dashboard** tab shows volumes by value stream, by resolution tier, and the
   repetitive-issue patterns by frequency.

## The MCP layer

The same tools the agent uses are exposed as a standalone MCP server:

```powershell
cd server
npm run mcp
```

This speaks MCP over stdio and can be attached to Claude Desktop or the MCP Inspector.
Tools: `list_open_incidents`, `get_incident`, `match_pattern`, `get_evidence`,
`get_root_cause`, `get_recurrence`, `get_proposed_action`, `append_worklog`.

## Regenerate the data

```powershell
python generate_synthetic_data.py
```

## Layout

```
data/                      synthetic + real CSV data (see data/README.md)
generate_synthetic_data.py deterministic data generator
server/                    Node/TS backend: Express API, agent, MCP server
  src/tools.ts             the tool layer (single source of truth)
  src/agent.ts             orchestration (offline + live Claude)
  src/mcp-server.ts        standalone MCP stdio server
  src/server.ts            Express API + SSE streaming
web/                       React (Vite) frontend
```
