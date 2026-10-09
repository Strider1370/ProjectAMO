"""Offline CAPE calculation from validated KIM inputs, not a production module."""
import json
import math
import warnings
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import metpy
from metpy.calc import dewpoint_from_specific_humidity, surface_based_cape_cin
from metpy.units import units
import numpy as np


def calculate_cape(point):
    ps = point['ps'] / 100
    if not (300 < ps < 1100 and 180 < point['t2m'] < 340 and 0 < point['q2m'] < 0.05):
        raise ValueError('invalid surface data')
    p, t, q = [ps], [point['t2m']], [point['q2m']]
    for level in point['profile']:
        if level['p'] >= ps - 0.01:  # discard underground pressure levels
            continue
        if level['T'] is None or level['q'] is None or not (150 < level['T'] < 340 and 0 <= level['q'] < 0.05):
            raise ValueError('missing or invalid profile level')
        p.append(level['p']); t.append(level['T']); q.append(max(level['q'], 1e-8))
    if len(p) < 2 or p[-1] > 150:
        raise ValueError('incomplete profile')
    dewpoint = dewpoint_from_specific_humidity(np.array(p) * units.hPa, np.array(q) * units.dimensionless)
    # Prevent humidity rounding from creating a supersaturated starting profile.
    dewpoint = np.minimum(dewpoint.to('kelvin').magnitude, t) * units.kelvin
    with warnings.catch_warnings():
        warnings.simplefilter('error', RuntimeWarning)
        cape, cin = surface_based_cape_cin(np.array(p) * units.hPa, np.array(t) * units.kelvin, dewpoint)
    value = float(cape.to('J/kg').magnitude)
    if not math.isfinite(value) or value < -1e-8:
        raise ValueError('invalid calculated CAPE')
    return max(0, value), float(cin.to('J/kg').magnitude)


def calculate_cell(point):
    try:
        cape, cin = calculate_cape(point)
        if not (math.isfinite(point['rainRate']) and point['rainRate'] >= 0 and 0 <= point['olr'] < 600):
            raise ValueError('invalid rain or OLR')
        return ({k: point[k] for k in ['x', 'y', 'lon', 'lat', 'rainRate', 'olr']} | {'cape': cape, 'cin': cin}, None)
    except (ValueError, RuntimeWarning) as e:
        return ({k: point[k] for k in ['x', 'y', 'lon', 'lat']} | {'cape': None, 'rainRate': None, 'olr': None, 'cin': None}, str(e))


def main():
    data = json.loads(Path('artifacts/aci-experiment/private/inputs.json').read_text())
    points = data.pop('points')
    cells, failures = [], {}
    workers = min(8, os.cpu_count() or 1)
    print(f'Calculating all {len(points)} profiles using {workers} processes', flush=True)
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for cell, failure in pool.map(calculate_cell, points, chunksize=64):
            cells.append(cell)
            if failure:
                failures[failure] = failures.get(failure, 0) + 1
            if len(cells) % 1000 == 0:
                print(f'CAPE calculated {len(cells)}/{len(points)} cells', flush=True)
    data.update(cells=cells, metpyVersion=metpy.__version__, failures=failures,
                note='Single forecast time; every cell of the native 205x169, 1/12-degree grid calculated. No height/probability calibration. CAPE is integrated to EL or profile top (150 hPa).')
    Path('artifacts/aci-experiment/public/data.json').write_text(json.dumps(data, allow_nan=False))
    valid = [c['cape'] for c in cells if c['cape'] is not None]
    print(json.dumps({'cells': len(cells), 'valid': len(valid), 'capeMax': max(valid, default=None), 'failures': failures}))


if __name__ == '__main__':
    main()
