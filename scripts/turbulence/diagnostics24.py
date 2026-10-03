"""Remaining TURB diagnostic formulas for the experimental regional port.

Derivative transforms on native pressure layers approximate the original
explicit theta-grid regridding. This is deliberately NOT Fortran parity.
"""
import numpy as np


def interpolate_columns(a, z, target):
    lo = np.full(target.shape, -1, dtype=int)
    hi = np.full(target.shape, len(z), dtype=int)
    for _ in range(int(np.ceil(np.log2(len(z) + 1))) + 1):
        mid = (lo + hi) // 2
        sample = np.take_along_axis(z, np.clip(mid, 0, len(z) - 1), axis=0)
        lower = np.isfinite(sample) & (sample <= target)
        lo = np.where((hi - lo > 1) & lower, mid, lo)
        hi = np.where((hi - lo > 1) & ~lower, mid, hi)
    il, ih = np.clip(lo, 0, len(z) - 1), np.clip(hi, 0, len(z) - 1)
    zl, zh = np.take_along_axis(z, il, 0), np.take_along_axis(z, ih, 0)
    al, ah = np.take_along_axis(a, il, 0), np.take_along_axis(a, ih, 0)
    with np.errstate(divide='ignore', invalid='ignore'):
        value = al + (ah - al) * (target - zl) / (zh - zl)
    value = np.where(target == zl, al, value)
    return np.where((lo >= 0) & ((hi < len(z)) | (target == zl)), value, np.nan)


def structures(fields, z, grid, shifted):
    """5x5x3 same-height neighbourhood, all pairs at lags 1..4; Q(D,F)."""
    shape = z.shape
    patches = {}
    shiftxy = lambda a, y, x: shifted(shifted(a, 1, y), 2, x) if y and x else shifted(a, 1, y) if y else shifted(a, 2, x) if x else a
    for y in range(-2, 3):
        for x in range(-2, 3):
            zs = shiftxy(z, y, x)
            patches[y, x] = {name: interpolate_columns(shiftxy(a, y, x), zs, z) for name, a in fields.items()}
    latitude = np.deg2rad(np.linspace(grid['latMin'], grid['latMax'], grid['ny']))[None, :, None]
    ds = 6371000 * np.deg2rad((grid['lonMax'] - grid['lonMin']) / (grid['nx'] - 1))
    output = {}
    for axis in ('x', 'y'):
        qnum, qden, usable = {}, {}, {}
        for name in fields:
            qnum[name] = np.zeros(shape)
            qden[name] = np.zeros(shape)
            usable[name] = np.ones(shape, dtype=bool)
        for lag in range(1, 5):
            sums = {name: np.zeros(shape) for name in fields}
            counts = {name: np.zeros(shape) for name in fields}
            for along in range(-2, 3 - lag):
                for across in range(-2, 3):
                    p1 = patches[across, along] if axis == 'x' else patches[along, across]
                    p2 = patches[across, along + lag] if axis == 'x' else patches[along + lag, across]
                    for name in fields:
                        difference = (p2[name] - p1[name])**2
                        for kdelta in (-1, 0, 1):
                            diff = shifted(difference, 0, kdelta) if kdelta else difference
                            sums[name] += np.nan_to_num(diff)
                            counts[name] += np.isfinite(diff)
            distance = ds * lag / np.cos(latitude) if axis == 'x' else ds * lag
            for name in fields:
                d = sums[name] / np.maximum(counts[name], 1)
                usable[name] &= counts[name] > 1
                if name == 'w':
                    power = (distance / 5000)**(2/3)
                    model = power / (1 + power)
                else:
                    transverse = (name == 'v' and axis == 'x') or (name == 'u' and axis == 'y')
                    b, c = (1.625e-6, 1.075e-7) if transverse else (6.66666666e-7, 4.444444444e-8)
                    model = distance**.6666667 + b * distance**2 - c * distance**2 * np.log(distance)
                ratio = d / model
                qnum[name] += ratio**2 / lag
                qden[name] += ratio / lag
        for name in fields:
            threshold = 1e-16 if name == 'w' else 1e-12
            value = np.where(qnum[name] > threshold, np.abs(qnum[name] / np.maximum(qden[name], 1e-30)), 0)
            output[name, axis] = np.where(usable[name], value, np.nan)
    elx, ely = output['u', 'x']/2, output['v', 'y']/2
    etx, ety = output['v', 'x']/2.222222222, output['u', 'y']/2.222222222
    return {'edr': np.sqrt((elx + ely + etx + ety)/4), 'edrll': np.sqrt(elx),
            'ctsq': (output['T', 'x'] + output['T', 'y'])/2,
            'varw': np.minimum((output['w', 'x'] + output['w', 'y'])/4, 10)}


def additional(c, gradients, derivative, mapped_ri, smooth, shifted):
    u, v, w, t, z, theta = (c[name] for name in ('u', 'v', 'w', 't', 'z', 'theta'))
    ux, uy, uz = c['ugrad']
    vx, vy, vz = c['vgrad']
    tx, ty, tz = gradients(t)
    thx, thy, thz = gradients(theta)
    f = c['f']
    curv = c['curvature']
    ax, ay, divergence, ri = (c[name] for name in ('ax', 'ay', 'divergence', 'ri'))
    wx, wy, wz = gradients(w)
    ut = -9.80665 * c['mx'] * c['zx'] + f*v - ax - w*uz
    vt = -9.80665 * c['zy'] - f*u - ay - w*vz
    utx, uty, _ = gradients(ut)
    vtx, vty, _ = gradients(vt)
    divergence_t = utx + vty - vt*curv
    shear = np.hypot(uz, vz)
    rho = c['p'] / (287.05 * c['virtual_t'])
    vort = vx - uy + u*curv
    safe_thz = np.where(np.abs(thz) < 1e-6, np.copysign(1e-6, thz), thz)
    pv = 1e6 * (-vz*thx + uz*thy + (vort+f)*safe_thz) / np.maximum(rho, 1e-6)
    pvx, pvy, _ = gradients(pv)
    fc = np.copysign(np.maximum(np.abs(f), 5e-5), f)
    txbar = (shifted(t, 2, -1) + shifted(t, 2, 1))/2
    tybar = (shifted(t, 1, -1) + shifted(t, 1, 1))/2
    utw = -9.80665/fc * ty/tybar + u/t*tz
    vtw = 9.80665/fc * tx/txbar + v/t*tz
    ritw = mapped_ri(c['n2'] / np.maximum(utw**2 + vtw**2, 1e-10))
    inv_ritw = np.where(z >= c['topo'] + c['hpbl'], 1/ritw, np.nan)
    gt_x = ut*divergence + u*divergence_t + ut*ux + u*utx + vt*uy + v*uty - (ut*v+u*vt)*curv
    gt_y = vt*divergence + v*divergence_t + ut*vx + u*vtx + vt*vy + v*vty + 2*u*ut*curv
    g_x, g_y = u*divergence + ax, v*divergence + ay
    gtx, _, _ = gradients(gt_x)
    _, gty, _ = gradients(gt_y)
    _, gxy, _ = gradients(g_x)
    gyx, _, _ = gradients(g_y)
    lhfk = np.sqrt(np.abs(gtx + gty - gt_y*curv + f*(gyx - gxy + g_x*curv)))

    def theta_gradient(a, clamp=False):
        ax_, ay_, az_ = gradients(a)
        ath = az_/safe_thz
        if clamp:
            ath = np.clip(ath, -1e-4, 1e-4)
        return ax_ - ath*thx, ay_ - ath*thy, ath

    # Native-layer chain rule approximates the Fortran explicit theta regridding.
    uthx, uthy, uth = theta_gradient(u)
    vthx, vthy, vth = theta_gradient(v)
    delta_theta = shifted(theta, 0, 1) - shifted(theta, 0, -1)
    ftheta = np.abs(-uth*(uth*uthx + vth*uthy) - vth*(uth*vthx + vth*vthy))*(delta_theta/6)**2
    m = 1004*t + 9.80665*z
    mxth, myth, _ = theta_gradient(m, True)
    vort_th = vthx - uthy + u*curv
    vorthx, vorthy, _ = theta_gradient(vort_th, True)
    ncsu = np.abs(mxth*vorthy - myth*vorthx)
    ubar, vbar = smooth(uz, horizontal=0, vertical=1), smooth(vz, horizontal=0, vertical=1)
    ubar = np.where(np.abs(ubar) < 1e-5, np.copysign(1e-5, ubar), ubar)
    r = vbar/ubar
    phi = 2*(ux + r*uy + r*vx + r*r*vy + (1+r*r)*wz)/(1+r*r) - wz
    good = (smooth(thz, 0, 1) >= 1e-6) & (phi < 0) & (smooth(ri, 0, 1) >= .5)
    roach = np.where(good, np.maximum(np.cbrt(-500**2*(ubar**2+vbar**2)*phi/24), 1e-5), 0)
    temp_denom = np.hypot(thx, thy)
    front3 = np.abs(-(thx**2*ux + thx*thy*(vx+uy) + thy**2*vy)/np.maximum(temp_denom, 1e-12))
    front3 = np.where(temp_denom < 1e-12, 0, front3)
    sf = structures({'u': u, 'v': v, 'T': t, 'w': w}, z, c['grid'], shifted)
    return {'ellrod3': shear*(np.sqrt(c['defsq']) + 50*np.abs(divergence_t)),
            'fth_ri': ftheta/ri, 'ubf_ri': 1e8*np.abs(divergence_t)/ri,
            'sat_inv_ri': 1/ri, 'pvgrad': 1000*np.hypot(pvx, pvy),
            'edr': sf['edr'], 'edrll': sf['edrll'], 'inv_ritw': inv_ritw,
            'lhfk_ri': lhfk/ri, 'iawind_ri': np.hypot(ax, ay)/(1e-4*ri),
            'ncsu2_ri': ncsu/ri, 'edrlun': roach, 'sigw_ri': sf['varw']/ri,
            'f3d_ri': front3/ri, 'mwt2': c['mws']*sf['ctsq'], 'mwt7': c['mws']*sf['varw']}
