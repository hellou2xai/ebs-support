// Loads the demo data CSVs into memory. Single source of truth for the tools.
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { readCsv, Row } from "./csv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR =
  process.env.DATA_DIR
    ? resolve(process.env.DATA_DIR)
    : resolve(__dirname, "..", "..", "data");

function load(name: string): Row[] {
  return readCsv(join(DATA_DIR, name));
}

// Loaded once at startup; reload() re-reads (e.g. after the worklog is appended).
export const db = {
  incidents: load("incidents.csv"),
  itemRevisions: load("item_revisions.csv"),
  orderHolds: load("order_holds.csv"),
  dropship: load("dropship_orders.csv"),
  rcv: load("rcv_interface.csv"),
  cpq: load("cpq_submissions.csv"),
  blujay: load("blujay_transmissions.csv"),
  obligations: load("revenue_obligations.csv"),
  arInvoice: load("ar_invoice_interface.csv"),
  apInvoice: load("ap_invoice_interface.csv"),
  customers: load("customers.csv"),
  suppliers: load("suppliers.csv"),
  rca: load("root_cause_analysis.csv"),
  patterns: load("issue_patterns.csv"),
  dataFixes: load("data_fix_catalogue.csv"),
  actions: load("action_catalogue.csv"),
  kb: load("knowledge_base.csv"),
  users: load("users.csv"),
  items: load("item_master.csv"),
  kgNodes: load("kg_nodes.csv"),
  kgEdges: load("kg_edges.csv"),
};

export function reload() {
  db.incidents = load("incidents.csv");
}

export const WORKLOG_PATH = join(DATA_DIR, "agent_worklog.csv");
export const WORKLOG_HEADER = [
  "LOG_ID", "TIMESTAMP", "INCIDENT_NUMBER", "VALUE_STREAM", "AGENT_STAGE",
  "DECISION", "ACTION_TAKEN", "RESOLUTION_TIER", "APPROVER_ROLE",
  "TARGET_SYSTEM", "EVIDENCE_REF", "NOTE",
];

// Which detail table holds the evidence for each pattern.
export const EVIDENCE_BY_PATTERN: Record<string, keyof typeof db> = {
  "PAT-REV-SYNC": "itemRevisions",
  "PAT-CCO": "itemRevisions",
  "PAT-CCB-REV": "itemRevisions",
  "PAT-HOLD": "orderHolds",
  "PAT-DROPSHIP": "dropship",
  "PAT-RCV": "rcv",
  "PAT-BLUJAY": "blujay",
  "PAT-CPQ": "cpq",
  "PAT-OBLIG": "obligations",
  "PAT-AR-AUTOINV": "arInvoice",
  "PAT-AP-IMPORT": "apInvoice",
  "PAT-AP-HOLD": "apInvoice",
};
