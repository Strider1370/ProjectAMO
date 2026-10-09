"""Operational file-based CAPE CLI; one worker, bounded blocks and shared compiled kernel."""
import json,os,sys,time,warnings
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'aci_experiment'))
from engine import calculate
job_file=Path(sys.argv[1]);out=Path(sys.argv[2]);job=json.loads(job_file.read_text());base=job_file.parent
n=job['grid']['nx']*job['grid']['ny'];nz=len(job['pressures'])
t=np.memmap(base/'T.f32',dtype='<f4',mode='r',shape=(nz,n))
q=np.memmap(base/'q.f32',dtype='<f4',mode='r',shape=(nz,n))
s=np.memmap(base/'surface.f32',dtype='<f4',mode='r',shape=(3,n))
result=np.memmap(out/'cape.f32',dtype='<f4',mode='w+',shape=(3,n))
fallbacks=0;started=time.perf_counter()
with warnings.catch_warnings():
 warnings.simplefilter('ignore',UserWarning)
 for i in range(0,n,8192):
  r,count=calculate(s[:,i:i+8192].T.astype(float),np.array(job['pressures'])*100,t[:,i:i+8192].T.astype(float),q[:,i:i+8192].T.astype(float),job['maxStepPa'])
  result[:,i:i+len(r)]=r.T;fallbacks+=count
  print(json.dumps({'columns':min(i+8192,n),'total':n}),flush=True)
result.flush()
(out/'result.json').write_text(json.dumps({'columns':n,'fallbacks':fallbacks,'seconds':time.perf_counter()-started}))
