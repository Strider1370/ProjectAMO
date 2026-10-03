"""Immutable map JSON export shared by calculation engines."""
import json
import numpy as np
from products import CATALOG


def export(bundle, results, out, checks, calibration, algorithm, limitations):
    out.mkdir(parents=True,exist_ok=True)
    diagnostics = []
    for name,label,code,unit in CATALOG:
        finite = np.concatenate([fields[name][np.isfinite(fields[name])] for _,fields in results])
        diagnostics.append({'id':name,'label':label,'code':code,'unit':unit,'combined':code>=491,
                            'colorMax':.5 if code>=491 else max(float(np.percentile(finite,99)),1e-12)})
    pressures = bundle['frames'][0]['pressures']
    levels = [{'id':f'{p//100}hPa','value':p//100} for p in pressures]
    times = []
    for cube,fields in results:
        if cube['pressures'] != pressures or cube['grid'] != bundle['frames'][0]['grid']:
            raise ValueError('Mixed input grids/levels')
        times.append({'hf':cube['hf'],'validTime':cube['validTime']})
        for k,level in enumerate(levels):
            target = out/f"hf{cube['hf']:03d}"/level['id']
            target.mkdir(parents=True,exist_ok=True)
            for diagnostic in diagnostics:
                values = fields[diagnostic['id']][k]
                finite = values[np.isfinite(values)]
                field = {'type':'kim_turbulence_experiment_field','experimental':True,'algorithm':algorithm,
                         'revision':bundle['revision'],'tmfc':bundle['tmfc'],'hf':cube['hf'],'validTime':cube['validTime'],
                         'grid':cube['grid'],'level':level,'diagnostic':diagnostic,
                         # A binary32 value represented as a JSON number round-trips exactly.
                         'values':[float(v) if np.isfinite(v) else None for v in values.ravel()],
                         'stats':{'valid':int(finite.size),'total':int(values.size),
                                  'max':float(finite.max()) if finite.size else None,
                                  'p95':float(np.percentile(finite,95)) if finite.size else None}}
                (target/f"{diagnostic['id']}.json").write_text(json.dumps(field,ensure_ascii=False,allow_nan=False))
    index = {'type':'kim_turbulence_experiment_index','experimental':True,'algorithm':algorithm,
             'revision':bundle['revision'],'tmfc':bundle['tmfc'],'times':times,'levels':levels,'diagnostics':diagnostics,
             'grid':bundle['frames'][0]['grid'],'input':bundle['provenance'],'combination':calibration,
             'calculationChecks':checks,
             'limitations':limitations}
    (out/'index.json').write_text(json.dumps(index,ensure_ascii=False,allow_nan=False))
    print(json.dumps({'algorithm':algorithm,'frames':len(times),'levels':len(levels),'diagnostics':len(diagnostics)}),flush=True)
