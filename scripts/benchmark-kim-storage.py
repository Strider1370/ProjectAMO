#!/usr/bin/env python3
"""Isolated, lossless KIM JSON -> Zarr/NetCDF-4 benchmark (no API calls).

Install numpy, zarr, netCDF4, numcodecs and psutil in a disposable venv.
Output must be a new directory outside the source data. See kim-grid-scaling.md.
"""
import argparse
import collections
from datetime import datetime, timezone
import gc
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import resource
import statistics
import subprocess
import sys
import time


CONFIGS = {
    "nc_zlib1_c128": ("nc", "zlib", 1, 128),
    "zarr_zlib1_c128": ("zarr", "zlib", 1, 128),
    "zarr_zstd1_c128": ("zarr", "zstd", 1, 128),
    "nc_zlib4_c128": ("nc", "zlib", 4, 128),
    "nc_zlib1_c64": ("nc", "zlib", 1, 64),
    "zarr_zstd1_c64": ("zarr", "zstd", 1, 64),
}


def emit(event, **data):
    print(json.dumps({"event": event, **data}, allow_nan=False), flush=True)


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def libraries():
    import numpy as np
    import zarr
    import netCDF4
    import numcodecs
    zarr.config.set({"async.concurrency": 2, "threading.max_workers": 2})
    numcodecs.blosc.set_nthreads(1)
    return np, zarr, netCDF4, numcodecs


def numeric_arrays(document):
    """Replace only flat spatial number arrays; keep jets and all other metadata."""
    n = document["grid"]["nx"] * document["grid"]["ny"]
    found = {}

    def walk(value, parts):
        if (isinstance(value, list) and len(value) == n
                and all(v is None or isinstance(v, (int, float)) for v in value)):
            pointer = "/".join(parts)
            found[pointer] = value
            return {"$spatial_array": pointer}
        if isinstance(value, dict):
            return {k: walk(v, [*parts, k]) for k, v in value.items()}
        if isinstance(value, list):
            return [walk(v, [*parts, str(i)]) for i, v in enumerate(value)]
        return value

    return walk(document, []), found


def category(document):
    return {"kim_nwp_grid": "base", "kim_nwp_gktg": "gktg",
            "kim_nwp_tropopause": "trop", "kim_nwp_tropopause_upper": "upper"}.get(document.get("type"))


def array_key(kind, document, pointer):
    if kind == "base":
        return f"base/{document['level']['id']}/{pointer.split('/')[1]}"
    if kind == "gktg":
        return f"gktg/{document['level']['id']}/{pointer}"
    if kind == "upper":
        parts = pointer.split("/")
        return f"upper/p{document['levels'][int(parts[1])]['pressure']}/{parts[-1]}"
    return f"trop/{pointer}"


def source_records(source):
    # Avoid raw files, manifests and unrelated snapshots; read diagnostic run only.
    for path in sorted(source.rglob("*.json")):
        if "normalized" not in path.parts and not ("tropopause" in path.parts and "hf" in path.parent.name):
            continue
        document = json.loads(path.read_text())
        kind = category(document)
        if kind is not None:
            yield path, document, kind


def inspect(source, output):
    np, *_ = libraries()
    specs, records = {}, []
    totals = collections.defaultdict(lambda: {"files": 0, "json_bytes": 0, "values": 0, "nulls": 0})
    grid = None
    started = time.perf_counter()
    for path, document, kind in source_records(source):
        if grid is None:
            grid = document["grid"]
        if document["grid"] != grid:
            raise ValueError(f"mixed geometry: {path}")
        hf = int(document.get("hf", document.get("time", {}).get("hf", -1)))
        if not 0 <= hf <= 12:
            raise ValueError(f"unexpected hf {hf}: {path}")
        metadata, arrays = numeric_arrays(document)
        if not arrays:
            raise ValueError(f"no spatial arrays: {path}")
        refs = {}
        for pointer, values in arrays.items():
            key = array_key(kind, document, pointer)
            a = np.asarray(values, dtype=np.float64)
            finite = a[np.isfinite(a)]
            integer = not any(v is None or isinstance(v, float) for v in values)
            exact32 = bool(np.array_equal(a, a.astype(np.float32).astype(np.float64), equal_nan=True))
            spec = specs.setdefault(key, {"integer": True, "exact32": True, "min": None, "max": None, "hours": []})
            if hf in spec["hours"]:
                raise ValueError(f"duplicate array/hour {key} {hf}")
            spec["hours"].append(hf)
            spec["integer"] &= integer
            spec["exact32"] &= exact32
            if finite.size:
                lo, hi = float(finite.min()), float(finite.max())
                spec["min"] = lo if spec["min"] is None else min(lo, spec["min"])
                spec["max"] = hi if spec["max"] is None else max(hi, spec["max"])
            refs[pointer] = key
            totals[kind]["values"] += len(values)
            totals[kind]["nulls"] += sum(v is None for v in values)
        records.append({"path": str(path.relative_to(source)), "category": kind, "hf": hf,
                        "refs": refs, "metadata": metadata})
        totals[kind]["files"] += 1
        totals[kind]["json_bytes"] += path.stat().st_size
    if not records:
        raise ValueError("no supported KIM grid files")
    for key, spec in specs.items():
        if sorted(spec["hours"]) != list(range(13)):
            raise ValueError(f"incomplete forecast hours: {key}")
        if spec["integer"]:
            lo, hi = spec["min"], spec["max"]
            spec["dtype"] = "i2" if lo >= -32768 and hi <= 32767 else "i4" if lo >= -2147483648 and hi <= 2147483647 else "i8"
        else:
            spec["dtype"] = "f4" if spec["exact32"] else "f8"
        spec["shape"] = [13, grid["ny"], grid["nx"]]
    manifest = {"source": str(source), "grid": grid, "records": records, "arrays": specs,
                "groups": dict(totals), "inspect_seconds": time.perf_counter() - started,
                "precision": "exact existing JSON numeric values; null -> NaN; no new quantization",
                "layout": "product/level/variable with (forecast hour,y,x); chunks (1,c,c)"}
    save(output / "manifest.json", manifest)
    emit("inspect_complete", files=len(records), arrays=len(specs), groups=dict(totals))


def store_path(output, config):
    return output / config / ("data.nc" if CONFIGS[config][0] == "nc" else "data.zarr")


def create_store(output, config, manifest):
    np, zarr, nc, codecs = libraries()
    fmt, codec, level, block = CONFIGS[config]
    path = store_path(output, config)
    path.parent.mkdir(parents=True, exist_ok=False)
    root = nc.Dataset(path, "w", format="NETCDF4") if fmt == "nc" else zarr.open_group(str(path), mode="w", zarr_format=2)
    arrays = {}
    for key, spec in manifest["arrays"].items():
        shape = tuple(spec["shape"])
        chunks = (1, min(block, shape[1]), min(block, shape[2]))
        fill = 0 if spec["integer"] else float("nan")
        if fmt == "nc":
            parent, name = key.rsplit("/", 1)
            group = root.createGroup(parent) if parent not in root.groups else root.groups[parent]
            if not group.dimensions:
                for dim, length in zip(("forecast_hour", "y", "x"), shape):
                    group.createDimension(dim, length)
            a = group.createVariable(name, spec["dtype"], ("forecast_hour", "y", "x"),
                                     compression="zlib", complevel=level, shuffle=True,
                                     chunksizes=chunks, fill_value=fill)
            a.set_auto_maskandscale(False)
            a.set_var_chunk_cache(size=512 * 1024, nelems=101, preemption=0.75)
        else:
            if codec == "zstd":
                compressor = codecs.Blosc(cname="zstd", clevel=level, shuffle=codecs.Blosc.SHUFFLE)
                filters = None
            else:
                compressor = codecs.Zlib(level=level)
                filters = [codecs.Shuffle(elementsize=np.dtype(spec["dtype"]).itemsize)]
            a = root.create_array(key, shape=shape, dtype=spec["dtype"], chunks=chunks,
                                  compressor=compressor, filters=filters, fill_value=fill)
        arrays[key] = a
    # Metadata JSON contains small descriptive values and array references, never numeric grids.
    metadata = json.dumps({"grid": manifest["grid"], "records": manifest["records"]}, separators=(",", ":"))
    if fmt == "nc":
        root.setncattr("source_metadata_json", metadata)
        root.setncattr("precision_policy", manifest["precision"])
    else:
        root.attrs.update({"source_metadata_json": metadata, "precision_policy": manifest["precision"]})
    return root, arrays


def open_store(output, config, manifest, keys=None):
    _, zarr, nc, _ = libraries()
    selected = keys if keys is not None else manifest["arrays"]
    if CONFIGS[config][0] == "nc":
        root = nc.Dataset(store_path(output, config), "r")
        root.set_auto_maskandscale(False)
        arrays = {}
        for key in selected:
            parent, name = key.rsplit("/", 1)
            a = root[parent].variables[name]
            a.set_var_chunk_cache(size=512 * 1024, nelems=101, preemption=0.75)
            arrays[key] = a
    else:
        root = zarr.open_consolidated(str(store_path(output, config)), mode="r")
        arrays = {key: root[key] for key in selected}
    return root, arrays


def close_store(root, config):
    if CONFIGS[config][0] == "nc":
        root.close()


def disk_stats(path):
    files = [path] if path.is_file() else [p for p in path.rglob("*") if p.is_file()]
    return {"logical_bytes": sum(p.stat().st_size for p in files),
            "allocated_bytes": sum(p.stat().st_blocks * 512 for p in files), "files": len(files)}


def convert(source, output, config, manifest):
    np, zarr, *_ = libraries()
    start = time.perf_counter()
    root, arrays = create_store(output, config, manifest)
    setup_seconds = time.perf_counter() - start
    for i, record in enumerate(manifest["records"]):
        d = json.loads((source / record["path"]).read_text())
        _, values = numeric_arrays(d)
        for pointer, key in record["refs"].items():
            spec = manifest["arrays"][key]
            a = np.asarray(values[pointer], dtype=spec["dtype"]).reshape(spec["shape"][1:])
            arrays[key][record["hf"], :, :] = a
        if (i + 1) % 100 == 0:
            emit("write_progress", config=config, files=i + 1)
    close_store(root, config)
    if CONFIGS[config][0] == "zarr":
        zarr.consolidate_metadata(str(store_path(output, config)))
    # Write result only after buffered writes complete. Disk/controller cache is not flushed globally.
    write_seconds = time.perf_counter() - start
    save(output / config / "write.json", {"write_seconds": write_seconds, "setup_seconds": setup_seconds,
         "peak_rss_mib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
         **disk_stats(store_path(output, config))})
    emit("write_complete", config=config, seconds=write_seconds)


def verify(source, output, config, manifest):
    np, *_ = libraries()
    root, arrays = open_store(output, config, manifest)
    expected_metadata = json.dumps({"grid": manifest["grid"], "records": manifest["records"]}, separators=(",", ":"))
    actual_metadata = root.getncattr("source_metadata_json") if CONFIGS[config][0] == "nc" else root.attrs["source_metadata_json"]
    assert actual_metadata == expected_metadata, "metadata changed"
    digest, count, nulls = hashlib.sha256(), 0, 0
    for record in manifest["records"]:
        d = json.loads((source / record["path"]).read_text())
        meta, values = numeric_arrays(d)
        assert meta == record["metadata"], "source metadata changed"
        for pointer, key in record["refs"].items():
            wanted = np.asarray(values[pointer], dtype=np.float64).reshape(manifest["arrays"][key]["shape"][1:])
            got = np.asarray(arrays[key][record["hf"], :, :], dtype=np.float64)
            assert np.array_equal(wanted, got, equal_nan=True), f"numeric difference: {record['path']} {pointer}"
            assert np.array_equal(np.isnan(wanted), np.isnan(got)), "missing values changed"
            count += got.size
            nulls += int(np.isnan(got).sum())
            digest.update(key.encode())
            digest.update(got.astype("<f8").tobytes())
    close_store(root, config)
    result = {"all_values_exact": True, "metadata_exact": True, "values": count, "nulls": nulls,
              "sha256": digest.hexdigest(), "files": len(manifest["records"])}
    save(output / config / "verify.json", result)
    emit("verify_complete", config=config, **result)


def query_keys(manifest, query):
    pressure_levels = sorted({k.split("/")[1] for k in manifest["arrays"]
                              if k.startswith("base/") and k.split("/")[1].endswith("hPa")},
                             key=lambda v: -float(v[:-3]))
    if query in ("compute_full", "compute_tile"):
        return [f"base/{level}/{var}" for level in pressure_levels for var in ("T", "u", "v", "hgt", "rh", "q")]
    if query == "map":
        return ["base/850hPa/T", "base/850hPa/u", "base/850hPa/v", "base/850hPa/hgt",
                "gktg/850hPa/gktg", "gktg/850hPa/geopotentialHeight"]
    if query == "point":
        return ["base/850hPa/T", "base/850hPa/u", "base/850hPa/v", "base/850hPa/hgt", "gktg/850hPa/gktg"]
    return list(manifest["arrays"])


def read_benchmark(source, output, config, manifest, query, repeats):
    np, *_ = libraries()
    keys = query_keys(manifest, query)
    hf = 6
    region = (slice(0, 128), slice(0, 128)) if query == "compute_tile" else (84, 102) if query == "point" else (slice(None), slice(None))
    samples = []
    for repeat in range(repeats):
        start = time.perf_counter()
        root, arrays = (None, None) if config == "json" else open_store(output, config, manifest, keys)
        open_seconds = time.perf_counter() - start
        loaded = []
        if config == "json":
            selected = set(keys)
            for record in manifest["records"]:
                if record["hf"] != hf or not selected.intersection(record["refs"].values()):
                    continue
                d = json.loads((source / record["path"]).read_text())
                _, values = numeric_arrays(d)
                for pointer, key in record["refs"].items():
                    if key in selected:
                        a = np.asarray(values[pointer], dtype=manifest["arrays"][key]["dtype"]).reshape(manifest["arrays"][key]["shape"][1:])
                        loaded.append(np.array(a[region], copy=True))
        else:
            for key in keys:
                loaded.append(np.array(arrays[key][(hf, *region)], copy=True))
            close_store(root, config)
        elapsed = time.perf_counter() - start
        values_count = sum(a.size for a in loaded)
        returned_bytes = sum(a.nbytes for a in loaded)
        checksum = sum(float(np.nansum(a, dtype=np.float64)) for a in loaded)
        samples.append({"seconds": elapsed, "open_seconds": open_seconds, "returned_bytes": returned_bytes,
                        "values": values_count, "checksum": checksum})
        del loaded, arrays, root
        gc.collect()
    target = output / config if config != "json" else output / "json"
    target.mkdir(exist_ok=True)
    result = {"query": query, "repeats": repeats, "samples": samples,
              "median_seconds": statistics.median(s["seconds"] for s in samples),
              "peak_rss_mib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024}
    save(target / f"read-{query}.json", result)
    emit("read_complete", config=config, query=query, seconds=result["median_seconds"], peak_rss_mib=result["peak_rss_mib"])


def run_child(args, action, config=None, query=None):
    import psutil
    import urllib.request
    cmd = [sys.executable, str(Path(__file__).resolve()), "--source", str(args.source), "--output", str(args.output),
           "--action", action, "--repeats", str(args.repeats)]
    if config:
        cmd += ["--config", config]
    if query:
        cmd += ["--query", query]
    with (args.output / "events.jsonl").open("a") as log:
        child = subprocess.Popen(cmd, stdout=log, stderr=log, env={**os.environ, "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1"})
        floor = float("inf")
        t0 = time.monotonic()
        last_health, failures, health = 0, 0, []
        while child.poll() is None:
            available = psutil.virtual_memory().available
            floor = min(floor, available)
            if time.monotonic() - last_health >= 10:
                last_health = time.monotonic()
                try:
                    with urllib.request.urlopen("http://127.0.0.1:3001/api/health", timeout=5) as response:
                        status = response.status
                    failures = 0 if status == 200 else failures + 1
                    health.append({"status": status, "seconds": time.monotonic() - last_health})
                except Exception:
                    failures += 1
                    health.append({"status": 0, "seconds": time.monotonic() - last_health})
            if available < 192 * 1024**2 or psutil.disk_usage(args.output).free < 2 * 1024**3 or time.monotonic() - t0 > 900 or failures >= 3:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
                raise RuntimeError(f"resource guard stopped {action} {config} {query}")
            time.sleep(0.25)
        if child.returncode:
            raise RuntimeError(f"child failed: {action} {config} {query}; see events.jsonl")
    emit("stage_complete", action=action, config=config, query=query, min_host_available_mib=floor / 1024**2)
    return {"action": action, "config": config, "query": query, "min_host_available_mib": floor / 1024**2,
            "wall_seconds": time.monotonic() - t0, "health": health}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--action", choices=["run", "inspect", "write", "verify", "read"], default="run")
    parser.add_argument("--config", choices=["json", *CONFIGS])
    parser.add_argument("--query", choices=["map", "point", "compute_full", "compute_tile", "all_fields"])
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--configs", nargs="+", choices=list(CONFIGS), default=list(CONFIGS))
    args = parser.parse_args()
    args.source, args.output = args.source.resolve(), args.output.resolve()
    if not args.source.is_dir():
        parser.error("source directory does not exist")
    if args.repeats < 1:
        parser.error("repeats must be positive")
    if args.source == args.output or args.source in args.output.parents or args.output in args.source.parents:
        parser.error("source and output must be separate directories")
    if args.action in ("write", "verify") and (args.config is None or args.config == "json"):
        parser.error("write/verify requires a binary format config")
    if args.action == "read" and (args.config is None or args.query is None):
        parser.error("read requires config and query")
    if args.action == "run":
        args.output.mkdir(parents=True, exist_ok=False)
        versions = {name: importlib.metadata.version(name) for name in ("numpy", "zarr", "netCDF4", "numcodecs", "psutil")}
        save(args.output / "environment.json", {"started_at_utc": datetime.now(timezone.utc).isoformat(),
             "python": sys.version, "versions": versions,
             "cpu_count": os.cpu_count(), "configs": {k: CONFIGS[k] for k in args.configs},
             "notes": "Fresh child per stage/query. Sequential reads; warm OS cache possible, no global drop_caches. RSS includes Python/library baseline. No weather computation included."})
        stages = [run_child(args, "inspect")]
        queries = ["map", "point", "compute_full", "compute_tile", "all_fields"]
        for query in queries:
            stages.append(run_child(args, "read", "json", query))
        for config in args.configs:
            stages.append(run_child(args, "write", config))
            stages.append(run_child(args, "verify", config))
        # Alternate formats per query; each query runs in its own fresh process.
        for query in queries:
            for config in args.configs:
                stages.append(run_child(args, "read", config, query))
        manifest = json.loads((args.output / "manifest.json").read_text())
        results = {config: {"write": json.loads((args.output / config / "write.json").read_text()),
                          "verify": json.loads((args.output / config / "verify.json").read_text()),
                          "reads": {query: json.loads((args.output / config / f"read-{query}.json").read_text()) for query in queries}}
                   for config in args.configs}
        json_reads = {query: json.loads((args.output / "json" / f"read-{query}.json").read_text()) for query in queries}
        checksums = {r["verify"]["sha256"] for r in results.values()}
        assert len(checksums) == 1, "formats contain different values"
        for config, result in results.items():
            for query in queries:
                for sample in result["reads"][query]["samples"]:
                    expected = json_reads[query]["samples"][0]
                    assert sample["values"] == expected["values"]
                    assert abs(sample["checksum"] - expected["checksum"]) <= max(1e-6, abs(expected["checksum"]) * 1e-12)
        save(args.output / "summary.json", {"groups": manifest["groups"], "grid": manifest["grid"],
             "arrays": len(manifest["arrays"]), "dtype_counts": dict(collections.Counter(s["dtype"] for s in manifest["arrays"].values())),
             "results": results, "json_reads": json_reads, "stages": stages, "all_checks_passed": True})
        emit("benchmark_complete", output=str(args.output))
        return
    if args.action == "inspect":
        inspect(args.source, args.output)
        return
    manifest = json.loads((args.output / "manifest.json").read_text())
    if args.action == "write":
        convert(args.source, args.output, args.config, manifest)
    elif args.action == "verify":
        verify(args.source, args.output, args.config, manifest)
    elif args.action == "read":
        read_benchmark(args.source, args.output, args.config, manifest, args.query, args.repeats)


if __name__ == "__main__":
    main()
