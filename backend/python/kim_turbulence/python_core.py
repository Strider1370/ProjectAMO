"""Native-grid Python translation of the operational TURB kernels.

Array order is (k,j,i). REAL work arrays stay float32; explicitly DOUBLE
PRECISION expressions use float64. No compiled Fortran is called here.
"""
import numpy as np
from numba import njit

F = np.float32
D = np.float64
G = D(F(9.81))
RD = D(F(287.0))
CPD = D(F(1004.6))
EPS = D(F(.6220))
KAPPA = D(F(.285714))
RE = D(6370000.)


def shift(a, axis, step):
    out = np.full_like(a, np.nan)
    dst, src = [slice(None)]*a.ndim, [slice(None)]*a.ndim
    dst[axis] = slice(None, -step) if step > 0 else slice(-step, None)
    src[axis] = slice(step, None) if step > 0 else slice(None, step)
    out[tuple(dst)] = a[tuple(src)]
    return out


# regular·irregular·smooth는 거의 모든 진단이 쓰는 공통 연산이라 Numba로 컴파일한 판(_*_kernel)을 쓴다.
# 연산 순서·float32 자료형은 아래 NumPy 판과 같게 두고, 입력이 float32가 아닌 경우 등은 NumPy 판으로 계산한다.
# 대조 기록: KIM 확대 영역 구현 계획 "계산 가속: GKTG".
NAN32 = np.float32(np.nan)


@njit(cache=True, error_model='numpy')
def _regular_kernel(a, spacing, axis):
    nz, ny, nx = a.shape
    out = np.empty((nz, ny, nx), dtype=np.float32)
    two = np.float32(2)
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                c = a[k, j, i]
                if axis == 2:
                    lo = a[k, j, i - 1] if i > 0 else NAN32
                    hi = a[k, j, i + 1] if i < nx - 1 else NAN32
                else:
                    lo = a[k, j - 1, i] if j > 0 else NAN32
                    hi = a[k, j + 1, i] if j < ny - 1 else NAN32
                step = spacing[k, j, i]
                if np.isfinite(lo) and np.isfinite(hi):
                    out[k, j, i] = (hi - lo) / (two * step)
                elif np.isfinite(hi) and np.isfinite(c):
                    out[k, j, i] = (hi - c) / step
                else:
                    out[k, j, i] = (c - lo) / step
    return out


@njit(cache=True, error_model='numpy')
def _irregular_kernel(a, x, threshold, span):
    nz, ny, nx = a.shape
    out = np.empty((nz, ny, nx), dtype=np.float32)
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                c, xc = a[k, j, i], x[k, j, i]
                if not (np.isfinite(c) and np.isfinite(xc)):
                    out[k, j, i] = NAN32
                    continue
                lo = a[k - 1, j, i] if k > 0 else NAN32
                hi = a[k + 1, j, i] if k < nz - 1 else NAN32
                xl = x[k - 1, j, i] if k > 0 else NAN32
                xh = x[k + 1, j, i] if k < nz - 1 else NAN32
                d1, d2 = xc - xl, xh - xc
                dt = xh - xl if span else d1 + d2
                central = (hi - c) * (d1 / (d2 * dt)) + (c - lo) * (d2 / (d1 * dt))
                if abs(d1) >= threshold and abs(d2) >= threshold and abs(dt) >= threshold and np.isfinite(central):
                    out[k, j, i] = central
                elif abs(d2) >= threshold and np.isfinite((hi - c) / d2):
                    out[k, j, i] = (hi - c) / d2
                elif abs(d1) >= threshold:
                    out[k, j, i] = (c - lo) / d1
                else:
                    out[k, j, i] = NAN32
    return out


@njit(cache=True, error_model='numpy')
def _smooth_kernel(a, horizontal, vertical, region):
    nz, ny, nx = a.shape
    out = a.copy()
    work = np.empty_like(a)
    quarter, two = np.float32(.25), np.float32(2)
    for _ in range(horizontal):
        for k in range(nz):
            for j in range(ny):
                for i in range(nx):
                    if not region[k, j, i]:
                        work[k, j, i] = NAN32
                        continue
                    c = out[k, j, i]
                    lo = out[k, j - 1, i] if j > 0 else NAN32
                    hi = out[k, j + 1, i] if j < ny - 1 else NAN32
                    work[k, j, i] = quarter * (hi + two * c + lo) if np.isfinite(lo) and np.isfinite(c) and np.isfinite(hi) else c
        for k in range(nz):
            for j in range(ny):
                for i in range(nx):
                    c = work[k, j, i]
                    lo = work[k, j, i - 1] if i > 0 else NAN32
                    hi = work[k, j, i + 1] if i < nx - 1 else NAN32
                    if region[k, j, i] and np.isfinite(lo) and np.isfinite(c) and np.isfinite(hi):
                        out[k, j, i] = quarter * (hi + two * c + lo)
    for _ in range(vertical):
        for k in range(nz):
            for j in range(ny):
                for i in range(nx):
                    work[k, j, i] = out[k, j, i] if region[k, j, i] else NAN32
        for k in range(nz):
            for j in range(ny):
                for i in range(nx):
                    c = work[k, j, i]
                    lo = work[k - 1, j, i] if k > 0 else NAN32
                    hi = work[k + 1, j, i] if k < nz - 1 else NAN32
                    if region[k, j, i] and np.isfinite(lo) and np.isfinite(c) and np.isfinite(hi):
                        out[k, j, i] = quarter * (hi + two * c + lo)
    return out


def _as3d(a):
    return a if a.ndim == 3 else a.reshape((1,) + a.shape)


def regular(a, spacing, axis):
    """dreg: centered (even if center missing), forward, backward."""
    spacing = np.asarray(spacing)
    if a.dtype == np.float32 and spacing.dtype == np.float32 and a.ndim in (2, 3) and axis in (a.ndim - 2, a.ndim - 1):
        out = _regular_kernel(_as3d(a), _as3d(np.broadcast_to(spacing, a.shape)), axis + 3 - a.ndim)
        return out.reshape(a.shape)
    return _regular_numpy(a, spacing, axis)


def _regular_numpy(a, spacing, axis):
    lo, hi = shift(a, axis, -1), shift(a, axis, 1)
    with np.errstate(all='ignore'):
        return np.where(np.isfinite(lo) & np.isfinite(hi),
                        (hi-lo)/(F(2)*spacing),
                        np.where(np.isfinite(hi) & np.isfinite(a),
                                 (hi-a)/spacing, (a-lo)/spacing)).astype('f4')


def irregular(a, x, axis=0, threshold=1e-5):
    """dirreg/dirregzk: signed irregular spacing and one-sided fallback."""
    x = np.broadcast_to(x, a.shape)
    if a.dtype == np.float32 and x.dtype == np.float32 and a.ndim == 3 and axis == 0:
        # NumPy 판은 float32 배열과 Python 실수 문턱값을 float32로 비교한다.
        return _irregular_kernel(a, x, np.float32(threshold), threshold == .001)
    return _irregular_numpy(a, x, axis, threshold)


def _irregular_numpy(a, x, axis=0, threshold=1e-5):
    lo, hi = shift(a, axis, -1), shift(a, axis, 1)
    xl, xh = shift(x, axis, -1), shift(x, axis, 1)
    d1, d2 = x-xl, xh-x
    dt = xh-xl if threshold == .001 else d1+d2
    with np.errstate(all='ignore'):
        central = (hi-a)*(d1/(d2*dt)) + (a-lo)*(d2/(d1*dt))
        forward, backward = (hi-a)/d2, (a-lo)/d1
    good = (np.abs(d1)>=threshold) & (np.abs(d2)>=threshold) & (np.abs(dt)>=threshold)
    out = np.where(good & np.isfinite(central), central,
                   np.where((np.abs(d2)>=threshold) & np.isfinite(forward), forward,
                            np.where(np.abs(d1)>=threshold, backward, np.nan)))
    return np.where(np.isfinite(a) & np.isfinite(x), out, np.nan).astype('f4')


def mean_height(a, z):
    """mirregzk, including its signed-distance weights."""
    lo, hi = shift(a, 0, -1), shift(a, 0, 1)
    zl, zh = shift(z, 0, -1), shift(z, 0, 1)
    d1, d2, dt = z-zl, zh-z, zh-zl
    with np.errstate(all='ignore'):
        central = ((lo+a)*d1+(a+hi)*d2)/(F(2)*dt)
    good = (np.abs(d1)>=.001) & (np.abs(d2)>=.001) & (np.abs(dt)>=.001)
    out = np.where(good & np.isfinite(central), central,
                   np.where(np.isfinite(hi), F(.5)*(hi+a), F(.5)*(lo+a)))
    return np.where(np.isfinite(a) & np.isfinite(z), out, np.nan).astype('f4')


def smooth(a, horizontal=1, vertical=0, domain=None):
    """meanFilter3D: original y, x, z ordering; DIRICHLET regional ends."""
    out = np.array(a, dtype='f4', copy=True)
    region = np.ones(a.shape, dtype=bool) if domain is None else np.broadcast_to(domain, a.shape)
    if out.ndim == 3 or (out.ndim == 2 and vertical == 0):
        return _smooth_kernel(_as3d(out), horizontal, vertical, _as3d(region)).reshape(a.shape)
    return _smooth_numpy(out, horizontal, vertical, region)


def _smooth_numpy(out, horizontal, vertical, region):
    for _ in range(horizontal):
        lo, hi = shift(out, -2, -1), shift(out, -2, 1)
        good = region & np.isfinite(lo) & np.isfinite(out) & np.isfinite(hi)
        work = np.where(region, np.where(good, F(.25)*(hi+F(2)*out+lo), out), np.nan)
        lo, hi = shift(work, -1, -1), shift(work, -1, 1)
        good = region & np.isfinite(lo) & np.isfinite(work) & np.isfinite(hi)
        out = np.where(good, F(.25)*(hi+F(2)*work+lo), out)
    for _ in range(vertical):
        work = np.where(region, out, np.nan)
        lo, hi = shift(work, 0, -1), shift(work, 0, 1)
        good = region & np.isfinite(lo) & np.isfinite(work) & np.isfinite(hi)
        out = np.where(good, F(.25)*(hi+F(2)*work+lo), out)
    return out.astype('f4')


def rimap(ri):
    """Rimap: interior <=1e-6, end points <1e-6; no 0.001 floor."""
    out = ri.copy()
    for k in range(1, len(ri)-1):
        below = np.full_like(ri[k], np.nan)
        above = below.copy()
        bi = np.zeros(ri.shape[1:], dtype=int)
        ai = bi.copy()
        for kk in range(k-1, -1, -1):
            take = ~np.isfinite(below) & (ri[kk] > F(1e-6))
            below = np.where(take, ri[kk], below)
            bi = np.where(take, kk, bi)
        for kk in range(k+1, len(ri)):
            take = ~np.isfinite(above) & (ri[kk] > F(1e-6))
            above = np.where(take, ri[kk], above)
            ai = np.where(take, kk, ai)
        adjacent_b = np.take_along_axis(ri, (bi+1)[None], axis=0)[0]
        adjacent_a = np.take_along_axis(ri, (ai-1)[None], axis=0)[0]
        bmean, amean = F(.5)*(below+adjacent_b), F(.5)*(above+adjacent_a)
        replacement = np.where(np.isfinite(below) & np.isfinite(above), F(.5)*(below+above),
                               np.where(np.isfinite(below), np.where(bmean>1e-6,bmean,below),
                                        np.where(amean>1e-6,amean,above)))
        out[k] = np.where(np.isfinite(ri[k]) & (ri[k]<=F(1e-6)), replacement, ri[k])
    out[0] = np.where(ri[0]<F(1e-6),out[1],ri[0])
    out[-1] = np.where(ri[-1]<F(1e-6),out[-2],ri[-1])
    return out


def rinorm(a, ri):
    # The operational code MAXes Ria before its missing test. Preserve that
    # behavior (a valid index with RMISSD Ri is divided by 0.001).
    denom = np.maximum(np.where(np.isfinite(ri), ri, F(-9999)), F(.001))
    return (a/denom).astype('f4')


class Geometry:
    def __init__(self, grid, z, halo=10, frame=None):
        # frame: 블록 계산일 때 영역 전체 격자와 이 블록의 시작 행. 위도·격자 간격은 영역 전체 기준으로 구해
        # 블록을 이어 붙인 결과가 영역 전체를 한 번에 계산한 결과와 같다.
        self.z = z
        ny,nx = z.shape[1:]
        full = frame['grid'] if frame else grid
        y0 = frame['y0'] if frame else 0
        fny,fnx = int(full['ny']),int(full['nx'])
        lat = (F(full['latMin']) + (F(full['latMax'])-F(full['latMin']))*np.arange(fny,dtype='f4')/F(fny-1))[y0:y0+ny]
        self.mx = (D(1)/np.cos(lat.astype('f8')*np.pi/D(180))).astype('f4')[None,:,None]
        self.dx = F(RE*D(F(full['lonMax'])-F(full['lonMin']))*np.pi/D(180)/D(fnx-1))
        self.dy = F(RE*D(F(full['latMax'])-F(full['latMin']))*np.pi/D(180)/D(fny-1))
        self.f = (D(F(1.45444e-4))*np.sin(lat.astype('f8')*np.pi/D(180))).astype('f4')[None,:,None]
        self.mask = np.zeros((ny,nx), dtype=bool)
        self.mask[halo:ny-halo,halo:nx-halo] = True
        self.cross = self.mask.copy()
        for axis in (0,1):
            for step in (-1,1):
                self.cross &= np.nan_to_num(shift(self.mask.astype('f4'),axis,step)).astype(bool)
        self.zx = regular(z,self.dx/self.mx,2)
        self.zy = regular(z,self.dy,1)

    def dz(self,a):
        return irregular(a,self.z,threshold=.001)

    def dz_general(self,a):
        return irregular(a,self.z)

    def grad(self,a,double=False):
        az=self.dz_general(a)
        ax,ay=regular(a,self.dx/self.mx,2),regular(a,self.dy,1)
        if double:
            return ax.astype('f8')-az.astype('f8')*self.zx,ay.astype('f8')-az.astype('f8')*self.zy,az.astype('f8')
        return ax-az*self.zx,ay-az*self.zy,az

    def divergence(self,u,v):
        # div2dz DOUBLE work, derivatives themselves are REAL.
        du=regular(u,self.dx,2).astype('f8')
        dv=regular(v/self.mx,self.dy,1).astype('f8')
        uz=self.dz_general(u).astype('f8')
        lo,hi=shift(v,1,-1),shift(v,1,1)
        mx=np.broadcast_to(self.mx,v.shape)
        mx=np.where(~np.isfinite(lo)&np.isfinite(hi),F(.5)*(mx+shift(mx,1,1)),mx)
        mx=np.where(~np.isfinite(hi)&np.isfinite(lo),F(.5)*(mx+shift(np.broadcast_to(self.mx,v.shape),1,-1)),mx)
        vz=(self.dz_general(v)/mx).astype('f8')
        out=mx*(du-uz*self.zx+dv-vz*self.zy)
        return np.where(self.mask,out,np.nan).astype('f4')

    def vorticity(self,u,v):
        dv=regular(v,self.dx,2)-self.dz_general(v)*self.zx
        du=regular(u/self.mx,self.dy,1)
        lo,hi=shift(u,1,-1),shift(u,1,1)
        mx=np.broadcast_to(self.mx,u.shape)
        mx=np.where(~np.isfinite(lo)&np.isfinite(hi),F(.5)*(mx+shift(mx,1,1)),mx)
        mx=np.where(~np.isfinite(hi)&np.isfinite(lo),F(.5)*(mx+shift(np.broadcast_to(self.mx,u.shape),1,-1)),mx)
        # mx is constant through a column for a one-sided horizontal branch.
        du=du-irregular(u/mx,self.z)*self.zy
        # Actual backward branch tests u(im1,j,k), not u(i,jm1,k).
        # Preserve this operational typo at the southwest/northwest corner.
        du=np.where(~np.isfinite(hi)&~np.isfinite(shift(u,2,-1)),np.nan,du)
        return np.where(self.mask,mx*(dv-du),np.nan).astype('f4')

    def deformation(self,u,v):
        # Preserve Def2dz's actual dzdx/dzdy choices, including the original
        # dmxvdy using dzdx.
        mx=self.mx
        uz,vz=self.dz_general(u),self.dz_general(v)
        a=regular(u,self.dx,2).astype('f8')-uz.astype('f8')*self.zx
        b=regular(mx*v,self.dy,1).astype('f8')-(mx*vz).astype('f8')*self.zx
        c=regular(mx*u,self.dy,1).astype('f8')-(mx*uz).astype('f8')*self.zy
        d=regular(v,self.dx,2).astype('f8')-vz.astype('f8')*self.zx
        dst=(mx*a-(F(1)/mx)*b).astype('f4')
        dsh=((F(1)/mx)*c+mx*d).astype('f4')
        # Dst**2+Dsh**2 is REAL then assigned to DOUBLE Defsq.
        dsq=(dst*dst+dsh*dsh)
        deformation=np.sqrt(dsq.astype('f8')).astype('f4')
        return tuple(np.where(self.cross,a,np.nan).astype('f4') for a in (dst,dsh,deformation))
