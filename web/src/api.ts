import type { IncidentSummary, StageEvent, Dashboard } from "./types";

export async function getIncidents(): Promise<IncidentSummary[]> {
  const r = await fetch("/api/incidents");
  return r.json();
}

export async function getDashboard(): Promise<Dashboard> {
  const r = await fetch("/api/dashboard");
  return r.json();
}

export async function getHealth(): Promise<{ mode: string; model: string }> {
  const r = await fetch("/api/health");
  return r.json();
}

// Stream the diagnosis via SSE. Calls onEvent for each stage / bundle / error.
export function diagnose(id: string, onEvent: (ev: StageEvent) => void): () => void {
  const es = new EventSource(`/api/incident/${id}/diagnose`);
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)); } catch { /* ignore keepalives */ }
  };
  es.addEventListener("done", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}

export async function approve(id: string, action: string, tier: string, approver: string) {
  const r = await fetch(`/api/incident/${id}/approve`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, tier, approver }),
  });
  return r.json();
}

export interface ChatMsg { role: "user" | "assistant"; content: string; }
export type ChatEvent =
  | { type: "tool"; name: string; input: any }
  | { type: "answer"; text: string }
  | { type: "usage"; cost: number; inputTokens: number; outputTokens: number; model: string; latencyMs: number }
  | { type: "error"; message: string };

export interface Observability {
  queries: number; totalCost: number; inputTokens: number; outputTokens: number;
  avgCost: number; avgLatencyMs: number;
  byFeature: Record<string, { count: number; cost: number; tokens: number }>;
  recent: { id: string; ts: string; feature: string; model: string; inputTokens: number; outputTokens: number; cost: number; latencyMs: number; detail: string }[];
}
export async function getObservability(): Promise<Observability> {
  const r = await fetch("/api/observability");
  return r.json();
}

export async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  return r.ok ? r.json() : { ok: false, error: "Invalid credentials" };
}

export async function getInsights(id: string): Promise<any> {
  const r = await fetch(`/api/incident/${id}/insights`);
  return r.json();
}

export async function getPersona(role: string): Promise<any> {
  const r = await fetch(`/api/persona/${encodeURIComponent(role)}`);
  return r.json();
}

// Chat over SSE-on-POST: read the streamed body and emit each event.
export async function chat(messages: ChatMsg[], onEvent: (ev: ChatEvent) => void): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find(l => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "{}") continue;
      try { onEvent(JSON.parse(payload)); } catch { /* ignore */ }
    }
  }
}

export async function raiseProblem(id: string, approver: string) {
  const r = await fetch(`/api/incident/${id}/raise-problem`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approver }),
  });
  return r.json();
}

export interface AgentDef { id: string; name: string; role: string; uses: string; autonomy: string; }
export async function getAgents(): Promise<AgentDef[]> {
  const r = await fetch("/api/agents");
  return r.json();
}

export type PipelineEvent =
  | { type: "init"; ids: string[] }
  | { type: "agent_start"; incident: string; agent: string }
  | { type: "agent_done"; incident: string; agent: string; status: "ok" | "skip" | "hold"; summary: string }
  | { type: "incident_done"; incident: string; outcome: string; tier: string }
  | { type: "pipeline_done"; stats: Record<string, number> }
  | { type: "step_done"; agent: string; count: number };

export function runPipeline(limit: number, onEvent: (ev: PipelineEvent) => void): () => void {
  const es = new EventSource(`/api/pipeline/run?limit=${limit}`);
  es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch { /* ignore */ } };
  es.addEventListener("done", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}

export function runStep(agent: string, limit: number, onEvent: (ev: PipelineEvent) => void): () => void {
  const es = new EventSource(`/api/pipeline/step?agent=${agent}&limit=${limit}`);
  es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch { /* ignore */ } };
  es.addEventListener("done", () => es.close());
  es.onerror = () => es.close();
  return () => es.close();
}

export type DetailKind = "resolution" | "pattern" | "rca";
export async function getDetail(kind: DetailKind, id: string): Promise<any> {
  const path = kind === "resolution" ? `/api/incident/${id}/resolution`
    : kind === "pattern" ? `/api/pattern/${id}` : `/api/rca/${id}`;
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${id} not found`);
  return r.json();
}
