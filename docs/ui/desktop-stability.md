# Desktop layout and camera stability: diagnosis and plan (2 November 2026)

Branch `feature/ui-desktop-stability`, from `main` at 690bc53 (D1.5).

## What was measured

- **The jolt.** At 1512x860, selecting five parts one after another, about a second apart:
  - The overlay's bottom edge jumped between 129 px and 632 px.
  - The camera's lens angle swung between 41.8° and 51.3°, a zoom of about 23% in and out.
  - The camera's vertical offset swung between -50 and +5 px.
  - The camera moved in 315 of 358 frames over 6 s.
- **The squeeze.** With a part selected (explorer, overlay and part panel all open), the car spans:

  | Viewport | Car width | Car height |
  |---|---|---|
  | 1280x720 | 24% | 22% |
  | 1440x900 | 37% | 27% |
  | 1512x982 | 27% | 19% |
  | 1920x1080 | 39% | 32% |

## Root causes

1. **The overlay empties while it loads.**
   - Its views read their answers with `useAnswer`, which goes back to "loading" whenever the id changes. So on every
     selection the overlay collapses to one line ("Asking TypeDB…"), then grows in steps:
     - the component answer;
     - then the relationships;
     - then the schema block, which loads after it opens.
   - It is also re-mounted (keyed by the selection), which restarts its entry animation.
2. **The camera's zoom follows the overlay's content.**
   - `Framing` (in `Stage.tsx`) re-measures the overlay's current bottom edge, through a ResizeObserver, on every
     change. Every frame, it then re-targets the lens angle and the vertical offset so the car fits the space left.
   - Every intermediate height of the overlay is a new target, with no threshold and no waiting for the layout to
     settle.
   - Its choice between framing the car beside or below the overlay can flip from one height to the next.
3. **Fixed panel widths.**
   - The explorer is 330 px, the part panel 360 px and the overlay 440 px, at every desktop size. None of them
     collapses by default.
   - At 1512 px the three leave about 770 px between the panels, and the overlay takes the top half of that, so the
     car is framed in the band below it.

The camera's position itself is never moved by these. Orbit, pan and zoom stay the user's; only the lens angle and
offsets change. But a changing lens angle looks exactly like a zoom.

## The fix (smallest coherent)

1. **The overlay keeps its content until the new content is ready.**
   - Each view holds on to its last complete answer; while the next loads, that content stays, slightly dimmed, with
     a small "updating" mark.
   - When everything for the new selection has arrived, the content cross-fades. There is no unmounting and no
     collapse.
   - Answers for a selection that has since been replaced are dropped, as now (each request is aborted).
2. **The camera frames from the layout, not from the overlay's content.**
   - The free area is computed from the panels' and the overlay's slots: the space each may occupy (open or
     collapsed), not the size of its current content. So content changes cannot move the camera.
   - Opening, closing and collapsing panels, or resizing the window, does re-frame. The new target is only taken
     once the layout has settled (no change for 150 ms).
   - It is ignored if it changes the car's size by less than 8% or moves it by less than 24 px. Otherwise the camera
     glides there; a new target simply replaces the old one, so there are never two competing animations.
   - The user's orbit, pan and zoom are untouched.
3. **A compact laptop layout.** Below 1700 px wide:
   - **Narrower panels:** the explorer is 290 px and the part panel 320 px.
   - **The TypeQL overlay starts collapsed** to a one-line summary ("TypeQL · Right rear quarter panel · 7 queries ·
     46 ms ▸"). Opened, it floats over the upper part of the free area. Its slot is reserved, so opening it re-frames
     the car once, smoothly.
   - **The part panel can be minimised** to a small tab at the right edge without losing the selection; the tab
     reopens it.
   - **The explorer can be closed** to its existing "Explore TypeDB" button, as now.
   - Each of the three collapses independently. Long content scrolls inside its panel, as now.

   At 1700 px and wider, the D1.5 layout stays as it is. It gets the same overlay and camera fixes.

No information or function is removed; this is not a redesign.

---

# Result: review (2 November 2026)

**Status: for review. Not merged; Phase F not started.**

## What changed

- **The overlay:**
  - It keeps its current view while a part's next view loads out of sight, dimmed slightly, with a small "updating"
    mark; then it cross-fades.
  - A system, assembly, type, question or failure arrives with its answer complete, so it goes straight on screen.
  - No collapse, no remount; a newer selection replaces a pending one.
- **The camera:**
  - It frames from the panels' measured edges and the overlay's reserved slot, never from the overlay's content.
  - It re-frames only for a settled, significant change; the explosion is still followed continuously.
  - It glides to each target and settles exactly.
  - Orbit, pan and zoom stay the user's.
- **The layout below 1700 px wide:**
  - narrower panels (explorer 290 px, part panel 320 px, tighter tabs);
  - the TypeQL overlay starts as a one-line summary (kind, name, counts), with ▸ to open it;
  - the part panel can be minimised to a tab (– in its corner) without losing the selection.

  Each of the three collapses independently, and long content scrolls inside its panel.
- **Wide screens (1700 px and over)** keep the D1.5 layout, with the same overlay and camera fixes.

## Before and after

Left: D1.5 (`main`, 690bc53). Right: this branch. Both are taken with a part selected and with a system highlighted.

| Viewport | A part selected | A system highlighted |
|---|---|---|
| 1280x720 (small laptop) | ![](compare-1280x720-part.jpg) | ![](compare-1280x720-system.jpg) |
| 1440x900 (typical laptop) | ![](compare-1440x900-part.jpg) | ![](compare-1440x900-system.jpg) |
| 1512x982 (MacBook class) | ![](compare-1512x982-part.jpg) | ![](compare-1512x982-system.jpg) |
| 1920x1080 (desktop monitor) | ![](compare-1920x1080-part.jpg) | ![](compare-1920x1080-system.jpg) |

**Rapid switching** (1512x860, ten selections about 0.8 s apart: parts, Propulsion, Braking): ![](rapid-switching.webp)

## Measurements

`scripts/browser/ui_stability.py` traces the camera every frame (lens angle, offsets, position), and the same script
was run on D1.5 and on this branch.

| Viewport | Car, part selected (width × height of window) | Camera frames moved, 10 rapid selections (overlay collapsed / expanded) |
|---|---|---|
| 1280x720 | 26% × 22% → **43% × 36%** | 315 / 375 → **0 / 2*** |
| 1440x900 | 37% × 27% → **49% × 36%** | 301 / 331 → **0 / 0** |
| 1512x982 at 90% zoom | 36% × 26% → **54% × 39%** | 371 / 417 → **0 / 0** |
| 1512x982 at 100% | 27% × 19% → **50% × 36%** | 371 / 418 → **0 / 0** |
| 1512x982 at 110% | 38% × 27% → **46% × 34%** | 303 / 341 → **0 / 0** |
| 1920x1080 | 39% × 32% → 33% × 28% (overlay open), **48% × 40%** (overlay collapsed) | 324 / 357 → **0 / 0** |

\* The 2 frames are the last 0.02° of the glide from opening the overlay just before, not the switching.

Other checks, at every size and zoom:
- **Panels and the explosion:**
  - minimising and restoring the part panel, closing and reopening the explorer, and expanding and assembling each
    give one smooth glide per change;
  - resizing the window re-frames once the resize stops.
- **Controls:** no control (explode, lights, download, panel close or minimise, overlay toggle, tabs, focus bar) is
  outside the window.
- **Tests:** web 71 pass, plus the build; API 119; live TypeDB 7.

**Performance against D1.5** (same benchmark, high tier, 1440x900 x1.5, three runs each):

| | D1.5 | After |
|---|---|---|
| Frame, assembled / expanded | 3.3-3.6 / 8.4-8.7 ms | 3.1-3.7 / 8.3-10.0 ms (one noisy run) |
| Draw calls, download | 936 calls, 17.24 MB | 936 calls, 17.24 MB |
| JavaScript (gzip) | 502.9 KB | 503.8 KB |
| Selecting a part (to its name shown) | 77-81 ms | **61-62 ms** |
| Highlighting a system (to the highlight drawn) | 77-83 ms | 92-114 ms |

Highlighting measures 15-25 ms slower over several runs. It is still under a tenth of a second and not visible; I
looked for the cause (the overlay's preparation was ruled out) and stopped there.

## Limitations

1. **At 1920x1080 with the overlay open and a part selected,** the car is smaller than on D1.5 (33% against 39% of the
   width).
   - The overlay's reserved slot sits beside the car, and D1.5's larger figure only lasted while the overlay happened
     to be short; it jolted as soon as the content changed.
   - With the overlay collapsed it is 48%. The overlay could start collapsed on wide screens too; that is a one-line
     change, for you to decide.
2. **Resizing to a smaller window keeps the overlay in its current state.** An overlay opened on a large window stays
   open after shrinking it; it does not collapse by itself.
3. **The part panel's own content** still shows "Asking TypeDB…" briefly while a new part loads (the camera is not
   affected). Keeping its previous content, like the overlay, would be a small follow-up.
