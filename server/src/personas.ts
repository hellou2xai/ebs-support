// Per-persona home dashboards. Each role gets a tailored, scoped view: the
// incidents they own, the KPIs they care about, and the actions they can take.
import { db } from "./data.js";
import { summary as usageSummary } from "./usage.js";

type Row = Record<string, string>;
const num = (s: string) => (s ? Number(s) : 0);

function tierOf(i: Row): string {
  const pat = db.patterns.find(p => p.PATTERN_ID === i.PATTERN_ID);
  const a = (pat?.AUTO_RESOLVABLE || "").toLowerCase();
  return a.startsWith("yes") ? "Auto-resolve" : a.startsWith("partial") ? "Assisted" : "Assisted/Escalate";
}
function lite(i: Row) {
  return {
    incident_number: i.INCIDENT_NUMBER, short_description: i.SHORT_DESCRIPTION,
    value_stream: i.VALUE_STREAM, ebs_module: i.EBS_MODULE, priority: i.PRIORITY,
    state: i.STATE, opened_at: i.OPENED_AT, assigned_to: i.ASSIGNED_TO,
    financial_band: i.FINANCIAL_BAND, invoice_amount: i.INVOICE_AMOUNT,
    counterparty: i.COUNTERPARTY, business_flags: i.BUSINESS_FLAGS, tier: tierOf(i),
  };
}
const open = () => db.incidents.filter(i => i.STATE !== "Closed");

export const PERSONA_TITLES: Record<string, { title: string; subtitle: string }> = {
  "L1 Support Analyst": { title: "Triage desk", subtitle: "New and unassigned incidents, prioritised by SLA risk" },
  "L2 Support Engineer": { title: "My work and diagnostics", subtitle: "Assigned incidents and what the agent can resolve" },
  "L3 SME": { title: "Problem management", subtitle: "Escalations and recurring root causes to fix at source" },
  "Finance Controller": { title: "Financial exposure", subtitle: "AR/AP and revenue incidents by value at risk" },
  "Change Approver": { title: "Approvals queue", subtitle: "Staged actions and changes awaiting your decision" },
  "AMS Service Manager": { title: "Service overview", subtitle: "SLA, auto-resolution, recurring problems and cost" },
};

export function personaDashboard(role: string) {
  const o = open();
  const t = PERSONA_TITLES[role] ?? { title: "Dashboard", subtitle: "" };
  let kpis: any[] = [];
  let panels: any[] = [];

  if (role === "L1 Support Analyst") {
    const news = o.filter(i => i.STATE === "New");
    const p1 = o.filter(i => i.PRIORITY === "P1");
    kpis = [
      { label: "Open incidents", value: o.length },
      { label: "New / untriaged", value: news.length, tone: "amber" },
      { label: "P1", value: p1.length, tone: "red" },
      { label: "Recurring", value: o.filter(i => i.RECURRING_FLAG === "Y").length },
    ];
    panels = [
      { title: "Needs triage (newest first)", type: "incidents", items: news.slice(0, 12).map(lite) },
      { title: "P1 incidents", type: "incidents", items: p1.slice(0, 8).map(lite) },
    ];
  } else if (role === "L2 Support Engineer") {
    const auto = o.filter(i => tierOf(i) === "Auto-resolve");
    const assisted = o.filter(i => tierOf(i) === "Assisted");
    kpis = [
      { label: "In progress", value: o.filter(i => i.STATE === "In Progress").length },
      { label: "Auto-resolvable", value: auto.length, tone: "green" },
      { label: "Assisted", value: assisted.length, tone: "amber" },
      { label: "P1 / P2", value: o.filter(i => i.PRIORITY === "P1" || i.PRIORITY === "P2").length },
    ];
    panels = [
      { title: "Quick wins (auto-resolvable)", type: "incidents", items: auto.slice(0, 10).map(lite) },
      { title: "Needs your hands (assisted)", type: "incidents", items: assisted.slice(0, 10).map(lite) },
    ];
  } else if (role === "L3 SME") {
    const escalate = o.filter(i => tierOf(i) === "Assisted/Escalate");
    const problems = db.rca.map(r => ({
      rca_id: r.RCA_ID, root_cause: r.ROOT_CAUSE, permanent_fix: r.PERMANENT_FIX,
      source_system: r.SOURCE_SYSTEM, fix_category: r.FIX_CATEGORY, effort: r.EFFORT,
      count: db.incidents.filter(i => i.ROOT_CAUSE_ID === r.RCA_ID).length,
    })).sort((a, b) => b.count - a.count).slice(0, 8);
    kpis = [
      { label: "Escalated to L3", value: escalate.length, tone: "red" },
      { label: "Distinct root causes", value: db.rca.length },
      { label: "Top problem recurs", value: problems[0]?.count ?? 0, tone: "amber" },
      { label: "Permanent fixes open", value: db.rca.length, tone: "green" },
    ];
    panels = [
      { title: "Recurring problems to fix at source", type: "rcas", items: problems },
      { title: "Escalations", type: "incidents", items: escalate.slice(0, 10).map(lite) },
    ];
  } else if (role === "Finance Controller") {
    const fin = o.filter(i => i.EBS_MODULE === "AR" || i.EBS_MODULE === "AP").filter(i => i.INVOICE_AMOUNT);
    fin.sort((a, b) => num(b.INVOICE_AMOUNT) - num(a.INVOICE_AMOUNT));
    const exposure = fin.reduce((s, i) => s + num(i.INVOICE_AMOUNT), 0);
    const highVal = fin.filter(i => i.FINANCIAL_BAND === "High" || i.FINANCIAL_BAND === "Critical");
    const critSup = fin.filter(i => (i.BUSINESS_FLAGS || "").includes("Critical component supplier") || (i.BUSINESS_FLAGS || "").includes("Single-source"));
    kpis = [
      { label: "Total exposure", value: `$${Math.round(exposure).toLocaleString()}`, tone: "red" },
      { label: "High-value invoices", value: highVal.length, tone: "amber" },
      { label: "Critical-supplier", value: critSup.length, tone: "red" },
      { label: "Quarter-close risk", value: fin.filter(i => (i.BUSINESS_FLAGS || "").includes("Quarter-close")).length, tone: "amber" },
    ];
    panels = [
      { title: "Highest value at risk", type: "incidents", items: fin.slice(0, 12).map(lite) },
      { title: "AR vs AP", type: "bars", items: [
        { label: "AR (AutoInvoice)", value: o.filter(i => i.EBS_MODULE === "AR").length },
        { label: "AP (Payables)", value: o.filter(i => i.EBS_MODULE === "AP").length },
      ] },
    ];
  } else if (role === "Change Approver") {
    const staged = o.filter(i => tierOf(i) !== "Auto-resolve");
    kpis = [
      { label: "Awaiting approval", value: staged.length, tone: "amber" },
      { label: "PROD data fixes", value: o.filter(i => i.RESOLUTION_TYPE?.includes("Data fix")).length, tone: "red" },
      { label: "Auto (no approval)", value: o.filter(i => tierOf(i) === "Auto-resolve").length, tone: "green" },
      { label: "P1 / P2 staged", value: staged.filter(i => i.PRIORITY === "P1" || i.PRIORITY === "P2").length },
    ];
    panels = [
      { title: "Actions awaiting your approval", type: "incidents", items: staged.slice(0, 14).map(lite) },
    ];
  } else if (role === "AMS Service Manager") {
    const byStream: Record<string, number> = {};
    o.forEach(i => { byStream[i.VALUE_STREAM] = (byStream[i.VALUE_STREAM] || 0) + 1; });
    const autoRate = Math.round((o.filter(i => tierOf(i) === "Auto-resolve").length / Math.max(o.length, 1)) * 100);
    const usage = usageSummary();
    const patterns = db.patterns.map(p => ({ pattern_id: p.PATTERN_ID, signature: p.FAILURE_SIGNATURE, count: Number(p.OCCURRENCE_COUNT), auto: p.AUTO_RESOLVABLE }))
      .sort((a, b) => b.count - a.count).slice(0, 8);
    kpis = [
      { label: "Open incidents", value: o.length },
      { label: "Auto-resolution rate", value: `${autoRate}%`, tone: "green" },
      { label: "Recurring", value: o.filter(i => i.RECURRING_FLAG === "Y").length, tone: "amber" },
      { label: "AI spend (session)", value: `$${usage.totalCost.toFixed(4)}` },
    ];
    panels = [
      { title: "By value stream", type: "bars", items: Object.entries(byStream).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) },
      { title: "Top recurring patterns", type: "patterns", items: patterns },
    ];
  }

  return { role, ...t, kpis, panels };
}
