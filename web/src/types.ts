export interface IncidentSummary {
  incident_number: string;
  theme: string;
  short_description: string;
  assignment_group: string;
  value_stream: string;
  primary_system: string;
  ebs_module: string;
  opened_at: string;
  opened_by: string;
  assigned_to: string;
  priority: string;
  state: string;
  sla_due: string;
  invoice_amount: string;
  currency: string;
  counterparty: string;
  counterparty_type: string;
  counterparty_tier: string;
  financial_band: string;
  business_flags: string;
  tier: string;
  closed_at: string;
  close_code: string;
  recurring: string;
  origin: string;
}

// Client-side queue filter, set by persona KPI clicks.
export interface QueueFilter {
  label: string;
  state?: string;
  tier?: string[];
  priority?: string[];
  recurring?: boolean;
  module?: string[];
  band?: string[];
  flags?: string; // pipe-separated substrings, any match
}

export interface Bundle {
  incident_number: string;
  mode: "OFFLINE" | "LIVE";
  theme: string;
  value_stream: string;
  primary_system: string;
  classification: {
    pattern_id: string; failure_signature: string; occurrence_count: number;
    auto_resolvable: string; root_cause_id: string;
  };
  evidence: { source_table: string; rows: Record<string, string>[] };
  root_cause: {
    root_cause_id: string; symptom?: string; immediate_resolution?: string;
    root_cause?: string; source_system?: string; source_object?: string;
    permanent_fix?: string; fix_category?: string; effort?: string;
  };
  recurrence: {
    incidents_with_same_root_cause: number; this_ticket_recurring: boolean;
    linked_incidents: string[]; sample: string[];
  };
  proposed_action: {
    tier: string; action_id: string; action_name: string; ebs_program: string;
    risk_level: string; requires_approval: string; reversible: string;
  };
  narrative: string;
  resolution_tier: string;
  requires_approval: boolean;
  cost?: number;
  usage?: { inputTokens: number; outputTokens: number; model: string; latencyMs: number };
}

export type StageEvent =
  | { type: "stage"; stage: string; label: string; detail?: any }
  | { type: "bundle"; bundle: Bundle }
  | { type: "error"; message: string };

export interface Dashboard {
  total: number; recurring: number;
  byStream: Record<string, number>; byTier: Record<string, number>;
  patterns: { pattern_id: string; value_stream: string; signature: string; count: number; auto: string; root_cause: string }[];
  rootCauses: number;
}
