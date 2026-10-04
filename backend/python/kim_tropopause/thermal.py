"""WMO thermal tropopause on coarse pressure levels (Reichler et al. 2003 style).

The first tropopause is the lowest level, between 550 hPa and the model top, where the
half-level lapse rate drops to 2 K/km and the mean half-level lapse rate in the 2 km above
stays at or below 2 K/km. Only the first (lowest) tropopause is returned; a second one is
above cruise levels and poorly resolved by the KIM pressure levels.
"""
import numpy as np

KAPPA = 0.2857
SEARCH_BOTTOM_HPA = 550.0
THRESHOLD_K_PER_KM = 2.0


def _pk(p):
    return np.power(p, KAPPA)


def _interp_pk(pressures, values, target):
    """Linear in p**kappa; pressures descend with height."""
    x = _pk(pressures)
    return float(np.interp(_pk(target), x[::-1], values[::-1]))


def column(pressures, temperature, height):
    """Return (pressure hPa or nan, above_top).

    above_top is True when no tropopause is confirmed and every half-level lapse rate below
    the top layer stays above the threshold: the tropopause lies near or above the model top."""
    gam = -(temperature[1:] - temperature[:-1]) / (height[1:] - height[:-1]) * 1000.0
    half = np.power((_pk(pressures[1:]) + _pk(pressures[:-1])) / 2.0, 1.0 / KAPPA)
    half_height = None
    for i in range(1, len(gam)):
        if half[i] > SEARCH_BOTTOM_HPA or not (gam[i] <= THRESHOLD_K_PER_KM < gam[i - 1]):
            continue
        w = (THRESHOLD_K_PER_KM - gam[i - 1]) / (gam[i] - gam[i - 1])
        trop = float(np.power(_pk(half[i - 1]) + w * (_pk(half[i]) - _pk(half[i - 1])), 1.0 / KAPPA))
        z_trop = _interp_pk(pressures, height, trop)
        if height[-1] < z_trop + 2000.0:
            return np.nan, True  # candidate too close to the model top to confirm
        if half_height is None:
            half_height = np.array([_interp_pk(pressures, height, p) for p in half])
        within = [gam[j] for j in range(i, len(gam)) if j == i or half_height[j] <= z_trop + 2000.0]
        if np.mean(within) <= THRESHOLD_K_PER_KM:
            return trop, False
    searched = half <= SEARCH_BOTTOM_HPA
    return np.nan, bool(np.all(gam[searched][:-1] > THRESHOLD_K_PER_KM))


def field(pressures, temperature, height):
    """Tropopause pressure (hPa), temperature (degC) and above-top flag for every column.

    pressures: (L,) hPa descending; temperature (K) and height (m): (L, ny, nx).
    """
    _, ny, nx = temperature.shape
    trop = np.full((ny, nx), np.nan)
    trop_t = np.full((ny, nx), np.nan)
    above = np.zeros((ny, nx), bool)
    for y in range(ny):
        for x in range(nx):
            t, z = temperature[:, y, x], height[:, y, x]
            if not (np.all(np.isfinite(t)) and np.all(np.isfinite(z))):
                continue
            p, above[y, x] = column(pressures, t, z)
            if np.isfinite(p):
                trop[y, x] = p
                trop_t[y, x] = _interp_pk(pressures, t, p) - 273.15
    return trop, trop_t, above
