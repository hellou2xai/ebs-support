import { useRef, useState, useEffect } from "react";
import { chat, ChatMsg, ChatEvent, DetailKind } from "../api";
import { Markdown } from "./Markdown";

interface Turn { role: "user" | "assistant"; content: string; tools?: string[]; pending?: boolean; cost?: number; tokens?: number; }

const SUGGESTIONS = [
  "Top recurring root causes and their permanent fixes?",
  "Explain INC0903826 with the exact objects involved.",
  "What is RCA-12 and which incidents does it cause?",
  "Which Item-MDM issues are auto-resolvable, and why?",
];

export function ChatPanel({ onDetail, known }: { onDetail?: (kind: DetailKind, id: string) => void; known?: Set<string> }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, open]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const history: ChatMsg[] = [...turns.map(t => ({ role: t.role, content: t.content })), { role: "user", content: text }];
    setTurns(t => [...t, { role: "user", content: text }, { role: "assistant", content: "", tools: [], pending: true }]);
    setInput(""); setBusy(true);
    try {
      await chat(history, (ev: ChatEvent) => {
        setTurns(t => {
          const copy = [...t];
          const last = copy[copy.length - 1];
          if (ev.type === "tool") last.tools = [...(last.tools || []), ev.name];
          else if (ev.type === "answer") { last.content = ev.text; last.pending = false; }
          else if (ev.type === "usage") { last.cost = ev.cost; last.tokens = ev.inputTokens + ev.outputTokens; }
          else if (ev.type === "error") { last.content = "Error: " + ev.message; last.pending = false; }
          return copy;
        });
      });
    } finally {
      setBusy(false);
      setTurns(t => { const c = [...t]; if (c.length) c[c.length - 1].pending = false; return c; });
    }
  }

  if (!open) return <button className="chat-fab" onClick={() => setOpen(true)} title="Ask the EBS AMS expert">Ask the expert</button>;

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div><b>AMS Expert Assistant</b><span className="chat-sub">full estate scope</span></div>
        <button className="chat-x" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="chat-body">
        {turns.length === 0 && (
          <div className="chat-empty">
            <p>Ask anything about the incidents, patterns, root causes, objects or permanent fixes.</p>
            {SUGGESTIONS.map(s => <button key={s} className="chat-sugg" onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`chat-turn ${t.role}`}>
            {t.role === "assistant" && t.tools && t.tools.length > 0 && (
              <div className="chat-tools">consulted: {t.tools.join(", ")}</div>
            )}
            {t.role === "user" ? <div className="chat-bubble user">{t.content}</div>
              : t.pending && !t.content ? <div className="chat-bubble assistant pending">thinking…</div>
              : <div className="chat-bubble assistant"><Markdown text={t.content} onDetail={onDetail} known={known} /></div>}
            {t.role === "assistant" && t.cost != null && (
              <div className="chat-cost">${t.cost.toFixed(5)} · {t.tokens} tokens</div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-input" onSubmit={e => { e.preventDefault(); send(input); }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask the expert…" disabled={busy} />
        <button type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
