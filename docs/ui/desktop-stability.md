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
