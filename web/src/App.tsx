import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { intro, useIntroStage } from "./scene/intro";
import { Stage } from "./scene/Stage";
import { semantic, TYPEDB_STATUS_EVENT } from "./semantic/api";
import { useAnswer } from "./semantic/useAnswer";
import { ComponentPanel } from "./ui/ComponentPanel";
import { Explore, type ExploreTab } from "./ui/Explore";
import { ModelDownload } from "./ui/ModelDownload";
import { useFocus } from "./ui/focus";
import { Scrubber } from "./ui/Scrubber";
import { TypeQLOverlay, type OverlayContext } from "./ui/TypeQLOverlay";

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

// Returning users can skip the introduction from the address: ?intro=off opens straight in the studio.
if (new URLSearchParams(window.location.search).get("intro") === "off") intro.skip();

const noop = () => {};

export function App() {
  // The introduction (road, then Begin's transition) and the studio, where the explorer lives.
  const stage = useIntroStage();
  const exploring = stage === "studio";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  // With reduced motion the car is already parked, and Begin cuts to the studio (a short fade, no camera flight).
  const [cut, setCut] = useState(false);
  useEffect(() => { if (reducedMotion) intro.park(); }, [reducedMotion]);
  const begin = useCallback(() => {
    if (!reducedMotion) return intro.begin();
    setCut(true);
    setTimeout(() => intro.skip(), 250);
    setTimeout(() => setCut(false), 700);
  }, [reducedMotion]);
  // Esc skips the introduction.
  useEffect(() => {
    if (stage === "studio") return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") intro.skip(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [stage]);
  const typedb = useTypeDBStatus();
  const { focus, error: focusError, pending, request, cancel, clear } = useFocus();
  const [exploreOpen, setExploreOpen] = useState(() => window.innerWidth > 1100);
  const [exploreTab, setExploreTab] = useState<ExploreTab>("systems");
  // The TypeQL overlay describes whatever was chosen last: the focus (system, assembly, type...) or a single part.
  const [lastChoice, setLastChoice] = useState<"focus" | "component">("focus");
  const [typeqlCollapsed, setTypeqlCollapsed] = useState(() => window.innerWidth < 900);
  // Where the overlay ends, so the camera frames the vehicle beside or below it.
  const [overlayEdge, setOverlayEdge] = useState<{ right: number; bottom: number } | null>(null);
  const onOverlayEdge = useCallback((edge: { right: number; bottom: number } | null) => setOverlayEdge((e) =>
    e && edge && Math.abs(e.right - edge.right) < 1 && Math.abs(e.bottom - edge.bottom) < 1 ? e : edge), []);
  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setLastChoice("component");
  }, []);
  useEffect(() => { if (focus) setLastChoice("focus"); }, [focus]);
  // The part under the pointer, named from TypeDB's component list (asked once, when exploring starts).
  const [hovered, setHovered] = useState<string | null>(null);
  const listing = useAnswer(exploring ? "components" : null, (s) => semantic.components(s));
  const names = listing.state?.status === "ok" ? listing.state.answer.data : null;
  const hoverName = hovered && names ? names.find((c) => c.id === hovered)?.name ?? null : null;
  const tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => { if (tip.current) tip.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 16}px)`; };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  // Stable props for the 3D stage, so the scene doesn't re-render when unrelated parts of the page change.
  const hasOverlay = exploring && !typeqlCollapsed && (selectedId !== null || focus !== null);
  const insets = useMemo(() => ({ left: exploring && exploreOpen ? 354 : 0, right: exploring && selectedId ? 384 : 0,
    overlay: hasOverlay ? overlayEdge : null }), [exploring, exploreOpen, selectedId, hasOverlay, overlayEdge]);
  const overlay: OverlayContext | null = lastChoice === "component" && selectedId ? { kind: "component", id: selectedId }
    : focus ? { kind: "focus", focus } : selectedId ? { kind: "component", id: selectedId } : null;
  // A system or assembly chosen anywhere (also from the component panel) opens its view in the explorer.
  useEffect(() => {
    const tabs: Partial<Record<string, ExploreTab>> = { system: "systems", assembly: "assemblies", type: "types", question: "questions" };
    const tab = focus ? tabs[focus.kind] : undefined;
    if (tab) {
      setExploreTab(tab);
      setExploreOpen(true);
    }
  }, [focus]);
  // Development only: select a part from the console, for repeatable checks (see CLAUDE.md).
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __select: (id: string | null) => { intro.skip(); setSelectedId(id); if (id) setLastChoice("component"); } });
  }, []);

  return (
    <main className={`app stage-${stage}${exploring ? " exploring" : ""}${exploring && exploreOpen ? " explore-is-open" : ""}${exploring && selectedId ? " panel-is-open" : ""}`}>
      <div className="canvas">
        <Stage exploring={exploring} onArrive={noop} selectedId={selectedId}
          highlight={focus?.ids ?? null} onSelect={select} onHover={setHovered}
          insets={insets} />
      </div>

      <header className="brand">
        <span className="brand-mark" aria-hidden />
        <span>Noodlelab Visual Explorer</span>
        <span className="brand-sep">·</span>
        <span className={`typedb-status ${typedb}`} role="status">
          TypeDB {typedb === "available" ? "connected" : typedb === "unavailable" ? "unavailable" : "…"}
        </span>
      </header>

      <section className="intro" aria-hidden={stage !== "road"}>
        <h1>A vehicle is more than the sum of its parts.</h1>
        <p>Explore the structure of a complex system, powered by TypeDB.</p>
        <div className="intro-actions">
          <button type="button" className="begin" onClick={begin} tabIndex={stage === "road" ? 0 : -1}>Begin</button>
          <button type="button" className="skip" onClick={() => intro.skip()} tabIndex={stage === "road" ? 0 : -1}
            title="Go straight to the explorer (or open the address with ?intro=off)">Skip intro</button>
        </div>
      </section>
      {cut && <div className="cut" aria-hidden />}

      {exploring && (focus || focusError) && (
        <div className={focusError ? "focus-bar error" : "focus-bar"} role="status">
          <span>{focusError ? focusError.message : focus!.title}</span>
          {focus && (focus.kind === "impact" || focus.kind === "requirements") && (
            <span className="focus-key">
              <i className="primary" />{focus.kind === "impact" ? "loses a function" : "essential"}
              <i className={focus.kind === "impact" ? "degraded" : "secondary"} />{focus.kind === "impact" ? "only degraded" : "backed up or supporting"}
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
        <Explore pending={pending} onCancel={cancel} tab={exploreTab} onTab={setExploreTab} focus={focus} onFocus={request} onSelect={select}
          onClose={() => setExploreOpen(false)} />
      )}
      {exploring && !exploreOpen && (
        <button type="button" className="explore-open" onClick={() => setExploreOpen(true)}>Explore TypeDB ›</button>
      )}

      {exploring && selectedId && (
        <ComponentPanel id={selectedId} focus={focus} onSelect={select} onFocus={request}
          onClose={() => setSelectedId(null)} />
      )}

      {exploring && <TypeQLOverlay context={overlay} collapsed={typeqlCollapsed} onCollapse={setTypeqlCollapsed}
        onEdge={onOverlayEdge} />}

      <div ref={tip} className={hoverName && hovered !== selectedId ? "hover-tip shown" : "hover-tip"} aria-hidden>
        {hoverName}{hoverName && <span> · click for its TypeDB details</span>}
      </div>

      {exploring && <ModelDownload />}

      <p className="disclaimer">Original concept vehicle for demonstration. Not a production model.</p>
    </main>
  );
}
