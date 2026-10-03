"""Selected dynamical diagnostics from indices_gtg40ARismwtNoRi.f."""
import numpy as np
from python_core import F,D,G,RD,CPD,KAPPA,regular,irregular,mean_height


def advective_grad(a,geo):
    # iadvectz and LFKzm differentiate with dx,dy BEFORE the z transform.
    az=geo.dz_general(a).astype('f8')
    return (regular(a,geo.dx,2).astype('f8')-az*geo.zx,
            regular(a,geo.dy,1).astype('f8')-az*geo.zy,az)


def inertial(u,v,geo):
    ux,uy,_=advective_grad(u,geo);vx,vy,_=advective_grad(v,geo)
    mx=geo.mx.astype('f8')
    dm=regular(np.broadcast_to(geo.mx,u.shape),geo.dy,1).astype('f8')
    ud,vd=u.astype('f8'),v.astype('f8')
    ax=(mx*ud*ux+vd*uy-(u*v).astype('f8')/mx*dm).astype('f4')
    ay=(mx*ud*vx+vd*vy+(u*u).astype('f8')/mx*dm).astype('f4')
    return tuple(np.where(geo.cross,a,np.nan).astype('f4') for a in (ax,ay))


def imbalance(a,qmix,p,tv,geo):
    u,v,w=(a[n] for n in ('u','v','w'))
    ax,ay=inertial(u,v,geo)
    rho=(p.astype('f8')/(RD*tv.astype('f8'))).astype('f4')
    dpdz=(-rho.astype('f8')*G).astype('f4')
    phix=(-dpdz*geo.zx)/rho;phiy=(-dpdz*geo.zy)/rho
    ut=(-phix+geo.f*v-ax-w*geo.dz(u)).astype('f4')
    vt=(-phiy-geo.f*u-ay-w*geo.dz(v)).astype('f4')
    ut=np.where(geo.cross,ut,np.nan);vt=np.where(geo.cross,vt,np.nan)
    dt=geo.divergence(ut,vt)
    div=geo.divergence(u,v)
    gd=(u.astype('f8')*div.astype('f8')+ax).astype('f4')
    gy=(v.astype('f8')*div.astype('f8')+ay).astype('f4')
    gd=np.where(geo.cross,gd,np.nan);gy=np.where(geo.cross,gy,np.nan)
    term2=(geo.f*geo.vorticity(gd,gy)).astype('f4')
    ux,uy,_=advective_grad(u,geo);vx,vy,_=advective_grad(v,geo)
    utx,uty,_=advective_grad(ut,geo);vtx,vty,_=advective_grad(vt,geo)
    mx=geo.mx.astype('f8')
    dm=regular(np.broadcast_to(geo.mx,u.shape),geo.dy,1).astype('f8')
    # duvt is DOUBLE, but both products and their sum are REAL.
    duvt=(u*vt+v*ut).astype('f8')
    ud,vd,utd,vtd=(val.astype('f8') for val in (u,v,ut,vt))
    axt=mx*(ud*utx+utd*ux)+(vd*uty+vtd*uy)-(D(1)/mx)*dm*duvt
    ayt=mx*(ud*vtx+utd*vx)+(vd*vty+vtd*vy)+(D(1)/mx)*dm*(F(2)*u*ut).astype('f8')
    gtx=(utd*div.astype('f8')+ud*dt.astype('f8')+axt).astype('f4')
    gty=(vtd*div.astype('f8')+vd*dt.astype('f8')+ayt).astype('f4')
    gtx=np.where(geo.cross,gtx,np.nan);gty=np.where(geo.cross,gty,np.nan)
    term1=geo.divergence(gtx,gty)
    lhf=np.sqrt(np.abs(term1.astype('f8')+term2.astype('f8'))).astype('f4')
    return ax,ay,dt,lhf


def pv(u,v,p,theta,geo):
    vort=geo.vorticity(u,v)
    uz,vz=geo.dz(u).astype('f8'),geo.dz(v).astype('f8')
    thz=geo.dz(theta).astype('f8')
    thz=np.where(np.abs(thz)<1e-6,np.copysign(D(1e-6),thz),thz)
    thx=regular(theta,geo.dx/geo.mx,2).astype('f8')-thz*geo.zx
    thy=regular(theta,geo.dy,1).astype('f8')-thz*geo.zy
    rpk=((D(100000)/p.astype('f8'))**KAPPA).astype('f4')
    tv=(theta/rpk).astype('f4')
    rho=(p.astype('f8')/(RD*tv.astype('f8'))).astype('f4')
    val=((-vz*thx+uz*thy+(vort+geo.f).astype('f8')*thz)/np.maximum(rho,F(1e-6))*D(1e6)).astype('f4')
    val[0]=val[1];val[-1]=val[-2]
    return val,vort


def thermal_ri(u,v,t,nsq,geo):
    tx=regular(t,geo.dx/geo.mx,2);ty=regular(t,geo.dy,1);tz=geo.dz(t)
    from python_core import shift
    # mirreg uses distance-weighted means, retaining REAL multiplication.
    def mean_axis(axis,delta):
        lo,hi=shift(t,axis,-1),shift(t,axis,1)
        return ((lo+t)*delta+(t+hi)*delta)/(F(2)*(delta+delta))
    tbx=mean_axis(2,geo.dx/geo.mx);tby=mean_axis(1,geo.dy)
    tx=tx-tz*geo.zx;ty=ty-tz*geo.zy
    fc=np.where(np.abs(geo.f)<F(5e-5),np.where(geo.f<0,F(-5e-5),F(5e-5)),geo.f)
    uz=(-G/fc.astype('f8')*(ty/tby).astype('f8')+((u/t)*tz).astype('f8')).astype('f4')
    vz=(G/fc.astype('f8')*(tx/tbx).astype('f8')+((v/t)*tz).astype('f8')).astype('f4')
    return np.where(geo.cross,nsq/np.maximum(uz*uz+vz*vz,F(1e-10)),np.nan).astype('f4')


def roach(u,v,w,theta,ri,geo):
    # Roach2's mirreg averages on z, rather than a vertical 1-2-1 filter.
    uz=mean_height(geo.dz(u),geo.z).astype('f8')
    vz=mean_height(geo.dz(v),geo.z).astype('f8')
    thz=mean_height(geo.dz(theta),geo.z).astype('f8')
    ribar=mean_height(ri,geo.z)
    ux=regular(u,geo.dx/geo.mx,2).astype('f8')-uz*geo.zx
    uy=regular(u,geo.dy,1).astype('f8')-uz*geo.zy
    vx=regular(v,geo.dx/geo.mx,2).astype('f8')-vz*geo.zx
    vy=regular(v,geo.dy,1).astype('f8')-vz*geo.zy
    wz=geo.dz(w).astype('f8')
    vwssq=(uz*uz+vz*vz).astype('f4')
    uz=np.where(np.abs(uz)<D(1e-5),np.copysign(D(1e-5),uz),uz)
    r=vz/uz;rs=r*r;mx=geo.mx
    term2=D(2)*(mx*ux+r*uy+wz)/(D(1)+rs)
    term3=D(2)*(mx*r*vx+rs*vy+rs*wz)/(D(1)+rs)
    phi=(term2+term3-wz).astype('f4')
    dvsq=vwssq*F(500)**2
    base=-(dvsq/F(24))*phi
    with np.errstate(all='ignore'):
        value=np.maximum(base**(F(1)/F(3)),F(1e-5))
    good=(thz>=D(F(1e-6))) & (phi<0) & (ribar>=F(.5))
    valid=geo.cross & np.isfinite(phi) & np.isfinite(thz)
    return np.where(valid,np.where(good,value,F(0)),np.nan).astype('f4')


def front3(u,v,w,theta,geo):
    # threed=.FALSE. in the active source; all vertical transforms are
    # still performed before the horizontal frontogenesis expression.
    thx,thy,_=geo.grad(theta,True)
    ux,uy,_=geo.grad(u,True);vx,vy,_=geo.grad(v,True)
    mag=np.sqrt(thx*thx+thy*thy)
    fq=(-thx*(thx*ux+thy*vx)-thy*(thx*uy+thy*vy)).astype('f4')
    with np.errstate(all='ignore'):
        value=np.where(mag<D(1e-12),F(0),(fq.astype('f8')/mag).astype('f4'))
    return np.where(geo.cross,np.abs(value),np.nan).astype('f4')


def ncsu(u,v,t,theta,geo):
    from python_core import shift
    tx=regular(theta,geo.dx/geo.mx,2);ty=regular(theta,geo.dy,1)
    uth=irregular(u/geo.mx,theta);vth=irregular(v,theta)
    dvdx=regular(v,geo.dx,2)-vth*tx
    dudy=regular(u/geo.mx,geo.dy,1)
    # vort2dth falls through and uses untransformed dUdy if dUdth fails.
    dudy=np.where(np.isfinite(uth)&np.isfinite(ty),dudy-uth*ty,dudy)
    vort=np.where(geo.cross,geo.mx*(dvdx-dudy),np.nan).astype('f4')
    m=(CPD*t.astype('f8')+G*geo.z.astype('f8')).astype('f4')
    m=np.where(geo.mask,m,np.nan)
    def thgrad(a):
        ath=irregular(a,theta).astype('f8')
        ath=np.clip(ath,-D(1e-4),D(1e-4))
        return (regular(a,geo.dx/geo.mx,2).astype('f8')-ath*tx,
                regular(a,geo.dy,1).astype('f8')-ath*ty)
    mx,my=thgrad(m);vx,vy=thgrad(vort)
    return np.where(geo.cross,np.abs(mx*vy-my*vx),np.nan).astype('f4')
