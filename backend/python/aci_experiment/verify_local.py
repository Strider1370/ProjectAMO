import sys,json,time,resource
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from engine import calculate
import numpy as np
p=np.load('artifacts/aci-capacity/kernel-inputs.npz');s,levels,t,q=[p[k] for k in ['surface','levels','t','q']]
cells=json.loads(Path('artifacts/aci-experiment/public/data.json').read_text())['cells']
expected=np.array([[c['cape'],c['cin']] for c in cells],dtype=float)
start=time.perf_counter();calculate(s[:1],levels,t[:1],q[:1]);startup=time.perf_counter()-start
start=time.perf_counter();results,fallback_count=calculate(s,levels,t,q);seconds=time.perf_counter()-start
valid=np.isfinite(expected[:,0]);actual=np.isfinite(results[:,0]);both=valid&actual
error=np.abs(expected[both]-results[both,:2]);tolerance=np.maximum(1,abs(expected[both])*.001)
bad=np.where(np.any(error>tolerance,axis=1))[0]
start=time.perf_counter();finer,fine_fallback_count=calculate(s,levels,t,q,50.);fine_seconds=time.perf_counter()-start
conv=np.abs(results[both,:2]-finer[both,:2])
score=lambda cape,rate,olr:(np.clip(cape/1000,0,1)+np.clip(rate/5,0,1)+np.clip((250-olr)/100,0,1))/3
rain=np.array([c['rainRate'] for c in cells],float);olr=np.array([c['olr'] for c in cells],float)
a=score(expected[both,0],rain[both],olr[both]);b=score(results[both,0],rain[both],olr[both])
bands=lambda x:np.searchsorted([.25,.5,.75],x,side='right')
report={'fallbackCount':fallback_count,'fineFallbackCount':fine_fallback_count,'points':len(s),'validExpected':int(valid.sum()),'validActual':int(actual.sum()),'validMismatch':int(sum(valid!=actual)),
'outsideTolerance':int(len(bad)),'capeMaxAbsError':float(error[:,0].max()),'cinMaxAbsError':float(error[:,1].max()),
'capeP99Error':float(np.quantile(error[:,0],.99)),'convergenceMaxCape':float(conv[:,0].max()),'convergenceValidMismatch':int(sum(actual!=np.isfinite(finer[:,0]))),
'scoreMaxError':float(np.max(abs(a-b))),'bandMismatch':int(sum(bands(a)!=bands(b))),'cacheStartupSeconds':startup,'nativeGridSeconds':seconds,'fineGridSeconds':fine_seconds,
'metpyPerColumnBaseline':.004368529196906813,'speedupEstimate':.004368529196906813*len(s)/seconds,'peakRssMiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024}
Path('artifacts/aci-capacity/full-kernel-results.json').write_text(json.dumps(report,indent=2));np.save('artifacts/aci-capacity/full-kernel-results.npy',results)
print(json.dumps(report,indent=2),flush=True)
assert report['validMismatch']==0 and report['outsideTolerance']==0
assert report['convergenceValidMismatch']==0 and report['convergenceMaxCape']<.01
assert report['bandMismatch']==0
