// Tiny, safe markdown renderer: ###/## headers, "- "/"* " and "1." lists,
// **bold**, `code`, --- rules, and clickable INC / RCA / PAT deeplinks.
import { ReactNode } from "react";

export type DetailKind = "resolution" | "pattern" | "rca";
interface Opts { onDetail?: (kind: DetailKind, id: string) => void; known?: Set<string>; }

function inline(text: string, opts: Opts): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|INC\d{5,}|RCA-[A-Z]{0,3}\d+|PAT-[A-Z0-9-]+)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    if (opts.onDetail) {
      if (/^INC\d{5,}$/.test(p)) {
        const known = !opts.known || opts.known.has(p);
        return <a key={i} className={`inc-link ${known ? "" : "ext"}`} title={known ? "Open resolution" : "Referenced ticket (not in scope)"}
          onClick={() => known && opts.onDetail!("resolution", p)}>{p}</a>;
      }
      if (/^RCA-[A-Z]{0,3}\d+$/.test(p)) return <a key={i} className="inc-link rca" title="Open root cause" onClick={() => opts.onDetail!("rca", p)}>{p}</a>;
      if (/^PAT-[A-Z0-9-]+$/.test(p)) return <a key={i} className="inc-link pat" title="Open pattern" onClick={() => opts.onDetail!("pattern", p)}>{p}</a>;
    }
    return <span key={i}>{p}</span>;
  });
}

function splitRow(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
}
const isTableRow = (l: string) => l.startsWith("|") && l.includes("|", 1);
const isSeparatorRow = (l: string) => /^\|?[\s:|-]+\|?$/.test(l) && l.includes("-");

export function Markdown({ text, onDetail, known }: { text: string } & Opts) {
  const opts: Opts = { onDetail, known };
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let ul: string[] = [], ol: string[] = [], para: string[] = [], tbl: string[][] = [];

  const flushUl = () => { if (ul.length) { out.push(<ul key={`ul-${out.length}`}>{ul.map((b, i) => <li key={i}>{inline(b, opts)}</li>)}</ul>); ul = []; } };
  const flushOl = () => { if (ol.length) { out.push(<ol key={`ol-${out.length}`}>{ol.map((b, i) => <li key={i}>{inline(b, opts)}</li>)}</ol>); ol = []; } };
  const flushPara = () => { if (para.length) { out.push(<p key={`p-${out.length}`}>{inline(para.join(" "), opts)}</p>); para = []; } };
  const flushTbl = () => {
    if (tbl.length) {
      const [head, ...body] = tbl;
      out.push(
        <table key={`t-${out.length}`} className="md-table">
          <thead><tr>{head.map((c, i) => <th key={i}>{inline(c, opts)}</th>)}</tr></thead>
          <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c, opts)}</td>)}</tr>)}</tbody>
        </table>
      );
      tbl = [];
    }
  };
  const flushAll = () => { flushUl(); flushOl(); flushPara(); flushTbl(); };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushAll(); continue; }
    if (isTableRow(line)) {
      flushUl(); flushOl(); flushPara();
      if (!isSeparatorRow(line)) tbl.push(splitRow(line));
      continue;
    }
    flushTbl();
    if (/^---+$/.test(line)) { flushAll(); out.push(<hr key={`hr-${out.length}`} />); continue; }
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) { flushAll(); out.push(<h4 key={`h-${out.length}`}>{inline(h[2], opts)}</h4>); continue; }
    if (/^[-*]\s+/.test(line)) { flushOl(); flushPara(); ul.push(line.replace(/^[-*]\s+/, "")); continue; }
    const num = line.match(/^\d+\.\s+(.*)$/);
    if (num) { flushUl(); flushPara(); ol.push(num[1]); continue; }
    flushUl(); flushOl(); para.push(line);
  }
  flushAll();
  return <div className="md">{out}</div>;
}
