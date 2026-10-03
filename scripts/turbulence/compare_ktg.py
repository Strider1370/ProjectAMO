"""Compare existing low-level KTG with experimental GKTG on matched UTC frames.

GKTG is interpolated in geometric height to 1000–10000 ft AMSL, then sampled
bilinearly at the original curvilinear KTG coordinates. No extrapolation or
missing-corner renormalization. Raw scales differ; grade metrics use each
product's own thresholds. Correlation measures spatial association only.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from diagnostics24 import interpolate_columns

KTG_THRESHOLDS = np.array([.3, .475, .75])
GKTG_THRESHOLDS = np.array([.15, .22, .34])
LABELS = ['NIL', 'LGT', 'MOD', 'SEV']


def bilinear(a, grid, lon, lat):
    x = (lon - grid['lonMin']) / (grid['lonMax'] - grid['lonMin']) * (grid['nx'] - 1)
    y = (lat - grid['latMin']) / (grid['latMax'] - grid['latMin']) * (grid['ny'] - 1)
    inside = (x >= 0) & (x <= grid['nx'] - 1) & (y >= 0) & (y <= grid['ny'] - 1)
    ix = np.clip(np.floor(x).astype(int), 0, grid['nx'] - 2)
    iy = np.clip(np.floor(y).astype(int), 0, grid['ny'] - 2)
    fx, fy = x - ix, y - iy
    values = np.stack([a[iy, ix], a[iy, ix + 1], a[iy + 1, ix], a[iy + 1, ix + 1]])
    weights = np.stack([(1-fx)*(1-fy), fx*(1-fy), (1-fx)*fy, fx*fy])
    needed = weights > 1e-12
    usable = inside & np.all(~needed | np.isfinite(values), axis=0)
    result = np.sum(np.where(needed, values, 0) * weights, axis=0)
    return np.where(usable, result, np.nan)


def ranks(a):
    _, inverse, counts = np.unique(a, return_inverse=True, return_counts=True)
    ends = np.cumsum(counts)
    return (ends - (counts + 1) / 2)[inverse]


def correlation(a, b):
    return float(np.corrcoef(a, b)[0, 1]) if len(a) > 1 and np.std(a) > 0 and np.std(b) > 0 else None


def statistics(ktg, gktg):
    ok = np.isfinite(ktg) & np.isfinite(gktg)
    a, b = ktg[ok], gktg[ok]
    if not len(a):
        return {'pairs': 0}
    ca, cb = np.searchsorted(KTG_THRESHOLDS, a, side='right'), np.searchsorted(GKTG_THRESHOLDS, b, side='right')
    matrix = np.bincount(ca*4+cb, minlength=16).reshape(4, 4)
    accuracy = np.trace(matrix) / len(a)
    chance = np.dot(matrix.sum(axis=1), matrix.sum(axis=0)) / len(a)**2
    shared, union = np.sum((ca >= 1) & (cb >= 1)), np.sum((ca >= 1) | (cb >= 1))
    positive = np.sum(ca >= 1) + np.sum(cb >= 1)
    summary = lambda v: {k: float(x) for k, x in zip(['mean', 'median', 'p95', 'max'], [v.mean(), *np.percentile(v, [50, 95]), v.max()])}
    return {'pairs': int(len(a)), 'pearson': correlation(a, b), 'spearman': correlation(ranks(a), ranks(b)),
            'agreement': float(accuracy), 'within_one_grade': float(np.mean(np.abs(ca-cb) <= 1)),
            'kappa': float((accuracy-chance)/(1-chance)) if chance < 1 else None,
            'light_or_higher_iou': float(shared/union) if union else None,
            'light_or_higher_dice': float(2*shared/positive) if positive else None,
            'experimental_higher_grade': float(np.mean(cb > ca)), 'experimental_lower_grade': float(np.mean(cb < ca)),
            'ktg_grade_counts': matrix.sum(axis=1).tolist(), 'gktg_grade_counts': matrix.sum(axis=0).tolist(),
            'confusion_ktg_rows_gktg_columns': matrix.tolist(), 'ktg_raw': summary(a), 'gktg_raw': summary(b)}


def plot_maps(folder, hf, alt, lon, lat, a, b, coast):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap, BoundaryNorm
    from matplotlib.collections import LineCollection
    ok = np.isfinite(a) & np.isfinite(b)
    ca = np.where(ok, np.searchsorted(KTG_THRESHOLDS, a, side='right'), np.nan)
    cb = np.where(ok, np.searchsorted(GKTG_THRESHOLDS, b, side='right'), np.nan)
    fig, axes = plt.subplots(1, 3, figsize=(13, 6), constrained_layout=True)
    severity = ListedColormap(['#f0f0f0', '#33ff00', '#ffcc00', '#ff2900'])
    difference = ListedColormap(['#15458a', '#4885b8', '#a6c6df', '#f0f0f0', '#f3caab', '#db854e', '#a93d20'])
    for i, (ax, values, title) in enumerate(zip(axes, [ca, cb, cb-ca], ['Existing KTG', 'Experimental GKTG', 'Grade difference (GKTG - KTG)'])):
        ax.add_collection(LineCollection(coast, colors='#555', linewidths=.35, zorder=2))
        norm = BoundaryNorm(np.arange(-.5, 4.5), 4) if i < 2 else BoundaryNorm(np.arange(-3.5, 4.5), 7)
        mesh = ax.pcolormesh(lon, lat, np.ma.masked_invalid(values), cmap=severity if i < 2 else difference, norm=norm, shading='nearest', rasterized=True)
        ax.set(xlim=(123, 134), ylim=(30.7, 40.5), xlabel='Longitude (E)', ylabel='Latitude (N)', title=title)
        ax.set_aspect(1/np.cos(np.deg2rad(36)))
        ax.grid(alpha=.2)
        bar = fig.colorbar(mesh, ax=ax, orientation='horizontal', pad=.03, fraction=.055, ticks=range(4) if i < 2 else range(-3, 4))
        if i < 2: bar.ax.set_xticklabels(LABELS)
    fig.suptitle(f'2026-09-10 06 UTC +{hf}h | {alt:,} ft AMSL | matched valid points only\nKTG: 0.30 / 0.475 / 0.75; GKTG: 0.15 / 0.22 / 0.34 (experimental)', fontsize=11)
    fig.savefig(folder/f'comparison-hf{hf}-{alt}ft.png', dpi=150)
    plt.close(fig)


def coastlines(repo):
    lines = []
    for name in ['korea_neighbors_masked.v1.geojson', 'sido.json']:
        data = json.loads((repo/'frontend/public/Geo'/name).read_text())
        for feature in data['features']:
            g = feature['geometry']
            if g['type'] == 'MultiLineString':
                lines.extend(np.asarray(line)[:, :2] for line in g['coordinates'])
            polygons = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']] if g['type'] == 'Polygon' else []
            for polygon in polygons:
                lines.extend(np.asarray(ring)[:, :2] for ring in polygon)
    return lines


def report(result):
    def altitude_summary(altitude):
        metrics = [level['korea_roi']['gktg'] for frame in result['frames'] for level in frame['levels']
                   if level['altFt'] == altitude and level['korea_roi']['gktg']['pairs']]
        if not metrics:
            return f'- {altitude:,} ft: 공통 유효 격자가 없다.'
        span = lambda values, scale=1, digits=1: f'{min(values)*scale:.{digits}f}–{max(values)*scale:.{digits}f}'
        ratios = lambda key: [sum(m[key][1:])/m['pairs'] for m in metrics]
        return (f"- {altitude:,} ft: 상관 {span([m['pearson'] for m in metrics], digits=3)}, "
                f"등급 일치 {span([m['agreement'] for m in metrics], 100)}%. "
                f"기존 LGT+ {span(ratios('ktg_grade_counts'), 100)}% / "
                f"시험 LGT+ {span(ratios('gktg_grade_counts'), 100)}%.")
    lines = ['# 기존 ‘난류’ KTG와 시험 GKTG 비교', '',
             '분포에 유사성이 있지만, 현재 시험값을 기존 난류의 대체값으로 사용할 만큼 강도가 일치하지는 않는다.', '',
             f"발표: {result['tmfc']} UTC. +6/+9시간, 1,000–10,000 ft의 20개 고도·시각 조합을 비교했다.",
             f"계산: {result['algorithm']}, revision `{result['revision']}`. 수정 전 시험값의 비교 통계를 대체한다.",
             '기존 KTG 파일은 현재 지도 ‘난류’에서 사용하는 것과 같은 KIM 기반 다운로드 API의 해당 과거 회차다. 현재 자료 포인터는 변경하지 않았다.', '',
             '기존 KTG는 무차원 0–1 지수, 시험 GKTG는 원본 로그정규 변환 결과다. 원시값의 차이/RMSE 대신 공간 상관과 각 제품의 임계값에 따른 등급을 비교했다.',
             'KTG: 0.30 / 0.475 / 0.75. 시험 GKTG: 0.15 / 0.22 / 0.34.', '',
             '[기상청 API·KIM 설명자료](https://apihub.kma.go.kr/apiList.do?seqApi=14&seqApiSub=1043)와 원본 TURB NCL 코드가 임계값의 출처다.', '',
             '## 조건', '',
             '- 동일 발표시각·예보시간을 사용했고 응답 파일명의 모델(kimg)·회차·예보시간을 확인했다.',
             '- KIM hgt(m)를 낮은 고도에서 높이로 근사하고, 이미 계산한 시험 GKTG를 선형 연직 보간했다. 고도층별 재계산은 아니다.',
             '- 그 값을 원래 KTG의 8 km 곡선 격자 좌표에 수평 이중선형 보간했다.',
             '- 외삽·결측 이웃 재정규화를 하지 않고 공통 유효 격자만 비교했다. 지하/경계/미지원 고도는 제외했다.',
             '- 아래 표는 124–132°E, 32–39°N 영역(바다 포함)이다. 전체 겹치는 영역·CAT/MWT 성분 통계는 comparison.json에 있다.',
             '- 관측을 기준으로 검증한 것이 아니며, 어느 예보가 더 정확한지를 판정하지 않는다.', '',
             '## 고도별 결과', '',
             '| 예보 | 고도(ft) | 비교 격자 | 상관계수 r | 등급 일치 | κ | 기존 LGT+ | 시험 LGT+ | 기존 MOD+ | 시험 MOD+ |',
             '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for frame in result['frames']:
        for level in frame['levels']:
            m = level['korea_roi']['gktg']
            if not m['pairs']: continue
            n, a, b = m['pairs'], m['ktg_grade_counts'], m['gktg_grade_counts']
            lines.append(f"| +{frame['hf']}h | {level['altFt']:,} | {n:,} | {m['pearson']:.3f} | {100*m['agreement']:.1f}% | {m['kappa']:.3f} | {100*sum(a[1:])/n:.1f}% | {100*sum(b[1:])/n:.1f}% | {100*sum(a[2:])/n:.1f}% | {100*sum(b[2:])/n:.1f}% |")
    lines += ['', '等級 일치에는 NIL끼리의 일치도 포함된다. κ는 우연한 일치를 보정한 값이다. 상관계수가 높아도 표시되는 난류 면적과 강도가 같다는 뜻은 아니다.'.replace('等級', '등급'), '',
              '## 해석', '',
              altitude_summary(5000), altitude_summary(10000),
              '- 저층의 차이도 고도별 표에서 별도로 확인해야 한다. 단일 배율로 일치를 가정하지 않는다.',
              '- 현재 비교에서는 중·강 난류 영역 차이도 크다. 입력 격자·수직 해상도, 고도 보간, 통계 변환 및 실제 KTG 계수 차이를 분리해 점검할 필요가 있다.',
              '- 제공된 TURB 계산과 운용 저층 KTG의 변환/보정이 동일하다고 확인되지 않았다. 기존 KTG에 맞춰 화면 임계값만 바꾸지는 않았다.',
              '- 1개 발표회차·2개 예보시각의 사례다. 격자는 공간적으로 상관되어 있으므로 격자 수를 독립 검증 사례 수로 해석하지 않는다.', '',
              '## 비교 지도', '',
              '왼쪽: 기존 KTG, 가운데: 시험 GKTG, 오른쪽: 등급 차이. 청색은 시험이 낮게, 갈색은 높게 분류한 영역이다. 회색은 NIL 또는 같은 등급, 흰색은 비교 제외다.', '']
    for hf in [6, 9]:
        for alt in [5000, 10000]: lines += [f'### +{hf}시간 · {alt:,} ft', '', f'![비교 지도](comparison-hf{hf}-{alt}ft.png)', '']
    return '\n'.join(lines)


def compare(repo, source, folder, plots=False):
    index = json.loads((source/'kim_turbulence_experiment/index.json').read_text())
    cube_path = repo/f"artifacts/kim-turbulence-demo/inputs/{index['tmfc']}/cube-{index['revision']}.json"
    bundle = json.loads(cube_path.read_text())
    if bundle['tmfc'] != index['tmfc'] or bundle['revision'] != index['revision']:
        raise ValueError('Input cube does not match published experimental revision')
    coast = coastlines(repo) if plots else []
    result = {'tmfc': index['tmfc'], 'revision': index['revision'], 'algorithm': index['algorithm'],
              'ktg_thresholds': KTG_THRESHOLDS.tolist(), 'gktg_thresholds': GKTG_THRESHOLDS.tolist(),
              'roi': {'lonMin': 124, 'lonMax': 132, 'latMin': 32, 'latMax': 39},
              'method': 'Native geometric-height linear interpolation without extrapolation, then bilinear sampling at KTG coordinates; paired finite points only',
              'limitations': ['Products have different raw scales: no raw bias/RMSE is reported',
                              'Matched forecast comparison, not observation/Fortran validation',
                              'Experimental 21 pressure layers use TURB coefficients; equivalence to operational KTG inputs and calibration is unconfirmed',
                              'Spatially correlated grid points are not independent samples'], 'frames': []}
    for cube in bundle['frames']:
        hf = cube['hf']
        reference = json.loads((folder/f"ktg-{index['tmfc']}-hf{hf}.nc.json").read_text())
        if reference['tmfc'] != index['tmfc'] or reference['hf'] != hf or reference['validTime'] != cube['validTime']:
            raise ValueError('Reference KTG time does not match experimental frame')
        dims = {d['name']: d['size'] for d in reference['metadata']['dimensions']}
        shape = dims['ny'], dims['nx']
        lon = np.asarray(reference['lon']).reshape(shape)
        lat = np.asarray(reference['lat']).reshape(shape)
        ktg = np.asarray(reference['ktg']).reshape(dims['nz'], *shape)
        ktg = np.where((ktg >= 0) & (ktg <= 1), ktg, np.nan)
        grid = cube['grid']
        native_shape = len(cube['pressures']), grid['ny'], grid['nx']
        z = np.asarray(cube['fields']['hgt'], dtype=float).reshape(native_shape)*3.28084
        monotonic = np.all(np.isfinite(z) & np.concatenate([np.ones_like(z[:1], dtype=bool), np.diff(z, axis=0) > 0]), axis=0)
        products = {}
        for name in ['gktg', 'cat', 'mwt']:
            layers = []
            for level in index['levels']:
                p = source/f"kim_turbulence_experiment/runs/{index['revision']}/hf{hf:03d}/{level['id']}/{name}.json"
                field = json.loads(p.read_text())
                if field['tmfc'] != index['tmfc'] or field['hf'] != hf or field['validTime'] != cube['validTime'] or field['revision'] != index['revision'] or field['grid'] != grid or field['level']['id'] != level['id']:
                    raise ValueError(f'Experimental field identity mismatch: {p}')
                layers.append(np.asarray(field['values'], dtype=float).reshape(native_shape[1:]))
            products[name] = np.where(monotonic, np.asarray(layers), np.nan)
        roi = (lon >= 124) & (lon <= 132) & (lat >= 32) & (lat <= 39)
        frame = {'hf': hf, 'validTime': cube['validTime'], 'ktg_grid': dims, 'reference': reference['metadata'], 'levels': []}
        for k, alt in enumerate(reference['alt']):
            matched = {}
            for name, values in products.items():
                native = interpolate_columns(values, z, np.full((1, *native_shape[1:]), alt, dtype=float))[0]
                matched[name] = bilinear(native, grid, lon, lat)
            item = {'altFt': alt, 'all_overlap': {name: statistics(ktg[k], values) for name, values in matched.items()},
                    'korea_roi': {name: statistics(ktg[k][roi], values[roi]) for name, values in matched.items()}}
            frame['levels'].append(item)
            if plots and alt in [5000, 10000]: plot_maps(folder, hf, alt, lon, lat, ktg[k], matched['gktg'], coast)
        result['frames'].append(frame)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--plots', action='store_true', help='Requires optional matplotlib')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    source, folder = args.source_root or repo/'backend/data', args.output or repo/'artifacts/kim-turbulence-comparison'
    folder.mkdir(parents=True, exist_ok=True)
    result = compare(repo, source, folder, args.plots)
    (folder/'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    (folder/'comparison.md').write_text(report(result))
    for frame in result['frames']:
        for level in frame['levels']:
            m = level['korea_roi']['gktg']
            print(json.dumps({'hf': frame['hf'], 'altFt': level['altFt'], **m}))


if __name__ == '__main__':
    main()
