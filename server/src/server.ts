// Express API for the React frontend. Hosts the Claude orchestration and the
// in-process tool layer. Streams the agent's diagnosis over SSE.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import cors from "cors";
import { handlers } from "./tools.js";
import { diagnose, liveEnabled } from "./agent.js";
import { streamChat, ChatMessage } from "./chat.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { AGENTS, runPipeline, runSingleStep, pickIncidents, getResolution } from "./orchestrator.js";
import { incidentObjects } from "./tools.js";
import { summary as usageSummary } from "./usage.js";
import { computeInsights } from "./insights.js";
import { personaDashboard } from "./personas.js";
import { db } from "./data.js";

// Load .env without a dependency.
try {
  const env = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env, fine */ }

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: liveEnabled() ? "LIVE" : "OFFLINE", model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6" });
});

app.get("/api/incidents", (req, res) => {
  res.json(handlers.list_incidents({ state: String(req.query.state || "all"), limit: Number(req.query.limit) || 300 }));
});

app.get("/api/incident/:id", (req, res) => {
  try { res.json(handlers.get_incident({ incident_number: req.params.id })); }
  catch (e: any) { res.status(404).json({ error: e.message }); }
});

// Aggregate view for the dashboard.
app.get("/api/dashboard", (_req, res) => {
  const byStream: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  for (const i of db.incidents) {
    byStream[i.VALUE_STREAM] = (byStream[i.VALUE_STREAM] || 0) + 1;
    const pat = db.patterns.find(p => p.PATTERN_ID === i.PATTERN_ID);
    const auto = (pat?.AUTO_RESOLVABLE || "").toLowerCase();
    const tier = auto.startsWith("yes") ? "Auto-resolve" : auto.startsWith("partial") ? "Assisted" : "Assisted/Escalate";
    byTier[tier] = (byTier[tier] || 0) + 1;
  }
  const patterns = db.patterns.map(p => ({
    pattern_id: p.PATTERN_ID, value_stream: p.VALUE_STREAM,
    signature: p.FAILURE_SIGNATURE, count: Number(p.OCCURRENCE_COUNT),
    auto: p.AUTO_RESOLVABLE, root_cause: p.ROOT_CAUSE_ID,
  })).sort((a, b) => b.count - a.count);
  res.json({
    total: db.incidents.length,
    recurring: db.incidents.filter(i => i.RECURRING_FLAG === "Y").length,
    byStream, byTier, patterns,
    rootCauses: db.rca.length,
  });
});

// Stream the diagnosis as Server-Sent Events.
app.get("/api/incident/:id/diagnose", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  for await (const ev of diagnose(req.params.id)) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }
  res.write("event: done\ndata: {}\n\n");
  res.end();
});

// Approve and execute a proposed action (writes back to the worklog).
app.post("/api/incident/:id/approve", (req, res) => {
  const { action, tier, approver } = req.body ?? {};
  const r = handlers.append_worklog({
    incident_number: req.params.id, stage: "action_executed",
    decision: "Approved by " + (approver || "approver"),
    action: action || "Approved action", tier: tier || "Assisted",
    approver: approver || "Change Approver",
    note: "Action approved and executed (demo: written to worklog)",
  });
  res.json({ ...r, executed: action });
});

app.post("/api/incident/:id/raise-problem", (req, res) => {
  const inc = handlers.get_incident({ incident_number: req.params.id });
  const rca = handlers.get_root_cause({ incident_number: req.params.id });
  handlers.append_worklog({
    incident_number: req.params.id, stage: "problem_raised",
    decision: `Problem record for ${rca.root_cause_id}`,
    action: `Permanent fix: ${rca.permanent_fix}`,
    tier: "Problem/Source", approver: req.body?.approver || "AMS Service Manager",
    note: `Resolve at source. Source: ${rca.source_system}`,
  });
  res.json({ ok: true, root_cause: rca, value_stream: inc.VALUE_STREAM });
});

// AI chat assistant with full semantic scope. SSE over POST.
app.post("/api/chat", async (req, res) => {
  const history: ChatMessage[] = (req.body?.messages ?? []).filter((m: any) => m && m.content);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  for await (const ev of streamChat(history)) {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  }
  res.write("event: done\ndata: {}\n\n");
  res.end();
});

// Agent orchestration dashboard: the agent roster and a streamed pipeline run.
app.get("/api/agents", (_req, res) => res.json(AGENTS));

function sse(res: any) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

app.get("/api/pipeline/run", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 8, 30);
  const ids = (req.query.ids ? String(req.query.ids).split(",") : pickIncidents(limit)).filter(Boolean);
  sse(res);
  for await (const ev of runPipeline(ids)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  res.write("event: done\ndata: {}\n\n");
  res.end();
});

// Run a SINGLE agent step over the batch (independent execution).
app.get("/api/pipeline/step", async (req, res) => {
  const agent = String(req.query.agent || "");
  const limit = Math.min(Number(req.query.limit) || 8, 30);
  const ids = (req.query.ids ? String(req.query.ids).split(",") : pickIncidents(limit)).filter(Boolean);
  sse(res);
  for await (const ev of runSingleStep(agent, ids)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  res.write("event: done\ndata: {}\n\n");
  res.end();
});

// Full resolution report for one incident (how resolved + next steps + agent outputs).
app.get("/api/incident/:id/resolution", (req, res) => {
  try { res.json(getResolution(req.params.id)); }
  catch (e: any) { res.status(404).json({ error: e.message }); }
});

// Pattern detail.
app.get("/api/pattern/:id", (req, res) => {
  const p = db.patterns.find(x => x.PATTERN_ID === req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  const incidents = db.incidents.filter(i => i.PATTERN_ID === p.PATTERN_ID);
  const rca = db.rca.find(x => x.RCA_ID === p.ROOT_CAUSE_ID);
  const action = db.actions.find(a => (a.PATTERN_ID || "").split(",").includes(p.PATTERN_ID));
  const kb = db.kb.find(k => k.PATTERN_ID === p.PATTERN_ID);
  res.json({
    pattern_id: p.PATTERN_ID, value_stream: p.VALUE_STREAM, signature: p.FAILURE_SIGNATURE,
    occurrence_count: Number(p.OCCURRENCE_COUNT), auto_resolvable: p.AUTO_RESOLVABLE,
    root_cause_id: p.ROOT_CAUSE_ID,
    root_cause: rca ? { root_cause: rca.ROOT_CAUSE, permanent_fix: rca.PERMANENT_FIX, source_system: rca.SOURCE_SYSTEM, source_object: rca.SOURCE_OBJECT } : null,
    action: action ? { action_name: action.ACTION_NAME, ebs_program: action.EBS_PROGRAM_OR_API, risk: action.RISK_LEVEL, approval: action.REQUIRES_APPROVAL } : null,
    kb: kb ? { title: kb.TITLE, resolution: kb.RESOLUTION_SUMMARY } : null,
    example_incidents: incidents.slice(0, 12).map(i => i.INCIDENT_NUMBER),
    objects: incidents.slice(0, 4).flatMap(i => incidentObjects(i.INCIDENT_NUMBER)).slice(0, 14),
  });
});

// Root cause detail.
app.get("/api/rca/:id", (req, res) => {
  const r = db.rca.find(x => x.RCA_ID === req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  const incidents = db.incidents.filter(i => i.ROOT_CAUSE_ID === r.RCA_ID);
  const patterns = db.patterns.filter(p => p.ROOT_CAUSE_ID === r.RCA_ID).map(p => p.PATTERN_ID);
  res.json({
    rca_id: r.RCA_ID, value_stream: r.VALUE_STREAM, symptom: r.SYMPTOM,
    immediate_resolution: r.IMMEDIATE_RESOLUTION, root_cause: r.ROOT_CAUSE,
    source_system: r.SOURCE_SYSTEM, source_object: r.SOURCE_OBJECT,
    permanent_fix: r.PERMANENT_FIX, fix_category: r.FIX_CATEGORY, effort: r.EFFORT,
    patterns, incident_count: incidents.length,
    example_incidents: incidents.slice(0, 12).map(i => i.INCIDENT_NUMBER),
    objects: incidents.slice(0, 4).flatMap(i => incidentObjects(i.INCIDENT_NUMBER)).slice(0, 14),
  });
});

// Observability: queries, tokens, cost.
app.get("/api/observability", (_req, res) => res.json(usageSummary()));

// Pre-start insights for one incident (computed before any agent runs).
app.get("/api/incident/:id/insights", (req, res) => {
  try { res.json(computeInsights(req.params.id)); }
  catch (e: any) { res.status(404).json({ error: e.message }); }
});

// Per-persona home dashboard.
app.get("/api/persona/:role", (req, res) => res.json(personaDashboard(req.params.role)));

// Demo login (admin/admin). Not real auth; gates the demo UI only.
app.post("/api/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (username === "admin" && password === "admin") res.json({ ok: true, user: "admin", role: "Administrator" });
  else res.status(401).json({ ok: false, error: "Invalid credentials" });
});

// Serve the built React app in production (single-service deploy on Render).
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, "..", "..", "web", "dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(webDist, "index.html")));
  console.log(`Serving frontend from ${webDist}`);
}

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  console.log(`Alice AMS backend on http://localhost:${PORT}  [${liveEnabled() ? "LIVE" : "OFFLINE"} mode]`);
});
