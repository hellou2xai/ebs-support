import type { Dashboard } from "../types";
import type { DetailKind } from "../api";

export function DashboardView({ dash, onDetail }: { dash: Dashboard | null; onDetail: (kind: DetailKind, id: string) => void }) {
  if (!dash) return <div className="panel empty">Loading dashboard…</div>;
  const maxStream = Math.max(...Object.values(dash.byStream), 1);
  const maxPat = Math.max(...dash.patterns.map(p => p.count), 1);
  return (
    <div className="dashboard">
      <div className="stat-row">
        <Stat label="Incidents in scope" value={dash.total} />
        <Stat label="Recurring" value={dash.recurring} accent="#f0b35b" />
        <Stat label="Distinct root causes" value={dash.rootCauses} accent="#5ad1a8" />
        <Stat label="Auto-resolvable" value={dash.byTier["Auto-resolve"] || 0} accent="#7c9eff" />
      </div>

      <div className="two-col">
        <section className="card">
          <h4>By value stream</h4>
          {Object.entries(dash.byStream).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <div className="bar-row" key={k}>
              <span className="bar-label">{k}</span>
              <div className="bar"><div className="bar-fill" style={{ width: `${(v / maxStream) * 100}%` }} /></div>
              <span className="bar-val">{v}</span>
            </div>
          ))}
        </section>
        <section className="card">
          <h4>By resolution tier</h4>
          {Object.entries(dash.byTier).map(([k, v]) => (
            <div className="bar-row" key={k}>
              <span className="bar-label">{k}</span>
              <div className="bar"><div className="bar-fill alt" style={{ width: `${(v / dash.total) * 100}%` }} /></div>
              <span className="bar-val">{v}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="card">
        <h4>Repetitive issue patterns (by frequency)</h4>
        <table className="pat-table">
          <thead><tr><th>Pattern</th><th>Stream</th><th>Signature</th><th>Auto</th><th>Root cause</th><th>Count</th></tr></thead>
          <tbody>
            {dash.patterns.map(p => (
              <tr key={p.pattern_id}>
                <td><a className="inc-link pat" onClick={() => onDetail("pattern", p.pattern_id)}>{p.pattern_id}</a></td>
                <td>{p.value_stream}</td>
                <td className="sig">{p.signature}</td>
                <td>{p.auto}</td>
                <td><a className="inc-link rca" onClick={() => onDetail("rca", p.root_cause)}>{p.root_cause}</a></td>
                <td>
                  <div className="mini-bar"><div style={{ width: `${(p.count / maxPat) * 100}%` }} /></div>
                  {p.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="stat">
      <div className="stat-val" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
