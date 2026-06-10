import { useEffect, useState } from "react";
import { getDetail, DetailKind } from "../api";
import { Markdown } from "./Markdown";

interface Props {
  kind: DetailKind; id: string;
  onDetail: (kind: DetailKind, id: string) => void;
  known: Set<string>;
  onClose: () => void;
}

export function DetailModal({ kind, id, onDetail, known, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setErr(null);
    getDetail(kind, id).then(setData).catch(e => setErr(String(e.message || e)));
  }, [kind, id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-kind">{kind === "resolution" ? "Resolution" : kind === "pattern" ? "Issue pattern" : "Root cause"}</div>
          <div className="modal-id">{id}</div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <p className="muted">{err}</p>}
          {!data && !err && <p className="muted">Loading…</p>}
          {data && kind === "resolution" && <Resolution d={data} onDetail={onDetail} known={known} />}
          {data && kind === "pattern" && <Pattern d={data} onDetail={onDetail} known={known} />}
          {data && kind === "rca" && <Rca d={data} onDetail={onDetail} known={known} />}
        </div>
      </div>
    </div>
  );
}

function Objects({ objects }: { objects: { label: string; value: string }[] }) {
  if (!objects || objects.length === 0) return null;
  return (
    <section className="m-card">
      <h4>Identified objects</h4>
      <div className="obj-grid">
        {objects.map((o, i) => (
          <div className="obj" key={i}><span className="obj-k">{o.label}</span><span className="obj-v">{o.value}</span></div>
        ))}
      </div>
    </section>
  );
}

function IncList({ ids, onDetail, known }: { ids: string[]; onDetail: Props["onDetail"]; known: Set<string> }) {
  return (
    <div className="inc-chips">
      {ids.map(n => {
        const k = known.has(n);
        return <a key={n} className={`inc-chip ${k ? "" : "ext"}`} onClick={() => k && onDetail("resolution", n)}>{n}</a>;
      })}
    </div>
  );
}

function Pill({ text }: { text: string }) {
  const cls = text.includes("Auto") ? "ok" : text.includes("Staged") || text.includes("Assisted") ? "hold" : "esc";
  return <span className={`m-pill ${cls}`}>{text}</span>;
}

function Resolution({ d, onDetail, known }: { d: any } & Pick<Props, "onDetail" | "known">) {
  return (
    <>
      <div className="m-top">
        <div>
          <div className="m-theme">{d.theme}</div>
          <div className="m-desc">{d.short_description}</div>
        </div>
        <Pill text={d.outcome} />
      </div>
      <div className="m-chips">
        <span className="chip">{d.value_stream}</span>
        <span className="chip">{d.primary_system}</span>
        <span className="chip">{d.assignment_group}</span>
        <span className="chip">tier: {d.tier}</span>
      </div>

      <section className="m-card">
        <h4>How it was resolved</h4>
        <Markdown text={d.how_resolved} onDetail={onDetail} known={known} />
      </section>

      <Objects objects={d.objects} />

      <section className="m-card timeline">
        <h4>Agent sequence</h4>
        {d.agents.map((a: any) => (
          <div className="tl-row" key={a.id}>
            <span className={`tl-dot ${a.status}`} />
            <span className="tl-name">{a.name}</span>
            <span className="tl-sum">{a.summary}</span>
          </div>
        ))}
      </section>

      <section className="m-card source">
        <h4>Resolve at source</h4>
        <KV k="Root cause" v={d.root_cause.root_cause} link={["rca", d.root_cause.root_cause_id]} onDetail={onDetail} />
        <KV k="Source" v={`${d.root_cause.source_system} (${d.root_cause.source_object})`} />
        <KV k="Permanent fix" v={d.root_cause.permanent_fix} hl />
        <KV k="Pattern" v={d.pattern?.pattern_id} link={["pattern", d.pattern?.pattern_id]} onDetail={onDetail} />
        <div className="recurrence">{d.recurrence.incidents_with_same_root_cause} incident(s) share this root cause
          {d.linked_incidents.length > 0 && <> · linked: <IncList ids={d.linked_incidents} onDetail={onDetail} known={known} /></>}
        </div>
      </section>

      <section className="m-card">
        <h4>Next steps</h4>
        <ul className="md">{d.next_steps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
      </section>
    </>
  );
}

function Pattern({ d, onDetail, known }: { d: any } & Pick<Props, "onDetail" | "known">) {
  return (
    <>
      <div className="m-top"><div className="m-theme">{d.signature}</div></div>
      <div className="m-chips">
        <span className="chip">{d.value_stream}</span>
        <span className="chip">{d.occurrence_count}x in scope</span>
        <span className="chip">auto: {d.auto_resolvable}</span>
      </div>
      {d.root_cause && (
        <section className="m-card source">
          <h4>Root cause</h4>
          <KV k="Root cause" v={d.root_cause.root_cause} link={["rca", d.root_cause_id]} onDetail={onDetail} />
          <KV k="Source" v={`${d.root_cause.source_system} (${d.root_cause.source_object || "—"})`} />
          <KV k="Permanent fix" v={d.root_cause.permanent_fix} hl />
        </section>
      )}
      {d.action && (
        <section className="m-card">
          <h4>Typical action</h4>
          <KV k="Action" v={`${d.action.action_name} (${d.action.ebs_program})`} />
          <KV k="Risk / approval" v={`${d.action.risk} · ${d.action.approval === "N" ? "no approval" : "approval required"}`} />
        </section>
      )}
      {d.kb && <section className="m-card"><h4>Runbook · {d.kb.title}</h4><p className="md">{d.kb.resolution}</p></section>}
      <Objects objects={d.objects} />
      <section className="m-card"><h4>Example incidents</h4><IncList ids={d.example_incidents} onDetail={onDetail} known={known} /></section>
    </>
  );
}

function Rca({ d, onDetail, known }: { d: any } & Pick<Props, "onDetail" | "known">) {
  return (
    <>
      <div className="m-top"><div className="m-theme">{d.symptom}</div></div>
      <div className="m-chips">
        <span className="chip">{d.value_stream}</span>
        <span className="chip">{d.fix_category}</span>
        <span className="chip">effort: {d.effort}</span>
        <span className="chip">{d.incident_count} incident(s)</span>
      </div>
      <section className="m-card source">
        <h4>Root cause and permanent fix</h4>
        <KV k="Root cause" v={d.root_cause} />
        <KV k="Source" v={`${d.source_system} (${d.source_object})`} />
        <KV k="Immediate fix" v={d.immediate_resolution} />
        <KV k="Permanent fix" v={d.permanent_fix} hl />
      </section>
      <Objects objects={d.objects} />
      <section className="m-card">
        <h4>Patterns and incidents</h4>
        <div className="inc-chips">{d.patterns.map((p: string) => <a key={p} className="inc-chip pat" onClick={() => onDetail("pattern", p)}>{p}</a>)}</div>
        <div style={{ marginTop: 8 }}><IncList ids={d.example_incidents} onDetail={onDetail} known={known} /></div>
      </section>
    </>
  );
}

function KV({ k, v, hl, link, onDetail }: { k: string; v: string; hl?: boolean; link?: [DetailKind, string]; onDetail?: Props["onDetail"] }) {
  return (
    <div className={`kv ${hl ? "hl" : ""}`}>
      <span className="k">{k}</span>
      <span className="v">{link && onDetail ? <a className="inc-link" onClick={() => onDetail(link[0], link[1])}>{link[1]}</a> : null}{link ? " · " : ""}{v}</span>
    </div>
  );
}
