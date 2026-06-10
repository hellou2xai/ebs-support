// Minimal CSV reader/appender. Handles quoted fields, embedded commas, quotes,
// and newlines. No external dependency so the demo installs cleanly.
import { readFileSync, appendFileSync, existsSync } from "node:fs";

export type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { record.push(field); field = ""; }
      else if (c === "\n") { record.push(field); records.push(record); record = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }
  if (records.length === 0) return [];
  const header = records[0];
  return records.slice(1)
    .filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map(r => {
      const obj: Row = {};
      header.forEach((h, idx) => { obj[h] = r[idx] ?? ""; });
      return obj;
    });
}

export function readCsv(path: string): Row[] {
  if (!existsSync(path)) return [];
  return parseCsv(readFileSync(path, "utf-8"));
}

function esc(v: string): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Append one row to a CSV that already has the given header order.
export function appendCsvRow(path: string, header: string[], row: Row): void {
  const line = header.map(h => esc(row[h] ?? "")).join(",") + "\n";
  appendFileSync(path, line, "utf-8");
}
