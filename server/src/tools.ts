// The agent's tool layer over the data. These same handlers are exposed as an MCP
// server (mcp-server.ts) and called in-process by the agent (agent.ts), so the
// architecture is real MCP while the web demo stays fast and reliable.
import { db, reload, WORKLOG_PATH, WORKLOG_HEADER, EVIDENCE_BY_PATTERN } from "./data.js";
import { appendCsvRow, Row } from "./csv.js";

export const toolDefs = [
  { name: "list_open_incidents", description: "List incidents that are not yet resolved by the agent (no worklog action).", input: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "get_incident", description: "Get one incident by number.", input: { type: "object", properties: { incident_number: { type: "string" } }, required: ["incident_number"] } },
  { name: "match_pattern", description: "Get the repetitive-issue pattern for an incident (classification).", input: { type: "object", properties: { incident_number: { type: "string" } }, required: ["incident_number"] } },
  { name: "get_evidence", description: "Get the EBS detail rows (the evidence) for an incident.", input: { type: "object", properties: { incident_number: { type: "string" } }, required: ["incident_number"] } },
  { name: "get_root_cause", description: "Get the root cause and permanent fix (resolve at source) for an incident.", input: { type: "object", properties: { incident_number: { type: "string" } }, required: ["incident_number"] } },
  { name: "get_recurrence", description: "How many incidents trace to the same root cause, plus linked/recreated tickets.", input: { type: "object", properties: { incident_number: { type: "string" } }, required: ["incident_number"] } },
  { name: "get_proposed_action", description: "Get the proposed immediate action from the action catalogue for the incident's pattern.", input: { type: "object", properties: { incident_number: { type: "string" } }, required: ["incident_number"] } },
  { name: "append_worklog", description: "Record an agent decision or action to the worklog (ITSM write-back).", input: { type: "object", properties: { incident_number: { type: "string" }, stage: { type: "string" }, decision: { type: "string" }, action: { type: "string" }, tier: { type: "string" }, approver: { type: "string" }, note: { type: "string" } }, required: ["incident_number", "stage"] } },
] as const;

const inc = (n: string) => db.incidents.find(r => r.INCIDENT_NUMBER === n);

// Map of EBS identifier columns to human labels, in display order.
const OBJECT_LABELS: [string, string][] = [
  ["ITEM_NUMBER", "Item"], ["INVENTORY_ITEM_ID", "Item ID"], ["DESCRIPTION", "Item description"],
  ["OPERATING_UNIT", "Operating unit"], ["ORG_ID", "Org ID"], ["ORGANIZATION_CODE", "Inventory org"],
  ["SHIP_FROM_ORG_ID", "Ship-from org"], ["ORDER_NUMBER", "Order"], ["LINE_NUMBER", "Line"],
  ["HEADER_ID", "Order header ID"], ["PO_NUMBER", "PO"], ["CHANGE_ORDER", "Change order"],
  ["CO_TYPE", "CO type"], ["PD_REVISION", "PD revision"], ["EBS_REVISION", "EBS revision"],
  ["INTERFACE_STATUS", "Interface status"], ["HOLD_NAME", "Hold"], ["DELIVERY_NOTE", "Delivery note"],
  ["DELIVERY_ID", "Delivery"], ["MESSAGE_ID", "Message"], ["CONTRACT_NUMBER", "Contract"],
  ["PROJECT_NUMBER", "Project"], ["SALES_ORDER", "Sales order"], ["TRX_NUMBER", "Transaction"],
  ["QUOTE_NUMBER", "Quote"], ["EBS_ORDER_NUMBER", "EBS order"], ["PERIOD_NAME", "GL period"],
  ["TRX_NUMBER", "AR transaction"], ["BILL_TO_CUSTOMER", "Customer"], ["CUSTOMER_TIER", "Customer tier"],
  ["BATCH_SOURCE", "Batch source"], ["INVOICE_NUM", "AP invoice"], ["SUPPLIER_NAME", "Supplier"],
  ["SUPPLIER_TIER", "Supplier tier"], ["HOLD_NAME", "AP hold"], ["MATCH_STATUS", "Match status"],
  ["REJECTION_REASON", "Rejection"], ["ERROR_MESSAGE", "Error"],
  ["AMOUNT", "Amount"], ["EXPECTED_QTY", "Expected qty"], ["RECEIVED_QTY", "Received qty"],
  ["PO_UNLINKED_FLAG", "PO unlinked"], ["DATA_CORRUPTION_FLAG", "Data corruption"],
  ["REV_REC_STATUS", "Rev rec status"], ["ERROR_MESSAGE", "Error"],
];

// Extract object-level identifiers from one or more EBS evidence rows.
export function extractObjects(rows: Row[]): { label: string; value: string }[] {
  const seen = new Set<string>();
  const out: { label: string; value: string }[] = [];
  for (const row of rows) {
    for (const [col, label] of OBJECT_LABELS) {
      const v = row[col];
      if (v && v.trim() && v !== "0" && v !== "N") {
        const k = `${label}:${v}`;
        if (!seen.has(k)) { seen.add(k); out.push({ label, value: v }); }
      }
    }
  }
  return out;
}

export function incidentObjects(id: string): { label: string; value: string }[] {
  try {
    const ev = handlers.get_evidence({ incident_number: id });
    return extractObjects(ev.rows);
  } catch { return []; }
}

export const handlers: Record<string, (a: any) => any> = {
  list_open_incidents({ limit }: { limit?: number }) {
    const open = db.incidents.filter(r => r.STATE !== "Closed");
    return open.slice(0, limit ?? 50).map(r => ({
      incident_number: r.INCIDENT_NUMBER,
      theme: r.BUSINESS_IMPACT_THEME,
      short_description: r.SHORT_DESCRIPTION,
      assignment_group: r.ASSIGNMENT_GROUP,
      value_stream: r.VALUE_STREAM,
      primary_system: r.PRIMARY_SYSTEM,
      ebs_module: r.EBS_MODULE,
      opened_at: r.OPENED_AT,
      opened_by: r.OPENED_BY,
      assigned_to: r.ASSIGNED_TO,
      priority: r.PRIORITY,
      state: r.STATE,
      sla_due: r.SLA_DUE,
      invoice_amount: r.INVOICE_AMOUNT,
      currency: r.CURRENCY,
      counterparty: r.COUNTERPARTY,
      counterparty_type: r.COUNTERPARTY_TYPE,
      counterparty_tier: r.COUNTERPARTY_TIER,
      financial_band: r.FINANCIAL_BAND,
      business_flags: r.BUSINESS_FLAGS,
      recurring: r.RECURRING_FLAG,
      origin: r.DATA_ORIGIN,
    }));
  },

  get_incident({ incident_number }: { incident_number: string }) {
    const r = inc(incident_number);
    if (!r) throw new Error(`Incident ${incident_number} not found`);
    return r;
  },

  match_pattern({ incident_number }: { incident_number: string }) {
    const r = inc(incident_number);
    if (!r) throw new Error("not found");
    const pat = db.patterns.find(p => p.PATTERN_ID === r.PATTERN_ID);
    return {
      pattern_id: r.PATTERN_ID,
      failure_signature: pat?.FAILURE_SIGNATURE ?? "",
      value_stream: pat?.VALUE_STREAM ?? r.VALUE_STREAM,
      occurrence_count: Number(pat?.OCCURRENCE_COUNT ?? 0),
      auto_resolvable: pat?.AUTO_RESOLVABLE ?? "Unknown",
      root_cause_id: pat?.ROOT_CAUSE_ID ?? r.ROOT_CAUSE_ID,
    };
  },

  get_evidence({ incident_number }: { incident_number: string }) {
    const r = inc(incident_number);
    if (!r) throw new Error("not found");
    const key = EVIDENCE_BY_PATTERN[r.PATTERN_ID];
    const table: Row[] = key ? (db as any)[key] : [];
    const rows = table.filter(x => x.INCIDENT_NUMBER === incident_number);
    return { source_table: key ?? "none", rows };
  },

  get_root_cause({ incident_number }: { incident_number: string }) {
    const r = inc(incident_number);
    if (!r) throw new Error("not found");
    const rca = db.rca.find(x => x.RCA_ID === r.ROOT_CAUSE_ID);
    if (!rca) return { root_cause_id: r.ROOT_CAUSE_ID };
    return {
      root_cause_id: rca.RCA_ID,
      symptom: rca.SYMPTOM,
      immediate_resolution: rca.IMMEDIATE_RESOLUTION,
      root_cause: rca.ROOT_CAUSE,
      source_system: rca.SOURCE_SYSTEM,
      source_object: rca.SOURCE_OBJECT,
      permanent_fix: rca.PERMANENT_FIX,
      fix_category: rca.FIX_CATEGORY,
      effort: rca.EFFORT,
    };
  },

  get_recurrence({ incident_number }: { incident_number: string }) {
    const r = inc(incident_number);
    if (!r) throw new Error("not found");
    const sameCause = db.incidents.filter(x => x.ROOT_CAUSE_ID === r.ROOT_CAUSE_ID);
    const linked = db.kgEdges
      .filter(e => e.SOURCE_NODE === incident_number && e.EDGE_TYPE === "RECURRENCE_OF")
      .map(e => e.TARGET_NODE);
    return {
      root_cause_id: r.ROOT_CAUSE_ID,
      incidents_with_same_root_cause: sameCause.length,
      this_ticket_recurring: r.RECURRING_FLAG === "Y",
      linked_incidents: linked,
      sample: sameCause.slice(0, 8).map(x => x.INCIDENT_NUMBER),
    };
  },

  get_proposed_action({ incident_number }: { incident_number: string }) {
    const r = inc(incident_number);
    if (!r) throw new Error("not found");
    const action = db.actions.find(a => (a.PATTERN_ID || "").split(",").includes(r.PATTERN_ID));
    const pat = db.patterns.find(p => p.PATTERN_ID === r.PATTERN_ID);
    const auto = (pat?.AUTO_RESOLVABLE ?? "").toLowerCase().startsWith("yes");
    const tier = auto ? "Auto-resolve" : (pat?.AUTO_RESOLVABLE ?? "").toLowerCase().startsWith("partial") ? "Assisted" : "Assisted/Escalate";
    return {
      tier,
      action_id: action?.ACTION_ID ?? "",
      action_name: action?.ACTION_NAME ?? "Route to specialist",
      ebs_program: action?.EBS_PROGRAM_OR_API ?? "",
      risk_level: action?.RISK_LEVEL ?? "",
      requires_approval: action?.REQUIRES_APPROVAL ?? "Y",
      reversible: action?.REVERSIBLE ?? "",
    };
  },

  append_worklog(a: { incident_number: string; stage: string; decision?: string; action?: string; tier?: string; approver?: string; note?: string }) {
    const r = inc(a.incident_number);
    const row: Row = {
      LOG_ID: `WL-${Date.now()}`,
      TIMESTAMP: new Date().toISOString(),
      INCIDENT_NUMBER: a.incident_number,
      VALUE_STREAM: r?.VALUE_STREAM ?? "",
      AGENT_STAGE: a.stage,
      DECISION: a.decision ?? "",
      ACTION_TAKEN: a.action ?? "",
      RESOLUTION_TIER: a.tier ?? "",
      APPROVER_ROLE: a.approver ?? "",
      TARGET_SYSTEM: r?.PRIMARY_SYSTEM ?? "",
      EVIDENCE_REF: r?.PATTERN_ID ?? "",
      NOTE: a.note ?? "",
    };
    appendCsvRow(WORKLOG_PATH, WORKLOG_HEADER, row);
    reload();
    return { ok: true, log_id: row.LOG_ID };
  },
};
