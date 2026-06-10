import { useEffect, useState } from "react";
import { getIncidents, getDashboard, getHealth, DetailKind } from "./api";
import type { IncidentSummary, Dashboard, QueueFilter } from "./types";
import { Login } from "./components/Login";
import { PersonaHome } from "./components/PersonaHome";
import { IncidentQueue } from "./components/IncidentQueue";
import { IncidentDetail } from "./components/IncidentDetail";
import { DashboardView } from "./components/Dashboard";
import { AgentsDashboard } from "./components/AgentsDashboard";
import { ObservabilityView } from "./components/Observability";
import { ChatPanel } from "./components/ChatPanel";
import { DetailModal } from "./components/DetailModal";

const ROLES = [
  "L1 Support Analyst", "L2 Support Engineer", "L3 SME",
  "Finance Controller", "Change Approver", "AMS Service Manager",
];
type Tab = "home" | "queue" | "agents" | "dashboard" | "observability";

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem("alice-auth") === "1");
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [role, setRole] = useState(ROLES[1]);
  const [tab, setTab] = useState<Tab>("home");
  const [health, setHealth] = useState<{ mode: string; model: string } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("alice-theme") as "light" | "dark") || "light");
  const [detail, setDetail] = useState<{ kind: DetailKind; id: string } | null>(null);
  const [queueFilter, setQueueFilter] = useState<QueueFilter | null>(null);

  useEffect(() => {
    if (!authed) return;
    getIncidents().then(setIncidents);
    getDashboard().then(setDash);
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, [authed]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("alice-theme", theme);
  }, [theme]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const selectedIncident = incidents.find(i => i.incident_number === selected) || null;
  const knownIds = new Set(incidents.map(i => i.incident_number));
  const openDetail = (kind: DetailKind, id: string) => setDetail({ kind, id });
  // Switching persona lands on that persona's home dashboard.
  const changeRole = (r: string) => { setRole(r); setTab("home"); setQueueFilter(null); };
  const openQueue = (filter: QueueFilter) => { setQueueFilter(filter); setTab("queue"); };
  const logout = () => { localStorage.removeItem("alice-auth"); setAuthed(false); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo-u2x">U2x<span className="ai">AI</span></span>
          <div>
            <div className="brand-title">U2xAI Alice AMS Support</div>
            <div className="brand-sub">Oracle EBS Application Management Services</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className={`mode-badge ${health?.mode === "LIVE" ? "live" : "offline"}`}>
            <span className="dot" />{health ? `${health.mode}${health.mode === "LIVE" ? " · " + health.model : ""}` : "connecting"}
          </div>
          <button className="theme-toggle" onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}>
            {theme === "light" ? "Dark" : "Light"} mode
          </button>
          <label className="role-select">
            <span>Persona (admin can switch)</span>
            <select value={role} onChange={e => changeRole(e.target.value)}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </label>
          <button className="theme-toggle" onClick={logout}>Sign out</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>{role.split(" ")[0]} home</button>
        <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>Incident queue</button>
        <button className={tab === "agents" ? "active" : ""} onClick={() => setTab("agents")}>Agent pipeline</button>
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}>Track dashboard</button>
        <button className={tab === "observability" ? "active" : ""} onClick={() => setTab("observability")}>Observability</button>
      </nav>

      {tab === "home" && <PersonaHome role={role} onDetail={openDetail} onOpenQueue={openQueue} />}
      {tab === "queue" && (
        <div className="layout">
          <IncidentQueue incidents={incidents} selected={selected} onSelect={setSelected}
            filter={queueFilter} onClearFilter={() => setQueueFilter(null)} />
          {selectedIncident
            ? <IncidentDetail incident={selectedIncident} role={role} onDetail={openDetail} known={knownIds} />
            : <div className="panel empty">Select an incident to see insights and run the agent.</div>}
        </div>
      )}
      {tab === "agents" && <AgentsDashboard onDetail={openDetail} />}
      {tab === "dashboard" && <DashboardView dash={dash} onDetail={openDetail} />}
      {tab === "observability" && <ObservabilityView />}

      <ChatPanel onDetail={openDetail} known={knownIds} />
      {detail && <DetailModal kind={detail.kind} id={detail.id} onDetail={openDetail} known={knownIds} onClose={() => setDetail(null)} />}
    </div>
  );
}
