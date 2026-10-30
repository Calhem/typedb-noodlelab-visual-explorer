import { useEffect, useState } from "react";
import { Stage } from "./scene/Stage";

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

export function App() {
  const [exploring, setExploring] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  return (
    <main className={exploring ? "app exploring" : "app"}>
      <div className="canvas">
        <Stage exploring={exploring} reducedMotion={reducedMotion} />
      </div>

      <header className="brand">
        <span className="brand-mark" aria-hidden />
        <span>Noodlelab Visual Explorer</span>
        <span className="brand-sep">·</span>
        <span className="brand-sub">TypeDB</span>
      </header>

      <section className="intro" aria-hidden={exploring}>
        <h1>A vehicle is more than the sum of its parts.</h1>
        <p>Explore the structure of a complex system, powered by TypeDB.</p>
        <button type="button" onClick={() => setExploring(true)} tabIndex={exploring ? -1 : 0}>
          Explore the vehicle
        </button>
      </section>

      <footer className="hint" aria-hidden={!exploring}>
        Drag to orbit · scroll to zoom · right-drag to pan
      </footer>

      <p className="disclaimer">Original concept vehicle for demonstration. Not a production model.</p>
    </main>
  );
}
