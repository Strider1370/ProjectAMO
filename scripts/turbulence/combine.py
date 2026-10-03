"""Port of the active main's itfacomp41.f native-grid combination path.

GetkBdys(.F), itfasum, MergeRegions and itfamax are kept in source order.
Do not substitute the separately supplied itfacomp41_jyl.f implementation.
"""
import numpy as np


def remap(a, b, raw):
    with np.errstate(invalid='ignore', divide='ignore', over='ignore'):
        mapped = np.exp(a + b*np.log(np.maximum(raw, 1e-20)))
    return np.where(np.isfinite(raw), np.clip(np.where(raw < 1e-20, 0, mapped), 0, 1.5), np.nan)


def native_region_bounds(height_m, imin, jmin, jmax):
    """GetkBdys(.F): lowest bottom point in the leftmost two compute columns."""
    bottom = height_m[0, jmin:jmax + 1, imin:imin + 2]
    if not np.isfinite(bottom).any():
        raise ValueError('No reference column for native GetkBdys')
    j, i = np.unravel_index(np.nanargmin(bottom), bottom.shape)
    levels = np.maximum(height_m[:, jmin+j, imin+i]*3.28, 0)
    last = len(levels)-1
    bounds = []
    for region, (lower, upper) in enumerate(((100, 10000), (11000, 20000), (21000, 60000))):
        start = 0 if region == 0 else next((k for k in range(len(levels)) if levels[k] >= lower), last)
        end = next((k for k in range(start+1, len(levels)) if levels[k] >= upper), last)
        bounds.append((start, end))
    return bounds


def merge_regions(values, start):
    """MergeRegions: centre, then above, then below, using updated centre."""
    if len(values) < 5:
        raise ValueError('MergeRegions requires at least five native levels')
    boundary = min(max(start, 2), len(values)-3)
    for destination, begin in ((boundary, boundary-1), (boundary+1, boundary), (boundary-1, boundary-2)):
        neighbours = values[begin:begin+3]
        count = np.sum(np.isfinite(neighbours), axis=0)
        mean = np.nansum(neighbours, axis=0)/np.maximum(count, 1)
        values[destination] = np.where(count > 0, mean, values[destination])


def combine(raw_by_code, bounds, calibration, smooth):
    shape = next(iter(raw_by_code.values())).shape
    cat = np.full(shape, np.nan)
    mwt = np.zeros(shape)
    for region in range(1, 4):
        selected = calibration['selected'][str(region)]
        start, end = bounds[region-1]
        band = slice(start, end+1)
        for mountain, target in ((False, cat), (True, mwt)):
            codes = sorted(code for code in selected if (code >= 476) == mountain)
            # itfasum keeps the accumulated value when an index is missing;
            # weights remain 1 / all selected indices, without renormalisation.
            for number, code in enumerate(codes):
                fit = calibration['fits'][f'{region}:{code}']
                mapped = remap(fit['a'], fit['b'], raw_by_code[code][band])
                previous = np.zeros_like(mapped) if number == 0 else target[band]
                valid = np.isfinite(previous) & np.isfinite(mapped)
                target[band] = np.where(valid, previous + mapped/len(codes), target[band])
            target[band] = np.clip(target[band], 0, 1)
            if region > 1:
                merge_regions(target, start)
    gktg = np.full(shape, np.nan)
    for region, (start, end) in enumerate(bounds):
        band = slice(start, end+1)
        # Actual main requires both CAT and MWT to be valid.
        gktg[band] = np.clip(np.maximum(cat[band], mwt[band]), 0, 1)
        if region > 0:
            merge_regions(gktg, start)
    # kminr/kmaxr after the Fortran region loop are the LAST region's bounds.
    # CAT is intentionally not smoothed here (its call is commented out).
    start, end = bounds[-1]
    gktg[start:end+1] = smooth(gktg[start:end+1], 1, 1)
    mwt[start:end+1] = smooth(mwt[start:end+1], 1, 1)
    return {'cat': cat, 'mwt': mwt, 'gktg': gktg}
