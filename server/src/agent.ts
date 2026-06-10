// Agent orchestration. Runs the two-loop model from the design doc:
//   resolution loop (clear the ticket) + problem loop (resolve at source).
// OFFLINE by default (deterministic, driven by the knowledge layer). If
// ANTHROPIC_API_KEY is set, LIVE mode uses Claude to classify and narrate.
import { handlers } from "./tools.js";
import { record } from "./usage.js";

export type StageEvent =
  | { type: "stage"; stage: string; label: string; detail?: any }
  | { type: "bundle"; bundle: DiagnosticBundle }
  | { type: "error"; message: string };

export interface DiagnosticBundle {
  incident_number: string;
  mode: "OFFLINE" | "LIVE";
  theme: string;
  value_stream: string;
  primary_system: string;
  classification: any;
  evidence: any;
  root_cause: any;
  recurrence: any;
  proposed_action: any;
  narrative: string;
  resolution_tier: string;
  requires_approval: boolean;
  cost?: number;
  usage?: { inputTokens: number; outputTokens: number; model: string; latencyMs: number };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function liveEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0;
}

// Deterministic narrative assembled from the tool outputs, in a readable structure
// (short headers, bullets, short paragraphs). Same shape live mode is asked to produce.
function offlineNarrative(b: Omit<DiagnosticBundle, "narrative">): string {
  const rc = b.root_cause;
  const rec = b.recurrence;
  const pa = b.proposed_action;
  const linked = rec.linked_incidents.length ? ` Recreated/linked tickets: ${rec.linked_incidents.join(", ")}.` : "";
  return [
    `### What's wrong`,
    `${b.theme} on ${b.incident_number}, classified as ${b.classification.pattern_id} (${b.classification.failure_signature}). Evidence read from ${b.evidence.source_table} (${b.evidence.rows.length} row(s)).`,
    ``,
    `### Root cause`,
    rc.root_cause ? `${rc.root_cause} Source: ${rc.source_system} (${rc.source_object}).` : `No catalogued root cause for ${rc.root_cause_id}.`,
    ``,
    `### Immediate fix`,
    `- ${rc.immediate_resolution || pa.action_name}${pa.ebs_program ? ` (${pa.ebs_program})` : ""}`,
    `- Tier: ${b.resolution_tier}. ${b.requires_approval ? "Approval required before any write." : "No approval required."}`,
    ``,
    `### Permanent fix (resolve at source)`,
    rc.permanent_fix ? `- ${rc.permanent_fix}` : `- To be defined.`,
    rc.fix_category ? `- Fix type: ${rc.fix_category}, effort ${rc.effort}.` : ``,
    ``,
    `### Why fix it now`,
    `This root cause accounts for ${rec.incidents_with_same_root_cause} incident(s) in scope.${linked} Closing it at source stops the repeat stream rather than this one ticket.`,
  ].filter(l => l !== undefined).join("\n");
}

async function liveNarrative(b: Omit<DiagnosticBundle, "narrative">): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number; model: string; latencyMs: number }; cost: number }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
  const t0 = Date.now();
  const msg = await client.messages.create({
    model,
    max_tokens: 800,
    system:
      "You are an Oracle EBS AMS support engineer for the Vertiv 'Alice' programme. " +
      "Given a classified incident with evidence, root cause and recurrence, write a tight, scannable " +
      "diagnostic note for a fellow engineer, grounded in the evidence and the EBS objects. " +
      "Use exactly these markdown headers in this order, each followed by short content:\n" +
      "### What's wrong  (2 to 3 short sentences)\n" +
      "### Root cause  (1 to 2 short sentences)\n" +
      "### Immediate fix  (1 to 3 bullets starting with '- ')\n" +
      "### Permanent fix (resolve at source)  (1 to 3 bullets starting with '- ')\n" +
      "### Why fix it now  (1 to 2 sentences citing the recurrence count)\n" +
      "Rules: British English. No em-dashes. Plain and specific, no marketing tone. " +
      "Use only '###' headers and '- ' bullets. Do not use bold, asterisks for emphasis, or backslash escapes. " +
      "Refer to EBS objects in plain text (e.g. MTL_ITEM_REVISIONS_B).",
    messages: [{ role: "user", content: "Diagnose this:\n```json\n" + JSON.stringify(b, null, 2) + "\n```" }],
  });
  const text = msg.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  const inputTokens = msg.usage?.input_tokens ?? 0;
  const outputTokens = msg.usage?.output_tokens ?? 0;
  const rec = record({ feature: "diagnosis", model, inputTokens, outputTokens, latencyMs: Date.now() - t0, detail: b.incident_number });
  return { text: text || offlineNarrative(b), usage: { inputTokens, outputTokens, model, latencyMs: rec.latencyMs }, cost: rec.cost };
}

export async function* diagnose(incidentNumber: string): AsyncGenerator<StageEvent> {
  const mode: "OFFLINE" | "LIVE" = liveEnabled() ? "LIVE" : "OFFLINE";
  try {
    yield { type: "stage", stage: "intake", label: `Picked up ${incidentNumber} (${mode} mode)` };
    const incident = handlers.get_incident({ incident_number: incidentNumber });
    await sleep(250);

    yield { type: "stage", stage: "classify", label: "Classifying against repetitive-issue patterns" };
    const classification = handlers.match_pattern({ incident_number: incidentNumber });
    await sleep(300);
    yield { type: "stage", stage: "classify", label: `Pattern ${classification.pattern_id}: ${classification.failure_signature}`, detail: classification };

    yield { type: "stage", stage: "evidence", label: "Gathering EBS evidence" };
    const evidence = handlers.get_evidence({ incident_number: incidentNumber });
    await sleep(300);
    yield { type: "stage", stage: "evidence", label: `Read ${evidence.rows.length} row(s) from ${evidence.source_table}`, detail: evidence };

    yield { type: "stage", stage: "root_cause", label: "Tracing to source (root cause + permanent fix)" };
    const rootCause = handlers.get_root_cause({ incident_number: incidentNumber });
    await sleep(300);
    yield { type: "stage", stage: "root_cause", label: rootCause.root_cause ? `Root cause: ${rootCause.root_cause_id}` : "No catalogued root cause", detail: rootCause };

    yield { type: "stage", stage: "recurrence", label: "Checking recurrence across the estate" };
    const recurrence = handlers.get_recurrence({ incident_number: incidentNumber });
    await sleep(250);
    yield { type: "stage", stage: "recurrence", label: `${recurrence.incidents_with_same_root_cause} incident(s) share this root cause`, detail: recurrence };

    yield { type: "stage", stage: "propose", label: "Proposing immediate action" };
    const proposed = handlers.get_proposed_action({ incident_number: incidentNumber });
    await sleep(250);

    const base: Omit<DiagnosticBundle, "narrative"> = {
      incident_number: incidentNumber,
      mode,
      theme: incident.BUSINESS_IMPACT_THEME,
      value_stream: incident.VALUE_STREAM,
      primary_system: incident.PRIMARY_SYSTEM,
      classification,
      evidence,
      root_cause: rootCause,
      recurrence,
      proposed_action: proposed,
      resolution_tier: proposed.tier,
      requires_approval: (proposed.requires_approval ?? "Y") !== "N",
    };

    yield { type: "stage", stage: "narrate", label: mode === "LIVE" ? "Claude is writing the diagnosis" : "Assembling diagnosis" };
    let narrative: string, cost: number | undefined, usage: DiagnosticBundle["usage"];
    if (mode === "LIVE") { const r = await liveNarrative(base); narrative = r.text; cost = r.cost; usage = r.usage; }
    else { narrative = offlineNarrative(base); }

    const bundle: DiagnosticBundle = { ...base, narrative, cost, usage };
    handlers.append_worklog({
      incident_number: incidentNumber,
      stage: "diagnosis",
      decision: `Classified ${classification.pattern_id}, root cause ${rootCause.root_cause_id}`,
      action: proposed.action_name,
      tier: proposed.tier,
      note: `${mode} mode; ${recurrence.incidents_with_same_root_cause} share root cause`,
    });
    yield { type: "bundle", bundle };
  } catch (e: any) {
    yield { type: "error", message: e?.message ?? String(e) };
  }
}
