import { useEffect, useMemo, useRef, useState } from "react";
import { getGraph, getAnalytics, GraphNode, GraphEdge, DetailKind } from "../api";

// Node palette by type. Incident is the primary citizen.
const TYPE_COLOR: Record<string, string> = {
  Incident: "#2f6bff", IssuePattern: "#b5701f", RootCause: "#c0445a",
  PermanentFix: "#128a63", System: "#7a5cd6", ValueStream: "#0e8a9e", DataFix: "#5f6b80",
};
const TYPE_LABEL: Record<string, string> = {
  Incident: "Incidents", IssuePattern: "Patterns", RootCause: "Root causes",
  PermanentFix: "Permanent fixes", System: "Systems", ValueStream: "Value streams", DataFix: "Data fixes",
};
const DEFAULT_ON = new Set(["Incident", "IssuePattern", "RootCause", "PermanentFix", "System", "ValueStream"]);

// Deterministic pseudo-random so the layout is stable between renders.
function rng(seed: number) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

// Fruchterman-Reingold force layout, precomputed.
function layout(nodes: GraphNode[], edges: GraphEdge[], w: number, h: number) {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const r = rng(42);
  const px = nodes.map(() => w * (0.1 + 0.8 * r()));
  const py = nodes.map(() => h * (0.1 + 0.8 * r()));
  const deg = new Array(nodes.length).fill(0);
  const e = edges
    .map(ed => [idx.get(ed.source)!, idx.get(ed.target)!] as [number, number])
    .filter(([a, b]) => a !== undefined && b !== undefined);
  e.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  const k = Math.sqrt((w * h) / Math.max(nodes.length, 1)) * 0.9;
  let temp = w / 8;
  for (let iter = 0; iter < 260; iter++) {
    const dx = new Array(nodes.length).fill(0);
    const dy = new Array(nodes.length).fill(0);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let vx = px[i] - px[j], vy = py[i] - py[j];
        let d2 = vx * vx + vy * vy;
        if (d2 < 0.01) { vx = (r() - 0.5); vy = (r() - 0.5); d2 = vx * vx + vy * vy; }
        const d = Math.sqrt(d2);
        const f = (k * k) / d / d;
        dx[i] += vx * f; dy[i] += vy * f;
        dx[j] -= vx * f; dy[j] -= vy * f;
      }
    }
    for (const [a, b] of e) {
      const vx = px[a] - px[b], vy = py[a] - py[b];
      const d = Math.max(Math.sqrt(vx * vx + vy * vy), 0.01);
      const f = (d * d) / k / d;
      dx[a] -= vx * f; dy[a] -= vy * f;
      dx[b] += vx * f; dy[b] += vy * f;
    }
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.max(Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]), 0.01);
      px[i] += (dx[i] / d) * Math.min(d, temp);
      py[i] += (dy[i] / d) * Math.min(d, temp);
      px[i] = Math.max(20, Math.min(w - 20, px[i]));
      py[i] = Math.max(20, Math.min(h - 20, py[i]));
    }
    temp *= 0.96;
  }
  return { px, py, deg, idx };
}

export function AnalyticsView({ onDetail }: { onDetail: (kind: DetailKind, id: string) => void }) {
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [trends, setTrends] = useState<any>(null);
  const [typesOn, setTypesOn] = useState<Set<string>>(new Set(DEFAULT_ON));
  const [stream, setStream] = useState("all");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { getGraph().then(setGraph); getAnalytics().then(setTrends); }, []);

  const W = 1240, H = 640;
  const view = useMemo(() => {
    if (!graph) return null;
    // Filter nodes by type and stream; keep non-incident nodes regardless of stream.
    let nodes = graph.nodes.filter(n => typesOn.has(n.type));
    if (stream !== "all") {
      const keepInc = new Set(nodes.filter(n => n.type === "Incident" && n.stream === stream).map(n => n.id));
      nodes = nodes.filter(n => n.type !== "Incident" ? true : keepInc.has(n.id));
    }
    const ids = new Set(nodes.map(n => n.id));
    const edges = graph.edges.filter(e => ids.has(e.source) && ids.has(e.target));
    const lay = layout(nodes, edges, W, H);
    // Search highlight: matching nodes + their direct neighbours stay full, rest dim.
    let lit: Set<string> | null = null;
    const q = search.trim().toUpperCase();
    if (q) {
      lit = new Set<string>();
      for (const n of nodes) if (n.id.toUpperCase().includes(q) || (n.label || "").toUpperCase().includes(q)) lit.add(n.id);
      for (const e of edges) {
        if (lit.has(e.source)) lit.add(e.target);
        if (lit.has(e.target)) lit.add(e.source);
      }
    }
    return { nodes, edges, lay, lit };
  }, [graph, typesOn, stream, search]);

  function toggleType(t: string) {
    setTypesOn(s => { const c = new Set(s); c.has(t) ? c.delete(t) : c.add(t); return c; });
  }
  function nodeClick(n: GraphNode) {
    if (n.type === "Incident" && n.known) onDetail("resolution", n.id);
    else if (n.type === "IssuePattern") onDetail("pattern", n.id);
    else if (n.type === "RootCause") onDetail("rca", n.id);
  }
  function radius(n: GraphNode, deg: number) {
    if (n.type === "Incident") return n.priority === "P1" ? 9 : n.priority === "P2" ? 7.5 : 6;
    return Math.min(8 + deg * 0.35, 20);
  }

  return (
    <div className="analytics">
      <div className="run-bar graph-bar">
        <input className="graph-search" placeholder="Find: INC…, RCA-…, PAT-…, system" value={search} onChange={e => setSearch(e.target.value)} />
        <select value={stream} onChange={e => setStream(e.target.value)}>
          <option value="all">All value streams</option>
          {(trends?.streams ?? []).map((s: string) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="legend">
          {Object.keys(TYPE_COLOR).map(t => (
            <label key={t} className={`legend-item ${typesOn.has(t) ? "" : "off"}`}>
              <input type="checkbox" checked={typesOn.has(t)} onChange={() => toggleType(t)} />
              <span className="legend-dot" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}
            </label>
          ))}
        </div>
        <span className="hint">{view ? `${view.nodes.length} nodes · ${view.edges.length} links` : "loading…"} · click a node for detail · drag to pan · wheel to zoom</span>
      </div>

      <div className="panel graph-panel">
        {view && (
          <svg
            viewBox={`0 0 ${W} ${H}`} className="graph-svg"
            onWheel={e => { setZoom(z => Math.max(0.5, Math.min(4, z * (e.deltaY < 0 ? 1.12 : 0.89)))); }}
            onPointerDown={e => { dragRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; }}
            onPointerMove={e => { if (dragRef.current) setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y }); }}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerLeave={() => { dragRef.current = null; }}
          >
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {view.edges.map((e, i) => {
                const a = view.lay.idx.get(e.source)!, b = view.lay.idx.get(e.target)!;
                const dim = view.lit && !(view.lit.has(e.source) && view.lit.has(e.target));
                const recur = e.type === "RECURRENCE_OF";
                return <line key={i}
                  x1={view.lay.px[a]} y1={view.lay.py[a]} x2={view.lay.px[b]} y2={view.lay.py[b]}
                  stroke={recur ? "#c0445a" : "var(--border)"} strokeWidth={recur ? 1.6 : 1}
                  strokeDasharray={recur ? "4 3" : undefined} opacity={dim ? 0.12 : recur ? 0.9 : 0.55} />;
              })}
              {view.nodes.map(n => {
                const i = view.lay.idx.get(n.id)!;
                const dim = view.lit && !view.lit.has(n.id);
                const closed = n.type === "Incident" && n.state === "Closed";
                return (
                  <g key={n.id} transform={`translate(${view.lay.px[i]},${view.lay.py[i]})`}
                    className={`gnode ${dim ? "dim" : ""}`} onClick={() => nodeClick(n)}>
                    <circle r={radius(n, view.lay.deg[i])} fill={TYPE_COLOR[n.type] || "#888"}
                      opacity={dim ? 0.15 : closed ? 0.45 : 0.92}
                      stroke={n.type === "Incident" && n.priority === "P1" ? "#c0445a" : "#fff"}
                      strokeWidth={n.type === "Incident" && n.priority === "P1" ? 2 : 1} />
                    {(n.type !== "Incident" || (view.lit && view.lit.has(n.id))) && !dim && (
                      <text dy={-radius(n, view.lay.deg[i]) - 3} textAnchor="middle" className="gnode-label">
                        {n.id.length > 22 ? n.id.slice(0, 21) + "…" : n.id}
                      </text>
                    )}
                    <title>{`${n.type}: ${n.id}\n${n.label}${n.type === "Incident" ? `\n${n.module} · ${n.priority} · ${n.state}` : ""}`}</title>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {!view && <div className="panel empty" style={{ border: "none" }}>Building graph…</div>}
      </div>

      {trends && <TrendCharts trends={trends} />}
    </div>
  );
}

const STREAM_COLORS: Record<string, string> = {
  "Item-MDM": "#7c9eff", "QTD": "#5ad1a8", "PTM": "#f0b35b",
  "PTC": "#e06c9f", "PTP": "#c08cff", "Services": "#9b8cff",
};

function TrendCharts({ trends }: { trends: any }) {
  const months = Object.keys(trends.byMonth).sort();
  const streams: string[] = trends.streams;
  const maxMonth = Math.max(...months.map(m => streams.reduce((s, st) => s + (trends.byMonth[m][st] || 0), 0)), 1);
  const mods = Object.entries(trends.byModule as Record<string, number>).sort((a, b) => b[1] - a[1]);
  const maxMod = Math.max(...mods.map(([, v]) => v), 1);
  const maxExp = Math.max(...months.map(m => trends.exposureByMonth[m] || 0), 1);

  return (
    <div className="two-col charts-row">
      <section className="card">
        <h4>Incidents opened by month · by value stream</h4>
        <svg viewBox="0 0 600 220" className="chart-svg">
          {months.map((m, i) => {
            const bw = 600 / months.length;
            let y = 200;
            return (
              <g key={m}>
                {streams.map(st => {
                  const v = trends.byMonth[m][st] || 0;
                  const h = (v / maxMonth) * 170;
                  y -= h;
                  return v ? <rect key={st} x={i * bw + 6} y={y} width={bw - 12} height={h} fill={STREAM_COLORS[st] || "#888"} rx={1.5}><title>{`${m} ${st}: ${v}`}</title></rect> : null;
                })}
                <text x={i * bw + bw / 2} y={214} textAnchor="middle" className="chart-label">{m.slice(5)}</text>
              </g>
            );
          })}
        </svg>
        <div className="chart-legend">
          {streams.map(s => <span key={s}><i style={{ background: STREAM_COLORS[s] || "#888" }} />{s}</span>)}
        </div>
      </section>
      <section className="card">
        <h4>By Oracle module · AR/AP exposure by month</h4>
        {mods.map(([m, v]) => (
          <div className="bar-row" key={m}>
            <span className="bar-label">{m}</span>
            <div className="bar"><div className="bar-fill" style={{ width: `${(v / maxMod) * 100}%` }} /></div>
            <span className="bar-val">{v}</span>
          </div>
        ))}
        <svg viewBox="0 0 600 110" className="chart-svg" style={{ marginTop: 10 }}>
          {months.map((m, i) => {
            const bw = 600 / months.length;
            const v = trends.exposureByMonth[m] || 0;
            const h = (v / maxExp) * 80;
            return (
              <g key={m}>
                <rect x={i * bw + 6} y={92 - h} width={bw - 12} height={h} fill="#128a63" rx={1.5} opacity={0.85}>
                  <title>{`${m}: $${Math.round(v).toLocaleString()}`}</title>
                </rect>
                <text x={i * bw + bw / 2} y={106} textAnchor="middle" className="chart-label">{m.slice(5)}</text>
              </g>
            );
          })}
        </svg>
      </section>
    </div>
  );
}
