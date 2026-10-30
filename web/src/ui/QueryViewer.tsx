// The TypeQL behind a view: collapsed to one quiet line ("TypeQL · 3 queries · 14 ms"); open, each query exactly
// as it ran, with its execution time in TypeDB and a copy button. Read-only: inspecting, never editing.

import { Fragment, useState } from "react";
import type { Answer } from "../semantic/api";

const KEYWORDS = /\b(match|fetch|reduce|groupby|let|in|or|not|isa!?|has|links|sub!?|owns|plays|label|count|sum|return|fun)\b/g;

/** Light highlighting: keywords and $variables. */
function highlight(query: string) {
  const parts = query.split(/(\$[a-z0-9_-]+|"[^"]*")/gi);
  return parts.map((part, i) => {
    if (part.startsWith("$")) return <span key={i} className="tq-var">{part}</span>;
    if (part.startsWith('"')) return <span key={i} className="tq-str">{part}</span>;
    const bits = part.split(KEYWORDS);
    return <Fragment key={i}>{bits.map((b, j) => (j % 2 ? <span key={j} className="tq-kw">{b}</span> : b))}</Fragment>;
  });
}

export function QueryViewer({ answers, label = "TypeQL" }: { answers: (Pick<Answer<unknown>, "typeql" | "timings-ms"> | null | undefined)[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const queries = answers.flatMap((a) => (a ? a.typeql.map((q, i) => ({ q, ms: a["timings-ms"]?.[i] })) : []));
  if (!queries.length) return null;
  const total = queries.reduce((t, x) => t + (x.ms ?? 0), 0);
  const copy = (i: number, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1200);
    });
  };
  return (
    <section className="typeql">
      <button type="button" className="typeql-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="typeql-mark">{open ? "▾" : "▸"}</span> {label} · {queries.length} {queries.length === 1 ? "query" : "queries"} · {formatMs(total)}
      </button>
      {open && queries.map((x, i) => (
        <div className="typeql-query" key={i}>
          <div className="typeql-meta">
            <span>{x.ms !== undefined ? formatMs(x.ms) : ""}</span>
            <button type="button" className="link" onClick={() => copy(i, x.q)}>{copied === i ? "copied" : "copy"}</button>
          </div>
          <pre>{highlight(x.q)}</pre>
        </div>
      ))}
    </section>
  );
}

export const formatMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
