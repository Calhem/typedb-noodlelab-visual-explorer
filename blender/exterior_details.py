"""D1.4 exterior details on the D1.3 shell: the lamps, the roof sensors' housings and the door mirrors with their
cameras. Called by blender/exterior_panels.py, which exports them with the panels as part of `body-exterior`.

Everything is laid onto the body by casting rays at the shell, so it follows the surface exactly:
- Front lighting signature: a slim light blade across the whole nose under the bonnet edge, splitting into two short
  parallel lines where it wraps each front corner, and below it at each corner a dark lens with three projector
  modules in a row. Each headlamp owns its half of the blade (the lamps meet at the centre line).
- Rear: a continuous light bar under the tail ledge, across the tailgate and round onto the quarters, where each lamp
  adds two shorter lines below the bar under a deeper smoked lens.
- Roof: the lidar in a low pod on the roof's front edge (over the front header, its window looking forward over the
  windscreen), and the satellite-navigation antenna in a fin near the roof's rear edge. Both bases are shaped to the
  roof, so there is no gap.
- Mirrors: a slim arm from the door's front upper corner (on the beltline) to the head; the side camera sits in the
  head's underside, looking down and out.
Component ids are unchanged: each detail belongs to an existing component (lamp elements to their lamp, lenses to the
lens, pod to the lidar, fin to the antenna).
"""

from __future__ import annotations

import math

import bpy  # must come first
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import exterior_d13 as d13
import kit

app = d13.app


def _cast(bvh: BVHTree, origin, direction) -> tuple[Vector, Vector] | None:
    hit, n, _, _ = bvh.ray_cast(app(*origin), app(*direction) - app(0, 0, 0), 6.0)
    return None if hit is None else (hit, n)


class Face:
    """Points on the nose (front) or tail (rear) found by rays from inside the body, fanning round the plan corner:
    angle 0 looks straight ahead (or back), 90 straight out to the side."""

    def __init__(self, bvh: BVHTree, front: bool, side: int):
        self.bvh, self.side = bvh, side
        self.facing = 1 if front else -1
        self.cx = 1.9 if front else -1.9

    def at(self, a: float, y: float, lift: float = 0.0) -> Vector | None:
        r = math.radians(a)
        got = _cast(self.bvh, (self.cx, y, 0.0), (self.facing * math.cos(r), 0.0, self.side * math.sin(r)))
        return None if got is None else got[0] + got[1] * lift

    def pillow(self, a0: float, a1: float, y0, y1, lift0: float, lift1: float, na: int = 36, ny: int = 3) -> bmesh.types.BMesh:
        """A closed thin solid on the surface between angles a0..a1 and heights y0(a)..y1(a), from lift0 to lift1
        off the surface (its sides stand straight up from the surface)."""
        y0f = y0 if callable(y0) else (lambda a, v=y0: v)
        y1f = y1 if callable(y1) else (lambda a, v=y1: v)
        bm = bmesh.new()
        layers = []
        for lift in (lift0, lift1):
            grid = []
            for i in range(na + 1):
                a = a0 + (a1 - a0) * i / na
                col = []
                for j in range(ny + 1):
                    y = y0f(a) + (y1f(a) - y0f(a)) * j / ny
                    p = self.at(a, y, lift)
                    if p is None:
                        raise ValueError(f"no surface at angle {a:.1f}, y {y:.3f}")
                    col.append(bm.verts.new(p))
                grid.append(col)
            layers.append(grid)
        lo, hi = layers
        hi_verts = {v for col in hi for v in col}
        for g, flip in ((lo, True), (hi, False)):  # windings written out so the solid is consistent; flipped below if needed
            for i in range(na):
                for j in range(ny):
                    quad = (g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1])
                    bm.faces.new(quad[::-1] if flip else quad)
        ring = [(i, 0) for i in range(na)] + [(na, j) for j in range(ny)] + [(i, ny) for i in range(na, 0, -1)] + [(0, j) for j in range(ny, 0, -1)]
        for (i, j), (k, l) in zip(ring, ring[1:] + ring[:1]):
            bm.faces.new((lo[i][j], lo[k][l], hi[k][l], hi[i][j]))
        # the outer layer must face away from the body
        bm.normal_update()
        top = next(f for f in bm.faces if all(v in hi_verts for v in f.verts))
        out = hi[na // 2][ny // 2].co - lo[na // 2][ny // 2].co
        if top.normal.dot(out) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces)
        return bm

    def disc(self, a: float, y: float, r: float, lift0: float, lift1: float, segments: int = 24) -> bmesh.types.BMesh:
        """A short cylinder standing on the surface (a projector module's bezel or emitter)."""
        r_ = math.radians(a)
        p, n = _cast(self.bvh, (self.cx, y, 0.0), (self.facing * math.cos(r_), 0.0, self.side * math.sin(r_)))
        cyl = kit.cylinder(r, lift1 - lift0, segments)
        return kit.transform(cyl, Matrix.Translation(p + n * (lift0 + lift1) / 2) @ kit.align_z(n))


def _obj(name: str, pieces: list[tuple[bmesh.types.BMesh, str]], smooth: bool = False) -> bpy.types.Object:
    """One object from several pieces, each with its own material."""
    bm = bmesh.new()
    mats: list[str] = []
    for piece, mat in pieces:
        if mat not in mats:
            mats.append(mat)
        for f in piece.faces:
            f.material_index = mats.index(mat)
        kit.merge_into(bm, piece)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(o)
    for m in mats:
        o.data.materials.append(kit.material(m))
    for p in o.data.polygons:
        p.use_smooth = smooth
    return o


# ---- lamps ----------------------------------------------------------------------------------------------------------

BLADE_Y = 0.836       # the light blade, under the bonnet's leading edge
BLADE_END = 50.0      # where the blade splits into its twin tips
TIP_END = 61.0


def cluster_lo(a: float) -> float:
    """The headlamp cluster's lower edge: rising towards the corner, so the cluster tapers as it wraps round."""
    return 0.774 + 0.014 * d13.smooth((a - 23.0) / 28.0)


def headlamp(bvh: BVHTree, side: int) -> dict[str, bpy.types.Object]:
    f = Face(bvh, True, side)
    elements = [
        (f.pillow(0.0, BLADE_END, BLADE_Y - 0.004, BLADE_Y + 0.004, 0.0004, 0.003, na=48, ny=1), "lamp"),
        (f.pillow(BLADE_END - 1.0, TIP_END, BLADE_Y + 0.003, BLADE_Y + 0.0075, 0.0004, 0.003, na=12, ny=1), "lamp"),
        (f.pillow(BLADE_END - 1.0, TIP_END - 2.5, BLADE_Y - 0.0075, BLADE_Y - 0.003, 0.0004, 0.003, na=12, ny=1), "lamp"),
        # the cluster: a dark housing behind three projector modules, each a bezel round an emitter
        (f.pillow(23.0, 51.0, cluster_lo, 0.816, 0.0002, 0.0012, na=24, ny=2), "lamp-housing"),
    ]
    for a in (29.0, 37.0, 45.0):
        elements.append((f.disc(a, 0.796, 0.0145, 0.0012, 0.0050), "lamp-bezel"))
        elements.append((f.disc(a, 0.796, 0.0095, 0.0050, 0.0058), "lamp"))
    # a thin lit accent along the cluster's lower edge, echoing the blade
    elements.append((f.pillow(25.0, 49.0, lambda a: cluster_lo(a) + 0.0035, lambda a: cluster_lo(a) + 0.0065, 0.0012, 0.0030, na=20, ny=1), "lamp"))
    lens = [(f.pillow(0.0, TIP_END + 1.0, BLADE_Y - 0.011, BLADE_Y + 0.011, 0.0002, 0.0060, na=48, ny=2), "lamp-lens"),
            (f.pillow(22.0, 52.0, lambda a: cluster_lo(a) - 0.003, 0.819, 0.0002, 0.0072, na=24, ny=3), "lamp-lens")]
    k = "r" if side > 0 else "l"
    return {f"headlamp-{k}": _obj(f"headlamp-{k}", elements), f"headlamp-lens-{k}": _obj(f"headlamp-lens-{k}", lens, smooth=True)}


BAR_Y = 1.0           # the rear light bar, under the tail ledge
BAR_END = 64.0


def tail_lamp(bvh: BVHTree, side: int) -> bpy.types.Object:
    f = Face(bvh, False, side)
    deep = lambda a: BAR_Y - 0.016 if a < 38.0 else BAR_Y - 0.016 - 0.034 * d13.smooth((a - 38.0) / 5.0)
    pieces = [
        (f.pillow(0.0, BAR_END, BAR_Y - 0.005, BAR_Y + 0.005, 0.0004, 0.003, na=56, ny=1), "tail-lamp"),
        (f.pillow(44.0, BAR_END - 2.0, BAR_Y - 0.020, BAR_Y - 0.014, 0.0004, 0.003, na=16, ny=1), "tail-lamp"),
        (f.pillow(48.0, BAR_END - 5.0, BAR_Y - 0.035, BAR_Y - 0.029, 0.0004, 0.003, na=12, ny=1), "tail-lamp"),
        (f.pillow(40.0, BAR_END + 1.0, lambda a: deep(a) + 0.002, BAR_Y - 0.008, 0.0002, 0.0012, na=20, ny=2), "lamp-housing"),
        # the smoked lens over the bar and the cluster
        (f.pillow(0.0, BAR_END + 2.0, deep, BAR_Y + 0.016, 0.0002, 0.0065, na=56, ny=3), "tail-lens"),
    ]
    k = "r" if side > 0 else "l"
    return _obj(f"tail-lamp-{k}", pieces, smooth=True)


# ---- roof sensors ---------------------------------------------------------------------------------------------------

def _roof(bvh: BVHTree, x: float, z: float) -> float:
    got = _cast(bvh, (x, 2.5, z), (0.0, -1.0, 0.0))
    assert got is not None, (x, z)
    return got[0].z  # Blender's z is the app's y


def _loft(bvh: BVHTree, xs: list[float], height, half, nu: int = 16, sink: float = 0.004) -> tuple[bmesh.types.BMesh, list]:
    """A smooth housing on the roof: at each x a cross-section from -half(x) to +half(x) whose top is height(x)
    above the roof (an ellipse-like arch), its base on the roof itself, sunk `sink` into it so no gap shows.
    Returns the solid and its last (front) cross-section's verts, for a window."""
    bm = bmesh.new()
    rows = []
    for x in xs:
        h, w = height(x), half(x)
        top, base = [], []
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            z = u * w
            y0 = _roof(bvh, x, z) - sink
            y = y0 + sink + h * math.sqrt(max(0.0, 1 - abs(u) ** 2.6))
            top.append(bm.verts.new(app(x, y, z)))
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            base.append(bm.verts.new(app(x, _roof(bvh, x, u * w) - sink, u * w)))
        rows.append((top, base))
    # windings written out (outward normals): the thin base makes recalculating them unreliable
    for (ta, ba), (tb, bb) in zip(rows, rows[1:]):
        for i in range(nu):
            bm.faces.new((ta[i + 1], tb[i + 1], tb[i], ta[i]))
            bm.faces.new((ba[i], bb[i], bb[i + 1], ba[i + 1]))
        bm.faces.new((tb[0], bb[0], ba[0], ta[0]))
        bm.faces.new((ba[nu], bb[nu], tb[nu], ta[nu]))
    (top0, base0), (top1, base1) = rows[0], rows[-1]
    caps = [bm.faces.new((top0 + base0[::-1])[::-1]), bm.faces.new(top1 + base1[::-1])]
    bm.normal_update()
    return bm, caps


def lidar_pod(bvh: BVHTree) -> bpy.types.Object:
    """The lidar in a low pod over the roof's front header (x 0 to 0.08), running back as a tapering fairing and
    forward over the top of the windscreen to a blunt face with the sensor window."""
    x0, x1 = -0.16, 0.175
    xs = [x0 + (x1 - x0) * (1 - math.cos(math.pi * i / 24)) / 2 for i in range(25)]
    height = lambda x: 0.052 * math.sin(math.pi / 2 * d13.smooth((x - x0) / (0.12 - x0)) ** 0.7) if x < 0.12 else 0.052 - 0.006 * ((x - 0.12) / (x1 - 0.12)) ** 2
    half = lambda x: 0.10 + 0.05 * d13.smooth((x - x0) / 0.20)
    bm, (rear, front) = _loft(bvh, xs, height, half)
    bmesh.ops.delete(bm, geom=[rear], context="FACES_ONLY")
    body = [(bm, "gloss-black")]
    # the sensor window: a dark glass panel set into the blunt front face
    win = bmesh.new()
    pts = [Vector(v.co) for v in front.verts]
    centre = sum(pts, Vector()) / len(pts)
    for v in pts:
        win.verts.new(centre + (v - centre) * 0.82 + Vector((0.0015, 0, 0)))
    win.faces.new(win.verts)
    bmesh.ops.solidify(win, geom=win.faces[:], thickness=0.002)
    return _obj("lidar", body + [(win, "sensor-window")], smooth=True)


def shark_fin(bvh: BVHTree) -> bpy.types.Object:
    """The satellite-navigation antenna's fin on the painted rear part of the roof, its base shaped to the roof."""
    x0, x1 = -1.66, -1.47
    xs = [x0 + (x1 - x0) * i / 20 for i in range(21)]
    height = lambda x: 0.066 * (1 - ((x - x0) / (x1 - x0)) ** 1.6) ** 0.8 + 0.004
    half = lambda x: 0.03 * math.sin(math.pi / 2 * min(1.0, (x1 - x) / 0.06 + 0.15)) * (1 - 0.25 * (x1 - x) / (x1 - x0))
    bm, _ = _loft(bvh, xs, height, half, nu=12)
    return _obj("gnss-antenna", [(bm, "body-paint")], smooth=True)


# ---- mirrors and side cameras ---------------------------------------------------------------------------------------

def mirror(bvh: BVHTree, side: int) -> dict[str, bpy.types.Object]:
    """The head (gloss black, mirror glass facing back) on a slim arm from the door's front upper corner. side: +1
    is the right (app +z)."""
    got = _cast(bvh, (0.86, 1.045, side * 1.6), (0.0, 0.0, -side))
    assert got is not None
    base, n = got
    head = Vector(app(0.80, 1.115, side * 1.055))
    sx, sy, sz = 0.072, 0.092, 0.19  # app x (depth), y (height), z (width)
    shell = kit.box(sx, sz, sy)  # Blender: x, y (= -app z), z (= app y)
    o = kit.new_object("mirror-head", shell, "gloss-black")
    o.location = head
    o = kit.bevel(o, 0.024, 4, 30.0)
    head_bm = bmesh.new()
    head_bm.from_mesh(o.data)
    kit.transform(head_bm, Matrix.Translation(head))
    bpy.data.objects.remove(o)
    glass = kit.transform(kit.box(0.004, sz - 0.03, sy - 0.026), Matrix.Translation(head - Vector((sx / 2 + 0.0005, 0, 0))))
    inner = head + Vector((0.004, side * (sz / 2 - 0.03), -0.012))  # Blender y is -app z: the head's inboard end
    arm = kit.rod(base + n * 0.004, inner, 0.0125, 20, 0.010)
    foot = kit.transform(kit.box(0.07, 0.05, 0.012), Matrix.Translation(base + n * 0.004) @ kit.align_z(n))
    k = "r" if side > 0 else "l"
    m = _obj(f"mirror-{k}", [(head_bm, "gloss-black"), (arm, "gloss-black"), (foot, "plastic-black"), (glass, "mirror-glass")], smooth=True)
    # the camera: in the head's underside towards its outer end, looking down and outwards
    look = (Vector(app(0.0, -1.0, side * 0.45)) - Vector(app(0, 0, 0))).normalized()
    spot = head + Vector((0.0, -side * 0.055, -sy / 2 + 0.006))
    bezel = kit.transform(kit.cylinder(0.0105, 0.012, 24), Matrix.Translation(spot) @ kit.align_z(look))
    lens = kit.transform(kit.cylinder(0.0065, 0.002, 24), Matrix.Translation(spot + look * 0.0065) @ kit.align_z(look))
    cam = _obj(f"side-camera-{k}", [(bezel, "plastic-black"), (lens, "camera-lens")])
    return {f"mirror-{k}": m, f"side-camera-{k}": cam}


def grille_slats(body: bpy.types.Object) -> bpy.types.Object:
    """Four slim horizontal slats in dark metal across the lower intake (a restrained treatment: the electric drive
    needs little cooling air; the front radar sits behind the intake's centre)."""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    f = Face(bvh, True, 1)
    slats = [(f.pillow(-44.0, 44.0, y - 0.0035, y + 0.0035, 0.0004, 0.007, na=48, ny=1), "trim-dark-metal")
             for y in (0.531, 0.557, 0.583, 0.609)]
    return _obj("grille-slats", slats)


def build(body: bpy.types.Object) -> dict[str, bpy.types.Object]:
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    parts: dict[str, bpy.types.Object] = {}
    for side in (1, -1):
        parts.update(headlamp(bvh, side))
        parts[f"tail-lamp-{'r' if side > 0 else 'l'}"] = tail_lamp(bvh, side)
        parts.update(mirror(bvh, side))
    parts["lidar"] = lidar_pod(bvh)
    parts["gnss-antenna"] = shark_fin(bvh)
    return parts
