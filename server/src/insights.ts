// Pre-start insights for an incident: computed deterministically from the
// enrichment and the knowledge graph BEFORE any agent runs. The point is to tell
// the engineer what they are walking into before they start.
import { db } from "./data.js";
import { handlers, incidentObjects } from "./tools.js";

const FLAG_SEVERITY: Record<string, "critical" | "high" | "info"> = {
  "High-value invoice": "high",
  "Critical component supplier": "critical",
  "Single-source supplier": "critical",
  "Strategic customer": "high",
  "Quarter-close risk": "high",
  "Recurring issue": "info",
};

export function computeInsights(id: string) {
  const inc = db.incidents.find(r => r.INCIDENT_NUMBER === id);
  if (!inc) throw new Error(`Incident ${id} not found`);

  const pat = db.patterns.find(p => p.PATTERN_ID === inc.PATTERN_ID);
  const rca = db.rca.find(r => r.RCA_ID === inc.ROOT_CAUSE_ID);
  const action = db.actions.find(a => (a.PATTERN_ID || "").split(",").includes(inc.PATTERN_ID));
  const sameCause = db.incidents.filter(r => r.ROOT_CAUSE_ID === inc.ROOT_CAUSE_ID).length;

  const auto = (pat?.AUTO_RESOLVABLE || "").toLowerCase();
  const tier = auto.startsWith("yes") ? "Auto-resolve" : auto.startsWith("partial") ? "Assisted" : "Assisted/Escalate";

  // Business flags with severity.
  const flags = (inc.BUSINESS_FLAGS || "").split(";").filter(Boolean)
    .map(f => ({ label: f, severity: FLAG_SEVERITY[f] || "info" }));

  // SLA risk from priority + open age (we only have opened/sla_due strings).
  const slaRisk = inc.PRIORITY === "P1" ? "High" : inc.PRIORITY === "P2" ? "Medium" : "Low";

  // Financial exposure.
  const amount = inc.INVOICE_AMOUNT ? Number(inc.INVOICE_AMOUNT) : 0;
  const exposure = amount
    ? { amount, currency: inc.CURRENCY || "USD", band: inc.FINANCIAL_BAND, counterparty: inc.COUNTERPARTY, counterparty_type: inc.COUNTERPARTY_TYPE, counterparty_tier: inc.COUNTERPARTY_TIER }
    : null;

  // Recommended first action.
  const recommended = tier === "Auto-resolve"
    ? `Auto-resolve: ${action?.ACTION_NAME ?? "run the catalogued action"}`
    : tier === "Assisted"
      ? `Assist: ${action?.ACTION_NAME ?? "apply fix"} (approval required)`
      : `Escalate to specialist with the context bundle`;

  // Confidence: higher when the pattern is well-represented.
  const occ = Number(pat?.OCCURRENCE_COUNT ?? 0);
  const confidence = occ >= 8 ? "High" : occ >= 4 ? "Medium" : "Low";

  return {
    incident: id,
    headline: buildHeadline(inc, flags, tier, sameCause),
    classification: { pattern_id: inc.PATTERN_ID, signature: pat?.FAILURE_SIGNATURE ?? "", confidence, occurrence_count: occ },
    predicted_root_cause: rca ? { id: rca.RCA_ID, root_cause: rca.ROOT_CAUSE, permanent_fix: rca.PERMANENT_FIX, source_system: rca.SOURCE_SYSTEM } : null,
    recurrence: { incidents_with_same_root_cause: sameCause, this_recurring: inc.RECURRING_FLAG === "Y" },
    predicted_tier: tier,
    sla_risk: slaRisk,
    priority: inc.PRIORITY,
    flags,
    financial_exposure: exposure,
    objects: incidentObjects(id),
    recommended_first_action: recommended,
    meta: {
      module: inc.EBS_MODULE, opened_at: inc.OPENED_AT, opened_by: inc.OPENED_BY,
      assigned_to: inc.ASSIGNED_TO, state: inc.STATE, sla_due: inc.SLA_DUE,
      assignment_group: inc.ASSIGNMENT_GROUP, value_stream: inc.VALUE_STREAM,
    },
  };
}

function buildHeadline(inc: any, flags: { label: string; severity: string }[], tier: string, sameCause: number): string {
  const bits: string[] = [];
  const crit = flags.filter(f => f.severity === "critical").map(f => f.label);
  const high = flags.filter(f => f.severity === "high").map(f => f.label);
  if (crit.length) bits.push(crit.join(" and "));
  if (high.length) bits.push(high.join(", "));
  if (inc.INVOICE_AMOUNT) bits.push(`${inc.CURRENCY || "USD"} ${Number(inc.INVOICE_AMOUNT).toLocaleString()} exposure`);
  bits.push(`predicted ${tier}`);
  if (sameCause >= 3) bits.push(`${sameCause} incidents share this root cause`);
  return bits.join(" · ");
}
