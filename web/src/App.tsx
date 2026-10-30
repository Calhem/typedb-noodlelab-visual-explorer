import { useEffect, useState } from "react";
import { Stage } from "./scene/Stage";
import { semantic, TYPEDB_STATUS_EVENT } from "./semantic/api";
import { ComponentPanel } from "./ui/ComponentPanel";
import { Explore, type ExploreTab } from "./ui/Explore";
import { useFocus } from "./ui/focus";
import { Scrubber } from "./ui/Scrubber";

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Whether the semantic layer (API and TypeDB) answers: checked on load, every 20 seconds and with every answer. */
function useTypeDBStatus() {
  const [status, setStatus] = useState<"checking" | "available" | "unavailable">("checking");
  useEffect(() => {
    let live = true;
    const check = () => semantic.health().then((ok) => live && setStatus(ok ? "available" : "unavailable"));
    check();
    const timer = setInterval(check, 20_000);
    const onAnswer = (e: Event) => setStatus((e as CustomEvent<boolean>).detail ? "available" : "unavailable");
    window.addEventListener(TYPEDB_STATUS_EVENT, onAnswer);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener(TYPEDB_STATUS_EVENT, onAnswer);
    };
  }, []);
  return status;
}

export function App() {
  const [exploring, setExploring] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const typedb = useTypeDBStatus();
  const { focus, error: focusError, request, clear } = useFocus();
  const [exploreOpen, setExploreOpen] = useState(() => window.innerWidth > 1100);
  const [exploreTab, setExploreTab] = useState<ExploreTab>("systems");
  // A system or assembly chosen anywhere (also from the component panel) opens its view in the explorer.
  useEffect(() => {
    if (focus?.kind === "system" || focus?.kind === "assembly") {
      setExploreTab(focus.kind === "system" ? "systems" : "assemblies");
      setExploreOpen(true);
    }
  }, [focus]);
  // Development only: select a part from the console, for repeatable checks (see CLAUDE.md).
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __select: (id: string | null) => { setExploring(true); setSelectedId(id); } });
  }, []);

  return (
    <main className={exploring ? "app exploring" : "app"}>
      <div className="canvas">
        <Stage exploring={exploring} reducedMotion={reducedMotion} selectedId={selectedId}
          highlight={focus?.ids ?? null} onSelect={setSelectedId} />
      </div>

      <header className="brand">
        <span className="brand-mark" aria-hidden />
        <span>Noodlelab Visual Explorer</span>
        <span className="brand-sep">·</span>
        <span className={`typedb-status ${typedb}`} role="status">
          TypeDB {typedb === "available" ? "connected" : typedb === "unavailable" ? "unavailable" : "…"}
        </span>
      </header>

      <section className="intro" aria-hidden={exploring}>
        <h1>A vehicle is more than the sum of its parts.</h1>
        <p>Explore the structure of a complex system, powered by TypeDB.</p>
        <button type="button" onClick={() => setExploring(true)} tabIndex={exploring ? -1 : 0}>
          Explore the vehicle
        </button>
      </section>

      {exploring && (focus || focusError) && (
        <div className={focusError ? "focus-bar error" : "focus-bar"} role="status">
          <span>{focusError ? focusError.message : focus!.title}</span>
          {focus && (focus.kind === "impact" || focus.kind === "requirements") && (
            <span className="focus-key">
              <i className="primary" />{focus.kind === "impact" ? "lost" : "essential"}
              <i className="secondary" />{focus.kind === "impact" ? "degraded" : "backed up or supporting"}
            </span>
          )}
          <button type="button" className="link" onClick={clear}>{focusError ? "Dismiss" : "Clear"}</button>
        </div>
      )}

      {exploring && (
        <footer className="controls">
          <Scrubber reducedMotion={reducedMotion} />
          <p className="hint">Drag to orbit · scroll to zoom · right-drag to pan · click a part</p>
        </footer>
      )}

      {exploring && exploreOpen && (
        <Explore tab={exploreTab} onTab={setExploreTab} focus={focus} onFocus={request} onSelect={setSelectedId}
          onClose={() => setExploreOpen(false)} />
      )}
      {exploring && !exploreOpen && (
        <button type="button" className="explore-open" onClick={() => setExploreOpen(true)}>Explore TypeDB ›</button>
      )}

      {exploring && selectedId && (
        <ComponentPanel id={selectedId} focus={focus} onSelect={setSelectedId} onFocus={request}
          onClose={() => setSelectedId(null)} />
      )}

      <p className="disclaimer">Original concept vehicle for demonstration. Not a production model.</p>
    </main>
  );
}
