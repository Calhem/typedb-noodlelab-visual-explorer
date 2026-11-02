"""UI milestone check: camera stability and vehicle size on desktop viewports. Separate headless Chrome (see cdp.py).
    uv run --with websocket-client python -I scripts/browser/ui_stability.py [results.json]

For each scenario it traces the camera every frame (lens angle, offsets, position) and counts the frames in which it
moved and how many separate movements (glides) there were. Switching selections should move it in no frame;
opening or closing a panel, resizing or browser zoom may cause one smooth glide; expanding follows the explosion.
"""
import json, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from cdp import Browser

TRACE = r"""
const cam = __vx.camera, out = [], t0 = performance.now();
const sample = () => out.push([performance.now() - t0, cam.fov, cam.view?.enabled ? -cam.view.offsetY : 0, cam.filmOffset,
  cam.position.x, cam.position.y, cam.position.z]);
const steps = STEPS;
let i = 0;
await new Promise(done => { const tick = () => { sample(); const t = performance.now() - t0;
  while (i < steps.length && t >= steps[i][0]) { (0, eval)(steps[i][1]); i++; }
  if (t > DURATION) return done(); requestAnimationFrame(tick); }; tick(); });
return out;"""

# The car's size on screen: projected bounds of every visible mesh, as a share of the window.
CAR = r"""const v = __vx.scene.getObjectByName('vehicle'), p = v.position.clone();
let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
v.traverse(o => { if (!o.isMesh || !o.geometry || !o.visible) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
  const b = o.geometry.boundingBox;
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    p.set(x, y, z).applyMatrix4(o.matrixWorld).project(__vx.camera); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } });
return [Math.round((x1 - x0) / 2 * 100), Math.round((y1 - y0) / 2 * 100)];"""


def movement(trace):
    """Frames in which the camera moved, and the number of separate movements (runs of moving frames)."""
    # visible movement: lens angle by 0.005 degrees, vertical offset by 0.1 px, horizontal lens shift by 0.002 (about
    # a tenth of a pixel) or camera position by 0.1 mm
    limits = {1: 0.005, 2: 0.1, 3: 2e-3}
    moved = [any(abs(a[k] - b[k]) > limits.get(k, 1e-4) for k in range(1, 7)) for a, b in zip(trace, trace[1:])]
    # one glide = moving frames with no pause longer than a quarter of a second (a glide's slow tail can dip below
    # the visibility limit for a few frames)
    glides, last = 0, None
    for i, m in enumerate(moved):
        if m:
            if last is None or trace[i][0] - trace[last][0] > 250:
                glides += 1
            last = i
    return sum(moved), glides


def open_app(w, h, zoom=1.0):
    b = Browser(tempfile.mkdtemp() + "/profile", width=round(w / zoom), height=round(h / zoom), scale=zoom)
    b.call("Page.navigate", url="http://127.0.0.1:5180/?quality=medium")
    time.sleep(4)
    b.js("[...document.querySelectorAll('button')].find(e => /Explore the vehicle|Skip intro/.test(e.textContent))?.click();"
         "await new Promise(r => setTimeout(r, 3000)); return 1;")
    return b


def trace(b, steps, duration):
    js = TRACE.replace("STEPS", json.dumps(steps)).replace("DURATION", str(duration))
    return b.js(js)


SWITCH = [[0, "__select('quarter-r')"], [700, "__select('front-motor')"], [1400, "__select('lv-battery')"],
          [2100, "[...document.querySelectorAll('.tree-row')].find(e => e.textContent.startsWith('Propulsion'))?.click()"],
          [2900, "__select('caliper-fl')"], [3600, "__select('battery-module-3')"],
          [4300, "[...document.querySelectorAll('.tree-row')].find(e => e.textContent.startsWith('Braking'))?.click()"],
          [5000, "__select('door-fl')"], [5300, "__select('tyre-rr')"], [5600, "__select('front-inverter')"]]

results = {}
for (w, h) in [(1280, 720), (1440, 900), (1512, 982), (1920, 1080)]:
    for zoom in ([0.9, 1.0, 1.1] if (w, h) == (1512, 982) else [1.0]):
        name = f"{w}x{h}@{int(zoom * 100)}%"
        b = open_app(w, h, zoom)
        r = {}
        b.js("__select('quarter-r'); await new Promise(r => setTimeout(r, 3500)); return 1;")
        r["car with a part selected (% of width, height)"] = b.js(CAR)
        r["rapid switching, overlay as it starts (frames moved, glides)"] = movement(trace(b, SWITCH, 7000))
        b.js("const t = document.querySelector('.tq-overlay.collapsed .tq-collapse'); t?.click(); await new Promise(r => setTimeout(r, 2500)); return 1;")
        r["rapid switching, overlay expanded (frames moved, glides)"] = movement(trace(b, SWITCH, 7000))
        r["minimise then restore the part panel (frames moved, glides)"] = movement(trace(b, [
            [0, "document.querySelector('.panel-minimise')?.click()"], [2500, "document.querySelector('.panel-restore')?.click()"]], 5000))
        r["close then reopen the explorer (frames moved, glides)"] = movement(trace(b, [
            [0, "document.querySelector('.explore .panel-close')?.click()"],
            [2500, "[...document.querySelectorAll('button')].find(e => e.textContent.includes('Explore TypeDB'))?.click()"]], 5000))
        r["expand and assemble (frames moved, glides)"] = movement(trace(b, [
            [0, "[...document.querySelectorAll('.scrub-play')][0].click()"], [8000, "[...document.querySelectorAll('.scrub-play')][0].click()"]], 16000))
        if zoom == 1.0 and (w, h) == (1512, 982):
            # resize the window to 1280x800 and back, as a user dragging it would end
            b.call("Emulation.setDeviceMetricsOverride", width=1280, height=800, deviceScaleFactor=1, mobile=False)
            time.sleep(2.5)
            r["after resizing to 1280x800: car (% of width, height)"] = b.js(CAR)
            b.call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
            time.sleep(2.5)
        clipped = b.js("""const W = innerWidth, H = innerHeight; return [...document.querySelectorAll('.scrubber button, .scrubber input, .model-download button, .panel-close, .panel-minimise, .tq-collapse, .explore-tabs button, .focus-bar .link')]
          .filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H); }).map(e => e.className || e.textContent).slice(0, 5);""")
        r["controls outside the window"] = clipped
        results[name] = r
        print(name, json.dumps(r))
        b.close()
if len(sys.argv) > 1:
    json.dump(results, open(sys.argv[1], "w"), indent=1)
