"""Operational one-hour GKTG calculation; no Fortran or experiment dependency.

입력: job.json(격자·기압면 Pa·파일 이름)과 Node가 쓴 float32 배열 파일
  cube.f32    (u, v, w, T, q, hgt) × 기압면 × y × x
  surface.f32 (ps, topo, hpbl) × y × x
출력: gktg.f32(기압면 × y × x, 결측 NaN)과 checks.json. 블록마다 stdout에 진행 한 줄을 쓴다.

영역이 192×192보다 크면 192×192 창(가장자리 24칸 겹침, 결과로 쓰는 안쪽 144×144)으로 나눠 차례로 계산한다.
온위 범위와 고도 구간은 영역 전체에서 먼저 구해 모든 블록에 넣는다. 이렇게 이어 붙인 결과는 영역 전체를
한 번에 계산한 결과와 같다(2026-10-07 확대 영역 552만여 값 차이 0). 작은 영역(한반도)은 한 번에 계산한다.
"""
import argparse
import gc
import json
import os
from pathlib import Path
import numpy as np
from input_validation import validate_cube
from python_combine import bounds
from python_port import calculate, theta_from

ALGORITHM = "kim-gktg-python-v5"
FIELDS = ("u", "v", "w", "T", "q", "hgt")
SURFACE = ("ps", "topo", "hpbl")
WINDOW, HALO = 192, 24
CORE = WINDOW - 2 * HALO
EDGE = 10  # 계산 마스크(Geometry halo)와 표출 마스크의 외곽 칸 수


def plan_blocks(ny, nx):
    """[(결과로 쓸 안쪽 범위, 읽을 창)] — 둘 다 (y0, y1, x0, x1)."""
    if ny * nx <= WINDOW * WINDOW:
        return [((0, ny, 0, nx), (0, ny, 0, nx))]
    blocks = []
    for y0 in range(0, ny, CORE):
        for x0 in range(0, nx, CORE):
            y1, x1 = min(y0 + CORE, ny), min(x0 + CORE, nx)
            blocks.append(((y0, y1, x0, x1), (max(y0 - HALO, 0), min(y1 + HALO, ny), max(x0 - HALO, 0), min(x1 + HALO, nx))))
    return blocks


class Arrays:
    """float32 배열 파일에서 창만 읽는다. memmap은 읽은 쪽이 프로세스 메모리로 계속 잡혀(확대 영역 약 +220 MB)
    블록 하나의 메모리 상한을 넘기므로, 필요한 행만 읽어 복사하고 버린다."""

    def __init__(self, path, count, ny, nx):
        self.fd = os.open(path, os.O_RDONLY)
        self.count, self.ny, self.nx = count, ny, nx
        if os.fstat(self.fd).st_size != count * ny * nx * 4:
            raise ValueError(f"Unexpected input size: {path.name}")

    def read(self, index, y0, y1, x0, x1):
        start = (index * self.ny + y0) * self.nx * 4
        raw = os.pread(self.fd, (y1 - y0) * self.nx * 4, start)
        return np.frombuffer(raw, dtype="<f4").reshape(y1 - y0, self.nx)[:, x0:x1].astype("f4")

    def close(self):
        os.close(self.fd)


def write_block(fd, values, ny, nx, y0, x0):
    """블록 결과(기압면 × 행 × 열)를 영역 전체 결과 파일의 제자리에 쓴다. 영역 전체 배열을 메모리에 두지 않는다."""
    nz, rows, cols = values.shape
    for k in range(nz):
        for j in range(rows):
            os.pwrite(fd, values[k, j].astype("<f4").tobytes(), ((k * ny + y0 + j) * nx + x0) * 4)


def read_levels(arrays, field, nz, y0, y1, x0, x1):
    return np.stack([arrays.read(field * nz + k, y0, y1, x0, x1) for k in range(nz)])


def window_grid(grid, window):
    y0, y1, x0, x1 = window
    dx = (grid["lonMax"] - grid["lonMin"]) / (grid["nx"] - 1)
    dy = (grid["latMax"] - grid["latMin"]) / (grid["ny"] - 1)
    return {**grid, "nx": x1 - x0, "ny": y1 - y0, "lonMin": grid["lonMin"] + x0 * dx, "lonMax": grid["lonMin"] + (x1 - 1) * dx,
            "latMin": grid["latMin"] + y0 * dy, "latMax": grid["latMin"] + (y1 - 1) * dy}


def domain_context(cube, pressures, ny, nx, rows=64):
    """영역 전체 계산이 쓰는 두 값: 계산 마스크 안 온위의 최솟값·최댓값, 서쪽 두 열로 정하는 고도 구간."""
    nz = len(pressures)
    lo, hi = np.inf, -np.inf
    for y0 in range(EDGE, ny - EDGE, rows):
        y1 = min(y0 + rows, ny - EDGE)
        # 혼합비 평활이 위아래 한 칸을 보므로 두 칸 여유를 두고 읽는다.
        a, b = max(y0 - 2, 0), min(y1 + 2, ny)
        q, t = (read_levels(cube, FIELDS.index(name), nz, a, b, 0, nx) for name in ("q", "T"))
        theta = theta_from(q, t, pressures)[3][:, y0 - a:y1 - a, EDGE:nx - EDGE]
        lo, hi = min(lo, float(theta.min())), max(hi, float(theta.max()))
    # bounds()는 계산 마스크의 가장 서쪽 두 열만 본다.
    strip = read_levels(cube, FIELDS.index("hgt"), nz, EDGE, ny - EDGE, EDGE, EDGE + 2)
    bands = bounds(strip, np.ones(strip.shape[1:], dtype=bool))
    return {"theta_range": (lo, hi), "bands": [tuple(int(k) for k in band) for band in bands]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("job", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    job = json.loads(args.job.read_text())
    grid, pressures = job["grid"], job["pressures"]
    nz, ny, nx = len(pressures), int(grid["ny"]), int(grid["nx"])
    cube = Arrays(args.job.parent / job["cube"], len(FIELDS) * nz, ny, nx)
    surface = Arrays(args.job.parent / job["surface"], len(SURFACE), ny, nx)
    blocks = plan_blocks(ny, nx)
    context = domain_context(cube, pressures, ny, nx) if len(blocks) > 1 else None
    args.output.mkdir(parents=True, exist_ok=True)
    out = os.open(args.output / "gktg.f32", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    os.ftruncate(out, nz * ny * nx * 4)
    bands, finite = None, 0
    for number, ((cy0, cy1, cx0, cx1), (y0, y1, x0, x1)) in enumerate(blocks, 1):
        piece = {"grid": window_grid(grid, (y0, y1, x0, x1)) if context else grid, "pressures": pressures,
                 "fields": {name: read_levels(cube, i, nz, y0, y1, x0, x1) for i, name in enumerate(FIELDS)},
                 "surface": {name: surface.read(i, y0, y1, x0, x1) for i, name in enumerate(SURFACE)}}
        validate_cube(piece)
        products, _, internal = calculate(piece, context and {**context, "frame": {"grid": grid, "y0": y0}})
        values = products["gktg"][:, cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0].copy()
        # 표출 마스크: 영역 외곽 10칸은 비운다.
        rows, cols = np.arange(cy0, cy1), np.arange(cx0, cx1)
        values[:, (rows < EDGE) | (rows >= ny - EDGE)] = np.nan
        values[:, :, (cols < EDGE) | (cols >= nx - EDGE)] = np.nan
        valid = values[np.isfinite(values)]
        if np.any((valid < 0) | (valid > 1.5)):
            raise ValueError("Invalid GKTG output")
        finite += valid.size
        write_block(out, values, ny, nx, cy0, cx0)
        bands = internal["bounds"]
        del piece, products, internal, values, valid
        gc.collect()
        print(json.dumps({"event": "block", "block": number, "blocks": len(blocks)}), flush=True)
    cube.close()
    surface.close()
    os.close(out)
    if not finite:
        raise ValueError("Invalid GKTG output")
    (args.output / "checks.json").write_text(json.dumps({
        "algorithm": ALGORITHM, "shape": [nz, ny, nx], "bounds": [list(band) for band in bands], "blocks": len(blocks),
        "diagnostics": 24, "fastmath": False, "fortranRuntime": False,
    }))


if __name__ == "__main__":
    main()
