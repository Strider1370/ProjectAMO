"""Operational one-hour GKTG calculation; no Fortran or experiment dependency."""
import argparse
import json
from pathlib import Path
import numpy as np
from input_validation import validate_cube
from python_port import calculate

ALGORITHM = "kim-gktg-python-v5"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    cube = json.loads(args.input.read_text())
    shape = validate_cube(cube)
    products, _, internal = calculate(cube)
    values = products["gktg"]
    values[:, :10] = values[:, -10:] = np.nan
    values[:, :, :10] = values[:, :, -10:] = np.nan
    finite = values[np.isfinite(values)]
    if not finite.size or np.any((finite < 0) | (finite > 1.5)):
        raise ValueError("Invalid GKTG output")
    args.output.mkdir(parents=True, exist_ok=True)
    for k, pressure in enumerate(cube["pressures"]):
        data = [float(v) if np.isfinite(v) else None for v in values[k].ravel()]
        (args.output / f"{int(pressure)//100}hPa.json").write_text(json.dumps(data, allow_nan=False))
    (args.output / "checks.json").write_text(json.dumps({
        "algorithm": ALGORITHM, "shape": shape, "bounds": internal["bounds"],
        "diagnostics": 24, "fastmath": False, "fortranRuntime": False,
    }))


if __name__ == "__main__":
    main()
