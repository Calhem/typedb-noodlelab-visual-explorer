// The contextual TypeQL overlay: whatever is chosen (a system, assembly, type, question, failure or a single part),
// the TypeQL behind it floats in the dark space above and left of the vehicle. Everything shown is what the API
// reports about the answer: the exact queries that ran with their timings and purposes, which query returned the
// highlighted parts, the schema definitions TypeDB holds, and the steps the API did itself in Python. Three kinds
// of block keep those apart: SCHEMA (definitions in the database), QUERY (TypeQL that ran) and APP (not TypeDB).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { semantic, type QueryRecord, type SchemaDefinition } from "../semantic/api";
import { useAnswer } from "../semantic/useAnswer";
import type { Focus } from "./focus";
import { words } from "./format";
import { formatMs } from "./QueryViewer";
import { concepts, highlight, type Concepts } from "./typeql";

/** What the overlay describes: the current focus, or a single selected part. */
export type OverlayContext = { kind: "focus"; focus: Focus } | { kind: "component"; id: string };

interface Query { text: string; ms?: number; purpose?: string | null; result: boolean; source: string }

const queriesOf = (record: QueryRecord, source: string): Query[] =>
  record.typeql.map((text, i) => ({ text, ms: record["timings-ms"]?.[i], purpose: record.purposes?.[i], source,
    result: record["result-queries"]?.includes(i) ?? false }));

const KIND_LABEL: Record<Focus["kind"], string> = {
  system: "System", assembly: "Assembly", type: "Type", question: "Question", impact: "Failure impact", requirements: "Requirements",
};

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : word.endsWith("y") ? `${word.slice(0, -1)}ies` : `${word}s`}`;

export function TypeQLOverlay({ context, collapsed, onCollapse, onEdge }: {
  /** null: nothing chosen yet (the overlay says what will appear) */
  context: OverlayContext | null;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  /** reports where the overlay ends (CSS pixels), so the camera can frame the vehicle beside or below it */
  onEdge: (edge: { right: number; bottom: number } | null) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      onEdge(r.height > 0 ? { right: r.right, bottom: r.bottom } : null);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    window.addEventListener("resize", report);
    return () => { observer.disconnect(); window.removeEventListener("resize", report); onEdge(null); };
  }, [onEdge]);
  const view = !context
    ? <p className="tq-note tq-idle">Choose a system, assembly or type, or click a part: the TypeQL TypeDB runs for it, and the
        schema behind it, appear here.</p>
    : context.kind === "focus" ? <FocusView focus={context.focus} /> : <ComponentView id={context.id} />;
  const key = !context ? "idle" : context.kind === "focus" ? `${context.focus.kind}:${context.focus.key}` : `component:${context.id}`;
  return (
    <section ref={ref} className={collapsed ? "tq-overlay collapsed" : "tq-overlay"} aria-label="The TypeQL behind the current view">
      <button type="button" className="tq-collapse" onClick={() => onCollapse(!collapsed)} aria-expanded={!collapsed}
        title={collapsed ? "Show the TypeQL" : "Hide the TypeQL"}>
        <span className="tq-collapse-mark">{collapsed ? "▸" : "▾"}</span> TypeQL
      </button>
      {/* keyed by the context, so a new selection fades in */}
      <div className="tq-body" key={key}>{view}</div>
    </section>
  );
}

// ---- A focus: system, assembly, type, question, failure impact or requirements ---------------------------

function FocusView({ focus }: { focus: Focus }) {
  const queries = useMemo(() => queriesOf(focus, ""), [focus]);
  const results = queries.filter((q) => q.result);
  const total = queries.reduce((t, q) => t + (q.ms ?? 0), 0);
  const name = focus.system?.name ?? focus.assembly?.name ?? (focus.typeDetail ? words(focus.typeDetail.type) : null)
    ?? focus.question?.title ?? focus.impact?.failed.name ?? focus.key;
  // What the queries behind the highlight use; their functions have definitions in the schema, and a type focus
  // shows the type's own.
  const used = useMemo(() => merge((results.length ? results : queries).map((q) => concepts(q.text))), [results, queries]);
  const schemaNames = focus.kind === "type" ? [focus.key] : used?.functions ?? [];
  return (
    <>
      <Head kind={KIND_LABEL[focus.kind]} name={name}
        summary={<>
          <b>{plural(focus.ids.size, "component")}</b> highlighted · {plural(queries.length, "query")} ·{" "}
          <b>{formatMs(total)}</b> in TypeDB
        </>} />
      {used && <Explores used={used} />}
      {schemaNames.length > 0 && <Schema names={schemaNames} openFirst={focus.kind === "type"} />}
      <Queries queries={queries} resultLabel="returns the highlighted parts" />
      <App processing={focus.processing ?? []} highlighted={focus.ids.size} />
    </>
  );
}

// ---- A single selected part ----------------------------------------------------------------------------------

function ComponentView({ id }: { id: string }) {
  const details = useAnswer(id, (s) => semantic.component(id, s));
  const relations = useAnswer(id, (s) => semantic.relationships(id, s));
  const d = details.state?.status === "ok" ? details.state.answer : null;
  const r = relations.state?.status === "ok" ? relations.state.answer : null;
  const failed = [details.state, relations.state].find((s) => s && s.status !== "loading" && s.status !== "ok");
  const queries = useMemo(() => [...(d ? queriesOf(d, "component") : []), ...(r ? queriesOf(r, "relationships") : [])], [d, r]);
  if (failed && "message" in failed) return <p className="tq-note">{failed.message}</p>;
  if (!d) return <p className="tq-note loading">Asking TypeDB…</p>;
  const total = queries.reduce((t, q) => t + (q.ms ?? 0), 0);
  const c = d.data;
  const deps = r ? r.data.needs.length + r.data["needed-by"].length : 0;
  const attributes = c.properties.length + 1 + (c.name ? 1 : 0) + (c.description ? 1 : 0);
  return (
    <>
      <Head kind="Component" name={c.name}
        summary={<>
          <span className="tq-mono">{c.id}</span> · {plural(attributes, "attribute")}
          {r && <> · {plural(r.data.connections.length, "connection")} · {plural(deps, "dependency")}</>} ·{" "}
          <b>{formatMs(total)}</b> in TypeDB
        </>} />
      <p className="tq-explores">
        <span className="tq-label">isa</span>
        <span>{c.types.slice(0, -1).map((t, i) => <span key={t}>{i > 0 && <span className="tq-sub">sub </span>}<code>{t}</code></span>)}</span>
      </p>
      {r && <Explores used={{ ...merge(queriesOf(r, "").map((q) => concepts(q.text))), types: [] }} />}
      <Schema names={[c.type]} openFirst={true} />
      <Queries queries={queries} resultLabel={null} />
      <App processing={[...(d.processing ?? []), ...(r?.processing ?? [])]} />
    </>
  );
}

// ---- Shared pieces ---------------------------------------------------------------------------------------------

const merge = (all: Concepts[]): Concepts => {
  const roles = new Map<string, Set<string>>();
  for (const c of all) for (const r of c.relations) for (const role of r.roles) roles.set(r.name, (roles.get(r.name) ?? new Set()).add(role));
  for (const c of all) for (const r of c.relations) if (!roles.has(r.name)) roles.set(r.name, new Set());
  const unique = (pick: (c: Concepts) => string[]) => [...new Set(all.flatMap(pick))];
  return { types: unique((c) => c.types), functions: unique((c) => c.functions), attributes: unique((c) => c.attributes),
    relations: [...roles].map(([name, set]) => ({ name, roles: [...set] })) };
};

function Head({ kind, name, summary }: { kind: string; name: string; summary: React.ReactNode }) {
  return (
    <header className="tq-head">
      <p className="tq-kind">{kind}</p>
      <h2>{name}</h2>
      <p className="tq-summary">{summary}</p>
    </header>
  );
}

/** The types, relation types (with roles) and functions the highlighted query uses, read from its text. */
function Explores({ used }: { used: Concepts }) {
  if (!used.types.length && !used.relations.length && !used.functions.length) return null;
  return (
    <div className="tq-explores">
      {used.types.length > 0 && <p><span className="tq-label">types</span><span>{used.types.map((t) => <code key={t}>{t}</code>)}</span></p>}
      {used.relations.length > 0 && (
        <p><span className="tq-label">relations</span><span>{used.relations.map((r) => (
          <span key={r.name} className="tq-relation"><code>{r.name}</code>
            {r.roles.length > 0 && <span className="tq-roles">({r.roles.join(", ")})</span>}</span>
        ))}</span></p>
      )}
      {used.functions.length > 0 && <p><span className="tq-label">functions</span><span>{used.functions.map((f) => <code key={f}>{f}</code>)}</span></p>}
    </div>
  );
}

/** Schema definitions, as TypeDB returns them. A type's supertypes come behind a toggle. */
function Schema({ names, openFirst }: { names: string[]; openFirst: boolean }) {
  return <>{names.map((n, i) => <SchemaBlock key={n} name={n} open={openFirst && i === 0} />)}</>;
}

function SchemaBlock({ name, open: initiallyOpen }: { name: string; open: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [inherited, setInherited] = useState(false);
  const answer = useAnswer(open ? `schema:${name}` : null, (s) => semantic.schema(name, s));
  const defs: SchemaDefinition[] = answer.state?.status === "ok" ? answer.state.answer.data : [];
  const ms = answer.state?.status === "ok" ? (answer.state.answer as { "schema-ms"?: number })["schema-ms"] : undefined;
  return (
    <div className="tq-block schema">
      <button type="button" className="tq-block-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="tq-tag">Schema</span>
        <span className="tq-block-title">{defs[0]?.kind ?? (name.includes("_") ? "function" : "type")} <code>{name}</code></span>
        <span className="tq-ms">{open ? (ms !== undefined ? `read in ${formatMs(ms)}` : "") : "show"}</span>
      </button>
      {open && answer.state?.status === "loading" && <p className="tq-note loading">Reading the schema…</p>}
      {open && answer.state && answer.state.status !== "ok" && answer.state.status !== "loading" && <p className="tq-note">{answer.state.message}</p>}
      {open && defs.length > 0 && (
        <>
          <pre>{highlight(defs[0].definition)}</pre>
          {defs.length > 1 && (
            <>
              <button type="button" className="tq-more" onClick={() => setInherited((v) => !v)}>
                {inherited ? "Hide" : "Show"} what it inherits ({defs.slice(1).map((d) => d.name).join(" › ")})
              </button>
              {inherited && defs.slice(1).map((d) => <pre key={d.name} className="inherited">{highlight(d.definition)}</pre>)}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The queries behind the answer: one shown at a time, the highlighted one first. */
function Queries({ queries, resultLabel }: { queries: Query[]; resultLabel: string | null }) {
  const initial = Math.max(0, queries.findIndex((q) => q.result));
  const [shown, setShown] = useState(initial);
  const [copied, setCopied] = useState(false);
  useEffect(() => setShown(initial), [queries, initial]);
  const q = queries[shown];
  if (!q) return null;
  const copy = () => navigator.clipboard?.writeText(q.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); });
  return (
    <div className="tq-block query">
      <div className="tq-block-head static">
        <span className="tq-tag">Query</span>
        {queries.length > 1 && (
          <span className="tq-steps" role="tablist" aria-label="Queries in this answer">
            {queries.map((x, i) => (
              <button type="button" key={i} role="tab" aria-selected={i === shown} className={`${i === shown ? "active" : ""}${x.result && resultLabel ? " result" : ""}`}
                title={`${x.purpose ?? ""}${x.ms !== undefined ? ` (${formatMs(x.ms)})` : ""}`} onClick={() => setShown(i)}>{i + 1}</button>
            ))}
          </span>
        )}
        <span className="tq-ms">{q.ms !== undefined ? formatMs(q.ms) : ""}</span>
      </div>
      {q.purpose && <p className="tq-purpose">{q.result && resultLabel && <span className="tq-result">{resultLabel} · </span>}{q.purpose}</p>}
      <pre>{highlight(q.text)}</pre>
      <button type="button" className="tq-more" onClick={copy}>{copied ? "Copied" : "Copy query"}</button>
    </div>
  );
}

/** What happened outside TypeDB: the API's own steps, and the 3D view's. */
function App({ processing, highlighted }: { processing: string[]; highlighted?: number }) {
  if (!processing.length && highlighted === undefined) return null;
  return (
    <div className="tq-block app">
      <div className="tq-block-head static"><span className="tq-tag">App</span><span className="tq-block-title">not TypeDB</span></div>
      <ul>
        {processing.map((p) => <li key={p}>{p}</li>)}
        {highlighted !== undefined && <li>The 3D view highlights the {plural(highlighted, "returned component")} and ghosts the rest.</li>}
      </ul>
    </div>
  );
}
