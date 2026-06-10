// AI chat assistant with full semantic scope over the demo data. The model is
// briefed with a compact digest of the whole estate (value streams, patterns, root
// causes) and can call the same tools the agent uses to drill into any incident.
import { db } from "./data.js";
import { toolDefs, handlers } from "./tools.js";
import { record } from "./usage.js";

export type ChatEvent =
  | { type: "tool"; name: string; input: any }
  | { type: "answer"; text: string }
  | { type: "usage"; cost: number; inputTokens: number; outputTokens: number; model: string; latencyMs: number }
  | { type: "error"; message: string };

export interface ChatMessage { role: "user" | "assistant"; content: string; }

// A compact, full-scope digest so the assistant reasons over the entire dataset.
function buildDigest(): string {
  const byStream: Record<string, number> = {};
  for (const i of db.incidents) byStream[i.VALUE_STREAM] = (byStream[i.VALUE_STREAM] || 0) + 1;
  const patterns = db.patterns
    .map(p => `  ${p.PATTERN_ID} [${p.VALUE_STREAM}] "${p.FAILURE_SIGNATURE}" count=${p.OCCURRENCE_COUNT} auto=${p.AUTO_RESOLVABLE} -> ${p.ROOT_CAUSE_ID}`)
    .join("\n");
  const rcas = db.rca
    .map(r => `  ${r.RCA_ID} [${r.VALUE_STREAM}] symptom="${r.SYMPTOM}" rootCause="${r.ROOT_CAUSE}" source=${r.SOURCE_SYSTEM} permanentFix="${r.PERMANENT_FIX}" type=${r.FIX_CATEGORY} effort=${r.EFFORT} incidents=${r.RELATED_INCIDENTS}`)
    .join("\n");
  const fixes = db.dataFixes.map(f => `  ${f.FIX_ID} "${f.FIX_NAME}" tables=${f.AFFECTED_TABLES}`).join("\n");
  const actions = db.actions.map(a => `  ${a.ACTION_ID} "${a.ACTION_NAME}" via ${a.EBS_PROGRAM_OR_API} risk=${a.RISK_LEVEL} approval=${a.REQUIRES_APPROVAL}`).join("\n");
  return [
    `ESTATE DIGEST (Vertiv "Alice" Oracle EBS AMS).`,
    `Incidents in scope: ${db.incidents.length} (recurring: ${db.incidents.filter(i => i.RECURRING_FLAG === "Y").length}). ${db.incidents.filter(i => i.DATA_ORIGIN === "REAL").length} are real ServiceNow tickets, the rest synthetic.`,
    `Value streams: ${Object.entries(byStream).map(([k, v]) => `${k}=${v}`).join(", ")}.`,
    `Systems: AGILE_PD, ITEM_MDM, EBS, CPQ, BLUJAY, CLOUD2EBS_DROPSHIP.`,
    ``,
    `REPETITIVE-ISSUE PATTERNS:\n${patterns}`,
    ``,
    `ROOT CAUSES AND PERMANENT FIXES (resolve at source):\n${rcas}`,
    ``,
    `DATA-FIX CATALOGUE:\n${fixes}`,
    ``,
    `ACTION CATALOGUE:\n${actions}`,
  ].join("\n");
}

const SYSTEM = (digest: string) =>
  "You are a senior Oracle E-Business Suite AMS expert embedded in the Vertiv 'Alice' support programme. " +
  "You know Order Management, Bills of Material, Inventory, Receiving, Purchasing, Receivables, Projects, " +
  "Service Contracts, and the integrations to Agile PLM (PD), CPQ, BluJay and Cloud2EBS/DropShip. " +
  "Answer like an expert engineer: precise, grounded, practical. Name the real EBS objects (tables, interfaces, " +
  "concurrent programs, APIs). Distinguish the immediate fix from the permanent fix at source, and use the recurrence " +
  "data to argue for permanent fixes. When a question is about a specific incident, pattern or root cause, CALL THE TOOLS " +
  "to fetch exact detail rather than guessing; call get_evidence to read the underlying EBS rows. " +
  "ALWAYS surface the concrete object-level identifiers found in the evidence, and include a short '### Identified objects' " +
  "section listing every one present: item number, inventory organization / operating unit, order number and line, " +
  "PO number, change order (CO/CCO/NRCO/ECO), delivery note, contract, project, sales order, GL period. Do not omit an " +
  "identifier that is in the data. Keep answers tight and scannable: short paragraphs and '- ' bullets, '###' headers. " +
  "Refer to incidents as INC numbers, patterns as PAT- ids and root causes as RCA- ids verbatim so they render as links. " +
  "British English. No em-dashes. No marketing tone. If something is not in the data, say so.\n\n" +
  digest;

const anthropicTools = () =>
  toolDefs.map(t => ({ name: t.name, description: t.description, input_schema: t.input as any }));

export async function* streamChat(history: ChatMessage[]): AsyncGenerator<ChatEvent> {
  const live = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0;
  if (!live) { yield { type: "answer", text: offlineAnswer(history[history.length - 1]?.content || "") }; return; }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
    const messages: any[] = history.map(m => ({ role: m.role, content: m.content }));
    const question = history[history.length - 1]?.content ?? "";
    const t0 = Date.now();
    let inTok = 0, outTok = 0;

    for (let turn = 0; turn < 6; turn++) {
      const resp = await client.messages.create({
        model, max_tokens: 1100, system: SYSTEM(buildDigest()),
        tools: anthropicTools(), messages,
      });
      inTok += resp.usage?.input_tokens ?? 0;
      outTok += resp.usage?.output_tokens ?? 0;
      const toolUses = resp.content.filter((c: any) => c.type === "tool_use");
      const text = resp.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();

      if (resp.stop_reason === "tool_use" && toolUses.length) {
        messages.push({ role: "assistant", content: resp.content });
        const results: any[] = [];
        for (const tu of toolUses as any[]) {
          yield { type: "tool", name: tu.name, input: tu.input };
          let out: any;
          try { out = handlers[tu.name](tu.input ?? {}); }
          catch (e: any) { out = { error: e?.message ?? String(e) }; }
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      yield { type: "answer", text: text || "(no answer)" };
      const rec = record({ feature: "chat", model, inputTokens: inTok, outputTokens: outTok, latencyMs: Date.now() - t0, detail: question.slice(0, 120) });
      yield { type: "usage", cost: rec.cost, inputTokens: inTok, outputTokens: outTok, model, latencyMs: rec.latencyMs };
      return;
    }
    yield { type: "answer", text: "Stopped after several tool steps. Please refine the question." };
  } catch (e: any) {
    yield { type: "error", message: e?.message ?? String(e) };
  }
}

// Offline fallback: grounded, keyword-driven answer from the data (no API key).
function offlineAnswer(q: string): string {
  const ql = q.toLowerCase();
  const incMatch = q.match(/INC\d+/i);
  if (incMatch) {
    const id = incMatch[0].toUpperCase();
    try {
      const inc = handlers.get_incident({ incident_number: id });
      const rca = handlers.get_root_cause({ incident_number: id });
      const rec = handlers.get_recurrence({ incident_number: id });
      return [
        `### ${id} (${inc.BUSINESS_IMPACT_THEME})`,
        `- Value stream: ${inc.VALUE_STREAM}; pattern ${inc.PATTERN_ID}.`,
        `- Root cause (${rca.root_cause_id}): ${rca.root_cause || "n/a"}`,
        `- Immediate fix: ${rca.immediate_resolution || "n/a"}`,
        `- Permanent fix: ${rca.permanent_fix || "n/a"} [${rca.fix_category}, ${rca.effort}]`,
        `- Recurrence: ${rec.incidents_with_same_root_cause} share this root cause${rec.linked_incidents.length ? `; linked ${rec.linked_incidents.join(", ")}` : ""}.`,
        ``,
        `(Offline mode. Set ANTHROPIC_API_KEY for the full expert assistant.)`,
      ].join("\n");
    } catch { /* fall through */ }
  }
  // pattern / root-cause / value-stream summaries
  const rca = db.rca.find(r => ql.includes(r.RCA_ID.toLowerCase()) || (r.ROOT_CAUSE || "").toLowerCase().split(" ").some(w => w.length > 5 && ql.includes(w)));
  if (rca) {
    return `### ${rca.RCA_ID}\n- Symptom: ${rca.SYMPTOM}\n- Root cause: ${rca.ROOT_CAUSE}\n- Source: ${rca.SOURCE_SYSTEM} (${rca.SOURCE_OBJECT})\n- Permanent fix: ${rca.PERMANENT_FIX} [${rca.FIX_CATEGORY}, ${rca.EFFORT}]\n\n(Offline mode. Set ANTHROPIC_API_KEY for the full assistant.)`;
  }
  const top = [...db.patterns].sort((a, b) => Number(b.OCCURRENCE_COUNT) - Number(a.OCCURRENCE_COUNT)).slice(0, 5);
  return [
    `I can answer over the ${db.incidents.length} incidents, ${db.patterns.length} patterns and ${db.rca.length} root causes in scope.`,
    `Top repetitive patterns:`,
    ...top.map(p => `- ${p.PATTERN_ID} "${p.FAILURE_SIGNATURE}" (${p.OCCURRENCE_COUNT}x) -> ${p.ROOT_CAUSE_ID}`),
    ``,
    `Ask about an incident (e.g. INC0903826), a root cause (e.g. RCA-01), or a value stream (Item-MDM, QTD, PTM, PTC, Services).`,
    `(Offline mode. Set ANTHROPIC_API_KEY for the full expert assistant.)`,
  ].join("\n");
}
