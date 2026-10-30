// The selected component, as TypeDB describes it: identity and type hierarchy, engineering properties, where it
// sits (assembly), what it does (systems), how it is joined and what it depends on. Every value comes from the
// semantic API; "TypeQL" shows the exact queries behind the panel.

import { useState } from "react";
import { semantic, type Answer, type Dependency } from "../semantic/api";
import { useAnswer, type AnswerState } from "../semantic/useAnswer";
import type { Focus, FocusRequest } from "./focus";
import { attributeLabel, attributeValue, connectionKind, words } from "./format";

interface Props {
  id: string;
  focus: Focus | null;
  onSelect: (id: string) => void;
  onFocus: (request: FocusRequest) => void;
  onClose: () => void;
}

export function ComponentPanel({ id, focus, onSelect, onFocus, onClose }: Props) {
  const details = useAnswer(id, (s) => semantic.component(id, s));
  const placement = useAnswer(id, (s) => semantic.assemblyOf(id, s));
  const systems = useAnswer(id, (s) => semantic.systemsOf(id, s));
  const relations = useAnswer(id, (s) => semantic.relationships(id, s));
  const [showTypeql, setShowTypeql] = useState(false);

  const states = [details.state, placement.state, systems.state, relations.state];
  const failed = states.find((s) => s && s.status !== "loading" && s.status !== "ok") as
    | { status: string; message: string } | undefined;
  const retry = () => [details, placement, systems, relations].forEach((a) => a.retry());

  const d = ok(details.state);
  const p = ok(placement.state);
  const sys = ok(systems.state);
  const r = ok(relations.state);
  const queries = [d, p, sys, r].flatMap((a) => a?.typeql ?? []);
  const focusQueries = focus && focus.anchor === id ? focus.typeql : [];

  return (
    <aside className="panel" aria-live="polite" aria-label="Component details from TypeDB">
      <button type="button" className="panel-close" onClick={onClose} aria-label="Clear selection">×</button>

      {failed?.status === "unavailable" ? (
        <Unavailable id={id} message={failed.message} onRetry={retry} />
      ) : failed ? (
        <div className="panel-state">
          <p className="panel-id">{id}</p>
          <p>{failed.message}</p>
          <button type="button" className="chip" onClick={retry}>Ask again</button>
        </div>
      ) : (
        <>
          <p className="panel-path">
            {p ? [...p.data.path].reverse().slice(1).map((a, i, all) => (
              <span key={a.id}>
                <button type="button" className="link" onClick={() => onFocus({ kind: "assembly", key: a.id, anchor: id })}>{a.name}</button>
                {i < all.length - 1 && <span className="sep">›</span>}
              </span>
            )) : <span className="loading">Asking TypeDB…</span>}
          </p>
          <h2>{d ? d.data.name : <span className="loading">Asking TypeDB…</span>}</h2>
          <p className="panel-id">{id}</p>
          {d && (
            <p className="panel-types" title="Type hierarchy in the TypeDB schema">
              {d.data.types.slice(0, -1).map((t, i) => (
                <span key={t}>{i > 0 && <span className="sep">⊂</span>}{words(t)}</span>
              ))}
            </p>
          )}
          {d?.data.description && <p className="panel-description">{d.data.description}</p>}

          {d && d.data.properties.length > 0 && (
            <section>
              <h3>Engineering properties <span className="note">concept design targets</span></h3>
              <dl className="props">
                {d.data.properties.map((prop) => (
                  <div key={prop.attribute}>
                    <dt>{attributeLabel(prop.attribute)}</dt>
                    <dd>{attributeValue(prop.attribute, prop.value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {sys && sys.data.length > 0 && (
            <section>
              <h3>Systems</h3>
              <div className="chips">
                {sys.data.map((s) => (
                  <button type="button" key={s.id} className={chipClass(focus, "system", s.id)} title={s.description ?? undefined}
                    onClick={() => onFocus({ kind: "system", key: s.id, anchor: id })}>
                    {s.parents.length > 0 && <span className="chip-parent">{s.parents[s.parents.length - 1].name} ›</span>} {s.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3>Follow the dependencies</h3>
            <div className="chips">
              <button type="button" className={chipClass(focus, "impact", id)} onClick={() => onFocus({ kind: "impact", key: id, anchor: id })}>
                If this fails, what is affected?
              </button>
              <button type="button" className={chipClass(focus, "requirements", id)} onClick={() => onFocus({ kind: "requirements", key: id, anchor: id })}>
                What does it need to work?
              </button>
            </div>
            {focus && focus.anchor === id && focus.reached && (
              <ol className="reached">
                {focus.reached.length === 0 && <li className="muted">Nothing, according to TypeDB.</li>}
                {focus.reached.slice(0, 40).map((x) => (
                  <li key={x.id}>
                    <button type="button" className="link" onClick={() => onSelect(x.id)}>{x.name}</button>
                    <span className="muted"> {x.kind}, {x.steps} {x.steps === 1 ? "step" : "steps"}</span>
                  </li>
                ))}
                {focus.reached.length > 40 && <li className="muted">and {focus.reached.length - 40} more (highlighted)</li>}
              </ol>
            )}
          </section>

          {r && (
            <>
              <DependencyList title="Needs" items={r.data.needs} onSelect={onSelect} />
              <DependencyList title="Needed by" items={r.data["needed-by"]} onSelect={onSelect} />
              {r.data.connections.length > 0 && (
                <section>
                  <h3>Connections</h3>
                  <ul className="relations">
                    {r.data.connections.map((c, i) => (
                      <li key={i}>
                        <span className="tag">{connectionKind(c.kind)}</span>
                        <button type="button" className="link" onClick={() => onSelect(c.other)}>{c["other-name"]}</button>
                        <span className="muted"> {Object.entries(c.details).filter(([k]) => k !== "description").map(([, v]) => v).join(", ")}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {r.data["control-loops"].length > 0 && (
                <section>
                  <h3>Control loops</h3>
                  <ul className="relations">
                    {r.data["control-loops"].map((loop) => (
                      <li key={loop.name} title={loop.description ?? undefined}>
                        <span className="tag">{loop.role}</span>
                        <button type="button" className="link" onClick={() => onFocus({ kind: "system", key: loop.system, anchor: id })}>{loop.name}</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <section className="typeql">
            <button type="button" className="link" onClick={() => setShowTypeql((v) => !v)} aria-expanded={showTypeql}>
              {showTypeql ? "Hide" : "Show"} the TypeQL behind this panel ({queries.length + focusQueries.length} queries)
            </button>
            {showTypeql && [...queries, ...focusQueries].map((q, i) => <pre key={i}>{q}</pre>)}
          </section>
        </>
      )}
    </aside>
  );
}

function ok<T>(state: AnswerState<T> | null): Answer<T> | null {
  return state?.status === "ok" ? state.answer : null;
}

function chipClass(focus: Focus | null, kind: string, key: string) {
  return focus && focus.kind === kind && focus.key === key ? "chip active" : "chip";
}

function DependencyList({ title, items, onSelect }: { title: string; items: Dependency[]; onSelect: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3>{title}</h3>
      <ul className="relations">
        {items.map((d) => (
          <li key={`${d.id}-${d.kind}`} title={d.description ?? undefined}>
            <span className="tag">{d.kind}</span>
            <button type="button" className="link" onClick={() => onSelect(d.id)}>{d.name}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Unavailable({ id, message, onRetry }: { id: string; message: string; onRetry: () => void }) {
  return (
    <div className="panel-state unavailable" role="alert">
      <p className="panel-id">{id}</p>
      <h2>TypeDB unavailable</h2>
      <p>{message}</p>
      <button type="button" className="chip" onClick={onRetry}>Try again</button>
    </div>
  );
}
