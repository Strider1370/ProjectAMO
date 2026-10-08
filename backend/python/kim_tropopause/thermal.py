"""WMO thermal tropopause on coarse pressure levels (Reichler et al. 2003 style).

The first tropopause is the lowest level, between 550 hPa and the model top, where the
half-level lapse rate drops to 2 K/km and the mean half-level lapse rate in the 2 km above
stays at or below 2 K/km. Only the first (lowest) tropopause is returned; a second one is
above cruise levels and poorly resolved by the KIM pressure levels.
"""
import numpy as np
from numba import njit

KAPPA = 0.2857
SEARCH_BOTTOM_HPA = 550.0
THRESHOLD_K_PER_KM = 2.0

# 기둥마다 같은 판정을 하므로 Numba로 컴파일한다(확대 영역 한 시각 기둥 약 44만 개, 순수 Python은 시각당 수십 초).
# 연산 순서는 컴파일 전 NumPy 구현과 같게 둔다(평균의 합산 순서 포함). 대조 기록: KIM 확대 영역 구현 계획 3-2.


@njit(cache=True)
def _pk(p):
    return np.power(p, KAPPA)


@njit(cache=True)
def _interp_pk(pressures, values, target):
    """Linear in p**kappa; pressures descend with height."""
    x = _pk(pressures)
    return np.interp(_pk(target), np.ascontiguousarray(x[::-1]), np.ascontiguousarray(values[::-1]))


@njit(cache=True)
def _mean(values, n):
    """np.mean와 같은 합산 순서(NumPy pairwise_sum, 128개 이하)."""
    if n < 8:
        total = 0.0
        for i in range(n):
            total += values[i]
        return total / n
    r0, r1, r2, r3 = values[0], values[1], values[2], values[3]
    r4, r5, r6, r7 = values[4], values[5], values[6], values[7]
    i = 8
    while i < n - (n % 8):
        r0 += values[i]; r1 += values[i + 1]; r2 += values[i + 2]; r3 += values[i + 3]
        r4 += values[i + 4]; r5 += values[i + 5]; r6 += values[i + 6]; r7 += values[i + 7]
        i += 8
    total = ((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7))
    while i < n:
        total += values[i]
        i += 1
    return total / n


@njit(cache=True)
def column(pressures, temperature, height):
    """Return (pressure hPa or nan, above_top).

    above_top is True when no tropopause is confirmed and every half-level lapse rate below
    the top layer stays above the threshold: the tropopause lies near or above the model top."""
    gam = -(temperature[1:] - temperature[:-1]) / (height[1:] - height[:-1]) * 1000.0
    half = np.power((_pk(pressures[1:]) + _pk(pressures[:-1])) / 2.0, 1.0 / KAPPA)
    half_height = np.empty(len(half))
    have_half_height = False
    within = np.empty(len(gam))
    for i in range(1, len(gam)):
        if half[i] > SEARCH_BOTTOM_HPA or not (gam[i] <= THRESHOLD_K_PER_KM < gam[i - 1]):
            continue
        w = (THRESHOLD_K_PER_KM - gam[i - 1]) / (gam[i] - gam[i - 1])
        trop = np.power(_pk(half[i - 1]) + w * (_pk(half[i]) - _pk(half[i - 1])), 1.0 / KAPPA)
        z_trop = _interp_pk(pressures, height, trop)
        if height[-1] < z_trop + 2000.0:
            return np.nan, True  # candidate too close to the model top to confirm
        if not have_half_height:
            for j in range(len(half)):
                half_height[j] = _interp_pk(pressures, height, half[j])
            have_half_height = True
        n = 0
        for j in range(i, len(gam)):
            if j == i or half_height[j] <= z_trop + 2000.0:
                within[n] = gam[j]
                n += 1
        if _mean(within, n) <= THRESHOLD_K_PER_KM:
            return trop, False
    # 탐색 구간(half <= 550 hPa)의 맨 위 하나를 뺀 반층 감률이 모두 문턱보다 크면 모델 꼭대기 근처·위.
    count = 0
    for j in range(len(half)):
        if half[j] <= SEARCH_BOTTOM_HPA:
            count += 1
    seen = 0
    for j in range(len(half)):
        if half[j] <= SEARCH_BOTTOM_HPA:
            seen += 1
            if seen < count and not gam[j] > THRESHOLD_K_PER_KM:
                return np.nan, False
    return np.nan, True


@njit(cache=True)
def _field(pressures, temperature, height):
    _, ny, nx = temperature.shape
    trop = np.full((ny, nx), np.nan)
    trop_t = np.full((ny, nx), np.nan)
    above = np.zeros((ny, nx), np.bool_)
    for y in range(ny):
        for x in range(nx):
            t = np.ascontiguousarray(temperature[:, y, x])
            z = np.ascontiguousarray(height[:, y, x])
            if not (np.all(np.isfinite(t)) and np.all(np.isfinite(z))):
                continue
            p, above[y, x] = column(pressures, t, z)
            if np.isfinite(p):
                trop[y, x] = p
                trop_t[y, x] = _interp_pk(pressures, t, p) - 273.15
    return trop, trop_t, above


def field(pressures, temperature, height):
    """Tropopause pressure (hPa), temperature (degC) and above-top flag for every column.

    pressures: (L,) hPa descending; temperature (K) and height (m): (L, ny, nx).
    """
    return _field(np.asarray(pressures, dtype=np.float64), np.asarray(temperature, dtype=np.float64), np.asarray(height, dtype=np.float64))
