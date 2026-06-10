import { useEffect, useState } from "react";
import { getPersona, DetailKind } from "../api";

const BAND_TONE: Record<string, string> = { Critical: "red", High: "amber" };
const PRIO_TONE: Record<string, string> = { P1: "red", P2: "amber" };

export function PersonaHome({ role, onDetail, onOpenQueue }: { role: string; onDetail: (kind: DetailKind, id: string) => void; onOpenQueue: (filter: any) => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); getPersona(role).then(setD).catch(() => setD(null)); }, [role]);
  if (!d) return <div className="panel empty">Loading {role} dashboard…</div>;

  return (
    <div className="persona">
      <div className="persona-head">
        <div>
          <h2>{d.title}</h2>
          <div className="persona-sub">{role} · {d.subtitle}</div>
        </div>
      </div>

      <div className="stat-row">
        {d.kpis.map((k: any, i: number) => (
          <div className={`stat ${k.filter ? "clickable" : ""}`} key={i}
            title={k.filter ? "View these incidents in the queue" : ""}
            onClick={() => k.filter && onOpenQueue(k.filter)}>
            <div className="stat-val" style={toneStyle(k.tone)}>{k.value}</div>
            <div className="stat-label">{k.label}{k.filter ? " →" : ""}</div>
          </div>
        ))}
      </div>

      {d.panels.map((p: any, i: number) => (
        <section className="card" key={i}>
          <h4>{p.title}</h4>
          {p.type === "incidents" && <IncidentTable items={p.items} onDetail={onDetail} />}
          {p.type === "rcas" && <RcaList items={p.items} onDetail={onDetail} />}
          {p.type === "patterns" && <PatternList items={p.items} onDetail={onDetail} />}
          {p.type === "bars" && <Bars items={p.items} />}
        </section>
      ))}
    </div>
  );
}

function toneStyle(tone?: string) {
  if (tone === "red") return { color: "#c0445a" };
  if (tone === "amber") return { color: "var(--amber)" };
  if (tone === "green") return { color: "var(--green)" };
  return undefined;
}

function IncidentTable({ items, onDetail }: { items: any[]; onDetail: (k: DetailKind, id: string) => void }) {
  if (!items.length) return <p className="muted">Nothing here right now.</p>;
  return (
    <table className="pat-table">
      <thead><tr><th>Incident</th><th>Pri</th><th>Module</th><th>Summary</th><th>Value / flags</th><th>Tier</th></tr></thead>
      <tbody>
        {items.map(i => (
          <tr key={i.incident_number}>
            <td><a className="inc-link" onClick={() => onDetail("resolution", i.incident_number)}>{i.incident_number}</a></td>
            <td><span className="prio" style={toneStyle(PRIO_TONE[i.priority])}>{i.priority}</span></td>
            <td>{i.ebs_module}</td>
            <td className="sig">{i.short_description?.slice(0, 70)}</td>
            <td>
              {i.invoice_amount ? <span className="amt">${Math.round(Number(i.invoice_amount)).toLocaleString()}</span> : null}
              {(i.business_flags || "").split(";").filter(Boolean).slice(0, 2).map((f: string) => <span key={f} className={`flag mini ${flagTone(f)}`}>{f}</span>)}
            </td>
            <td><span className={`tierpill ${i.tier.replace(/\W/g, "")}`}>{i.tier}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RcaList({ items, onDetail }: { items: any[]; onDetail: (k: DetailKind, id: string) => void }) {
  return (
    <table className="pat-table">
      <thead><tr><th>Root cause</th><th>Recurs</th><th>Source</th><th>Permanent fix</th><th>Effort</th></tr></thead>
      <tbody>
        {items.map(r => (
          <tr key={r.rca_id}>
            <td><a className="inc-link rca" onClick={() => onDetail("rca", r.rca_id)}>{r.rca_id}</a></td>
            <td><b>{r.count}</b></td>
            <td>{r.source_system}</td>
            <td className="sig">{r.permanent_fix?.slice(0, 80)}</td>
            <td>{r.effort}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PatternList({ items, onDetail }: { items: any[]; onDetail: (k: DetailKind, id: string) => void }) {
  const max = Math.max(...items.map(p => p.count), 1);
  return (
    <table className="pat-table">
      <thead><tr><th>Pattern</th><th>Signature</th><th>Auto</th><th>Count</th></tr></thead>
      <tbody>
        {items.map(p => (
          <tr key={p.pattern_id}>
            <td><a className="inc-link pat" onClick={() => onDetail("pattern", p.pattern_id)}>{p.pattern_id}</a></td>
            <td className="sig">{p.signature}</td>
            <td>{p.auto}</td>
            <td><div className="mini-bar"><div style={{ width: `${(p.count / max) * 100}%` }} /></div>{p.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div>
      {items.map(i => (
        <div className="bar-row" key={i.label}>
          <span className="bar-label">{i.label}</span>
          <div className="bar"><div className="bar-fill" style={{ width: `${(i.value / max) * 100}%` }} /></div>
          <span className="bar-val">{i.value}</span>
        </div>
      ))}
    </div>
  );
}

function flagTone(f: string): string {
  if (f.includes("Critical") || f.includes("Single-source")) return "critical";
  if (f.includes("High-value") || f.includes("Strategic") || f.includes("Quarter")) return "high";
  return "info";
}
