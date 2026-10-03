"""REAL arithmetic translation of active itfacomp41.f native static path."""
import numpy as np
from python_core import F,smooth


def bounds(height,mask):
    ny,nx=mask.shape
    ys,xs=np.where(mask)
    imin,jmin,jmax=int(xs.min()),int(ys.min()),int(ys.max())
    # GetkBdys scans i outermost, j innermost, replacing only on <.
    bottom=height[0,jmin:jmax+1,imin:imin+2].T
    i,j=np.unravel_index(np.argmin(bottom),bottom.shape)
    levels=np.maximum(height[:,jmin+j,imin+i]*F(3.28),F(0))
    out=[];last=len(levels)-1
    for region,(lo,hi) in enumerate(((100,10000),(11000,20000),(21000,60000))):
        start=0 if region==0 else next((k for k in range(len(levels)) if levels[k]>=lo),last)
        end=next((k for k in range(start+1,len(levels)) if levels[k]>=hi),last)
        out.append((start,end))
    return out


def merge(a,start):
    center=min(max(start,2),len(a)-3)
    for dest,begin in ((center,center-1),(center+1,center),(center-1,center-2)):
        total=np.zeros(a.shape[1:],dtype='f4');count=np.zeros(a.shape[1:],dtype='i4')
        for k in range(begin,begin+3):
            valid=np.isfinite(a[k]);total=total+np.where(valid,a[k],F(0));count+=valid
        a[dest]=np.where(count>0,total/np.maximum(count,1).astype('f4'),a[dest])


def combine(raw,bands,calibration,mask):
    shape=next(iter(raw.values())).shape
    cat=np.full(shape,np.nan,dtype='f4')
    mountain=np.where(mask,np.zeros(shape,dtype='f4'),np.nan)
    for region,(start,end) in enumerate(bands,1):
        band=slice(start,end+1)
        for ismount,target in ((False,cat),(True,mountain)):
            codes=sorted(code for code in calibration['selected'][str(region)] if (code>=476)==ismount)
            weight=F(1)/F(len(codes))
            for number,code in enumerate(codes):
                fit=calibration['fits'][f'{region}:{code}'];value=raw[code][band]
                with np.errstate(all='ignore'):
                    mapped=np.exp(F(fit['a'])+F(fit['b'])*np.log(np.maximum(value,F(1e-20))))
                mapped=np.where(value<F(1e-20),F(0),np.clip(mapped,F(0),F(1.5))).astype('f4')
                prior=np.zeros_like(mapped) if number==0 else target[band]
                valid=mask & np.isfinite(prior) & np.isfinite(mapped)
                target[band]=np.where(valid,prior+weight*np.maximum(mapped,F(0)),target[band])
            target[band]=np.clip(target[band],F(0),F(1))
            if region>1:merge(target,start)
    # 493.F is saved here. itfamax later smooths its internal MWT array.
    saved_mountain=mountain.copy()
    gktg=np.full(shape,np.nan,dtype='f4')
    for region,(start,end) in enumerate(bands,1):
        band=slice(start,end+1)
        gktg[band]=np.clip(np.maximum(cat[band],mountain[band]),F(0),F(1))
        if region>1:merge(gktg,start)
    start,end=bands[-1]
    region=np.zeros(shape,dtype=bool);region[start:end+1]=mask
    # meanFilter3D work storage retains horizontal values outside kmin/kmax
    # during the vertical pass. The first high-region point consequently
    # sees the still-missing work point below it and is left unsmoothed.
    gktg=smooth(gktg,1,1,region)
    return {'cat':cat,'mwt':saved_mountain,'gktg':gktg}
