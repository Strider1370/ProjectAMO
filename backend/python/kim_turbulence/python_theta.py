"""FRNTGth: explicit isentropic regridding and height interpolation back."""
import numpy as np
from python_core import F,D,irregular,regular


def front_theta(u,v,theta,geo):
    nz,ny,nx=theta.shape
    # interp_to_theta2 searches the expanded requested domain, but theta was
    # initialized to RMISSD outside mask by tvcomp.
    thmin=F(max(np.floor(float(np.nanmin(theta))+.5),225))
    thmax=F(min(np.floor(float(np.nanmax(theta))+.5),800))
    ruc=np.array([240,250,260,265,270,272,274,276,278,280,282,284,286,288,290,292,294,296,298,300,302,304,306,308,310,312,314,316,318,320,322,325,328,331,334,337,340,343,346,349,352,355,359,365,372,385,400,422,450,500],dtype='f4')
    levels=ruc if thmin>=240 and thmax<=500 and nz>=50 else thmin+np.arange(nz,dtype='f4')*((thmax-thmin)/F(nz-1))
    adjusted=theta.copy()
    for k in range(1,nz):
        adjusted[k]=np.where(adjusted[k]-adjusted[k-1]<F(.001),adjusted[k-1]+F(.2),adjusted[k])
    # Entire columns with missing z, theta or u are skipped.
    columns=np.all(np.isfinite(theta)&np.isfinite(geo.z)&np.isfinite(u),axis=0)
    zth=np.full((len(levels),ny,nx),np.nan,dtype='f4')
    uth=zth.copy();vth=zth.copy()
    # First matching interval, followed by source-specific extrapolation.
    for ko,lev in enumerate(levels):
        found=np.zeros((ny,nx),dtype=bool)
        for k in range(nz-1):
            use=columns&~found&(adjusted[k]<=lev)&(adjusted[k+1]>lev)
            dt=adjusted[k+1]-adjusted[k];delta=lev-adjusted[k]
            for src,dst in ((geo.z,zth),(u,uth),(v,vth)):
                with np.errstate(all='ignore'):
                    val=np.where(np.abs(dt)<F(.01),F(.5)*(src[k]+src[k+1]),src[k]+((src[k+1]-src[k])/dt)*delta)
                dst[ko]=np.where(use,val,dst[ko])
            found |= use
        # Two theta surfaces below first input theta; all surfaces above top.
        first=np.sum(levels[:,None,None]<adjusted[0],axis=0)
        low=columns&(lev<adjusted[0])&(ko>=first-2)
        high=columns&(levels[-1]>adjusted[-1])&(lev>=adjusted[-1])
        for end,condition in ((0,low),(nz-2,high)):
            dt=adjusted[end+1]-adjusted[end]
            for src,dst in ((geo.z,zth),(u,uth),(v,vth)):
                if end==0:
                    val=np.where(np.abs(dt)<F(.01),F(.5)*(src[0]+src[1]),src[0]-((src[1]-src[0])/dt)*(adjusted[0]-lev))
                else:
                    val=np.where(np.abs(dt)<F(.01),src[-1],src[-1]+((src[-1]-src[-2])/dt)*(lev-adjusted[-1]))
                dst[ko]=np.where(condition,val,dst[ko])
    # If the highest requested surface equals the column top, interp_eta2
    # cannot bracket it (< at the upper end) and returns ierr=-2. Its caller
    # then discards the whole column, including earlier valid surfaces.
    top_equal=columns&(levels[-1]==adjusted[-1])
    zth[:,top_equal]=np.nan;uth[:,top_equal]=np.nan;vth[:,top_equal]=np.nan
    th=np.broadcast_to(levels[:,None,None],uth.shape)
    uz,vz=irregular(uth,th).astype('f8'),irregular(vth,th).astype('f8')
    ux=regular(uth,geo.dx/geo.mx,2).astype('f8');uy=regular(uth,geo.dy,1).astype('f8')
    vx=regular(vth,geo.dx/geo.mx,2).astype('f8');vy=regular(vth,geo.dy,1).astype('f8')
    fq=(-uz*(uz*ux+vz*uy)-vz*(uz*vx+vz*vy)).astype('f4')
    delta=np.empty(len(levels),dtype='f4');delta[1:-1]=levels[2:]-levels[:-2]
    delta[0]=levels[1]-levels[0];delta[-1]=levels[-1]-levels[-2]
    fq=np.abs(fq*(delta[:,None,None]/F(6))**2)
    fq=np.where(geo.cross,fq,np.nan)
    # interp_from_theta enforces monotonic zth and chooses first bracket.
    for k in range(1,len(levels)):
        zth[k]=np.where(zth[k]-zth[k-1]<F(1e-5),zth[k-1]+F(.01),zth[k])
    out=np.full_like(theta,np.nan);found=np.zeros(theta.shape,dtype=bool)
    for k in range(len(levels)-1):
        use=~found&(geo.z>=zth[k])&(geo.z<=zth[k+1])
        ratio=(geo.z-zth[k])/np.maximum(zth[k+1]-zth[k],F(.1))
        out=np.where(use,fq[k]+ratio*(fq[k+1]-fq[k]),out)
        found|=use
    return np.abs(out).astype('f4')
