#!/usr/bin/env python3
"""Diagnostic binary-input KIM compute capacity test; never publishes live data.

Requires the disposable storage benchmark venv plus the operational NumPy/Numba versions.
Arbitrary-size engine calls and global tile context are diagnostic adapters, not production APIs.
"""
import argparse
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import time
import types

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("NUMBA_NUM_THREADS", "1")


def save(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def emit(event, **value):
    print(json.dumps({"event": event, **value}, allow_nan=False), flush=True)


def libs():
    import numpy as np
    import netCDF4 as nc
    import zarr
    import numcodecs
    nc.set_chunk_cache(size=128 * 1024, nelems=101, preemption=.75)
    zarr.config.set({"async.concurrency": 2, "threading.max_workers": 2})
    numcodecs.blosc.set_nthreads(1)
    return np, nc, zarr, numcodecs


def raw(path):
    np, *_ = libs()
    text = path.read_bytes().decode("euc-kr", errors="replace")
    numbers = np.fromstring(" ".join(line for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")), sep=" ")
    return {"encoding": "raw", "values": numbers.tolist()}


def current_fields(source, hf):
    for path in sorted((source / "normalized" / f"hf{hf:03}").glob("*/grid.json")):
        d = json.loads(path.read_text())
        if d["level"]["kind"] != "pressure":
            continue
        for name in ("T", "u", "v", "w", "hgt", "q"):
            v = d["variables"].get(name)
            if v is None:
                v = raw(source / "raw/gktg" / f"hf{hf}-{name}-{d['level']['value']}.txt")
            yield f"base/{d['level']['id']}/{name}", d["grid"], v
    upper = json.loads(next((source / "derived/tropopause" / f"hf{hf:03}").glob("*.upper.json")).read_text())
    for level in upper["levels"]:
        for name in ("T", "hgt"):
            yield f"upper/p{level['pressure']}/{name}", upper["grid"], {"encoding": "raw", "values": level[name]}
    for name in ("ps", "hpbl", "topo"):
        path = next((source / "raw/gktg").glob(f"hf*-{name}-0.txt")) if name == "topo" else source / "raw/gktg" / f"hf{hf}-{name}-0.txt"
        yield f"surface/{name}", upper["grid"], raw(path)


def prepare(args):
    np, nc, zarr, codecs = libs()
    out = args.output
    out.mkdir(parents=True, exist_ok=False)
    fields = current_fields(args.source, args.hf) if args.dataset == "current" else (
        (d["id"], d["grid"], d) for d in (json.loads(p.read_text()) for p in sorted((args.source / "fields").rglob("*.json"))))
    roots = {"nc": nc.Dataset(out / "input.nc", "w"), "zarr": zarr.open_group(str(out / "input.zarr"), mode="w", zarr_format=2)}
    metadata, grid = {}, None
    start = time.perf_counter()
    for key, shape, variable in fields:
        if grid is None:
            grid = shape
            for name, size in [("y", grid["ny"]), ("x", grid["nx"])]:
                roots["nc"].createDimension(name, size)
        if shape != grid:
            raise ValueError("mixed geometry")
        packed = variable.get("encoding") == "int16-scaled-json-v1"
        a = np.asarray(variable["values"], dtype="i2" if packed else "f8").reshape(grid["ny"], grid["nx"])
        if not np.isfinite(a).all():
            raise ValueError(f"invalid input: {key}")
        spec = {k: variable[k] for k in ("encoding", "unit", "scale", "offset") if k in variable}
        spec["dtype"] = a.dtype.str
        metadata[key] = spec
        parent, name = key.rsplit("/", 1)
        group = roots["nc"].createGroup(parent)
        v = group.createVariable(name, a.dtype, ("y", "x"), compression="zlib", complevel=4, shuffle=True,
                                 chunksizes=(min(128, grid["ny"]), min(128, grid["nx"])), fill_value=False)
        v.set_auto_maskandscale(False)
        v.set_var_chunk_cache(size=128 * 1024, nelems=101, preemption=.75)
        v[:] = a
        z = roots["zarr"].create_array(key, shape=a.shape, dtype=a.dtype,
            chunks=(min(128, grid["ny"]), min(128, grid["nx"])),
            compressor=codecs.Blosc(cname="zstd", clevel=1, shuffle=codecs.Blosc.SHUFFLE), fill_value=None)
        z[:] = a
    roots["nc"].setncattr("source_metadata_json", json.dumps(metadata))
    roots["nc"].close()
    roots["zarr"].attrs["source_metadata_json"] = json.dumps(metadata)
    zarr.consolidate_metadata(str(out / "input.zarr"))
    save(out / "manifest.json", {"grid": grid, "arrays": metadata, "hf": args.hf, "dataset": args.dataset,
                                 "source": str(args.source), "prepare_seconds": time.perf_counter() - start})
    emit("prepared", dataset=args.dataset, arrays=len(metadata), seconds=time.perf_counter() - start)


class Reader:
    def __init__(self, directory, fmt):
        self.np, nc, zarr, _ = libs()
        self.meta = json.loads((directory / "manifest.json").read_text())
        self.fmt = fmt
        self.root = nc.Dataset(directory / "input.nc", "r") if fmt == "nc" else zarr.open_consolidated(str(directory / "input.zarr"), mode="r")
        if fmt == "nc":
            self.root.set_auto_maskandscale(False)

    def read(self, key, window, dtype="f4"):
        np = self.np
        y0, y1, x0, x1 = window
        if self.fmt == "nc":
            parent, name = key.rsplit("/", 1)
            v = self.root[parent].variables[name]
            v.set_var_chunk_cache(size=128 * 1024, nelems=101, preemption=.75)
        else:
            v = self.root[key]
        a = np.asarray(v[y0:y1, x0:x1])
        spec = self.meta["arrays"][key]
        if spec.get("encoding") == "int16-scaled-json-v1":
            a = a.astype("f8") * spec["scale"] + spec.get("offset", 0)
        return a.astype(dtype)

    def close(self):
        if self.fmt == "nc":
            self.root.close()


def pressure_levels(meta):
    return sorted({int(k.split("/")[1][:-3]) for k in meta["arrays"] if k.startswith("base/")}, reverse=True)


def validate_arrays(cube, kind):
    np, *_ = libs()
    grid = cube["grid"]
    if min(grid["ny"], grid["nx"]) < 24:
        raise ValueError("diagnostic window too small")
    for key, a in cube["fields"].items():
        if a.shape[1:] != (grid["ny"], grid["nx"]) or not np.isfinite(a).all():
            raise ValueError(f"incomplete cube {key}")
    if np.any((cube["fields"]["T"] <= 150) | (cube["fields"]["T"] >= 350)):
        raise ValueError("temperature range")
    if kind == "gktg" and np.any((cube["fields"]["q"] < 0) | (cube["fields"]["q"] >= .1)):
        raise ValueError("humidity range")


def load_cube(reader, window, kind):
    np = reader.np
    y0, y1, x0, x1 = window
    full = reader.meta["grid"]
    dx = (full["lonMax"] - full["lonMin"]) / (full["nx"] - 1)
    dy = (full["latMax"] - full["latMin"]) / (full["ny"] - 1)
    grid = {"nx": x1 - x0, "ny": y1 - y0, "lonMin": full["lonMin"] + x0 * dx,
            "lonMax": full["lonMin"] + (x1 - 1) * dx, "latMin": full["latMin"] + y0 * dy,
            "latMax": full["latMin"] + (y1 - 1) * dy, "dx": full.get("dx", dx), "dy": full.get("dy", dy)}
    levels = pressure_levels(reader.meta)
    names = ("T", "u", "v", "w", "hgt", "q") if kind == "gktg" else ("T", "hgt", "u", "v")
    fields = {}
    for name in names:
        parts = [reader.read(f"base/{level}hPa/{name}", window, "f4" if kind == "gktg" else "f8") for level in levels]
        if kind == "trop" and name in ("T", "hgt"):
            parts.extend(reader.read(f"upper/p{level}/{name}", window, "f8") for level in (100, 70))
        fields[name] = np.stack(parts)
    result = {"grid": grid, "fields": fields, "pressures": np.asarray(levels, dtype="f4") * (100 if kind == "gktg" else 1)}
    if kind == "gktg":
        result["surface"] = {name: reader.read(f"surface/{name}", window) for name in ("ps", "hpbl", "topo")}
    else:
        result["pressures"] = np.asarray([*levels, 100, 70], dtype="f8")
        result["windPressures"] = np.asarray(levels, dtype="f8")
    validate_arrays(result, kind)
    return result


def engines(repo, kind):
    if kind == "gktg":
        sys.path.insert(0, str(repo / "backend/python/kim_turbulence"))
        import python_port
        return python_port
    sys.path.insert(0, str(repo / "backend/python/kim_tropopause"))
    import thermal
    import jet
    return thermal, jet


def global_context(reader, repo):
    """Small-block reductions preserving the whole-domain theta range and height bands."""
    np = reader.np
    port = engines(repo, "gktg")
    levels = pressure_levels(reader.meta)
    grid = reader.meta["grid"]
    from python_core import smooth, D, EPS, KAPPA, F
    from python_combine import bounds
    lo, hi = float("inf"), -float("inf")
    for y0 in range(10, grid["ny"] - 10, 128):
        for x0 in range(10, grid["nx"] - 10, 128):
            y1, x1 = min(y0 + 128, grid["ny"] - 10), min(x0 + 128, grid["nx"] - 10)
            win = (y0 - 2, y1 + 2, x0 - 2, x1 + 2)
            q = np.stack([reader.read(f"base/{p}hPa/q", win) for p in levels]).astype("f8")
            t = np.stack([reader.read(f"base/{p}hPa/T", win) for p in levels])
            qm = smooth((q / (D(1) - q)).astype("f4"), 1, 1)
            tv = (t.astype("f8") * ((D(1) + qm.astype("f8") / EPS) / (D(1) + qm.astype("f8")))).astype("f4")
            rp = (D(100000) / (np.asarray(levels, dtype="f4")[:, None, None] * F(100)).astype("f8")) ** KAPPA
            theta = (tv * rp.astype("f4"))[:, 2:-2, 2:-2]
            lo, hi = min(lo, float(theta.min())), max(hi, float(theta.max()))
    strip = np.stack([reader.read(f"base/{p}hPa/hgt", (10, grid["ny"] - 10, 10, 12)) for p in levels])
    # bounds scans the two westernmost valid columns; translating to a 2-column mask is exact.
    bands = bounds(strip, np.ones(strip.shape[1:], dtype=bool))
    return {"theta_min": lo, "theta_max": hi, "bands": bands}


def install_tile_context(port, full, window, context):
    """Private diagnostic adapter. Keep global float32 geometry, theta surfaces and calibration bands."""
    import numpy as np
    from python_core import Geometry, F, D, RE, regular
    y0, y1, x0, x1 = window
    lat = F(full["latMin"]) + (F(full["latMax"]) - F(full["latMin"])) * np.arange(full["ny"], dtype="f4") / F(full["ny"] - 1)
    dx = F(RE * D(F(full["lonMax"]) - F(full["lonMin"])) * np.pi / D(180) / D(full["nx"] - 1))
    dy = F(RE * D(F(full["latMax"]) - F(full["latMin"])) * np.pi / D(180) / D(full["ny"] - 1))
    class RegionalGeometry(Geometry):
        def __init__(self, grid, z, halo=10):
            super().__init__(grid, z, halo)
            self.mx = (D(1) / np.cos(lat[y0:y1].astype("f8") * np.pi / D(180))).astype("f4")[None, :, None]
            self.f = (D(F(1.45444e-4)) * np.sin(lat[y0:y1].astype("f8") * np.pi / D(180))).astype("f4")[None, :, None]
            self.dx, self.dy = dx, dy
            self.zx, self.zy = regular(z, dx / self.mx, 2), regular(z, dy, 1)
    port.Geometry = RegionalGeometry
    port.bounds = lambda height, mask: [tuple(v) for v in context["bands"]]
    import python_theta
    class NumpyWithRange:
        def __getattr__(self, name):
            return getattr(np, name)
        def nanmin(self, a):
            return context["theta_min"]
        def nanmax(self, a):
            return context["theta_max"]
    globals_for_theta = {**python_theta.front_theta.__globals__, "np": NumpyWithRange()}
    port.front_theta = types.FunctionType(python_theta.front_theta.__code__, globals_for_theta)


def execute(args):
    np, *_ = libs()
    reader = Reader(args.source, args.format)
    meta = reader.meta
    window = args.window or [0, meta["grid"]["ny"], 0, meta["grid"]["nx"]]
    start = time.perf_counter()
    cube = load_cube(reader, window, args.kind)
    input_seconds = time.perf_counter() - start
    reader.close()
    if args.kind == "gktg":
        port = engines(args.repo, "gktg")
        if args.context:
            install_tile_context(port, meta["grid"], window, json.loads(args.context.read_text()))
        calc_start = time.perf_counter()
        products, stages, internal = port.calculate(cube)
        values = products["gktg"]
        values[:, :10] = values[:, -10:] = np.nan
        values[:, :, :10] = values[:, :, -10:] = np.nan
        data = {"gktg": values}
        checks = {"bands": internal["bounds"]}
    else:
        thermal, jet = engines(args.repo, "trop")
        calc_start = time.perf_counter()
        f = cube["fields"]
        trop, temp, above = thermal.field(cube["pressures"], f["T"], f["hgt"])
        grid = cube["grid"]
        g = jet.Grid(grid["lonMin"], grid["latMin"], grid["dx"], grid["nx"], grid["ny"])
        vmax, pmax, features, checks = jet.jets(g, cube["windPressures"], f["u"], f["v"])
        data = {"trop": trop, "tropT": temp, "tropAboveTop": above, "vmax": vmax, "pmax": pmax}
        checks["jets"] = features
    calculation_seconds = time.perf_counter() - calc_start
    args.output.mkdir(parents=True, exist_ok=True)
    np.savez(args.output / "result.npz", **data)
    save(args.output / "result.json", {"format": args.format, "kind": args.kind, "window": window,
         "shape": [cube["grid"]["ny"], cube["grid"]["nx"]], "input_seconds": input_seconds,
         "calculation_seconds": calculation_seconds, "elapsed_seconds": time.perf_counter() - start,
         "peak_rss_mib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
         "valid_values": {k: int(np.isfinite(v).sum()) for k, v in data.items()}, "checks": checks})
    emit("calculated", kind=args.kind, format=args.format, window=window, seconds=calculation_seconds)


def make_context(args):
    reader = Reader(args.source, args.format)
    result = global_context(reader, args.repo)
    reader.close()
    save(args.output, result)
    emit("global_context", **result)


def supervise(commands, output, reserve_mib=512, worker_mib=600, timeout=300):
    """Queue experiment: memory cap applies to the SUM of diagnostic workers only."""
    import psutil
    import urllib.request
    output.mkdir(parents=True, exist_ok=False)
    samples, health, reason, workers = [], [], None, []
    start, last_health = time.monotonic(), 0
    with (output / "stdout.log").open("w") as log:
        for command in commands:
            workers.append(subprocess.Popen(command, stdout=log, stderr=log))
        while any(p.poll() is None for p in workers):
            now = time.monotonic()
            rss = swap = 0
            for child in workers:
                if child.poll() is not None:
                    continue
                try:
                    p = psutil.Process(child.pid)
                    rss += p.memory_info().rss
                    status = Path(f"/proc/{child.pid}/status").read_text()
                    swap += next((int(line.split()[1]) * 1024 for line in status.splitlines() if line.startswith("VmSwap:")), 0)
                except (psutil.NoSuchProcess, FileNotFoundError, ProcessLookupError):
                    pass
            available = psutil.virtual_memory().available
            samples.append({"t": now - start, "worker_rss_mib": rss / 1024**2,
                            "worker_swap_mib": swap / 1024**2, "host_available_mib": available / 1024**2})
            if now - last_health >= 5:
                last_health = now
                try:
                    with urllib.request.urlopen("http://127.0.0.1:3001/api/health", timeout=5) as response:
                        status = response.status
                except Exception:
                    status = 0
                health.append({"status": status, "seconds": time.monotonic() - now})
            if available < reserve_mib * 1024**2:
                reason = "host_memory_reserve"
            elif rss > worker_mib * 1024**2:
                reason = "worker_memory_budget"
            elif swap > 32 * 1024**2:
                reason = "worker_swap_budget"
            elif now - start > timeout:
                reason = "diagnostic_timeout"
            elif len(health) >= 2 and all(h["status"] != 200 for h in health[-2:]):
                reason = "health_failure"
            if reason:
                for p in workers:
                    if p.poll() is None:
                        p.terminate()
                break
            time.sleep(.025)
        for p in workers:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait()
    result = {"outcome": "guard_stopped" if reason else "success" if all(p.returncode == 0 for p in workers) else "failed",
              "reason": reason, "codes": [p.returncode for p in workers], "seconds": time.monotonic() - start,
              "peak_worker_rss_mib": max(s["worker_rss_mib"] for s in samples),
              "peak_worker_swap_mib": max(s["worker_swap_mib"] for s in samples),
              "min_host_available_mib": min(s["host_available_mib"] for s in samples), "health": health}
    save(output / "supervision.json", result)
    save(output / "samples.json", samples)
    emit("supervised", path=str(output), **result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "execute", "context", "supervise"])
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--dataset", choices=["current", "expanded"])
    parser.add_argument("--hf", type=int, default=6)
    parser.add_argument("--kind", choices=["gktg", "trop"])
    parser.add_argument("--format", choices=["nc", "zarr"], default="nc")
    parser.add_argument("--context", type=Path)
    parser.add_argument("--window", type=int, nargs=4, metavar=("Y0", "Y1", "X0", "X1"))
    parser.add_argument("--commands", type=Path)
    parser.add_argument("--reserve-mib", type=int, default=512)
    parser.add_argument("--worker-mib", type=int, default=600)
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    if args.action == "prepare":
        prepare(args)
    elif args.action == "context":
        make_context(args)
    elif args.action == "execute":
        execute(args)
    else:
        supervise(json.loads(args.commands.read_text()), args.output, args.reserve_mib, args.worker_mib, args.timeout)


if __name__ == "__main__":
    main()
