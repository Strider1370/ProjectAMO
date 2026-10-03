"""Export original TURB .F results; Python performs no diagnostic arithmetic."""
import argparse
import json
import os
from pathlib import Path

import numpy as np

from fortran_runtime import DEFAULT_BUILD, REPO, ensure_build, load_build, read_f_record, run_original, validate_cube
from products import CATALOG

ALGORITHM = 'kim-gktg-original-fortran-v4'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path,nargs='?')
    parser.add_argument('output',type=Path,nargs='?')
    parser.add_argument('--build',type=Path,default=Path(os.environ.get('KIM_TURBULENCE_FORTRAN_BUILD',DEFAULT_BUILD)))
    parser.add_argument('--prepare',action='store_true')
    args = parser.parse_args()
    build_folder = args.build.resolve()
    if args.prepare:
        ensure_build(build_folder)
        return
    if args.input is None or args.output is None:
        parser.error('input and output are required for calculation')
    build = load_build(build_folder)
    bundle = json.loads(args.input.read_text())
    engine = bundle['provenance']['originalEngine']
    if engine['executableSha256'] != build['executableSha256'] or engine['files'] != build['files']:
        raise ValueError('Input revision does not identify this original Fortran build')
    calibration = json.loads(Path(__file__).with_name('calibration.json').read_text())
    out = args.output
    out.mkdir(parents=True,exist_ok=True)
    results,checks = [],[]
    native_root = REPO/f"artifacts/kim-turbulence-native/{bundle['revision']}"
    for cube in bundle['frames']:
        shape = validate_cube(cube)
        folder = native_root/f"hf{cube['hf']:03d}"
        print(f"Original Fortran indices_gtg -> ITFAcompF: +{cube['hf']}h",flush=True)
        checks.append({'hf':cube['hf'],**run_original(build,cube,folder,calibration)})
        fields = {}
        for name,_,code,_ in CATALOG:
            values = read_f_record(folder/f'{code}.F',shape)
            # Export the same native .F values, including the pre-itfamax 493.F.
            # The regional compute halo is hidden without altering interior data.
            values[:,:10,:] = values[:,-10:,:] = np.nan
            values[:,:,:10] = values[:,:,-10:] = np.nan
            finite = values[np.isfinite(values)]
            if not finite.size or np.any(finite < 0):
                raise ValueError(f'Invalid original diagnostic output: {name}')
            fields[name] = values
        results.append((cube,fields))
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
                field = {'type':'kim_turbulence_experiment_field','experimental':True,'algorithm':ALGORITHM,
                         'revision':bundle['revision'],'tmfc':bundle['tmfc'],'hf':cube['hf'],'validTime':cube['validTime'],
                         'grid':cube['grid'],'level':level,'diagnostic':diagnostic,
                         # A binary32 value represented as a JSON number round-trips exactly.
                         'values':[float(v) if np.isfinite(v) else None for v in values.ravel()],
                         'stats':{'valid':int(finite.size),'total':int(values.size),
                                  'max':float(finite.max()) if finite.size else None,
                                  'p95':float(np.percentile(finite,95)) if finite.size else None}}
                (target/f"{diagnostic['id']}.json").write_text(json.dumps(field,ensure_ascii=False,allow_nan=False))
    index = {'type':'kim_turbulence_experiment_index','experimental':True,'algorithm':ALGORITHM,
             'revision':bundle['revision'],'tmfc':bundle['tmfc'],'times':times,'levels':levels,'diagnostics':diagnostics,
             'grid':bundle['frames'][0]['grid'],'input':bundle['provenance'],'combination':calibration,
             'originalRoutineChecks':checks,
             'limitations':['Original active indices_gtg and ITFAcompF; 24 diagnostics -> CAT/MWT/GKTG',
                            'Regional 205x169 grid and 21 native pressure layers; no global cyclic boundary',
                            'Native specific humidity; original mixing-ratio smoothing, Ri and theta interpolation retained',
                            'MWT exported from original 493.F before itfamax modifies its internal array',
                            'Inherited UM coefficients and strength thresholds not recalibrated/validated for regional KIM',
                            'Full Intel MPI/NetCDF 91-layer run and final flight-level .Q product not reproduced']}
    (out/'index.json').write_text(json.dumps(index,ensure_ascii=False,allow_nan=False))
    print(json.dumps({'algorithm':ALGORITHM,'frames':len(times),'levels':len(levels),'diagnostics':len(diagnostics)}),flush=True)


if __name__ == '__main__':
    main()
