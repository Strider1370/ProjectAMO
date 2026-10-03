"""Calculate the operational 24 TURB indices and CAT/MWT/GKTG in Python."""
import argparse
import json
from pathlib import Path
import numpy as np
from python_port import calculate
from input_validation import validate_cube
from export_products import export
from products import CATALOG

ALGORITHM='kim-gktg-python-v5'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    bundle=json.loads(args.input.read_text())
    results=[];checks=[]
    for cube in bundle['frames']:
        validate_cube(cube)
        print(f"Python TURB 24 diagnostics -> CAT/MWT/GKTG: +{cube['hf']}h",flush=True)
        fields,_,internal=calculate(cube)
        for name,_,_,_ in CATALOG:
            values=fields[name]
            values[:,:10,:]=values[:,-10:,:]=np.nan
            values[:,:,:10]=values[:,:,-10:]=np.nan
            finite=values[np.isfinite(values)]
            if not finite.size or np.any(finite<0):
                raise ValueError(f'Invalid Python diagnostic output: {name}')
        results.append((cube,fields))
        checks.append({'hf':cube['hf'],'nativeRegionBounds':internal['bounds'],'diagnostics':24,
                       'engine':'Python/NumPy/Numba; no Fortran execution','fastmath':False})
    calibration=json.loads(Path(__file__).with_name('calibration.json').read_text())
    export(bundle,results,args.output,checks,calibration,ALGORITHM,
           ['Operational KIM native-grid 24 selected indices translated to Python',
            'Regional 205x169 grid / 21 pressure levels; no global cyclic boundary',
            'Specific-humidity conversion, Ri smoothing, theta regridding, structure functions and original save order retained',
            'UM coefficients and intensity classes not recalibrated for this KIM regional grid',
            'Full Intel MPI/NetCDF 91-layer global ingestion and final .Q flight-level product outside this experiment'])


if __name__=='__main__':main()
