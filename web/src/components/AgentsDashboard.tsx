import { useEffect, useState } from "react";
import { getAgents, runPipeline, runStep, AgentDef, PipelineEvent, DetailKind } from "../api";

type CellStatus = "pending" | "running" | "ok" | "hold" | "skip";
interface Cell { status: CellStatus; summary?: string; }
type Grid = Record<string, Record<string, Cell>>;

export function AgentsDashboard({ onDetail }: { onDetail: (kind: DetailKind, id: string) => void }) {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [limit, setLimit] = useState(8);
  const [ids, setIds] = useState<string[]>([]);
  const [grid, setGrid] = useState<Grid>({});
  const [outcomes, setOutcomes] = useState<Record<string, { outcome: string; tier: string }>>({});
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [running, setRunning] = useState<string | null>(null); // null | "all" | agentId
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => { getAgents().then(setAgents); }, []);

  function ensureGrid(idList: string[]) {
    const g: Grid = {};
    idList.forEach(id => { g[id] = {}; agents.forEach(a => g[id][a.id] = { status: "pending" }); });
    setGrid(g);
  }

  function handle(ev: PipelineEvent) {
    if (ev.type === "init") { setIds(ev.ids); ensureGrid(ev.ids); }
    else if (ev.type === "agent_start") setGrid(g => ({ ...g, [ev.incident]: { ...g[ev.incident], [ev.agent]: { status: "running" } } }));
    else if (ev.type === "agent_done") {
      setGrid(g => ({ ...g, [ev.incident]: { ...g[ev.incident], [ev.agent]: { status: ev.status, summary: ev.summary } } }));
      setLog(l => [`${ev.incident} · ${ev.agent}: ${ev.summary}`, ...l].slice(0, 50));
    }
    else if (ev.type === "incident_done") setOutcomes(o => ({ ...o, [ev.incident]: { outcome: ev.outcome, tier: ev.tier } }));
    else if (ev.type === "pipeline_done") { setStats(ev.stats); setRunning(null); }
    else if (ev.type === "step_done") setRunning(null);
  }

  function runAll() {
    setGrid({}); setOutcomes({}); setStats(null); setIds([]); setLog([]); setRunning("all");
    runPipeline(limit, handle);
  }
  function runOne(agentId: string) {
    setRunning(agentId);
    // keep prior grid/ids; just refresh the chosen column
    runStep(agentId, limit, handle);
  }

  return (
    <div className="agents-dash">
      <div className="pipeline-row">
        {agents.map((a, i) => (
          <button className={`agent-card ${running === a.id ? "active" : ""}`} key={a.id}
            onClick={() => runOne(a.id)} disabled={!!running} title="Run this step independently">
            <div className="agent-step">{i + 1}</div>
            <div className="agent-name">{a.name}</div>
            <div className="agent-role">{a.role}</div>
            <div className="agent-meta">{a.autonomy}</div>
            <div className="agent-run">{running === a.id ? "running…" : "▶ run step"}</div>
            {i < agents.length - 1 && <div className="agent-arrow">→</div>}
          </button>
        ))}
      </div>

      <div className="run-bar">
        <label>Run over
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} disabled={!!running}>
            {[4, 8, 12, 20].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          open incidents
        </label>
        <button className="btn primary" onClick={runAll} disabled={!!running}>
          {running === "all" ? "Pipeline running…" : "Run full pipeline"}
        </button>
        <span className="hint">or click a step card above to run it independently</span>
        {stats && (
          <div className="run-stats">
            <span>{stats.processed} processed</span>
            <span className="ok">{stats.auto} auto-resolved</span>
            <span className="hold">{stats.assisted} staged</span>
            <span>{stats.escalated} escalated</span>
            <span className="prob">{stats.problems} problems</span>
          </div>
        )}
      </div>

      {ids.length > 0 && (
        <div className="matrix-wrap">
          <table className="matrix">
            <thead>
              <tr><th>Incident</th>{agents.map(a => <th key={a.id}>{a.name}</th>)}<th>Outcome</th></tr>
            </thead>
            <tbody>
              {ids.map(id => (
                <tr key={id}>
                  <td><a className="inc-link" onClick={() => onDetail("resolution", id)}>{id}</a></td>
                  {agents.map(a => {
                    const c = grid[id]?.[a.id];
                    return <td key={a.id} className={`cell ${c?.status || "pending"}`} title={c?.summary || ""}><span className="cell-dot" /></td>;
                  })}
                  <td className="outcome">
                    {outcomes[id]
                      ? <a className="pill-link" onClick={() => onDetail("resolution", id)}><span className={`pill ${outcomes[id].tier.replace(/\W/g, "")}`}>{outcomes[id].outcome}</span></a>
                      : <span className="muted">…</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Click any incident or outcome for the full resolution detail.</p>
        </div>
      )}

      {log.length > 0 && (
        <div className="card feed">
          <h4>Agent activity</h4>
          {log.map((l, i) => <div key={i} className="feed-line">{l}</div>)}
        </div>
      )}
    </div>
  );
}
