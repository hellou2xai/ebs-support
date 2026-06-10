import { useEffect, useState } from "react";
import { getObservability, Observability } from "../api";

export function ObservabilityView() {
  const [d, setD] = useState<Observability | null>(null);
  useEffect(() => {
    const load = () => getObservability().then(setD).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  if (!d) return <div className="panel empty">Loading observability…</div>;
  const features = Object.entries(d.byFeature);
  const maxCost = Math.max(...features.map(([, v]) => v.cost), 0.0001);

  return (
    <div className="dashboard">
      <div className="stat-row">
        <Stat label="Queries (this session)" value={d.queries} />
        <Stat label="Total cost" value={`$${d.totalCost.toFixed(4)}`} accent="var(--green)" />
        <Stat label="Tokens (in / out)" value={`${fmt(d.inputTokens)} / ${fmt(d.outputTokens)}`} />
        <Stat label="Avg latency" value={`${d.avgLatencyMs} ms`} accent="var(--amber)" />
      </div>

      <section className="card">
        <h4>Cost by feature</h4>
        {features.length === 0 && <p className="muted">No Claude calls yet. Run a diagnosis or ask the expert.</p>}
        {features.map(([k, v]) => (
          <div className="bar-row" key={k}>
            <span className="bar-label">{k}</span>
            <div className="bar"><div className="bar-fill" style={{ width: `${(v.cost / maxCost) * 100}%` }} /></div>
            <span className="bar-val">${v.cost.toFixed(4)}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <h4>Recent queries</h4>
        <table className="pat-table obs-table">
          <thead><tr><th>Time</th><th>Feature</th><th>Model</th><th>In</th><th>Out</th><th>Latency</th><th>Cost</th><th>Detail</th></tr></thead>
          <tbody>
            {d.recent.length === 0 && <tr><td colSpan={8} className="muted">No queries yet.</td></tr>}
            {d.recent.map(r => (
              <tr key={r.id}>
                <td className="mono">{new Date(r.ts).toLocaleTimeString()}</td>
                <td><span className={`feat ${r.feature}`}>{r.feature}</span></td>
                <td className="mono">{r.model}</td>
                <td>{fmt(r.inputTokens)}</td>
                <td>{fmt(r.outputTokens)}</td>
                <td>{r.latencyMs} ms</td>
                <td className="cost">${r.cost.toFixed(5)}</td>
                <td className="sig">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function fmt(n: number) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="stat">
      <div className="stat-val" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
