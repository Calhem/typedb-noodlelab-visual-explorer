"""Phase E review: record the introduction live (road, Begin, studio, Expand) with Chrome's screencast, which does not
stall rendering, and save the frames plus an animated WebP. Separate headless Chrome (see cdp.py).
    uv run --with websocket-client --with pillow python -I scripts/browser/intro_recording.py <output-dir> [width height]
"""
import base64, io, json, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from cdp import Browser
from PIL import Image

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
w, h = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1440, 900)
b = Browser(tempfile.mkdtemp() + "/profile", width=w, height=h, scale=1)
frames = []  # (seconds since start, JPEG bytes)


def pump(seconds, action=None):
    """Collect screencast frames for `seconds`, running `action` (JavaScript) at the start."""
    if action:
        b.n += 1
        b.ws.send(json.dumps({"id": b.n, "method": "Runtime.evaluate", "params": {"expression": action}}))
    end = time.time() + seconds
    b.ws.settimeout(0.5)
    while time.time() < end:
        try:
            msg = json.loads(b.ws.recv())
        except Exception:
            continue
        if msg.get("method") == "Page.screencastFrame":
            p = msg["params"]
            frames.append((time.time() - t0, base64.b64decode(p["data"])))
            b.n += 1
            b.ws.send(json.dumps({"id": b.n, "method": "Page.screencastFrameAck", "params": {"sessionId": p["sessionId"]}}))


b.call("Page.navigate", url="http://127.0.0.1:5180/?quality=high")
time.sleep(1.5)
t0 = time.time()
b.n += 1
b.ws.send(json.dumps({"id": b.n, "method": "Page.startScreencast", "params": {"format": "jpeg", "quality": 80, "maxWidth": w, "maxHeight": h, "everyNthFrame": 2}}))
pump(10.5)                                                                     # the drive and the parked car
pump(5.0, "document.querySelector('.intro button.begin').click()")             # Begin: into the studio
pump(9.5, "[...document.querySelectorAll('.scrub-play')].find(e => e.textContent.includes('Expand')).click()")  # Expand
print(len(frames), "frames over", round(frames[-1][0], 1), "s")

# Key frames, and an animated WebP at a steady 12 frames a second.
marks = {"1-road": 1.0, "2-approach": 4.5, "3-parked": 10.0, "4-begin": 11.6, "5-studio": 15.2, "6-expand": 19.5, "7-explorer": 24.5}
for name, at in marks.items():
    t, data = min(frames, key=lambda f: abs(f[0] - at))
    Image.open(io.BytesIO(data)).convert("RGB").save(out / f"{name}.jpg", quality=85)
step, picked, t = 1 / 12, [], 0.0
while t <= frames[-1][0]:
    picked.append(min(frames, key=lambda f: abs(f[0] - t))[1])
    t += step
images = [Image.open(io.BytesIO(d)).convert("RGB").resize((w // 2, h // 2)) for d in picked]
images[0].save(out / "intro.webp", save_all=True, append_images=images[1:], duration=int(step * 1000), loop=0, quality=70)
print("saved", len(images), "frames to intro.webp")
b.close()
