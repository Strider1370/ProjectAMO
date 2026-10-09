import sys,json,time,resource
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from engine import calculate
import numpy as np
p=np.load('artifacts/aci-capacity/kernel-inputs.npz');s,levels,t,q=[p[k] for k in ['surface','levels','t','q']]
# Full native expanded shape workload, cycling real KR profiles. Not an EA forecast parity test.
count=841*529;block=64*64
calculate(s[:1],levels,t[:1],q[:1])
start=time.perf_counter();valid=0;fallback=0;blocks=0
for lo in range(0,count,block):
 idx=np.arange(lo,min(lo+block,count))%len(s)
 out,n=calculate(s[idx],levels,t[idx],q[idx]);fallback+=n;valid+=int(sum(out[:,2]==0));blocks+=1
 if blocks%25==0:print(f'Computed {min(lo+block,count)}/{count}',flush=True)
elapsed=time.perf_counter()-start
report={'workload':'841x529 shape, repeated real 205x169 profiles; not actual full EA meteorology','columns':count,'blocks':blocks,'blockColumns':block,'workers':1,'seconds':elapsed,'valid':valid,'fallbacks':fallback,'daily62FramesCpuHours':elapsed*62/3600,'peakRssMiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,'target90SecondsPassed':elapsed<=90}
Path('artifacts/aci-capacity/expanded-kernel-benchmark.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
