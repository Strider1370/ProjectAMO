"""Experimental compiled SBCAPE kernel, compared against MetPy 1.7.1.

Thermodynamic definitions and parcel/virtual-temperature crossing semantics follow
MetPy calc.thermo (BSD-3-Clause, Unidata). Numerical moist ascent uses bounded-step
RK4 instead of SciPy LSODA; this candidate is not enabled in the collector.
All kernel inputs are SI, Float64. No fastmath and no horizontal subsampling.
"""
import math
import numpy as np
from numba import njit

RD=287.04749097718457
RV=461.52311572606084
CPD=1004.6662184201462
CPV=1860.078011865639
CPL=4219.400000000001
LV=2500840.0
T0=273.16
EPS=0.6219569100577033
KAPPA=0.28571428571428564

@njit(cache=True)
def es(t):
    latent=LV-(CPL-CPV)*(t-T0)
    return 611.2*(T0/t)**((CPL-CPV)/RV)*math.exp((LV/T0-latent/t)/RV)

@njit(cache=True)
def mixing(p,t):
    e=es(t)
    return EPS*e/(p-e)

@njit(cache=True)
def td_from_q(p,q,t):
    r=q/(1-q)
    e=p*r/(EPS+r)
    x=math.log(e/611.2)
    return min(t,273.15+243.5*x/(17.67-x))

@njit(cache=True)
def lcl(p,t,td):
    r=mixing(p,td)
    q=r/(1+r)
    heat=((1-q)*CPD+q*CPV)/((1-q)*RD+q*RV)
    a=heat+(CPL-CPV)/RV
    b=-(LV+(CPL-CPV)*T0)/(RV*t)
    c=b/a
    rh=min(1.0,es(td)/es(t))
    logz=math.log(-c)+c+math.log(rh)/a
    # Real W(-1): solve w+log(-w)=log(-z), w<-1.
    w=logz-math.log(-logz)
    for _ in range(50):
        delta=(w+math.log(-w)-logz)/(1+1/w)
        w-=delta
        if abs(delta)<1e-13: break
    tl=c/w*t
    return p*(tl/t)**heat,tl

@njit(cache=True)
def moist_derivative(p,t):
    r=mixing(p,t)
    return (RD*t+LV*r)/(CPD+LV*LV*r*EPS/(RD*t*t))/p

@njit(cache=True)
def moist_to(p,t,target,max_step):
    steps=max(1,int(math.ceil(abs(target-p)/max_step)))
    h=(target-p)/steps
    for _ in range(steps):
        k1=moist_derivative(p,t)
        k2=moist_derivative(p+h/2,t+h*k1/2)
        k3=moist_derivative(p+h/2,t+h*k2/2)
        k4=moist_derivative(p+h,t+h*k3)
        t+=h*(k1+2*k2+2*k3+k4)/6
        p+=h
    return t

@njit(cache=True)
def close(a,b):
    return abs(a-b)<=1e-8+1e-5*abs(b)

@njit(cache=True)
def interpolate_linear(p,values,level):
    for i in range(len(p)-1):
        if p[i]>=level>=p[i+1]:
            return values[i]+(values[i+1]-values[i])*(level-p[i])/(p[i+1]-p[i])
    return np.nan

@njit(cache=True)
def intersections(p,y,start,direction):
    out=np.empty(len(p));n=0
    for i in range(start,len(p)-1):
        s0=np.sign(y[i]);s1=np.sign(y[i+1])
        if s0!=s1 and (direction==0 or (direction>0 and s1>0) or (direction<0 and s1<0)):
            cross=math.exp((y[i+1]*math.log(p[i])-y[i]*math.log(p[i+1]))/(y[i+1]-y[i]))
            if n==0 or cross!=out[n-1]:out[n]=cross;n+=1
    return out[:n]

@njit(cache=True)
def cape_column(ps,t2m,q2m,levels,temperatures,humidities,max_step=2000.0):
    if not (30000<ps<110000 and 180<t2m<340 and 0<q2m<.05):return np.nan,np.nan,1
    size=len(levels)+2
    p=np.empty(size);t=np.empty(size);td=np.empty(size);n=1
    p[0]=ps;t[0]=t2m;td[0]=td_from_q(ps,q2m,t2m)
    for k in range(len(levels)):
        if levels[k]>=ps-1.0:continue
        if not (150<temperatures[k]<340 and 0<=humidities[k]<.05):return np.nan,np.nan,1
        p[n]=levels[k];t[n]=temperatures[k];td[n]=td_from_q(p[n],max(humidities[k],1e-8),t[n]);n+=1
    if n<2 or p[n-1]>15000:return np.nan,np.nan,1
    pl,tl=lcl(ps,t2m,td[0])
    # MetPy inserts an LCL level (linear pressure environmental interpolation).
    # If LCL is outside profile range, interpolate_1d produces NaN and cape_cin removes it.
    if p[n-1]<=pl<=ps:
        ti=interpolate_linear(p[:n],t[:n],pl);di=interpolate_linear(p[:n],td[:n],pl)
        loc=0
        while loc<n and p[loc]>=pl:loc+=1
        for k in range(n,loc,-1):p[k]=p[k-1];t[k]=t[k-1];td[k]=td[k-1]
        p[loc]=pl;t[loc]=ti;td[loc]=di;n+=1
    parcel=np.empty(n)
    moist_p=pl;moist_t=t2m*(pl/ps)**KAPPA
    r0=mixing(ps,td[0])
    for k in range(n):
        if p[k]>pl or close(p[k],pl):
            parcel[k]=t2m*(p[k]/ps)**KAPPA
            if p[k]==pl:parcel[k]=tl
        else:
            moist_t=moist_to(moist_p,moist_t,p[k],max_step);moist_p=p[k];parcel[k]=moist_t
    # Virtual temperature correction, preserving the parcel mixing ratio below LCL.
    env=np.empty(n);vpar=np.empty(n)
    for k in range(n):
        re=mixing(p[k],td[k]);rp=r0 if p[k]>pl else mixing(p[k],parcel[k])
        env[k]=t[k]*(re+EPS)/(EPS*(1+re))
        vpar[k]=parcel[k]*(rp+EPS)/(EPS*(1+rp))
    y=vpar-env
    # Near-zero buoyancy can change which of multiple LFCs is selected when
    # RK4 and LSODA differ by only a few microkelvin. Defer to reference.
    for k in range(1,n):
        if abs(y[k])<1e-3:return np.nan,np.nan,3
    # cape_cin calls LFC/EL with the virtual-temperature profiles and dewpoint.
    lcl_lfc,_=lcl(ps,vpar[0],td[0])
    inc=intersections(p[:n],y,1 if close(vpar[0],env[0]) else 0,1)
    dec=intersections(p[:n],y,1,-1)
    lfc=np.nan
    if len(inc)==0:
        positive=False
        for k in range(n):
            if p[k]<lcl_lfc and y[k]>0 and not close(vpar[k],env[k]):positive=True
        if positive:lfc=lcl_lfc
    else:
        for value in inc:
            if value<lcl_lfc:lfc=value;break
        if math.isnan(lfc):
            if len(dec)==0 or min(dec)<=lcl_lfc:lfc=lcl_lfc
    if math.isnan(lfc):return 0.0,0.0,0
    el=p[n-1]
    lcl_el,_=lcl(ps,env[0],td[0])
    if y[n-1]<=0 and len(dec)>0 and dec[-1]<lcl_el:el=dec[-1]
    # Integration nodes sorted ascending, zero crossings added as MetPy does.
    crosses=intersections(p[:n],y,1,0)
    xp=np.concatenate((p[:n],crosses));yp=np.concatenate((y,np.zeros(len(crosses))))
    order=np.argsort(xp);xp=xp[order];yp=yp[order]
    cape=0.0;cin=0.0;pc=np.nan;yc=0.0;pi=np.nan;yi=0.0
    for k in range(len(xp)):
        # MetPy keeps the last node of duplicates within 1e-6 hPa.
        if k<len(xp)-1 and xp[k+1]-xp[k]<=1e-4:continue
        x=xp[k];v=yp[k]
        if (x<lfc or close(x,lfc)) and (x>el or close(x,el)):
            if not math.isnan(pc):cape+=(v+yc)/2*math.log(x/pc)*RD
            pc=x;yc=v
        if x>lfc or close(x,lfc):
            if not math.isnan(pi):cin+=(v+yi)/2*math.log(x/pi)*RD
            pi=x;yi=v
    if not math.isfinite(cape) or cape<-1e-8:return np.nan,np.nan,2
    return max(0.0,cape),min(0.0,cin),0

@njit(cache=True)
def calculate_batch(surface,levels,temperature,humidity,max_step=2000.0):
    out=np.empty((surface.shape[0],3))
    for i in range(surface.shape[0]):
        a,b,status=cape_column(surface[i,0],surface[i,1],surface[i,2],levels,temperature[i],humidity[i],max_step)
        out[i,0]=a;out[i,1]=b;out[i,2]=status
    return out
