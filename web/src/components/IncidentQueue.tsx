import type { IncidentSummary } from "../types";

const STREAM_COLORS: Record<string, string> = {
  "Item-MDM": "#7c9eff", "QTD": "#5ad1a8", "PTM": "#f0b35b",
  "PTC": "#e06c9f", "PTP": "#c08cff", "Services": "#9b8cff",
};
const PRIO_TONE: Record<string, string> = { P1: "#c0445a", P2: "#b5701f" };

function flagTone(f: string): string {
  if (f.includes("Critical") || f.includes("Single-source")) return "critical";
  if (f.includes("High-value") || f.includes("Strategic") || f.includes("Quarter")) return "high";
  return "info";
}

export function IncidentQueue(props: {
  incidents: IncidentSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="panel queue">
      <div className="panel-head"><span>Open incidents</span><span className="count">{props.incidents.length}</span></div>
      <div className="queue-list">
        {props.incidents.map(i => {
          const flags = (i.business_flags || "").split(";").filter(Boolean);
          return (
            <button key={i.incident_number}
              className={`queue-item ${props.selected === i.incident_number ? "sel" : ""}`}
              onClick={() => props.onSelect(i.incident_number)}>
              <div className="qi-top">
                <span className="qi-num">{i.incident_number}</span>
                <span className="qi-tags">
                  {i.priority && <span className="prio" style={{ color: PRIO_TONE[i.priority] }}>{i.priority}</span>}
                  {i.origin === "REAL" && <span className="tag real">real</span>}
                </span>
              </div>
              <div className="qi-desc">{i.short_description || i.theme}</div>
              <div className="qi-meta">
                <span className="stream-dot" style={{ background: STREAM_COLORS[i.value_stream] || "#888" }} />
                {i.ebs_module} · {i.value_stream} · {i.state}
              </div>
              {(i.invoice_amount || flags.length > 0) && (
                <div className="qi-flags">
                  {i.invoice_amount && <span className="amt">${Math.round(Number(i.invoice_amount)).toLocaleString()}</span>}
                  {flags.slice(0, 2).map(f => <span key={f} className={`flag mini ${flagTone(f)}`}>{f}</span>)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
