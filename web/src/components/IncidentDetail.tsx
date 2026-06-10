import { useEffect, useRef, useState } from "react";
import type { IncidentSummary, Bundle, StageEvent } from "../types";
import { diagnose, approve, raiseProblem, DetailKind } from "../api";
import { Markdown } from "./Markdown";
import { Insights } from "./Insights";

export function IncidentDetail(props: { incident: IncidentSummary; role: string; onDetail?: (kind: DetailKind, id: string) => void; known?: Set<string> }) {
  const id = props.incident.incident_number;
  const [stages, setStages] = useState<{ stage: string; label: string }[]>([]);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const closeRef = useRef<() => void>();

  // Reset when a different incident is selected.
  useEffect(() => {
    setStages([]); setBundle(null); setRunning(false); setToast(null);
    closeRef.current?.();
  }, [id]);

  function run() {
    setStages([]); setBundle(null); setRunning(true);
    closeRef.current = diagnose(id, (ev: StageEvent) => {
      if (ev.type === "stage") setStages(s => [...s, { stage: ev.stage, label: ev.label }]);
      else if (ev.type === "bundle") { setBundle(ev.bundle); setRunning(false); }
      else if (ev.type === "error") { setToast("Error: " + ev.message); setRunning(false); }
    });
  }

  const canApprove = ["L2 Support Engineer", "L3 SME", "Finance Controller", "Change Approver"].includes(props.role);
  const canProblem = ["L3 SME", "AMS Service Manager"].includes(props.role);

  async function onApprove() {
    if (!bundle) return;
    const r = await approve(id, bundle.proposed_action.action_name, bundle.resolution_tier, props.role);
    setToast(`Action executed: ${bundle.proposed_action.action_name} (logged ${r.log_id})`);
  }
  async function onRaiseProblem() {
    await raiseProblem(id, props.role);
    setToast(`Problem raised for ${bundle?.root_cause.root_cause_id}: permanent fix queued at source.`);
  }

  return (
    <div className="panel detail">
      <div className="detail-head">
        <div>
          <div className="dh-num">{id}</div>
          <div className="dh-theme">{props.incident.theme}</div>
        </div>
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? "Agent running…" : bundle ? "Re-run agent" : "Run agent"}
        </button>
      </div>
      <p className="dh-desc">{props.incident.short_description}</p>
      <div className="meta-grid">
        <span><b>Module</b> {props.incident.ebs_module}</span>
        <span><b>Priority</b> {props.incident.priority}</span>
        <span><b>State</b> {props.incident.state}</span>
        <span><b>Opened</b> {props.incident.opened_at}</span>
        <span><b>Opened by</b> {props.incident.opened_by}</span>
        <span><b>Assigned</b> {props.incident.assigned_to}</span>
        <span><b>SLA due</b> {props.incident.sla_due}</span>
        <span><b>Group</b> {props.incident.assignment_group}</span>
      </div>
      <div className="chips">
        <span className="chip">{props.incident.value_stream}</span>
        <span className="chip">{props.incident.primary_system}</span>
        {props.incident.recurring === "Y" && <span className="chip warn">recurring</span>}
      </div>

      <Insights id={id} onDetail={props.onDetail} />

      {(running || stages.length > 0) && (
        <div className="stages">
          {stages.map((s, i) => (
            <div key={i} className={`stage ${s.stage}`}>
              <span className="stage-dot" /> <b>{s.stage}</b> {s.label}
            </div>
          ))}
          {running && <div className="stage pending"><span className="stage-dot spin" /> working…</div>}
        </div>
      )}

      {bundle && (
        <div className="bundle">
          <section className="card narrative">
            <h3>Diagnosis <span className="mode">{bundle.mode}</span>
              {bundle.cost != null && <span className="cost-chip">${bundle.cost.toFixed(5)} · {(bundle.usage?.inputTokens ?? 0) + (bundle.usage?.outputTokens ?? 0)} tokens</span>}
            </h3>
            <Markdown text={bundle.narrative} onDetail={props.onDetail} known={props.known} />
          </section>

          <div className="two-col">
            <section className="card">
              <h4>Classification</h4>
              <Row k="Pattern" v={`${bundle.classification.pattern_id}`} />
              <Row k="Signature" v={bundle.classification.failure_signature} />
              <Row k="Seen (this dataset)" v={`${bundle.classification.occurrence_count}x`} />
              <Row k="Auto-resolvable" v={bundle.classification.auto_resolvable} />
            </section>
            <section className="card">
              <h4>Evidence · {bundle.evidence.source_table}</h4>
              {bundle.evidence.rows.length === 0 && <p className="muted">No detail rows linked.</p>}
              {bundle.evidence.rows.slice(0, 3).map((r, i) => (
                <pre key={i} className="evidence">{compact(r)}</pre>
              ))}
            </section>
          </div>

          <section className="card source">
            <h4>Resolve at source · {bundle.root_cause.root_cause_id}</h4>
            <Row k="Root cause" v={bundle.root_cause.root_cause || "—"} />
            <Row k="Source" v={`${bundle.root_cause.source_system || "—"} (${bundle.root_cause.source_object || "—"})`} />
            <Row k="Immediate fix" v={bundle.root_cause.immediate_resolution || bundle.proposed_action.action_name} />
            <Row k="Permanent fix" v={bundle.root_cause.permanent_fix || "—"} highlight />
            <Row k="Fix type / effort" v={`${bundle.root_cause.fix_category || "—"} · ${bundle.root_cause.effort || "—"}`} />
            <div className="recurrence">
              <b>{bundle.recurrence.incidents_with_same_root_cause}</b> incident(s) share this root cause
              {bundle.recurrence.linked_incidents.length > 0 &&
                <> · recreated/linked: {bundle.recurrence.linked_incidents.join(", ")}</>}
            </div>
          </section>

          <section className="card action">
            <h4>Proposed action</h4>
            <Row k="Tier" v={bundle.resolution_tier} />
            <Row k="Action" v={`${bundle.proposed_action.action_name} ${bundle.proposed_action.ebs_program ? "· " + bundle.proposed_action.ebs_program : ""}`} />
            <Row k="Risk / reversible" v={`${bundle.proposed_action.risk_level || "—"} · ${bundle.proposed_action.reversible || "—"}`} />
            <Row k="Approval" v={bundle.requires_approval ? "Required" : "Not required"} />
            <div className="action-buttons">
              <button className="btn" disabled={!canApprove} title={canApprove ? "" : "Your persona cannot approve writes"} onClick={onApprove}>
                Approve &amp; execute
              </button>
              <button className="btn ghost" disabled={!canProblem} title={canProblem ? "" : "L3 / Service Manager only"} onClick={onRaiseProblem}>
                Raise problem (fix at source)
              </button>
            </div>
            {!canApprove && <p className="muted small">As {props.role} you can diagnose but not approve writes. Switch persona to L2/L3.</p>}
          </section>
        </div>
      )}

      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  );
}

function Row(p: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className={`kv ${p.highlight ? "hl" : ""}`}>
      <span className="k">{p.k}</span>
      <span className="v">{p.v}</span>
    </div>
  );
}

function compact(r: Record<string, string>): string {
  return Object.entries(r)
    .filter(([k]) => k !== "INCIDENT_NUMBER")
    .slice(0, 8)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
