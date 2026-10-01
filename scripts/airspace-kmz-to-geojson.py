#!/usr/bin/env python3
"""국토교통부 공역정보 KMZ를 지도 공역 레이어(GeoJSON)로 바꾼다.

국토부 KMZ가 국내 공역의 기준 자료다. 우리 자료와 다르면 KMZ가 맞고, 기존 파일을 고치지 않고
이 스크립트로 다시 만든다. AIP 차수가 바뀌면 새 KMZ로 다시 돌린다.

    python3 scripts/airspace-kmz-to-geojson.py <공역정보.kmz> [출력 폴더]

출력 폴더 기본값은 frontend/public/data. 지도 글자·브리핑(backend/src/briefing/airspace-zones.js)·
MOA 활성화(moaActivation.js)가 읽는 기존 속성(res_lbl_1 등)을 같은 형식으로 채우고,
구조화된 값(ident, name, upper/lower, upperFt/lowerFt, airspaceClass, source, cycle)을 함께 넣는다.
항로(airways.geojson)·인천 FIR·섹터는 경로 계획·틱·주파수 자료와 엮여 있어 여기서 만들지 않는다.
해외 FIR(fir-overseas.geojson)은 VATSIM 원본(scripts/data/fir-overseas-vatsim.geojson)을 KMZ 경계에 맞춰
새로 만든다: 주변 FIR(평양·심양·상해·후쿠오카)은 KMZ 경계, 그 밖의 해외 FIR은 맞닿는 경계를 KMZ에 맞춘다.
"""
import html
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

KML = '{http://www.opengis.net/kml/2.2}'
ROOT = Path(__file__).resolve().parents[1]
SOURCE = '국토교통부 공역정보 KMZ'


def read_kml(kmz_path):
    with zipfile.ZipFile(kmz_path) as zf:
        name = next(n for n in zf.namelist() if n.lower().endswith('.kml'))
        text = zf.read(name).decode('utf-8')
    # 국토부 파일은 xsi 접두사를 선언하지 않고 쓴다. 엄격한 XML 파서가 읽도록 선언만 보탠다.
    if 'xmlns:xsi=' not in text[:2000]:
        text = text.replace('<kml xmlns=', '<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns=', 1)
    return ET.fromstring(text.encode('utf-8'))


def placemark_fields(placemark):
    """설명 HTML 표(이름-값 두 칸 행)를 속성 사전으로. '<Null>'은 None."""
    desc = placemark.findtext(f'{KML}description', default='')
    out = {}
    for key, value in re.findall(r'<tr[^>]*>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*</tr>', desc):
        value = html.unescape(value).strip()
        out[key.strip()] = None if value in ('<Null>', '') else value
    return out


def ring(coordinates_text):
    points = []
    for token in coordinates_text.split():
        lon, lat = token.split(',')[:2]
        points.append([round(float(lon), 6), round(float(lat), 6)])
    if points and points[0] != points[-1]:
        points.append(points[0])
    return points


def placemark_polygons(placemark):
    polygons = []
    for polygon in placemark.iter(f'{KML}Polygon'):
        outer = polygon.find(f'{KML}outerBoundaryIs/{KML}LinearRing/{KML}coordinates')
        if outer is None or not outer.text:
            continue
        rings = [ring(outer.text)]
        for inner in polygon.findall(f'{KML}innerBoundaryIs/{KML}LinearRing/{KML}coordinates'):
            if inner.text:
                rings.append(ring(inner.text))
        polygons.append(rings)
    return polygons


def categories(root):
    """폴더 경로 마지막 이름 → Placemark 목록. 폴더 이름에 붙은 차수 표기('(2605)')는 뗀다."""
    found = {}

    def walk(element):
        for child in element:
            if child.tag in (f'{KML}Folder', f'{KML}Document'):
                name = re.sub(r'\(\d{4}\)$', '', child.findtext(f'{KML}name', default='').strip())
                placemarks = child.findall(f'{KML}Placemark')
                if placemarks:
                    found[name] = placemarks
                walk(child)

    walk(root)
    return found


def cycle_label(root):
    title = root.findtext(f'{KML}Document/{KML}name', default='') or ''
    match = re.search(r'(\d{2})년\s*(\d+)차', title)
    return f'AIP 20{match.group(1)}년 {match.group(2)}차' if match else title


UNLIMITED = {'Unlimited', 'UNLTD', 'UNL'}
GROUND = {'Ground', 'GND'}
SURFACE = {'Surface', 'SFC'}
MSL = {'Altitude', 'ALT', 'MSL'}
AGL = {'Height'}


def thousands(value):
    return f'{value:,}'.replace(',', ' ')


def altitude(fields, side):
    """KMZ 고도 세 칸(값·단위·기준) → (지도 글자, 피트, 기준). 예: ('6 000 AMSL', 6000, 'AMSL')."""
    value = fields.get(f'DistVert{side}_Val')
    unit = (fields.get(f'DistVert{side}_UOM') or '').strip()
    code = (fields.get(f'DistVert{side}_Code') or '').strip()
    if code in UNLIMITED:
        return 'UNL', None, 'UNL'
    if value is None:
        if code in GROUND:
            return 'GND', 0, 'GND'
        if code in SURFACE:
            return 'SFC', 0, 'SFC'
        return None, None, None
    number = int(float(value))
    if unit in ('Flight Level', 'FL'):
        return f'FL {number}', number * 100, 'FL'
    # 값이 있는데 기준이 지면(SFC/GND)이면 지면에서 잰 높이다(예: ATZ 1500 FT SFC).
    reference = 'AGL' if code in AGL | SURFACE | GROUND else 'AMSL'
    return f'{thousands(number)} {reference}', number, reference


def short_ident(ident, prefix):
    """'RK R1' → 'R1'. 기존 지도 글자 형식에 맞춘다."""
    return re.sub(rf'^RK\s+(?={prefix})', '', ident or '').strip()


def build_feature(placemark, extra):
    fields = placemark_fields(placemark)
    polygons = placemark_polygons(placemark)
    if not polygons:
        return None
    upper, upper_ft, upper_ref = altitude(fields, 'Upper')
    lower, lower_ft, lower_ref = altitude(fields, 'Lower')
    properties = {
        'ident': fields.get('Ident_Txt'),
        'name': fields.get('Name_Txt') or placemark.findtext(f'{KML}name'),
        'type': fields.get('Type_Code'),
        'airspaceClass': fields.get('Class_Code'),
        'upper': upper, 'upperFt': upper_ft, 'upperRef': upper_ref,
        'lower': lower, 'lowerFt': lower_ft, 'lowerRef': lower_ref,
        'remarks': fields.get('Remarks_Txt'),
    }
    properties.update(extra(properties))
    geometry = {'type': 'MultiPolygon', 'coordinates': polygons}
    return {'type': 'Feature', 'properties': properties, 'geometry': geometry}


# 출력 파일 → (KMZ 폴더 이름들, 기존 속성 채우기)
LAYERS = {
    'restricted.geojson': (['비행제한구역'], lambda p: {
        'res_lbl_1': short_ident(p['ident'], 'R'), 'res_lbl_2': p['upper'], 'res_lbl_3': p['lower']}),
    'danger.geojson': (['위험구역'], lambda p: {
        'dng_lbl_1': short_ident(p['ident'], 'D'), 'dng_lbl_2': p['upper'], 'dng_lbl_3': p['lower']}),
    'prohibited.geojson': (['비행금지구역', '원자력발전소', '안보구역'], lambda p: {
        'prh_lbl_1': p['ident'], 'prh_lbl_2': p['upper'], 'prh_lbl_3': p['lower'],
        'prh_lbl_4': '임시비행금지구역' if p['type'] is None else '비행금지구역'}),
    'moa.geojson': (['군작전구역'], lambda p: {
        'moa_lbl_1': p['ident'], 'moa_lbl_2': p['upper'], 'moa_lbl_3': p['lower']}),
    'tma.geojson': (['접근관제구역'], lambda p: {
        'tma_lbl_1': p['name'], 'tma_lbl_2': f"AREA {p['ident']}" if p['ident'] else None,
        'tma_lbl_3': p['upper'], 'tma_lbl_4': p['lower']}),
    # 관제권: 실제 관제권(Control Zone) 20곳. 예전 ctr.geojson은 공역등급 구역이었다(→ airspace-class).
    'ctr.geojson': (['관제권'], lambda p: {'ctr_lbl_1': p['name']}),
    'airspace-class.geojson': (['공역등급'], lambda p: {}),
    # ATZ는 KMZ에 하한이 비어 있다. 비행장교통구역은 지면부터라 SFC로 채운다.
    'atz.geojson': (['비행장교통구역'], lambda p: {} if p['lower'] else {'lower': 'SFC', 'lowerFt': 0, 'lowerRef': 'SFC'}),
    'alert.geojson': (['경계구역'], lambda p: {}),
    'training.geojson': (['훈련구역'], lambda p: {}),
}


# 방공식별구역(KADIZ): 넓은 경계라 면 없이 선으로만 그린다(ident_txt가 선 위 글자).
def build_adiz(placemarks, out_dir, cycle):
    features = []
    for placemark in placemarks:
        lines = [rings[0] for rings in placemark_polygons(placemark)]
        features.append({'type': 'Feature', 'geometry': {'type': 'MultiLineString', 'coordinates': lines},
                         'properties': {'ident_txt': 'KADIZ', 'name': 'KOREA ADIZ', 'source': SOURCE, 'cycle': cycle}})
    collection = {'type': 'FeatureCollection', 'source': SOURCE, 'cycle': cycle, 'features': features}
    (out_dir / 'adiz.geojson').write_text(json.dumps(collection, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'adiz.geojson: {len(features)}')


# 해외 FIR은 VATSIM 원본(scripts/data/fir-overseas-vatsim.geojson)을 KMZ 경계에 맞춰 만든다.
# 주변 FIR(평양·심양·상해·후쿠오카)은 KMZ 경계로 바꾸고, 그 밖의 해외 FIR은 맞닿는 경계를 KMZ에 맞춘다
# (scripts/align-overseas-fir-to-kmz.mjs). 인천 FIR은 fir.geojson이 따로 그리지만, 이웃과 겹치지 않게 함께 넘긴다.
VATSIM_FIR = ROOT / 'scripts/data/fir-overseas-vatsim.geojson'


def align_overseas_firs(placemarks, out_dir, cycle):
    import subprocess
    import tempfile
    features = [{'type': 'Feature', 'properties': {'name': p.findtext(f'{KML}name'), 'source': SOURCE, 'cycle': cycle},
                 'geometry': {'type': 'MultiPolygon', 'coordinates': placemark_polygons(p)}} for p in placemarks]
    with tempfile.NamedTemporaryFile('w', suffix='.geojson', delete=False, encoding='utf-8') as handle:
        json.dump({'type': 'FeatureCollection', 'features': features}, handle, ensure_ascii=False)
    subprocess.run(['node', str(ROOT / 'scripts/align-overseas-fir-to-kmz.mjs'), str(VATSIM_FIR), handle.name,
                    str(out_dir / 'fir-overseas.geojson')], check=True, cwd=ROOT)
    Path(handle.name).unlink()


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    kmz = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'frontend/public/data'
    root = read_kml(kmz)
    cycle = cycle_label(root)
    found = categories(root)
    # 방공식별구역·비행정보구역 폴더는 하위 폴더 없이 Placemark를 바로 담는다(번호 붙은 이름).
    by_short = {re.sub(r'^\d+\.Airspace_', '', name): placemarks for name, placemarks in found.items()}
    for file_name, (folders, extra) in LAYERS.items():
        features = []
        for folder in folders:
            placemarks = by_short.get(folder)
            if placemarks is None:
                sys.exit(f'KMZ에 "{folder}" 폴더가 없습니다. 국토부 파일 구성이 바뀌었는지 확인하세요.')
            for placemark in placemarks:
                feature = build_feature(placemark, extra)
                if feature:
                    feature['properties'].update({'category': folder, 'source': SOURCE, 'cycle': cycle})
                    features.append(feature)
        collection = {'type': 'FeatureCollection', 'source': SOURCE, 'cycle': cycle, 'features': features}
        (out_dir / file_name).write_text(json.dumps(collection, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        print(f'{file_name}: {len(features)}')
    build_adiz(by_short['방공식별구역'], out_dir, cycle)
    align_overseas_firs(by_short['비행정보구역'], out_dir, cycle)


if __name__ == '__main__':
    main()
