"""Legacy v3 approximation retained for the historical comparison and tests.

The app calculator is calculate_python.py, the complete operational port.
This module is not a numerically equivalent port of the operational source.
Input arrays are south-to-north, bottom-to-top (Pa).
See README.md for formula provenance and deliberate differences from Fortran.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from diagnostics24 import additional
from combine import combine, native_region_bounds

ALGORITHM = "kim-gktg-experiment-v3"
from products import CATALOG


def shifted(a, axis, delta):
    """Neighbour with missing boundary, never wrap regional grids."""
    out = np.full_like(a, np.nan)
    dest, src = [slice(None)] * a.ndim, [slice(None)] * a.ndim
    dest[axis] = slice(None, -delta) if delta > 0 else slice(-delta, None)
    src[axis] = slice(delta, None) if delta > 0 else slice(None, delta)
    out[tuple(dest)] = a[tuple(src)]
    return out


def derivative(a, coordinate, axis):
    """dirreg: nonuniform centred derivative, then valid one-sided fallback."""
    x = np.broadcast_to(coordinate, a.shape)
    lo, hi = shifted(a, axis, -1), shifted(a, axis, 1)
    xl, xh = shifted(x, axis, -1), shifted(x, axis, 1)
    d1, d2 = x - xl, xh - x
    with np.errstate(invalid="ignore", divide="ignore"):
        central = (hi - a) * d1 / (d2 * (d1 + d2)) + (a - lo) * d2 / (d1 * (d1 + d2))
        forward, backward = (hi - a) / d2, (a - lo) / d1
    central = np.where((d1 > 1e-5) & (d2 > 1e-5), central, np.nan)
    out = np.where(np.isfinite(central), central,
                   np.where((d2 > 1e-5) & np.isfinite(forward), forward,
                            np.where(d1 > 1e-5, backward, np.nan)))
    return np.where(np.isfinite(a), out, np.nan)


def smooth(a, horizontal=1, vertical=0):
    """meanFilter3D: y then x, skip missing triplets, keep boundary points.

Regional x endpoints use DIRICHLET; the operational global cyclic wrap is
not applicable to a cropped domain. No partial-triplet renormalisation.
"""
    out = a.copy()
    for _ in range(horizontal):
        lo, hi = shifted(out, -2, -1), shifted(out, -2, 1)
        valid = np.isfinite(lo) & np.isfinite(out) & np.isfinite(hi)
        work = np.where(valid, (lo + 2*out + hi)/4, out)
        lo, hi = shifted(work, -1, -1), shifted(work, -1, 1)
        valid = np.isfinite(lo) & np.isfinite(work) & np.isfinite(hi)
        out = np.where(valid, (lo + 2*work + hi)/4, out)
    for _ in range(vertical):
        lo, hi = shifted(out, 0, -1), shifted(out, 0, 1)
        valid = np.isfinite(lo) & np.isfinite(out) & np.isfinite(hi)
        out = np.where(valid, (lo + 2*out + hi)/4, out)
    return out


def mean_on_height(a, z):
    """mirregzk: distance-weighted three-point mean, then two-point fallback."""
    lo, hi = shifted(a, 0, -1), shifted(a, 0, 1)
    zl, zh = shifted(z, 0, -1), shifted(z, 0, 1)
    d1, d2 = z-zl, zh-z
    with np.errstate(invalid='ignore', divide='ignore'):
        central = ((lo+a)*d1 + (a+hi)*d2)/(2*(d1+d2))
    good = np.isfinite(zl) & np.isfinite(z) & np.isfinite(zh) & (np.abs(d1) >= 1e-3) & (np.abs(d2) >= 1e-3)
    result = np.where(good & np.isfinite(central), central,
                      np.where(np.isfinite(hi), (hi+a)/2, (lo+a)/2))
    return np.where(np.isfinite(a) & np.isfinite(z), result, np.nan)


def filter_diagnostic(name, a, horizontal, vertical, floor):
    result = np.maximum(smooth(a, horizontal, vertical), floor)
    # Both actual selected inverse-Ri branches clamp AFTER filt3d.
    if name in ('sat_inv_ri', 'inv_ritw'):
        result = np.minimum(result, 100)
    return result


def mapped_ri(ri):
    """Rimap: replace nonpositive interior Ri with nearest positive neighbours."""
    nz = len(ri)
    down, up = np.full_like(ri, np.nan), np.full_like(ri, np.nan)
    found = np.full_like(ri[0], np.nan)
    for k in range(nz):
        down[k] = found
        good = ri[k] > 1e-6
        found = np.where(good, ri[k], found)
    found = np.full_like(found, np.nan)
    for k in range(nz - 1, -1, -1):
        up[k] = found
        found = np.where(ri[k] > 1e-6, ri[k], found)
    both = np.isfinite(down) & np.isfinite(up)
    replacement = np.where(both, (down + up) / 2,
                           np.where(np.isfinite(down), down, up))
    # One-sided Fortran refinement: mean with immediately adjacent Ri if positive.
    for k in range(1, nz - 1):
        only_up = ~np.isfinite(down[k]) & np.isfinite(up[k])
        only_down = np.isfinite(down[k]) & ~np.isfinite(up[k])
        for direction, condition, search in [(1, only_up, up), (-1, only_down, down)]:
            candidate = np.full_like(ri[k], np.nan)
            for kk in range(k + direction, nz if direction == 1 else -1, direction):
                average = (ri[kk] + ri[kk - direction]) / 2
                take = condition & ~np.isfinite(candidate) & (ri[kk] > 1e-6)
                candidate = np.where(take, np.where(average > 1e-6, average, search[k]), candidate)
            replacement[k] = np.where(condition, candidate, replacement[k])
    out = np.where(ri <= 1e-6, replacement, ri)
    out[0] = np.where(ri[0] < 1e-6, out[1], out[0])
    out[-1] = np.where(ri[-1] < 1e-6, out[-2], out[-1])
    return np.where(np.isfinite(ri), np.maximum(out, 1e-3), np.nan)


def calculate(cube):
    grid, pressures = cube["grid"], np.asarray(cube["pressures"], dtype=float)
    shape = (len(pressures), grid["ny"], grid["nx"])
    if len(pressures) < 5 or np.any(np.diff(pressures) >= 0):
        raise ValueError("Pressures must decrease bottom-to-top")
    fields = {}
    for name in ("u", "v", "T", "hgt", "q", "w"):
        a = np.asarray(cube["fields"][name], dtype=float)
        if a.size != np.prod(shape):
            raise ValueError(f"Invalid shape: {name}")
        fields[name] = a.reshape(shape)
    surface = {}
    for name in ("ps", "topo", "hpbl"):
        a = np.asarray(cube["surface"][name], dtype=float)
        if a.size != shape[1] * shape[2]:
            raise ValueError(f"Invalid surface shape: {name}")
        surface[name] = a.reshape(shape[1:])
    p = pressures[:, None, None]
    z, t, q = fields["hgt"], fields["T"], fields["q"]
    valid = (p <= surface["ps"]) & (z >= surface["topo"]) & (t > 150) & (t < 350) & (q >= 0) & (q < .1)
    valid &= np.isfinite(fields["u"]) & np.isfinite(fields["v"]) & np.isfinite(z)
    # Reject inverted/equal heights instead of silently differentiating them.
    dz = np.diff(z, axis=0)
    inverted = np.isfinite(dz) & (dz <= 0)
    valid[:-1] &= ~inverted
    valid[1:] &= ~inverted
    fields = {name: np.where(valid, a, np.nan) for name, a in fields.items()}
    u, v, t, z, q, w = (fields[name] for name in ("u", "v", "T", "hgt", "q", "w"))
    lat = np.deg2rad(np.linspace(grid["latMin"], grid["latMax"], grid["ny"]))
    lon = np.deg2rad(np.linspace(grid["lonMin"], grid["lonMax"], grid["nx"]))
    radius = 6371000.0
    xc, yc = (radius * lon)[None, None, :], (radius * lat)[None, :, None]
    mx = 1 / np.cos(lat)[None, :, None]
    curvature = np.tan(lat)[None, :, None] / radius
    zx, zy = derivative(z, xc, 2), derivative(z, yc, 1)

    def gradients(a):
        az = derivative(a, z, 0)
        return mx * (derivative(a, xc, 2) - az * zx), derivative(a, yc, 1) - az * zy, az

    ux, uy, uz = gradients(u)
    vx, vy, vz = gradients(v)
    tx, ty, _ = gradients(t)
    # Def2dz and spherical divergence, using gradients at constant geometric height.
    stretching = ux - vy - v * curvature
    shearing = uy + vx + u * curvature
    deformation_sq = stretching**2 + shearing**2
    speed = np.hypot(u, v)
    divergence = ux + vy - v * curvature
    ax = u * ux + v * uy - u * v * curvature
    ay = u * vx + v * vy + u**2 * curvature
    temp_gradient = np.hypot(tx, ty)
    mixing_ratio = q / (1 - q)
    virtual_t = t * (1 + mixing_ratio / .622) / (1 + mixing_ratio)
    theta = virtual_t * (100000 / p)**(287.05 / 1004.0)
    n2 = smooth(9.80665 / mean_on_height(theta, z) * derivative(theta, z, 0), 0, 1)
    ri = mapped_ri(n2 / np.maximum(uz**2 + vz**2, 1e-10))

    terrain = surface["topo"]
    neighbours = [terrain]
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            a = shifted(terrain, 0, dy) if dy else terrain
            neighbours.append(shifted(a, 1, dx) if dx else a)
    hmax = np.maximum.reduce([np.nan_to_num(a, nan=-np.inf) for a in neighbours])
    hx = mx[0] * derivative(terrain, xc[0], 1)
    hy = derivative(terrain, yc[0], 0)
    slope = smooth(1000 * np.hypot(hx, hy), horizontal=5)
    mask = smooth(((np.minimum(hmax, 3000) >= 200) & (slope >= 5)).astype(float), horizontal=2)
    eligible = (z[:-1] <= terrain + 1500) & (z[:-1] >= terrain)
    speeds = np.where(eligible, speed[:-1], -np.inf)
    low_speed = np.max(np.where(np.isfinite(speeds), speeds, -np.inf), axis=0)
    # No resolved wind in lowest 1.5 km means unavailable mountain-wave input.
    low_speed = np.where(np.isfinite(low_speed), low_speed, np.nan)
    mws = smooth(np.where(mask >= 1e-3, low_speed * hmax, 0), horizontal=1)
    mws = np.where(np.isfinite(terrain), mws, np.nan)
    raw = {
        "ngm1": np.sqrt(deformation_sq) * speed,
        "defsq": deformation_sq,
        "iawind": np.hypot(ax, ay) / 1e-4,
        "tempg_ri": temp_gradient / ri,
        "wsq": w**2,
        "wsq_ri": w**2 / ri,
        "mwt5": mws * np.abs(divergence),
        "mwt12": mws * temp_gradient,
    }
    raw.update(additional({
        'u': u, 'v': v, 'w': w, 't': t, 'z': z, 'theta': theta,
        'ugrad': (ux, uy, uz), 'vgrad': (vx, vy, vz), 'f': 2*7.292115e-5*np.sin(lat)[None, :, None],
        'curvature': curvature, 'mx': mx, 'zx': zx, 'zy': zy, 'ax': ax, 'ay': ay,
        'divergence': divergence, 'ri': ri, 'n2': n2, 'defsq': deformation_sq,
        'p': p, 'virtual_t': virtual_t, 'topo': terrain, 'hpbl': surface['hpbl'], 'mws': mws, 'grid': grid,
    }, gradients, derivative, mapped_ri, smooth, shifted))
    options = {'pvgrad': (2, 1, 0), 'edr': (0, 0, 1e-12), 'edrll': (0, 0, 1e-12),
               'inv_ritw': (2, 2, 0), 'ncsu2_ri': (2, 2, 0), 'edrlun': (4, 3, 1e-6),
               # Explicit choice for inherited SIGW filter setting in the source.
               'sigw_ri': (1, 1, 1e-17), 'fth_ri': (1, 1, 1e-10), 'iawind': (1, 1, 1e-7),
               'iawind_ri': (1, 1, 1e-7), 'ubf_ri': (1, 1, 1e-6), 'lhfk_ri': (1, 1, 1e-12),
               'tempg_ri': (1, 1, 1e-8), 'f3d_ri': (1, 1, 1e-17), 'mwt7': (0, 0, 0)}
    result = {}
    for name, a in raw.items():
        horizontal, vertical, floor = options.get(name, (1, 1, 0))
        a = filter_diagnostic(name, np.where(valid & np.isfinite(a), np.maximum(a, 0), np.nan),
                              horizontal, vertical, floor)
        # Exclude regional boundary filter/derivative halo (largest stencil: terrain).
        a[:, :10, :] = a[:, -10:, :] = np.nan
        a[:, :, :10] = a[:, :, -10:] = np.nan
        result[name] = a
    calibration = json.loads((Path(__file__).parent / 'calibration.json').read_text())
    codes = {code: result[name] for name, _, code, _ in CATALOG if code < 491}
    # Active ITFAcompOptn=1 uses GetkBdys on the native .F grid first.
    bounds = native_region_bounds(np.asarray(cube['fields']['hgt']).reshape(shape), 10, 10, shape[1]-11)
    combined = combine(codes, bounds, calibration, smooth)
    for a in combined.values():
        a[:, :10, :] = a[:, -10:, :] = np.nan
        a[:, :, :10] = a[:, :, -10:] = np.nan
    result.update(combined)
    return result


def finite_json(a):
    return [float(f"{v:.7g}") if np.isfinite(v) else None for v in a.ravel()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    args = parser.parse_args()
    bundle = json.loads(Path(args.input).read_text())
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    frames = []
    for cube in bundle['frames']:
        print(f"Calculating 24 diagnostics and GKTG: +{cube['hf']}h", flush=True)
        frames.append((cube, calculate(cube)))
    diagnostics = []
    for name, label, code, unit in CATALOG:
        finite = np.concatenate([values[name][np.isfinite(values[name])] for _, values in frames])
        if finite.size == 0:
            raise ValueError(f"No usable values for {name}")
        diagnostics.append({"id": name, "label": label, "code": code, "unit": unit,
                            "colorMax": .5 if code >= 491 else max(float(np.percentile(finite, 99)), 1e-12),
                            "combined": code >= 491})
    levels = [{"id": f"{p // 100}hPa", "value": p // 100} for p in bundle["frames"][0]["pressures"]]
    times = []
    for cube, values in frames:
        times.append({"hf": cube["hf"], "validTime": cube["validTime"]})
        for k, level in enumerate(levels):
            for diagnostic in diagnostics:
                a = values[diagnostic["id"]][k]
                finite = a[np.isfinite(a)]
                field = {"type": "kim_turbulence_experiment_field", "experimental": True,
                         "algorithm": ALGORITHM, "revision": bundle["revision"],
                         "tmfc": bundle["tmfc"], "hf": cube["hf"], "validTime": cube["validTime"],
                         "grid": cube["grid"], "level": level, "diagnostic": diagnostic,
                         "values": finite_json(a),
                         "stats": {"valid": int(finite.size), "total": int(a.size),
                                   "max": float(finite.max()) if finite.size else None,
                                   "p95": float(np.percentile(finite, 95)) if finite.size else None}}
                target = out / f"hf{cube['hf']:03d}" / level["id"]
                target.mkdir(parents=True, exist_ok=True)
                (target / f"{diagnostic['id']}.json").write_text(json.dumps(field, ensure_ascii=False, allow_nan=False))
    manifest = {"type": "kim_turbulence_experiment_index", "experimental": True,
                "algorithm": ALGORITHM, "revision": bundle["revision"], "tmfc": bundle["tmfc"],
                "times": times, "levels": levels, "diagnostics": diagnostics,
                "grid": bundle["frames"][0]["grid"], "input": bundle["provenance"],
                "combination": json.loads((Path(__file__).parent / 'calibration.json').read_text()),
                "limitations": ["24 diagnostics, original log-normal coefficients and equal-weight CAT/MWT -> GTGMAX",
                                "Historical test data; inherited UM coefficients not recalibrated to regional KIM",
                                "Native humidity and 21 pressure layers; theta-grid regridding still approximated",
                                "Active main itfacomp41.f native region bounds, missing handling and final smoothing; no structure-function extrapolation",
                                "Regional boundaries masked; Fortran numerical parity not established"]}
    (out / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, allow_nan=False))
    print(json.dumps({"algorithm": ALGORITHM, "frames": len(times), "levels": len(levels), "diagnostics": len(diagnostics)}))


if __name__ == "__main__":
    raise SystemExit('Legacy approximate calculator disabled. Use calculate_python.py.')
