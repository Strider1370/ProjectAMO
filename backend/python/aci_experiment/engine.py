"""Compiled calculation with reference fallback for numerically ambiguous crossings.

Status 0: valid, 1: invalid input, 2: invalid CAPE. Kernel-internal status 3
requests MetPy evaluation; it is never published as a missing result.
"""
import warnings
import numpy as np
from metpy.calc import dewpoint_from_specific_humidity, surface_based_cape_cin
from metpy.units import units
from kernel import calculate_batch


def reference_column(surface, levels, temperature, humidity):
    ps, t0, q0 = surface
    if not (30000 < ps < 110000 and 180 < t0 < 340 and 0 < q0 < .05):
        return np.nan, np.nan, 1
    mask = levels < ps - 1
    active_t, active_q = temperature[mask], humidity[mask]
    if (1 + int(mask.sum()) < 2 or levels[mask][-1] > 15000
            or not np.all((active_t > 150) & (active_t < 340))
            or not np.all((active_q >= 0) & (active_q < .05))):
        return np.nan, np.nan, 1
    p = np.r_[ps, levels[mask]]
    t = np.r_[t0, temperature[mask]]
    q = np.r_[q0, np.maximum(humidity[mask], 1e-8)]
    td = dewpoint_from_specific_humidity(p * units.Pa, q * units.dimensionless).to('K')
    td = np.minimum(td.magnitude, t) * units.K
    with warnings.catch_warnings():
        warnings.simplefilter('error', RuntimeWarning)
        cape, cin = surface_based_cape_cin(p * units.Pa, t * units.K, td)
    c = float(cape.to('J/kg').magnitude)
    if not np.isfinite(c) or c < -1e-8:
        return np.nan, np.nan, 2
    return max(0., c), float(cin.to('J/kg').magnitude), 0


def calculate(surface, levels, temperature, humidity, max_step=2000.):
    if not np.isfinite(max_step) or max_step <= 0:
        raise ValueError('max_step must be positive and finite')
    surface, levels, temperature, humidity = [np.asarray(v, dtype=np.float64) for v in (surface, levels, temperature, humidity)]
    if surface.ndim != 2 or surface.shape[1] != 3 or levels.ndim != 1 or temperature.shape != (len(surface),len(levels)) or humidity.shape != temperature.shape:
        raise ValueError('invalid profile array shapes')
    if len(levels) < 11 or not np.isfinite(levels).all() or (levels <= 0).any() or not (np.diff(levels) < 0).all():
        raise ValueError('pressure levels must be positive and strictly descending')
    result = calculate_batch(surface, levels, temperature, humidity, max_step)
    fallback = np.flatnonzero(result[:,2] == 3)
    for i in fallback:
        try:
            result[i] = reference_column(surface[i], levels, temperature[i], humidity[i])
        except (ValueError, RuntimeWarning):
            result[i] = np.nan, np.nan, 2
    return result, len(fallback)
