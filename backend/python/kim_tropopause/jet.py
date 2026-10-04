"""Jet stream from KIM pressure-level winds.

Stored grids are the column maximum wind without smoothing. Axis lines are guides only:
they are traced on a lightly smoothed field, smoothed for display, pulled back to within
MAX_SHIFT_KM of the traced ridge, and a jet whose 95th-percentile offset from the nearest
local wind maximum exceeds HIDE_SHIFT_KM is published without an axis (its strong-wind area
remains visible from the raw grid).
"""
import math
import numpy as np

KT = 1.94384
JET_MIN_KT = 80.0
MAX_SHIFT_KM = 30.0
HIDE_SHIFT_KM = 50.0
MIN_MAIN_KM = 500.0
KINK_DEG = 70.0
SEARCH_TOP_HPA = 150.0
SEARCH_BOTTOM_HPA = 500.0


def box(a, r):
    """(2r+1)^2 moving mean over the last two axes, edge padded."""
    k = 2 * r + 1
    pad = np.pad(a, [(0, 0)] * (a.ndim - 2) + [(r, r), (r, r)], mode="edge")
    c = np.pad(pad.cumsum(-1).cumsum(-2), [(0, 0)] * (a.ndim - 2) + [(1, 0), (1, 0)])
    return (c[..., k:, k:] - c[..., :-k, k:] - c[..., k:, :-k] + c[..., :-k, :-k]) / (k * k)


def max_wind(pressures, u, v):
    """Column maximum wind (kt), its pressure (hPa, parabolic in log p) and 80 kt layer limits.

    Returns vmax, pmax, ui, vi (wind components at the maximum), bottom, top (hPa; nan below 120 kt).
    """
    use = np.where((pressures <= SEARCH_BOTTOM_HPA) & (pressures >= SEARCH_TOP_HPA))[0]
    s = np.hypot(u[use], v[use]) * KT
    lp = np.log(pressures[use])
    k = np.argmax(s, axis=0)
    ny, nx = k.shape
    kk = np.clip(k, 1, len(use) - 2)
    a, b, c = [np.take_along_axis(s, (kk + d)[None], 0)[0] for d in (-1, 0, 1)]
    inner = (k > 0) & (k < len(use) - 1)
    den = a - 2 * b + c
    off = np.where(inner & (np.abs(den) > 1e-6), 0.5 * (a - c) / np.where(den == 0, 1, den), 0).clip(-0.5, 0.5)
    vmax = np.where(inner, b - 0.25 * (a - c) * off, np.take_along_axis(s, k[None], 0)[0])
    pmax = np.where(inner, np.exp(np.interp(kk + off, np.arange(len(use)), lp)), np.exp(lp[k]))
    ui = np.take_along_axis(u[use], k[None], 0)[0]
    vi = np.take_along_axis(v[use], k[None], 0)[0]
    bottom = np.full((ny, nx), np.nan)
    top = np.full((ny, nx), np.nan)
    for y, x in zip(*np.where(vmax >= 120)):
        col, k0 = s[:, y, x], k[y, x]
        for j in range(k0, 0, -1):
            if col[j - 1] < JET_MIN_KT:
                w = (col[j] - JET_MIN_KT) / (col[j] - col[j - 1])
                bottom[y, x] = math.exp(lp[j] + w * (lp[j - 1] - lp[j]))
                break
        for j in range(k0, len(use) - 1):
            if col[j + 1] < JET_MIN_KT:
                w = (col[j] - JET_MIN_KT) / (col[j] - col[j + 1])
                top[y, x] = math.exp(lp[j] + w * (lp[j + 1] - lp[j]))
                break
    return vmax, pmax, ui, vi, bottom, top


def bilinear(a, x, y):
    ny, nx = a.shape
    if not (0 <= x < nx - 1 and 0 <= y < ny - 1):
        return np.nan
    i, j = int(x), int(y)
    fx, fy = x - i, y - j
    return a[j, i] * (1 - fx) * (1 - fy) + a[j, i + 1] * fx * (1 - fy) + a[j + 1, i] * (1 - fx) * fy + a[j + 1, i + 1] * fx * fy


class Grid:
    def __init__(self, lon0, lat0, step, nx, ny):
        self.lon0, self.lat0, self.step, self.nx, self.ny = lon0, lat0, step, nx, ny
        self.km = 111.2 * step

    def lat(self, y):
        return self.lat0 + y * self.step

    def lon(self, x):
        return self.lon0 + x * self.step

    def coslat(self, y):
        return math.cos(math.radians(self.lat(y)))


def trace_axes(g, vmax, ui, vi):
    """Ridge tracing: step 3 cells along the wind, snap to the max within +-0.5 deg across."""
    taken = np.zeros(vmax.shape, bool)
    lines = []

    def direction(x, y, sign):
        uu, vv = bilinear(ui, x, y), bilinear(vi, x, y)
        dx, dy = uu / g.coslat(min(g.ny - 1, max(0, round(y)))), vv
        n = math.hypot(dx, dy) or 1.0
        return sign * dx / n, sign * dy / n

    def snap(x, y, tx, ty):
        best = (bilinear(vmax, x, y), x, y)
        for d in np.arange(-6, 6.01, 0.5):
            px, py = x - d * ty, y + d * tx
            val = bilinear(vmax, px, py)
            if np.isfinite(val) and val > best[0]:
                best = (val, px, py)
        return best

    def trace(x, y, sign):
        pts = []
        for _ in range(600):
            tx, ty = direction(x, y, sign)
            if not (np.isfinite(tx) and np.isfinite(ty)):
                break
            val, x, y = snap(x + 3 * tx, y + 3 * ty, tx, ty)
            if not np.isfinite(val) or val < JET_MIN_KT or taken[int(round(y)), int(round(x))]:
                break
            pts.append((x, y))
        return pts

    for flat in np.argsort(-np.nan_to_num(vmax, nan=-1), axis=None):
        y, x = divmod(int(flat), vmax.shape[1])
        if not vmax[y, x] >= JET_MIN_KT:
            break
        if taken[y, x]:
            continue
        pts = trace(x, y, -1)[::-1] + [(float(x), float(y))] + trace(x, y, 1)
        for px, py in pts:  # no other jet may start within ~1 deg of this axis
            j0, i0 = int(round(py)), int(round(px))
            taken[max(0, j0 - 12):j0 + 13, max(0, i0 - 12):i0 + 13] = True
        if len(pts) >= 2:
            lines.append(pts)
    return lines


def _km_xy(g, p, coslat):
    return np.c_[p[:, 0] * g.km * coslat, p[:, 1] * g.km]


def _douglas_peucker(p, eps):
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    ab = b - a
    n = math.hypot(*ab) or 1.0
    d = np.abs(ab[0] * (p[:, 1] - a[1]) - ab[1] * (p[:, 0] - a[0])) / n
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([_douglas_peucker(p[:i + 1], eps)[:-1], _douglas_peucker(p[i:], eps)])
    return np.array([a, b])


def tidy(g, pts):
    """Split at sharp turns and keep every piece. Pieces of 500 km or more are smoothed and
    pulled back within MAX_SHIFT_KM of the traced ridge; shorter pieces keep the ridge (minor)."""
    pts = np.array(pts, float)
    c = g.coslat(float(np.mean(pts[:, 1])))
    xy = _km_xy(g, pts, c)
    head = np.degrees(np.arctan2(np.diff(xy[:, 1]), np.diff(xy[:, 0])))
    pieces, start = [], 0
    for i in range(6, len(head) - 6):
        turn = abs((np.mean(head[i:i + 6]) - np.mean(head[i - 6:i]) + 180) % 360 - 180)
        if turn > KINK_DEG and i + 1 - start >= 6:
            pieces.append((start, i + 1))
            start = i
    pieces.append((start, len(pts)))
    out = []
    for a, b in pieces:
        raw = pts[a:b]
        if len(raw) < 2:
            continue
        length = float(np.sum(np.hypot(*np.diff(_km_xy(g, raw, c), axis=0).T)))
        if length < MIN_MAIN_KM or len(raw) < 5:
            out.append((raw, True))
            continue
        p = raw.copy()
        for _ in range(3):
            sm = p.copy()
            for i in range(1, len(p) - 1):
                sm[i] = p[max(0, i - 4):min(len(p), i + 5)].mean(axis=0)
            p = sm
        p = _douglas_peucker(p, 1.0)
        for _ in range(3):
            if len(p) < 3:
                break
            n = [p[0]]
            for i in range(len(p) - 1):
                n += [0.75 * p[i] + 0.25 * p[i + 1], 0.25 * p[i] + 0.75 * p[i + 1]]
            n.append(p[-1])
            p = np.array(n)
        rk = _km_xy(g, raw, c)
        for i in range(len(p)):
            q = _km_xy(g, p[i:i + 1], c)[0]
            d = np.hypot(*(rk - q).T)
            j = int(np.argmin(d))
            if d[j] > MAX_SHIFT_KM:
                p[i] = raw[j] + (p[i] - raw[j]) * MAX_SHIFT_KM / d[j]
        out.append((p, False))
    return out


def axis_offsets(g, line, vmax):
    """Distance (km) from each other axis point to the nearest local maximum across the axis."""
    p = np.asarray(line, float)
    offs = []
    for i in range(1, len(p) - 1, 2):
        c = g.coslat(p[i, 1])
        tx, ty = (p[i + 1, 0] - p[i - 1, 0]) * c, p[i + 1, 1] - p[i - 1, 1]
        n = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / n, tx / n
        ds = list(range(-150, 151, 5))
        vs = [bilinear(vmax, p[i, 0] + d * nx / (g.km * c), p[i, 1] + d * ny / g.km) for d in ds]
        peaks = [abs(ds[k]) for k in range(1, len(ds) - 1) if np.isfinite(vs[k])
                 and vs[k] >= (vs[k - 1] if np.isfinite(vs[k - 1]) else -1)
                 and vs[k] >= (vs[k + 1] if np.isfinite(vs[k + 1]) else -1)]
        offs.append(min(peaks) if peaks else 150)
    return offs


def missed_strong(lines, vmax):
    """Share of >=100 kt area (pieces of at least 20 cells) that no axis passes through."""
    strong = vmax >= 100
    label = np.zeros(vmax.shape, int)
    n = 0
    for y0, x0 in zip(*np.where(strong)):
        if label[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        label[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < vmax.shape[0] and 0 <= xx < vmax.shape[1] and strong[yy, xx] and not label[yy, xx]:
                        label[yy, xx] = n
                        stack.append((yy, xx))
    sizes = np.bincount(label.ravel(), minlength=n + 1)
    big = [k for k in range(1, n + 1) if sizes[k] >= 20]
    hit = set()
    for line in lines:
        for x, y in line:
            yy, xx = int(round(y)), int(round(x))
            win = label[max(0, yy - 3):yy + 4, max(0, xx - 3):xx + 4]
            hit.update(int(v) for v in np.unique(win) if v)
    area = sum(sizes[k] for k in big)
    return float(sum(sizes[k] for k in big if k not in hit) / area) if area else 0.0


def jets(g, pressures, u, v):
    """Grids and axis features for one forecast time."""
    vmax, pmax, _, _, bottom, top = max_wind(pressures, u, v)
    # Axes are traced on winds smoothed over ~0.4 deg (5x5) and then ~0.6 deg (7x7) so that
    # isolated grid-scale maxima do not start fragments; stored grids and checks stay raw.
    smooth, _, ui, vi, _, _ = max_wind(pressures, box(u, 2), box(v, 2))
    traced = trace_axes(g, box(smooth[None], 3)[0], box(ui[None], 3)[0], box(vi[None], 3)[0])
    pieces = [piece for pts in traced for piece in tidy(g, pts)]
    features, shown = [], []
    for pts, minor in pieces:
        offs = axis_offsets(g, pts, vmax)
        p95 = float(np.percentile(offs, 95)) if offs else 0.0
        ok = p95 <= HIDE_SHIFT_KM
        if ok:
            shown.append(pts)
        speeds = [bilinear(vmax, x, y) for x, y in pts]
        speeds = [s if np.isfinite(s) else -1.0 for s in speeds]
        core = int(np.argmax(speeds))
        cx, cy = pts[core]
        j, k = min(g.ny - 1, max(0, round(cy))), min(g.nx - 1, max(0, round(cx)))
        layer = [float(bottom[j, k]), float(top[j, k])] if np.isfinite(bottom[j, k]) and np.isfinite(top[j, k]) else None
        features.append({
            "coordinates": [[round(g.lon(x), 4), round(g.lat(y), 4)] for x, y in pts],
            "minor": bool(minor), "axisShown": bool(ok), "p95OffsetKm": round(p95, 1),
            "core": {"lon": round(g.lon(cx), 4), "lat": round(g.lat(cy), 4), "speedKt": round(float(speeds[core]), 1),
                     "pressureHpa": round(float(pmax[j, k]), 1), "layer80KtHpa": layer},
        })
    offs_all = [o for pts in shown for o in axis_offsets(g, pts, vmax)]
    checks = {
        "axes": len(features), "hiddenAxes": sum(not f["axisShown"] for f in features),
        "medianOffsetKm": round(float(np.median(offs_all)), 1) if offs_all else 0.0,
        "p95OffsetKm": round(float(np.percentile(offs_all, 95)), 1) if offs_all else 0.0,
        "missedStrongShare": round(missed_strong(shown, vmax), 3),
    }
    return vmax, pmax, features, checks
