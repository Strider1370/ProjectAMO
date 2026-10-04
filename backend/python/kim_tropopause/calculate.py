"""One forecast hour: KIM thermal tropopause and jet stream.

Input JSON: {grid, hf, validTime, pressures (hPa, descending), windPressures (hPa, descending),
fields: {T (K), hgt (m)} per pressure, {u, v (m/s)} per wind pressure; each level a flat ny*nx list}.
Output JSON: grids trop (hPa), tropT (degC), vmax (kt), pmax (hPa) as flat lists with null for
missing values, tropAboveTop (1 where the tropopause is above the model top), jet axis features and checks.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import jet
import thermal

ALGORITHM = "kim-tropopause-jet-v1"


def _cube(values, levels, shape, name, lo, hi):
    if len(values) != levels:
        raise ValueError(f"{name}: expected {levels} levels")
    a = np.array(values, dtype=float)
    if a.shape != (levels, shape[0] * shape[1]):
        raise ValueError(f"{name}: grid size mismatch")
    if not np.all(np.isfinite(a)) or np.any((a < lo) | (a > hi)):
        raise ValueError(f"{name}: missing or out-of-range values")
    return a.reshape(levels, *shape)


def validate(cube):
    grid = cube["grid"]
    shape = (int(grid["ny"]), int(grid["nx"]))
    pressures = np.array(cube["pressures"], dtype=float)
    winds = np.array(cube["windPressures"], dtype=float)
    for name, p in (("pressures", pressures), ("windPressures", winds)):
        if p.ndim != 1 or len(p) < 3 or np.any(np.diff(p) >= 0):
            raise ValueError(f"{name} must descend")
    if pressures[-1] > 100 or winds[-1] > jet.SEARCH_TOP_HPA or winds[0] < jet.SEARCH_BOTTOM_HPA:
        raise ValueError("pressure coverage too small")
    f = cube["fields"]
    temperature = _cube(f["T"], len(pressures), shape, "T", 150, 340)
    height = _cube(f["hgt"], len(pressures), shape, "hgt", -1000, 40000)
    if np.any(np.diff(height, axis=0) <= 0):
        raise ValueError("hgt must increase upward")
    u = _cube(f["u"], len(winds), shape, "u", -200, 200)
    v = _cube(f["v"], len(winds), shape, "v", -200, 200)
    return grid, shape, pressures, winds, temperature, height, u, v


def _flat(a, digits):
    return [round(float(x), digits) if np.isfinite(x) else None for x in a.ravel()]


def calculate(cube):
    grid, shape, pressures, winds, temperature, height, u, v = validate(cube)
    trop, trop_t, above = thermal.field(pressures, temperature, height)
    g = jet.Grid(float(grid["lonMin"]), float(grid["latMin"]), float(grid["dx"]), shape[1], shape[0])
    if abs(float(grid["dy"]) - g.step) > 1e-6:
        raise ValueError("grid must be square in degrees")
    vmax, pmax, features, checks = jet.jets(g, winds, u, v)
    return {
        "algorithm": ALGORITHM,
        "trop": _flat(trop, 1), "tropT": _flat(trop_t, 2), "tropAboveTop": [int(x) for x in above.ravel()],
        "vmax": _flat(vmax, 1), "pmax": _flat(pmax, 1),
        "jets": features,
        "checks": {**checks, "tropopauseFoundShare": round(float(np.isfinite(trop).mean()), 4),
                   "tropopauseAboveTopShare": round(float(above.mean()), 4)},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = calculate(json.loads(args.input.read_text()))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "result.json").write_text(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    main()
