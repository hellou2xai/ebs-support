import { useMemo, useState } from "react";
import type { IncidentSummary, QueueFilter } from "../types";

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

function matches(i: IncidentSummary, f: QueueFilter): boolean {
  if (f.state && i.state !== f.state) return false;
  if (f.tier && !f.tier.includes(i.tier)) return false;
  if (f.priority && !f.priority.includes(i.priority)) return false;
  if (f.recurring && i.recurring !== "Y") return false;
  if (f.module && !f.module.includes(i.ebs_module)) return false;
  if (f.band && !f.band.includes(i.financial_band)) return false;
  if (f.flags && !f.flags.split("|").some(s => (i.business_flags || "").includes(s))) return false;
  return true;
}

export function IncidentQueue(props: {
  incidents: IncidentSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
  filter: QueueFilter | null;
  onClearFilter: () => void;
}) {
  const [view, setView] = useState<"open" | "closed">("open");

  const openList = useMemo(() => props.incidents.filter(i => i.state !== "Closed"), [props.incidents]);
  const closedList = useMemo(() => props.incidents.filter(i => i.state === "Closed"), [props.incidents]);

  let list = view === "open" ? openList : closedList;
  if (props.filter) list = props.incidents.filter(i => i.state !== "Closed" && matches(i, props.filter!));

  return (
    <div className="panel queue">
      <div className="panel-head queue-head">
        {props.filter ? (
          <span className="filter-chip" title="Click to clear" onClick={props.onClearFilter}>
            {props.filter.label} · {list.length} <b>×</b>
          </span>
        ) : (
          <span className="queue-toggle">
            <button className={view === "open" ? "on" : ""} onClick={() => setView("open")}>Open · {openList.length}</button>
            <button className={view === "closed" ? "on" : ""} onClick={() => setView("closed")}>Closed · {closedList.length}</button>
          </span>
        )}
        <span className="count">{list.length}</span>
      </div>
      <div className="queue-list">
        {list.length === 0 && <div className="panel empty" style={{ border: "none" }}>No incidents match.</div>}
        {list.map(i => {
          const flags = (i.business_flags || "").split(";").filter(Boolean);
          const closed = i.state === "Closed";
          return (
            <button key={i.incident_number}
              className={`queue-item ${props.selected === i.incident_number ? "sel" : ""} ${closed ? "closed" : ""}`}
              onClick={() => props.onSelect(i.incident_number)}>
              <div className="qi-top">
                <span className="qi-num">{i.incident_number}</span>
                <span className="qi-tags">
                  {i.priority && <span className="prio" style={{ color: PRIO_TONE[i.priority] }}>{i.priority}</span>}
                  {i.origin === "REAL" && <span className="tag real">real</span>}
                  {closed && <span className="tag done">closed</span>}
                </span>
              </div>
              <div className="qi-desc">{i.short_description || i.theme}</div>
              <div className="qi-meta">
                <span className="stream-dot" style={{ background: STREAM_COLORS[i.value_stream] || "#888" }} />
                {i.ebs_module} · {i.value_stream} · {closed ? `${i.close_code || "Closed"} · ${(i.closed_at || "").slice(0, 10)}` : i.state}
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
