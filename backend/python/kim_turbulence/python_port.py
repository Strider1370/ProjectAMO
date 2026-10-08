"""The operational KIM native-pressure TURB path, translated to Python."""
import numpy as np
import json
from pathlib import Path
from products import CATALOG
from python_combine import bounds,combine
from python_core import F, D, G, EPS, KAPPA, Geometry, smooth, rimap, rinorm, mean_height, shift, regular
from python_dynamics import imbalance, pv, thermal_ri, roach, front3, ncsu
from python_theta import front_theta
from python_structure import structure_fields


def theta_from(q,t,pressures):
    """tvcomp: specific humidity -> mixing ratio (smoothed) -> virtual temperature -> potential temperature."""
    q=np.asarray(q,dtype='f4').astype('f8')
    qmix=smooth((q/(D(1)-q)).astype('f4'),1,1)
    tv=(np.asarray(t,dtype='f4').astype('f8')*((D(1)+qmix.astype('f8')/EPS)/(D(1)+qmix.astype('f8')))).astype('f4')
    p=np.asarray(pressures,dtype='f4')[:,None,None]
    rpk=(D(100000)/p.astype('f8'))**KAPPA
    # tvcomp stores rpk in a REAL scalar before multiplying.
    return qmix,tv,p,(tv*rpk.astype('f4')).astype('f4')


def preprocess(cube,frame=None):
    grid=cube['grid']
    shape=(len(cube['pressures']),grid['ny'],grid['nx'])
    a={key:np.asarray(cube['fields'][key],dtype='f4').reshape(shape) for key in ('u','v','w','T','q','hgt')}
    surface={key:np.asarray(cube['surface'][key],dtype='f4').reshape(shape[1:]) for key in ('ps','topo','hpbl')}
    z,u,v,t=a['hgt'],a['u'],a['v'],a['T']
    geo=Geometry(grid,z,frame=frame)
    qmix,tv,p,theta=theta_from(a['q'],t,cube['pressures'])
    theta=np.where(geo.mask,theta,np.nan).astype('f4')
    tv=np.where(geo.mask,tv,np.nan).astype('f4')
    uz,vz=geo.dz(u),geo.dz(v)
    shear=np.sqrt(uz*uz+vz*vz)
    rawshear=shear.copy()
    # vwscomp only changes zero shear if both nearest positive sides exist.
    for k in range(len(z)):
        below=np.full(shape[1:],np.nan,dtype='f4');above=below.copy()
        for kk in range(k-1,-1,-1):
            below=np.where(~np.isfinite(below)&(rawshear[kk]>F(1e-10)),rawshear[kk],below)
        for kk in range(k+1,len(z)):
            above=np.where(~np.isfinite(above)&(rawshear[kk]>F(1e-10)),rawshear[kk],above)
        shear[k]=np.where((shear[k]<=F(1e-10))&np.isfinite(below)&np.isfinite(above),F(.5)*(below+above),shear[k])
    nsq=(G/mean_height(theta,z).astype('f8')*geo.dz(theta).astype('f8')).astype('f4')
    nsq=smooth(nsq,0,1)
    rawri=(nsq/np.maximum(shear*shear,F(1e-10))).astype('f4')
    mapped=rimap(rawri)
    ri=smooth(mapped,1,1)
    masked=lambda val:np.where(geo.mask,val,np.nan).astype('f4')
    stages={2:qmix,12:tv,15:rawri,16:np.where(ri>0,ri,np.nan),36:nsq,46:masked(uz),47:masked(vz)}
    return a,surface,geo,p,tv,theta,nsq,shear,mapped,ri,stages


def mountain_multiplier(u,v,z,topo,geo):
    # mwt_init includes all levels below the first crossing of terrain+1500,
    # including the original below-ground levels, then takes a 3x3 maximum.
    speed=np.sqrt(u*u+v*v)
    eligible=np.cumprod((z[:-1]<=topo+F(1500)).astype('i1'),axis=0).astype(bool)
    low=np.max(np.where(eligible,speed[:-1],F(0)),axis=0)
    low=np.where(geo.cross,low,np.nan)
    height=np.where(geo.mask,topo,np.nan)
    hmax=np.zeros_like(topo);smax=hmax.copy()
    for dx in (-1,0,1):
        for dy in (-1,0,1):
            h=height if dx==0 else shift(height,1,dx)
            s=low if dx==0 else shift(low,1,dx)
            if dy:
                h,s=shift(h,0,dy),shift(s,0,dy)
            hmax=np.maximum(hmax,np.nan_to_num(h))
            smax=np.maximum(smax,np.nan_to_num(s))
    # dxm is the last valid neighbour's scale factor in the original ii,jj
    # loops. It is intentionally retained when calculating center terrain.
    lastmx=np.full_like(topo,np.nan)
    mx=np.broadcast_to(geo.mx[0],topo.shape)
    for dx in (-1,0,1):
        for dy in (-1,0,1):
            valid=geo.cross.astype('f4');m=mx
            if dx: valid,m=shift(valid,1,dx),shift(m,1,dx)
            if dy: valid,m=shift(valid,0,dy),shift(m,0,dy)
            lastmx=np.where(valid==1,m,lastmx)
    hx=regular(topo,geo.dx/lastmx,1)
    hy=regular(topo,geo.dy,0)
    slope=np.where(geo.mask,F(1000)*np.sqrt(hx*hx+hy*hy),np.nan)
    slope=smooth(slope,5)
    flag=np.where(geo.mask & (np.minimum(hmax,F(3000))>=F(200)) & (slope>=F(5)),F(1),F(0))
    flag=smooth(flag,2,domain=geo.mask)
    mws=np.where(geo.mask,np.where(flag>=F(.001),np.maximum(smax*hmax,F(0)),F(0)),np.nan)
    return smooth(mws,1,domain=geo.mask),flag


def calculate(cube,context=None):
    """context(블록 계산): frame(영역 전체 격자·블록 시작 행), theta_range, bands. 없으면 cube 전체가 영역이다."""
    context=context or {}
    a,s,geo,p,tv,theta,nsq,shear,mapped,ri,stages=preprocess(cube,context.get('frame'))
    u,v,w,t,z=(a[n] for n in ('u','v','w','T','hgt'))
    domain=geo.mask
    result={}
    def save(name,raw,h=1,k=1,floor=0,ceiling=None):
        val=smooth(np.where(domain,raw,np.nan).astype('f4'),h,k,domain)
        # clampi zeros positive values smaller than Timin; it is not a floor.
        val=np.where((val>F(0))&(val<F(floor)),F(0),val)
        if ceiling is not None: val=np.minimum(val,F(ceiling))
        result[name]=val
        return val
    dst,dsh,defm=geo.deformation(u,v)
    stages[10]=defm
    div=geo.divergence(u,v);stages[9]=div
    speed=np.sqrt(u*u+v*v)
    save('ngm1',defm*speed)
    save('defsq',defm*defm)
    save('wsq',w*w)
    save('wsq_ri',rinorm(w*w,ri))
    save('sat_inv_ri',F(1)/np.maximum(mapped,F(.001)),ceiling=100)
    mws,flag=mountain_multiplier(u,v,z,s['topo'],geo)
    save('mwt5',mws*np.abs(div))
    tx,ty,_=geo.grad(t)
    # grad2dz stores magnitude REAL.
    tempg=np.where(geo.cross,np.sqrt(tx*tx+ty*ty),np.nan).astype('f4')
    save('tempg_ri',rinorm(tempg,ri),floor=1e-8)
    mountain=lambda val:np.maximum(mws*np.nan_to_num(val,nan=0),F(0))
    save('mwt12',mountain(tempg))
    qmix=stages[2]
    ax,ay,dt,lhf=imbalance(a,qmix,p,tv,geo)
    iawind=np.sqrt(ax*ax+ay*ay)/F(1e-4)
    save('iawind',iawind,floor=1e-7)
    save('iawind_ri',rinorm(iawind,ri),floor=1e-7)
    save('ubf_ri',rinorm(np.abs(dt)*F(1e8),ri),floor=1e-6)
    save('lhfk_ri',rinorm(lhf,ri),floor=1e-12)
    save('ellrod3',shear*(defm+F(50)*np.abs(dt)))
    pvval,vort=pv(u,v,p,theta,geo)
    pvval=smooth(pvval,1,1,domain)
    stages[14]=pvval;stages[8]=vort
    px,py,_=geo.grad(pvval)
    save('pvgrad',np.where(geo.cross,F(1000)*np.sqrt(px*px+py*py),np.nan),2,1)
    ritw=rimap(thermal_ri(u,v,t,nsq,geo))
    inv=np.where(z>=s['topo']+s['hpbl'],F(1)/np.maximum(ritw,F(.001)),np.nan)
    save('inv_ritw',inv,2,2,ceiling=100)
    save('edrlun',roach(u,v,w,theta,ri,geo),4,3,floor=1e-6)
    save('f3d_ri',rinorm(front3(u,v,w,theta,geo),ri),floor=1e-17)
    save('ncsu2_ri',rinorm(ncsu(u,v,t,theta,geo),ri),2,2)
    save('fth_ri',rinorm(front_theta(u,v,theta,geo,context.get('theta_range')),ri),floor=1e-10)
    edr,edrll,ctsq,varw=structure_fields(np.stack((u,v,t,w)),z,geo.mx.ravel(),geo.dx)
    save('edr',np.sqrt(edr),0,0,floor=1e-12)
    save('edrll',np.sqrt(edrll),0,0,floor=1e-12)
    varw=np.minimum(varw,F(10))
    # SIGW inherits nftxy=0,nftz=0 from the selected EDR branch; 457 is
    # not selected and consequently does not change these settings.
    save('sigw_ri',rinorm(varw,ri),0,0,floor=1e-17)
    save('mwt7',mountain(varw),0,0)
    save('mwt2',mountain(ctsq))
    calibration=json.loads(Path(__file__).with_name('calibration.json').read_text())
    bands=[tuple(band) for band in context['bands']] if 'bands' in context else bounds(z,geo.mask)
    codes={code:result[name] for name,_,code,_ in CATALOG if name in result}
    result.update(combine(codes,bands,calibration,geo.mask))
    return result,stages,{'bounds':bands,'theta':theta,'ri':ri,'mws':mws}
