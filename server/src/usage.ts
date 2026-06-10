// Usage and cost observability. Records every Claude API call (feature, model,
// tokens, cost, latency) in memory and appends to data/usage_log.csv.
import { appendCsvRow } from "./csv.js";
import { DATA_DIR } from "./data.js";
import { join } from "node:path";

// Approximate public list prices, USD per 1M tokens. Adjust as needed.
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
function priceFor(model: string) {
  const key = Object.keys(PRICES).find(k => model.startsWith(k));
  return key ? PRICES[key] : { in: 3, out: 15 };
}

export interface UsageRecord {
  id: string; ts: string; feature: string; model: string;
  inputTokens: number; outputTokens: number; cost: number;
  latencyMs: number; detail: string;
}

const records: UsageRecord[] = [];
const USAGE_PATH = join(DATA_DIR, "usage_log.csv");
const USAGE_HEADER = ["ID", "TIMESTAMP", "FEATURE", "MODEL", "INPUT_TOKENS", "OUTPUT_TOKENS", "COST_USD", "LATENCY_MS", "DETAIL"];

export function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return +(inputTokens / 1e6 * p.in + outputTokens / 1e6 * p.out).toFixed(6);
}

export function record(r: { feature: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number; detail?: string }): UsageRecord {
  const cost = computeCost(r.model, r.inputTokens, r.outputTokens);
  const rec: UsageRecord = {
    id: `U-${records.length + 1}`, ts: new Date().toISOString(),
    feature: r.feature, model: r.model, inputTokens: r.inputTokens,
    outputTokens: r.outputTokens, cost, latencyMs: r.latencyMs, detail: r.detail ?? "",
  };
  records.push(rec);
  try {
    appendCsvRow(USAGE_PATH, USAGE_HEADER, {
      ID: rec.id, TIMESTAMP: rec.ts, FEATURE: rec.feature, MODEL: rec.model,
      INPUT_TOKENS: String(rec.inputTokens), OUTPUT_TOKENS: String(rec.outputTokens),
      COST_USD: String(rec.cost), LATENCY_MS: String(rec.latencyMs), DETAIL: rec.detail,
    });
  } catch { /* non-fatal */ }
  return rec;
}

export function summary() {
  const totalCost = records.reduce((s, r) => s + r.cost, 0);
  const totalIn = records.reduce((s, r) => s + r.inputTokens, 0);
  const totalOut = records.reduce((s, r) => s + r.outputTokens, 0);
  const byFeature: Record<string, { count: number; cost: number; tokens: number }> = {};
  for (const r of records) {
    const b = byFeature[r.feature] ?? (byFeature[r.feature] = { count: 0, cost: 0, tokens: 0 });
    b.count++; b.cost += r.cost; b.tokens += r.inputTokens + r.outputTokens;
  }
  return {
    queries: records.length,
    totalCost: +totalCost.toFixed(4),
    inputTokens: totalIn, outputTokens: totalOut,
    avgCost: records.length ? +(totalCost / records.length).toFixed(4) : 0,
    avgLatencyMs: records.length ? Math.round(records.reduce((s, r) => s + r.latencyMs, 0) / records.length) : 0,
    byFeature,
    recent: records.slice(-25).reverse(),
  };
}
