"""Offline scientific comparison: Python kernels vs unchanged TURB Fortran.

The Fortran executable is used only by this verification command. Map
collection/calculation has no import or dependency on this command.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from python_port import calculate
from python_core import F,KAPPA
from products import CATALOG
from fortran_runtime import REPO,DEFAULT_BUILD,load_build,run_original,read_f_record,validate_cube


def synthetic(kind):
    nz,ny,nx=21,169,205
    p=np.linspace(100000,15000,nz,dtype='f4')
    x=np.linspace(-1,1,nx,dtype='f4')[None,None,:]
    y=np.linspace(-1,1,ny,dtype='f4')[None,:,None]
    k=np.arange(nz,dtype='f4')[:,None,None]
    topo=(F(700)*np.exp(-F(15)*(x[0]*x[0]+y[0]*y[0]))).astype('f4')
    z=np.broadcast_to(F(200)+F(500)*k+F(80)*x+F(60)*y+F(.12)*topo,(nz,ny,nx)).copy()
    th=np.broadcast_to(F(285)+F(2)*k+F(2)*x-F(1)*y,z.shape).copy()
    u=np.broadcast_to(F(10)+F(1.5)*k+F(3)*x+F(2)*y,z.shape).copy()
    v=np.broadcast_to(F(5)+F(.3)*k-F(2)*x+F(3)*y,z.shape).copy()
    w=np.broadcast_to(F(.2)*np.sin(F(3)*x)*np.cos(F(2)*y)*(F(1)+F(.1)*k),z.shape).copy()
    if kind=='inversion-zero-shear':
        # Exercise Rimap negative layers, theta monotonic adjustment,
        # nearest positive shear search, and zero-w structure functions.
        th[5]=th[4]-F(1);th[6]=th[5]-F(1)
        u[8:11]=u[9].copy();v[8:11]=v[9].copy()
        w[:]=F(0)
    elif kind=='constant-wind':
        u[:]=F(10);v[:]=F(5)
    rpk=((100000./p.astype('f8'))**KAPPA).astype('f4')[:,None,None]
    t=(th/rpk).astype('f4')
    return {'grid':{'nx':nx,'ny':ny,'lonMin':119,'lonMax':136,'latMin':30,'latMax':44},
            'pressures':p.tolist(),'hf':0,'validTime':'2026-09-10T06:00:00.000Z',
            'fields':{'u':u,'v':v,'w':w,'hgt':z,'T':t,'q':np.zeros_like(z)},
            'surface':{'ps':np.full((ny,nx),100000,dtype='f4'),'topo':topo,'hpbl':np.full((ny,nx),1000,dtype='f4')}}


def metrics(a,b,mask):
    finite_a=np.isfinite(a)[mask];finite_b=np.isfinite(b)[mask]
    matching=bool(np.array_equal(finite_a,finite_b))
    valid=mask&np.isfinite(a)&np.isfinite(b)
    aa=a[valid].astype('f8');bb=b[valid].astype('f8');error=aa-bb
    rms=float(np.sqrt(np.mean(bb*bb))) if bb.size else 0.
    eps=float(np.finfo('f4').eps)
    # Component subtraction/derivative chains can amplify a last-bit
    # difference near zero. The absolute allowance is tied to THIS field's
    # RMS, so even 1e-17-scale indices cannot pass a generic 1e-8 tolerance.
    rtol=128*eps;atol=8*eps*rms
    close=np.abs(error)<=atol+rtol*np.abs(bb)
    return {'pairs':int(bb.size),'missingMatches':matching,
            'binary32Exact':bool(matching and np.array_equal(aa,bb)),
            'rmse':float(np.sqrt(np.mean(error*error))) if bb.size else 0.,
            'maxAbsError':float(np.max(np.abs(error))) if bb.size else 0.,
            'relativeRmse':float(np.sqrt(np.mean(error*error))/rms) if rms else 0.,
            'rtol':rtol,'atol':atol,'outsideTolerance':int(np.count_nonzero(~close)),
            'passed':bool(matching and np.all(close))}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',type=Path)
    parser.add_argument('--build',type=Path,default=DEFAULT_BUILD)
    parser.add_argument('--output',type=Path,default=REPO/'artifacts/kim-turbulence-python-v5')
    parser.add_argument('--synthetic',action='store_true')
    parser.add_argument('--data-root',type=Path)
    args=parser.parse_args()
    bundle=json.loads(args.input.read_text()) if args.input else None
    cases=[(f"hf{c['hf']:03d}",c) for c in bundle['frames']] if bundle else []
    if args.synthetic:cases += [(name,synthetic(name)) for name in ('analytic','inversion-zero-shear','constant-wind')]
    if not cases:parser.error('provide --input and/or --synthetic')
    build=load_build(args.build);calibration=json.loads(Path(__file__).with_name('calibration.json').read_text())
    args.output.mkdir(parents=True,exist_ok=True)
    result={'algorithm':'kim-gktg-python-v5','method':'Pure Python compared against unchanged original indices_gtg and ITFAcompF',
            'revision':bundle['revision'] if bundle else None,'build':build,'cases':[],'passed':True}
    runtime_files=['calculate_python.py','python_port.py','python_core.py','python_dynamics.py','python_theta.py',
                   'python_structure.py','python_combine.py','export_products.py','input_validation.py','calibration.json','requirements.txt']
    result['pythonSources']=[{'file':name,'sha256':hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()} for name in runtime_files]
    for name,cube in cases:
        print(f'Python / original Fortran comparison: {name}',flush=True)
        shape=validate_cube(cube);folder=(args.output/name).resolve()
        original=run_original(build,cube,folder,calibration,mode='active-main')
        fields,stages,internals=calculate(cube)
        mask=np.zeros(shape,bool);mask[:,10:-10,10:-10]=True
        products=[]
        for key,label,code,_ in CATALOG:
            reference=read_f_record(folder/f'{code}.F',shape)
            item={'diagnostic':key,'code':code,'label':label,**metrics(fields[key],reference,mask)}
            if args.data_root and name.startswith('hf'):
                path=args.data_root/f"kim_turbulence_experiment/runs/{bundle['revision']}/{name}"
                rows=[]
                for p in cube['pressures']:
                    data=json.loads((path/f'{p//100}hPa/{key}.json').read_text())
                    if (data['revision'],data['algorithm'],data['hf'],data['validTime'])!=(bundle['revision'],result['algorithm'],cube['hf'],cube['validTime']):
                        raise ValueError('Published field identity mismatch')
                    rows.append(np.asarray(data['values'],float).reshape(shape[1:]))
                published=np.asarray(rows)
                item['publishedMatchesPython']=bool(np.array_equal(published,fields[key],equal_nan=True)) if not np.isfinite(fields[key][~mask]).any() else bool(np.array_equal(published[mask],fields[key][mask],equal_nan=True) and not np.isfinite(published[~mask]).any())
                item['passed'] &= item['publishedMatchesPython']
            products.append(item);result['passed'] &= item['passed']
        intermediates=[]
        for code,a in stages.items():
            if not (folder/f'{code}.F').exists():continue
            b=read_f_record(folder/f'{code}.F',a.shape)
            scope=mask if a.ndim==3 else mask[0]
            item={'code':code,**metrics(a,b,scope)}
            intermediates.append(item);result['passed'] &= item['passed']
        native=np.fromfile(folder/'region-bounds.bin',dtype='<i4')
        expected=list(zip((native[:3]-1).tolist(),(native[3:]-1).tolist()))
        bounds_match=internals['bounds']==expected
        result['passed'] &= bounds_match
        result['cases'].append({'case':name,'checks':original,'boundsMatch':bounds_match,'products':products,'intermediates':intermediates})
        print(json.dumps({'case':name,'products':len(products),'exact':sum(p['binary32Exact'] for p in products),
                          'passed':all(p['passed'] for p in products),'failed':[p['diagnostic'] for p in products if not p['passed']]}),flush=True)
    (args.output/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False))
    lines=['# TURB Python 완전 이식 수치 검증','',f"revision: `{result['revision']}`",'',
           '원본 파일을 수정 없이 컴파일한 indices_gtg → ITFAcompF와 같은 입력으로 대조한다.',
           '실제 KIM 압력층의 선택 24종과 CAT/MWT/GKTG, 결측 위치, 중간값, 고도대 경계를 검사한다.',
           '허용 오차는 각 지수의 크기에 맞춘 float32 오차이며 0/결측을 바꿔 통과시키지 않는다.',
           'Fortran은 이 검증 명령에서만 실행한다. 앱 계산은 Python/NumPy/Numba다.','',
           '| 사례 | 지수 | 격자 | RMSE | 최대 절대 오차 | 정확 일치 | 결측 일치 | 통과 |',
           '|---|---|---:|---:|---:|---|---|---|']
    for case in result['cases']:
        for p in case['products']:
            lines.append(f"| {case['case']} | {p['label']} | {p['pairs']:,} | {p['rmse']:.4g} | {p['maxAbsError']:.4g} | {p['binary32Exact']} | {p['missingMatches']} | {p['passed']} |")
    lines += ['',f"전체 결과: {'통과' if result['passed'] else '실패'}",'']
    (args.output/'verification.md').write_text('\n'.join(lines))
    if not result['passed']:raise ValueError('Python port differs from original reference')


if __name__=='__main__':main()
