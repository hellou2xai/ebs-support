// Agent orchestration backend. A structured sequence of fully-featured agents runs
// over a batch of incidents. Each agent is independently executable (run one step
// across the batch) and the full pipeline is composable from them. A resolution
// report assembles every agent's output plus the outcome and next steps.
import { db } from "./data.js";
import { handlers, extractObjects } from "./tools.js";

export interface AgentDef { id: string; name: string; role: string; uses: string; autonomy: string; }

export const AGENTS: AgentDef[] = [
  { id: "intake", name: "Intake", role: "Normalise the ticket into a structured object", uses: "itsm", autonomy: "Read-only" },
  { id: "triage", name: "Triage", role: "Classify to a repetitive-issue pattern and set the tier", uses: "patterns", autonomy: "Read-only" },
  { id: "diagnostic", name: "Diagnostic", role: "Gather EBS evidence and confirm the root cause", uses: "ebs read tools", autonomy: "Read-only" },
  { id: "problem", name: "Problem / RCA", role: "Measure recurrence and recommend the permanent fix at source", uses: "knowledge graph", autonomy: "Read-only" },
  { id: "remediation", name: "Remediation", role: "Execute the immediate fix (auto) or stage it for approval (assisted)", uses: "action catalogue", autonomy: "Guarded write" },
  { id: "comms", name: "Communications", role: "Draft the resolution note and write back to the ITSM", uses: "itsm write", autonomy: "Ticket write" },
];
const ORDER = AGENTS.map(a => a.id);

export type PipelineEvent =
  | { type: "init"; ids: string[] }
  | { type: "agent_start"; incident: string; agent: string }
  | { type: "agent_done"; incident: string; agent: string; status: "ok" | "skip" | "hold"; summary: string }
  | { type: "incident_done"; incident: string; outcome: string; tier: string }
  | { type: "pipeline_done"; stats: Record<string, number> }
  | { type: "step_done"; agent: string; count: number };

interface Ctx {
  incident: any; pattern?: any; evidence?: any; rca?: any; recurrence?: any;
  action?: any; tier?: string; outcome?: string;
}
type StepResult = { status: "ok" | "skip" | "hold"; summary: string };

// Each step. `write` gates the side effects so prerequisite computation for a single
// independent step does not double-write the worklog.
const STEP: Record<string, (id: string, c: Ctx, write: boolean) => StepResult> = {
  intake(id, c) {
    c.incident = handlers.get_incident({ incident_number: id });
    return { status: "ok", summary: `${c.incident.VALUE_STREAM} · ${c.incident.PRIMARY_SYSTEM} · ${c.incident.BUSINESS_IMPACT_THEME}` };
  },
  triage(id, c) {
    c.pattern = handlers.match_pattern({ incident_number: id });
    const auto = (c.pattern.auto_resolvable || "").toLowerCase();
    c.tier = auto.startsWith("yes") ? "Auto-resolve" : auto.startsWith("partial") ? "Assisted" : "Assisted/Escalate";
    return { status: "ok", summary: `${c.pattern.pattern_id} (${c.pattern.occurrence_count}x) -> ${c.tier}` };
  },
  diagnostic(id, c) {
    c.evidence = handlers.get_evidence({ incident_number: id });
    c.rca = handlers.get_root_cause({ incident_number: id });
    return { status: "ok", summary: `${c.evidence.rows.length} evidence row(s); root cause ${c.rca.root_cause_id}` };
  },
  problem(id, c) {
    c.recurrence = handlers.get_recurrence({ incident_number: id });
    const fix = c.rca?.permanent_fix ? c.rca.permanent_fix.slice(0, 60) + "…" : "n/a";
    return { status: "ok", summary: `${c.recurrence.incidents_with_same_root_cause} share root cause; permanent fix: ${fix}` };
  },
  remediation(id, c, write) {
    c.action = handlers.get_proposed_action({ incident_number: id });
    if (c.tier === "Auto-resolve" && (c.action.requires_approval ?? "Y") === "N") {
      if (write) handlers.append_worklog({ incident_number: id, stage: "auto_resolved", decision: "Auto-resolve", action: c.action.action_name, tier: c.tier, note: "Pipeline auto-resolution" });
      c.outcome = "Auto-resolved";
      return { status: "ok", summary: `Executed ${c.action.action_name}` };
    }
    if (write) handlers.append_worklog({ incident_number: id, stage: "staged_for_approval", decision: "Staged", action: c.action.action_name, tier: c.tier ?? "Assisted", note: "Awaiting approval" });
    c.outcome = c.tier === "Assisted" ? "Staged for approval" : "Escalated to specialist";
    return { status: "hold", summary: `${c.action.action_name} staged (${c.action.requires_approval === "N" ? "no approval" : "approval required"})` };
  },
  comms(id, c, write) {
    if (write) handlers.append_worklog({ incident_number: id, stage: "comms", decision: "Resolution note drafted", action: c.outcome ?? "", tier: c.tier ?? "", note: `Pattern ${c.pattern?.pattern_id}; recurrence ${c.recurrence?.incidents_with_same_root_cause}` });
    return { status: "ok", summary: `Note drafted, ITSM updated` };
  },
};

// Build context by running prior steps silently (no writes), return ctx up to (excl) target.
function buildCtxUpTo(id: string, targetIdx: number): Ctx {
  const ctx: Ctx = { incident: null };
  for (let i = 0; i < targetIdx; i++) STEP[ORDER[i]](id, ctx, false);
  return ctx;
}

// Run ONE agent step over a batch (independent execution).
export async function* runSingleStep(agentId: string, ids: string[]): AsyncGenerator<PipelineEvent> {
  const idx = ORDER.indexOf(agentId);
  yield { type: "init", ids };
  let count = 0;
  for (const id of ids) {
    yield { type: "agent_start", incident: id, agent: agentId };
    await new Promise(r => setTimeout(r, 120));
    let r: StepResult;
    try { const ctx = buildCtxUpTo(id, idx); r = STEP[agentId](id, ctx, true); }
    catch (e: any) { r = { status: "skip", summary: e?.message ?? "error" }; }
    yield { type: "agent_done", incident: id, agent: agentId, status: r.status, summary: r.summary };
    count++;
  }
  yield { type: "step_done", agent: agentId, count };
}

// Run the full pipeline over a batch.
export async function* runPipeline(ids: string[]): AsyncGenerator<PipelineEvent> {
  const stats: Record<string, number> = { processed: 0, auto: 0, assisted: 0, escalated: 0, problems: 0 };
  yield { type: "init", ids };
  for (const id of ids) {
    const ctx: Ctx = { incident: null };
    for (const agent of AGENTS) {
      yield { type: "agent_start", incident: id, agent: agent.id };
      await new Promise(r => setTimeout(r, 130));
      let r: StepResult;
      try { r = STEP[agent.id](id, ctx, true); }
      catch (e: any) { r = { status: "skip", summary: e?.message ?? "error" }; }
      yield { type: "agent_done", incident: id, agent: agent.id, status: r.status, summary: r.summary };
    }
    if (ctx.outcome === "Auto-resolved") stats.auto++;
    else if (ctx.outcome === "Staged for approval") stats.assisted++;
    else stats.escalated++;
    if ((ctx.recurrence?.incidents_with_same_root_cause ?? 0) >= 3) stats.problems++;
    stats.processed++;
    yield { type: "incident_done", incident: id, outcome: ctx.outcome ?? "Routed", tier: ctx.tier ?? "" };
  }
  yield { type: "pipeline_done", stats };
}

export function pickIncidents(limit: number): string[] {
  return db.incidents.filter(i => i.STATE !== "Closed").slice(0, limit).map(i => i.INCIDENT_NUMBER);
}

// Full, well-formatted resolution report for one incident: every agent's output,
// how it was resolved, and the next steps.
export function getResolution(id: string) {
  const ctx: Ctx = { incident: null };
  const agents = AGENTS.map(a => {
    let r: StepResult;
    try { r = STEP[a.id](id, ctx, false); }
    catch (e: any) { r = { status: "skip", summary: e?.message ?? "error" }; }
    return { id: a.id, name: a.name, role: a.role, autonomy: a.autonomy, status: r.status, summary: r.summary };
  });
  const inc = ctx.incident;
  const tier = ctx.tier ?? "";
  const outcome = ctx.outcome ?? "Routed";
  const rca = ctx.rca ?? {};
  const rec = ctx.recurrence ?? {};
  const action = ctx.action ?? {};

  let howResolved = "";
  const nextSteps: string[] = [];
  if (outcome === "Auto-resolved") {
    howResolved =
      `This incident matched the known pattern ${ctx.pattern?.pattern_id} (${ctx.pattern?.failure_signature}), which is auto-resolvable and low risk. ` +
      `The Remediation agent executed ${action.action_name}${action.ebs_program ? ` (${action.ebs_program})` : ""} with no approval required, then the Communications agent drafted the resolution note and updated the ITSM. The whole path was straight-through.`;
    nextSteps.push(`Verify the fix held by re-reading the evidence in ${ctx.evidence?.source_table}.`);
    nextSteps.push(`Confirm resolution with the requester and close the ticket.`);
    nextSteps.push(`Resolve at source so it stops recurring: ${rca.permanent_fix} [${rca.fix_category}, ${rca.effort}]. ${rec.incidents_with_same_root_cause} incidents share this root cause, so raise a Problem record.`);
  } else if (outcome === "Staged for approval") {
    howResolved =
      `This incident is in pattern ${ctx.pattern?.pattern_id} and the proposed fix ${action.action_name} writes to a system, so it needs approval before execution. ` +
      `The Remediation agent staged the action and the Communications agent logged the pending state. It is not yet resolved.`;
    nextSteps.push(`Approve ${action.action_name} (risk ${action.risk_level}) in the Incident queue as L2/L3, then it executes.`);
    nextSteps.push(`After execution, verify and confirm with the requester.`);
    nextSteps.push(`Resolve at source: ${rca.permanent_fix} [${rca.fix_category}, ${rca.effort}].`);
  } else {
    howResolved =
      `This incident in pattern ${ctx.pattern?.pattern_id} is not safely auto-resolvable, so the Remediation agent routed it to a specialist with the full context bundle attached. ` +
      `The diagnosis and root cause are already in hand, so the engineer starts from the analysis, not from scratch.`;
    nextSteps.push(`L3 specialist to action the root cause: ${rca.root_cause}.`);
    nextSteps.push(`Apply the immediate fix: ${rca.immediate_resolution}.`);
    nextSteps.push(`Resolve at source: ${rca.permanent_fix} [${rca.fix_category}, ${rca.effort}].`);
  }

  return {
    incident: id,
    theme: inc?.BUSINESS_IMPACT_THEME ?? "",
    short_description: inc?.SHORT_DESCRIPTION ?? "",
    value_stream: inc?.VALUE_STREAM ?? "",
    primary_system: inc?.PRIMARY_SYSTEM ?? "",
    assignment_group: inc?.ASSIGNMENT_GROUP ?? "",
    pattern: ctx.pattern,
    root_cause: rca,
    recurrence: rec,
    proposed_action: action,
    objects: extractObjects(ctx.evidence?.rows ?? []),
    evidence_table: ctx.evidence?.source_table ?? "none",
    tier, outcome,
    agents,
    how_resolved: howResolved,
    next_steps: nextSteps,
    linked_incidents: rec.linked_incidents ?? [],
  };
}
