"""Compare published native exports against an independent staged Fortran run."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from fortran_runtime import DEFAULT_BUILD, REPO, load_build, read_f_record, run_original, validate_cube
from products import CATALOG


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root',type=Path,default=REPO/'backend/data')
    parser.add_argument('--build',type=Path,default=DEFAULT_BUILD)
    parser.add_argument('--output',type=Path,default=REPO/'artifacts/kim-turbulence-fortran-v4')
    args = parser.parse_args()
    source = args.data_root/'kim_turbulence_experiment'
    index = json.loads((source/'index.json').read_text())
    if index['algorithm'] != 'kim-gktg-original-fortran-v4':
        raise ValueError('Published run is not the original Fortran calculator')
    cube_file = REPO/f"artifacts/kim-turbulence-demo/inputs/{index['tmfc']}/cube-{index['revision']}.json"
    bundle = json.loads(cube_file.read_text())
    calibration = json.loads(Path(__file__).with_name('calibration.json').read_text())
    build = load_build(args.build)
    args.output.mkdir(parents=True,exist_ok=True)
    result = {'algorithm':index['algorithm'],'revision':index['revision'],'tmfc':index['tmfc'],
              'method':'Native export uses ITFAcompF; reference independently calls GetkBdys/ITFA_MWT/ITFA_static/itfamax',
              'build':build,'frames':[],'passed':True}
    for cube in bundle['frames']:
        shape = validate_cube(cube)
        folder = (args.output/f"hf{cube['hf']:03d}").resolve()
        print(f"Independent original Fortran reference +{cube['hf']}h",flush=True)
        checks = run_original(build,cube,folder,calibration,mode='reference')
        mask = np.zeros(shape[1:],bool)
        mask[10:-10,10:-10] = True
        mask3 = np.broadcast_to(mask,shape)
        products = []
        for name,label,code,_ in CATALOG:
            reference = read_f_record(folder/f'{code}.F',shape)
            values = []
            for level in index['levels']:
                field = json.loads((source/f"runs/{index['revision']}/hf{cube['hf']:03d}/{level['id']}/{name}.json").read_text())
                if (field['algorithm'],field['revision'],field['tmfc'],field['hf'],field['validTime'],field['level']['id'],field['diagnostic']['id']) != (index['algorithm'],index['revision'],index['tmfc'],cube['hf'],cube['validTime'],level['id'],name):
                    raise ValueError('Published field identity differs')
                values.append(np.asarray(field['values'],float).reshape(shape[1:]))
            published = np.asarray(values)
            valid = np.isfinite(reference) & mask3
            matching_missing = np.array_equal(np.isfinite(reference)[mask3],np.isfinite(published)[mask3])
            error = published[valid]-reference[valid]
            exact = bool(matching_missing and np.array_equal(published[valid],reference[valid]))
            hidden_halo = bool(not np.isfinite(published[~mask3]).any())
            item = {'diagnostic':name,'code':code,'label':label,'pairs':int(valid.sum()),
                    'missingMatches':matching_missing,'haloHidden':hidden_halo,'binary32Exact':exact,
                    'rmse':float(np.sqrt(np.mean(error**2))),'maxAbsError':float(np.max(np.abs(error))),
                    'referenceSha256':hashlib.sha256((folder/f'{code}.F').read_bytes()).hexdigest()}
            result['passed'] &= exact and hidden_halo
            products.append(item)
        result['frames'].append({'hf':cube['hf'],'checks':checks,'products':products})
        print(json.dumps({'hf':cube['hf'],'products':len(products),'allExact':all(p['binary32Exact'] and p['haloHidden'] for p in products)}),flush=True)
    (args.output/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False))
    lines = ['# 원본 Fortran 직접 연결 수정 검증','',f"발표 {result['tmfc']} UTC · revision `{result['revision']}`",'',
             '지도 계산은 원본 indices_gtg → ITFAcompF를 실행한다. 독립 대조는 원본 개별 결합 루틴을 순서대로 실행했다.',
             '같은 KIM 지역 격자·21개 기압층·+6/+9시간을 사용했다. 수식은 원본 파일을 수정 없이 컴파일했다.',
             '24종과 CAT/MWT/GKTG 총 27종의 게시 JSON 값을 모든 계산 격자에서 비교했다. 바깥 10칸은 표출에서 숨긴다.',
             '원본 binary32 실수를 JSON 숫자로 그대로 저장해 소수 자릿수 반올림을 제거했다. 결측 일치도 검사했다.',
             '전체 Intel MPI·NetCDF·91층 전 지구 처리·최종 .Q 산출물 재현까지 검증한 결과는 아니다.','',
             '| 예보 | 지수 | 격자 | RMSE | 최대 절대 오차 | 정확 일치 | 결측 일치 |',
             '|---|---|---:|---:|---:|---|---|']
    for frame in result['frames']:
        for product in frame['products']:
            lines.append(f"| +{frame['hf']}h | {product['label']} | {product['pairs']:,} | {product['rmse']:.3g} | {product['maxAbsError']:.3g} | {product['binary32Exact']} | {product['missingMatches']} |")
    lines += ['',f"전체 결과: {'통과' if result['passed'] else '실패'}",'']
    (args.output/'verification.md').write_text('\n'.join(lines))
    if not result['passed']:
        raise ValueError('Published original Fortran result differs from independent reference')


if __name__ == '__main__':
    main()
