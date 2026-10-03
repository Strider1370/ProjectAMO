"""Compare the published Python port with compiled original TURB routines.

This is a same-input regional/native-grid comparison, not a reproduction of
the Intel MPI deployment, its 91-layer inputs or its final .Q/NetCDF output.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

import numpy as np

from calculate import CATALOG, smooth
from combine import combine, native_region_bounds
from fortran_runtime import read_f_record, write_input, verify_configuration, verify_input_records




def metrics(reference, port, mask):
    reference, port = np.broadcast_arrays(reference, port)
    mask = np.broadcast_to(mask, reference.shape)
    valid_a, valid_b = np.isfinite(reference), np.isfinite(port)
    paired = mask & valid_a & valid_b
    a, b = reference[paired], port[paired]
    result = {'evaluatedCells': int(mask.sum()), 'pairs': int(paired.sum()),
              'fortranOnly': int((mask & valid_a & ~valid_b).sum()),
              'pythonOnly': int((mask & ~valid_a & valid_b).sum()),
              'bothMissing': int((mask & ~valid_a & ~valid_b).sum())}
    if not len(a):
        return result
    error = b-a
    rmse = np.sqrt(np.mean(error**2))
    std = np.std(a)
    result.update({'fortranMean': float(np.mean(a)), 'pythonMean': float(np.mean(b)),
                   'bias': float(np.mean(error)), 'mae': float(np.mean(np.abs(error))), 'rmse': float(rmse),
                   'maxAbsError': float(np.max(np.abs(error))),
                   'pearson': float(np.corrcoef(a,b)[0,1]) if std > 0 and np.std(b) > 0 else None,
                   'normalizedRmseByFortranStd': float(rmse/std) if std > 0 else None,
                   'withinTolerance': float(np.mean(np.abs(error) <= 1e-8 + 1e-5*np.abs(a))),
                   'fortranP95': float(np.percentile(a,95)), 'pythonP95': float(np.percentile(b,95))})
    return result








def plot(folder, hf, pressure, grid, original, port, mask):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import BoundaryNorm, ListedColormap
    from matplotlib.collections import LineCollection
    from compare_ktg import coastlines
    repo = Path(__file__).resolve().parents[2]
    extent = [grid['lonMin'],grid['lonMax'],grid['latMin'],grid['latMax']]
    cmap = ListedColormap(['#eeeeee','#33ff00','#ffcc00','#ff2900'])
    norm = BoundaryNorm([0,.15,.22,.34,1.01],4)
    fig,axes = plt.subplots(1,3,figsize=(16,5),layout='constrained')
    coast = coastlines(repo)
    for ax,values,title in zip(axes,[original,port,port-original],['Original Fortran GKTG','Python port GKTG','Python minus Fortran']):
        values = np.where(mask,values,np.nan)
        image = ax.imshow(values,origin='lower',extent=extent,cmap=cmap if ax is not axes[2] else 'RdBu_r',
                          norm=norm if ax is not axes[2] else None,
                          vmin=None if ax is not axes[2] else -.10,vmax=None if ax is not axes[2] else .10)
        ax.add_collection(LineCollection(coast,colors='#777777',linewidths=.4))
        ax.set(xlim=(123,134),ylim=(31,41),title=title,xlabel='Longitude (E)',ylabel='Latitude (N)')
        fig.colorbar(image,ax=ax,orientation='horizontal',shrink=.8)
    fig.suptitle(f'Same 21-layer KIM input | +{hf}h | {pressure} hPa | interior cells only')
    fig.savefig(folder/f'fortran-vs-python-hf{hf}-{pressure}hPa.png',dpi=140)
    plt.close(fig)


def report(result):
    lines = ['# 원본 Fortran과 Python 시험 이식의 같은 입력 비교', '',
             f"발표 {result['tmfc']} UTC, Python {result['algorithm']}, revision `{result['revision']}`.",
             '같은 205×169 지역 격자, 21개 압력층, +6/+9시간을 사용했다. 원본 계산 루틴을 GNU Fortran으로 컴파일해 직접 호출했다.', '',
             '## 비교 범위', '',
             '- 원본 read_config와 CheckIndices로 선택 지수·계수·가중치를 읽고 설정했다. 선택 24종, 고도대별 계수/가중치 28개를 검증했다.',
             '- 원본 indices_gtg → GetkBdys → ITFA_MWT → ITFA_static → itfamax를 실행했다. 원본 수식과 분기는 수정하지 않았다.',
             '- 지역 도메인에서는 cyclic 경계를 적용하지 않았으며, Python과 같은 10칸 계산 경계를 사용했다. 비교 통계는 경계 영향 완화를 위해 바깥 20칸을 제외했다.',
             '- `.F` 저장값과 비교했다. MWT의 itfamax 호출 뒤 내부 배열과 저장된 493.F는 별도로 구분했다.',
             '- 입력 binary32, 원본 연산 binary32, 현재 Python 연산 binary64/JSON 7자리라는 정밀도 차이가 있다.',
             '- 전체 Intel MPI 실행 파일·NetCDF 수집·91층 전 지구 처리·최종 .Q 산출물까지 재현한 비교는 아니다.', '',
             '## 전체 계산 결과', '',
             '| 예보 | 결과 | 공통 격자 | 원본 평균 | Python 평균 | 편향(Python−원본) | RMSE | 공간 상관 | 허용오차 이내 |',
             '|---|---|---:|---:|---:|---:|---:|---:|---:|']
    def row(hf,label,m):
        r = f"{m['pearson']:.4f}" if m.get('pearson') is not None else '—'
        return f"| +{hf}h | {label} | {m['pairs']:,} | {m['fortranMean']:.6g} | {m['pythonMean']:.6g} | {m['bias']:.6g} | {m['rmse']:.6g} | {r} | {100*m['withinTolerance']:.2f}% |"
    for frame in result['frames']:
        for name in ('cat','mwt','gktg'):
            lines.append(row(frame['hf'],name.upper(),frame['endToEnd'][name]))
    lines += ['', '허용오차는 |Python−Fortran| ≤ 1e−8 + 1e−5×|Fortran|다. 수치 일치를 선언하기 위한 인증 기준이 아니라 오차 크기를 확인하는 지표다.', '',
              '## 원본 원시 지수를 그대로 넣은 결합부 비교', '',
              '원본에서 계산한 같은 24종 배열을 Python 결합부에 넣었다. 따라서 이 표의 차이는 개별 지수 계산에서 생긴 오차가 아니다.', '',
              '| 예보 | 결과 | 공통 격자 | 원본 평균 | Python 평균 | 편향(Python−원본) | RMSE | 공간 상관 | 허용오차 이내 |',
              '|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for frame in result['frames']:
        for name in ('cat','mwt','gktg'):
            lines.append(row(frame['hf'],name.upper(),frame['combinationOnly'][name]))
    lines += ['', 'CAT와 최종 GKTG는 같은 원시 지수를 넣었을 때 모든 비교 격자에서 위 허용오차 이내다.',
              'MWT 표의 차이는 저장 시점 차이다. 원본은 493.F를 먼저 저장한 뒤 itfamax에서 MWT 내부 배열을 추가 평활화하며 493.F를 다시 저장하지 않는다.',
              '현재 Python은 추가 평활화된 MWT를 저장한다. 최종 GKTG는 원본과 같은 순서로 계산한다.', '',
              '추가 평활화 뒤 원본 MWT 내부 배열과 Python 결합부의 RMSE: ' + ', '.join(
                  f"+{frame['hf']}h {frame['combinationVsReturnedArray']['mwt']['rmse']:.3g}"
                  for frame in result['frames']) + '.', '',
              '## 기압층별 최종 GKTG', '',
              '| 예보 | 기압층 | 원본 평균 | Python 평균 | RMSE | 층 내 공간 상관 |',
              '|---|---|---:|---:|---:|---:|']
    for frame in result['frames']:
        for level in frame['levels']:
            if level['level'] not in ('1000hPa','850hPa','500hPa','200hPa'):
                continue
            m = level['gktg']
            lines.append(f"| +{frame['hf']}h | {level['level']} | {m['fortranMean']:.6g} | {m['pythonMean']:.6g} | {m['rmse']:.6g} | {m['pearson']:.4f} |")
    lines += ['', '## 개별 진단지수', '',
              '| 예보 | ID | 지수 | 공통 격자 | 원본 평균 | Python 평균 | RMSE | 공간 상관 | 허용오차 이내 |',
              '|---|---:|---|---:|---:|---:|---:|---:|---:|']
    for frame in result['frames']:
        for name,label,code,_ in CATALOG:
            if code >= 491:
                continue
            m = frame['diagnostics'][name]
            r = f"{m['pearson']:.4f}" if m.get('pearson') is not None else '—'
            lines.append(f"| +{frame['hf']}h | {code} | {label} | {m['pairs']:,} | {m['fortranMean']:.6g} | {m['pythonMean']:.6g} | {m['rmse']:.6g} | {r} | {100*m['withinTolerance']:.2f}% |")
    lines += ['', '결측이 달라 한쪽만 유효한 격자 수와 기압층별 통계는 comparison.json에 기록했다.', '',
              '## 비교 지도', '']
    for frame in result['frames']:
        for pressure in (850,500):
            lines += [f"### +{frame['hf']}h · {pressure} hPa", '',
                      f"![원본·이식 비교](fortran-vs-python-hf{frame['hf']}-{pressure}hPa.png)", '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--run',action='store_true',help='Run compiled original routines before comparing')
    parser.add_argument('--plots',action='store_true')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    folder = (args.output or repo/'artifacts/kim-turbulence-fortran').resolve()
    folder.mkdir(parents=True,exist_ok=True)
    source = repo/'backend/data/kim_turbulence_experiment'
    index = json.loads((source/'index.json').read_text())
    cube_file = repo/f"artifacts/kim-turbulence-demo/inputs/{index['tmfc']}/cube-{index['revision']}.json"
    bundle = json.loads(cube_file.read_text())
    if (bundle['tmfc'],bundle['revision']) != (index['tmfc'],index['revision']):
        raise ValueError('Input does not match published Python revision')
    calibration = json.loads(Path(__file__).with_name('calibration.json').read_text())
    build = json.loads((folder/'build/build.json').read_text())
    # Refuse stale builds instead of silently comparing changed source to old code.
    for item in build['files']:
        if hashlib.sha256((repo/item['file']).read_bytes()).hexdigest() != item['sha256']:
            raise ValueError(f"Reference source changed after build: {item['file']}")
    result = {'tmfc':index['tmfc'],'revision':index['revision'],'algorithm':index['algorithm'],
              'build':build,'tolerance':{'absolute':1e-8,'relative':1e-5},
              'comparisonHalo':20,'frames':[]}
    for cube in bundle['frames']:
        hf,grid = cube['hf'],cube['grid']
        frame_folder = folder/f'hf{hf:03d}'
        frame_folder.mkdir(exist_ok=True)
        input_file = frame_folder/'input.bin'
        write_input(cube,input_file)
        if args.run:
            env = os.environ.copy()
            compiler = Path(build['compiler'])
            local_lib = compiler.parents[1]/'lib/x86_64-linux-gnu'
            env['LD_LIBRARY_PATH'] = str(local_lib)+( ':'+env['LD_LIBRARY_PATH'] if env.get('LD_LIBRARY_PATH') else '')
            print(f'Running original Fortran +{hf}h',flush=True)
            with (frame_folder/'stdout.log').open('w') as log:
                subprocess.run([build['executable'],str(input_file),str(frame_folder)+'/',
                                str(repo/calibration['source'])],env=env,stdout=log,stderr=log,check=True)
            (frame_folder/'run.json').write_text(json.dumps({'inputSha256':hashlib.sha256(input_file.read_bytes()).hexdigest(),
                                                            'buildSha256':hashlib.sha256((folder/'build/build.json').read_bytes()).hexdigest()}))
        run = json.loads((frame_folder/'run.json').read_text())
        if run['inputSha256'] != hashlib.sha256(input_file.read_bytes()).hexdigest() or run['buildSha256'] != hashlib.sha256((folder/'build/build.json').read_bytes()).hexdigest():
            raise ValueError('Reference run does not match current input/build')
        configuration = verify_configuration(frame_folder,calibration)
        shape = len(cube['pressures']),grid['ny'],grid['nx']
        mask = np.zeros(shape[1:],dtype=bool)
        mask[20:-20,20:-20]=True
        input_check = verify_input_records(frame_folder,cube,shape,mask)
        original,published = {},{}
        for name,_,code,_ in CATALOG:
            original[name] = read_f_record(frame_folder/f'{code}.F',shape)
            layers = []
            for level in index['levels']:
                field = json.loads((source/f"runs/{index['revision']}/hf{hf:03d}/{level['id']}/{name}.json").read_text())
                if (field['revision'],field['tmfc'],field['hf'],field['validTime'],field['level']['id'],field['diagnostic']['id']) != (index['revision'],index['tmfc'],hf,cube['validTime'],level['id'],name):
                    raise ValueError('Published field identity mismatch')
                layers.append(np.asarray(field['values'],float).reshape(shape[1:]))
            published[name] = np.asarray(layers)
        bounds_data = np.fromfile(frame_folder/'region-bounds.bin',dtype='<i4')
        bounds = list(zip((bounds_data[:3]-1).tolist(),(bounds_data[3:]-1).tolist()))
        python_bounds = native_region_bounds(np.asarray(cube['fields']['hgt']).reshape(shape),10,10,grid['ny']-11)
        if bounds != python_bounds:
            raise ValueError(f'Native region bounds differ: original {bounds}, Python {python_bounds}')
        same_raw = combine({code:original[name] for name,_,code,_ in CATALOG if code<491},bounds,calibration,smooth)
        internal_data = np.fromfile(frame_folder/'combined.bin',dtype='<f4').reshape(3,*shape).astype(float)
        internal_data[np.abs(internal_data+9999)<=1e-3]=np.nan
        frame = {'hf':hf,'validTime':cube['validTime'],'shape':shape,'configuration':configuration,'inputVerification':input_check,'nativeRegionBoundsZeroBased':bounds,
                 'endToEnd':{name:metrics(original[name],published[name],mask) for name in ('cat','mwt','gktg')},
                 'combinationOnly':{name:metrics(original[name],same_raw[name],mask) for name in ('cat','mwt','gktg')},
                 'combinationVsReturnedArray':{name:metrics(internal_data[i],same_raw[name],mask) for i,name in enumerate(('cat','mwt','gktg'))},
                 'diagnostics':{name:metrics(original[name],published[name],mask) for name,_,code,_ in CATALOG if code<491},'levels':[]}
        for k,level in enumerate(index['levels']):
            frame['levels'].append({'level':level['id'],**{name:metrics(original[name][k],published[name][k],mask) for name in ('cat','mwt','gktg')}})
            if args.plots and level['value'] in (850,500):
                plot(folder,hf,level['value'],grid,original['gktg'][k],published['gktg'][k],mask)
        result['frames'].append(frame)
        print(json.dumps({'hf':hf,'gktg':frame['endToEnd']['gktg'],'combinationOnly':frame['combinationOnly']['gktg']}),flush=True)
    (folder/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False))
    (folder/'comparison.md').write_text(report(result))


if __name__ == '__main__':
    main()
