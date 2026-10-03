"""sfnroutines40-nofit.f translated without fitting/algorithm changes.

Numba accelerates Python loops only; fastmath is disabled. The original
scalar interpolator's retained-work-array branch is deliberately preserved.
"""
import numpy as np
from numba import njit

F=np.float32


@njit(cache=True, fastmath=False)
def structure_fields(fields,z,mx,ds,halo=10):
    nz,ny,nx=z.shape
    work=np.full(fields.shape,np.nan,dtype=np.float32)
    outputs=np.full((4,2,nz,ny,nx),np.nan,dtype=np.float32)
    for kc in range(1,nz-1):
        for jc in range(halo,ny-halo):
            for ic in range(halo,nx-halo):
                # interp_to_zc2 for u/v and interp_to_zc1 for T/w.
                for k in range(kc-1,kc+2):
                    zc=z[k,jc,ic]
                    for j in range(jc-2,jc+3):
                        for i in range(ic-2,ic+3):
                            if i==ic and j==jc:
                                for n in range(4): work[n,k,j,i]=fields[n,k,j,i]
                            elif zc<z[0,j,i]:
                                dzc=zc-z[0,j,i];dzm=z[1,j,i]-z[0,j,i]
                                # The scalar routine computes qc but never
                                # assigns qonzc in this branch. Keep its prior
                                # work value; the two-variable routine writes.
                                for n in range(2):
                                    val=F(np.nan)
                                    if -dzc<dzm:
                                        slope=(fields[n,1,j,i]-fields[n,0,j,i])/dzm
                                        val=fields[n,0,j,i]+slope*dzc
                                    work[n,k,j,i]=val
                            elif zc>z[nz-2,j,i]:
                                for n in range(4):work[n,k,j,i]=F(np.nan)
                            else:
                                for n in range(4):work[n,k,j,i]=F(np.nan)
                                if k>=nz-1:continue
                                ki=k
                                if not (z[ki,j,i]<=zc and z[ki+1,j,i]>=zc):
                                    if z[ki,j,i]<zc:
                                        for k1 in range(k+1,nz):
                                            ki=k1-1
                                            if z[k1,j,i]>=zc:break
                                    else:
                                        for k1 in range(k-1,-1,-1):
                                            ki=k1
                                            if z[k1,j,i]<=zc:break
                                if ki<0 or ki>=nz-1:continue
                                dz=z[ki+1,j,i]-z[ki,j,i]
                                ratio=(zc-z[ki,j,i])/dz if abs(dz)>=F(.1) else F(0)
                                for n in range(4):
                                    work[n,k,j,i]=((F(1)-ratio)*fields[n,ki,j,i]+ratio*fields[n,ki+1,j,i]) if abs(dz)>=F(.1) else fields[n,ki,j,i]
                for axis in range(2):
                    for n in range(4):
                        sumn=0.;sumd=0.;valid_lags=0
                        for lag in range(1,5):
                            total=0.;count=0
                            # The accumulation order in the source is k,j,i
                            # for x, and k,i,j for y. Float32 squares become
                            # DOUBLE before accumulation.
                            for k in range(kc-1,kc+2):
                                for across in range(-2,3):
                                    for along in range(-2,3-lag):
                                        if axis==0:
                                            j=jc+across;i=ic+along
                                            v1=work[n,k,j,i];v2=work[n,k,j,i+lag]
                                        else:
                                            j=jc+along;i=ic+across
                                            v1=work[n,k,j,i];v2=work[n,k,j+lag,i]
                                        if np.isfinite(v1) and np.isfinite(v2):
                                            diff=F(v1-v2)
                                            total+=np.float64(F(diff*diff));count+=1
                            if count<=1:continue
                            dl=F(total/count)
                            distance=F(F(mx[jc]*ds)*F(lag)) if axis==0 else F(ds*F(lag))
                            ssq=F(distance*distance)
                            if n==3:
                                power=F(F(distance/F(5000))**F(.66666666666))
                                model=np.float64(F(power/(F(1)+power)))
                            else:
                                transverse=(n==1 and axis==0) or (n==0 and axis==1)
                                b=F(1.625e-6) if transverse else F(6.66666666e-7)
                                c=F(1.075e-7) if transverse else F(4.444444444e-8)
                                model=np.float64(F(F(F(distance**F(.6666667))+F(b*ssq))-F(F(c*ssq)*F(np.log(distance)))))
                            ratio=np.float64(dl)/model
                            sumn+=ratio**2/F(lag);sumd+=ratio/F(lag);valid_lags+=1
                        threshold=F(1e-16) if n==3 else F(1e-12)
                        if valid_lags==4:
                            value=F(abs(sumn/sumd)) if abs(sumn)>threshold else F(0)
                            if n<2:
                                transverse=(n==1 and axis==0) or (n==0 and axis==1)
                                value=F(value/(F(2.222222222) if transverse else F(2)))
                            elif n==3:value=F(value/F(2))
                            outputs[n,axis,kc,jc,ic]=value
    edr=F(.25)*(outputs[0,0]+outputs[1,0]+outputs[0,1]+outputs[1,1])
    edrll=outputs[0,0]
    ctsq=F(.5)*(outputs[2,0]+outputs[2,1])
    varw=F(.5)*(outputs[3,0]+outputs[3,1])
    return edr,edrll,ctsq,varw
