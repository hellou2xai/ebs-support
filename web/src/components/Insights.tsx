import { useEffect, useState } from "react";
import { getInsights, DetailKind } from "../api";

// Pre-start insights: shown the moment an incident is selected, before the agent runs.
export function Insights({ id, onDetail }: { id: string; onDetail?: (kind: DetailKind, id: string) => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); getInsights(id).then(setD).catch(() => setD(null)); }, [id]);
  if (!d) return null;

  return (
    <section className="insights">
      <div className="ins-head">
        <span className="ins-badge">Pre-start insights</span>
        <span className="ins-headline">{d.headline}</span>
      </div>

      {d.flags.length > 0 && (
        <div className="ins-flags">
          {d.flags.map((f: any, i: number) => <span key={i} className={`flag ${f.severity}`}>{f.label}</span>)}
        </div>
      )}

      <div className="ins-grid">
        <Ins label="Predicted tier" value={d.predicted_tier} tone={d.predicted_tier === "Auto-resolve" ? "green" : "amber"} />
        <Ins label="Priority / SLA risk" value={`${d.priority} · ${d.sla_risk}`} tone={d.priority === "P1" ? "red" : undefined} />
        <Ins label="Pattern" value={d.classification.pattern_id} link={onDetail ? ["pattern", d.classification.pattern_id] : undefined} onDetail={onDetail} sub={`${d.classification.confidence} confidence`} />
        <Ins label="Root cause" value={d.predicted_root_cause?.id || "—"} link={onDetail && d.predicted_root_cause ? ["rca", d.predicted_root_cause.id] : undefined} onDetail={onDetail} sub={`${d.recurrence.incidents_with_same_root_cause} share it`} />
        {d.financial_exposure && (
          <Ins label="Financial exposure" value={`${d.financial_exposure.currency} ${Math.round(d.financial_exposure.amount).toLocaleString()}`} tone="red"
            sub={`${d.financial_exposure.counterparty} · ${d.financial_exposure.counterparty_tier}`} />
        )}
        <Ins label="Recommended first action" value={d.recommended_first_action} wide />
      </div>

      {d.objects.length > 0 && (
        <div className="ins-objects">
          <span className="ins-obj-label">Objects</span>
          {d.objects.slice(0, 8).map((o: any, i: number) => (
            <span key={i} className="ins-obj"><b>{o.label}</b> {o.value}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function Ins({ label, value, sub, tone, wide, link, onDetail }: { label: string; value: string; sub?: string; tone?: string; wide?: boolean; link?: [DetailKind, string]; onDetail?: (k: DetailKind, id: string) => void }) {
  return (
    <div className={`ins-cell ${wide ? "wide" : ""}`}>
      <div className="ins-label">{label}</div>
      <div className="ins-value" style={tone === "red" ? { color: "#c0445a" } : tone === "green" ? { color: "var(--green)" } : tone === "amber" ? { color: "var(--amber)" } : undefined}>
        {link && onDetail ? <a className="inc-link" onClick={() => onDetail(link[0], link[1])}>{value}</a> : value}
      </div>
      {sub && <div className="ins-sub">{sub}</div>}
    </div>
  );
}
