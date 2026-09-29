"""Build the experimental SIGWX chart geometry using only the Python stdlib.

Run with the downloaded XML path to write artifacts/wifs-sigwx/preview.geojson.
Use wafs-sigwx-samples.py to regenerate the map's entire time series. Cubic splines
use chord-length parameters and the supplied endpoint tangent directions. Reference
chart agreement has not been validated; retain this assumption in metadata.
"""
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

BOUNDS = (75, -20, 170, 70)
NS = {'i': 'http://icao.int/iwxxm/2025-2', 'g': 'http://www.opengis.net/gml/3.2'}
HREF = '{http://www.w3.org/1999/xlink}href'
NIL = '{http://www.w3.org/2001/XMLSchema-instance}nil'


def coordinates(node):
    values = list(map(float, node.text.split()))
    if len(values) % 2:
        raise ValueError('Odd coordinate count')
    pairs = list(zip(values[::2], values[1::2]))
    if any(not (-90 <= lat <= 90 and -180 <= lon <= 180) for lat, lon in pairs):
        raise ValueError('Coordinates outside declared Lat Long CRS')
    return [[lon, lat] for lat, lon in pairs]


def unwrap(points):
    result = []
    for lon, lat in points:
        if result:
            lon += 360 * round((result[-1][0] - lon) / 360)
        if not result or [lon, lat] != result[-1]:
            result.append([lon, lat])
    return result


def cubic_spline(points, start, end, steps=8):
    """C2 clamped spline in unwrapped lon/lat with chord-length knots.

    GML 3.2.1 geometryPrimitives.xsd specifies endpoint vector *directions*.
    Normalize vectors; do not interpret their magnitudes as degrees per segment.
    Solve the tridiagonal system for second derivatives, preserving every knot.
    """
    points = unwrap(points)
    if len(points) < 3:
        return points
    h = [math.dist(a, b) for a, b in zip(points, points[1:])]
    tangents = []
    for vector, a, b in [(start, points[0], points[1]), (end, points[-2], points[-1])]:
        length = math.hypot(*vector)
        if length == 0:
            raise ValueError('Zero spline endpoint tangent')
        tangents.append([v / length for v in vector])
    n = len(points)
    second = []
    for dimension in range(2):
        y = [p[dimension] for p in points]
        diagonal = [2*h[0]] + [2*(a+b) for a, b in zip(h, h[1:])] + [2*h[-1]]
        lower = [0] + h
        upper = h + [0]
        rhs = [6*((y[1]-y[0])/h[0] - tangents[0][dimension])]
        rhs += [6*((y[i+1]-y[i])/h[i] - (y[i]-y[i-1])/h[i-1]) for i in range(1, n-1)]
        rhs += [6*(tangents[1][dimension] - (y[-1]-y[-2])/h[-1])]
        for i in range(1, n):
            ratio = lower[i] / diagonal[i-1]
            diagonal[i] -= ratio * upper[i-1]
            rhs[i] -= ratio * rhs[i-1]
        values = [0.0]*n
        values[-1] = rhs[-1]/diagonal[-1]
        for i in range(n-2, -1, -1):
            values[i] = (rhs[i]-upper[i]*values[i+1])/diagonal[i]
        second.append(values)
    result = []
    for i, distance in enumerate(h):
        for j in range(steps):
            b = j/steps
            a = 1-b
            result.append([a*points[i][d]+b*points[i+1][d] +
                ((a*a*a-a)*second[d][i]+(b*b*b-b)*second[d][i+1])*distance*distance/6 for d in range(2)])
    result.append(points[-1])
    return result


def geometry_curves(geometry):
    curves = []
    for segment in geometry.findall('.//g:segments/*', NS):
        node = segment.find('g:posList', NS)
        if node is None:
            raise ValueError('Unsupported curve segment coordinates')
        points = coordinates(node)
        if segment.tag == '{'+NS['g']+'}CubicSpline':
            vectors = []
            for tag in ['vectorAtStart', 'vectorAtEnd']:
                values = list(map(float, segment.find('g:'+tag, NS).text.split()))
                if len(values) != 2 or not all(map(math.isfinite, values)):
                    raise ValueError('Invalid spline tangent')
                vectors.append(list(reversed(values)))
            points = cubic_spline(points, *vectors)
        elif segment.tag != '{'+NS['g']+'}LineStringSegment':
            raise ValueError('Unsupported curve segment '+segment.tag)
        curves.append(points)
    return curves


def selection_polygons(geometry):
    """Preserve complete exterior/interior rings for picking and selected fill.

    Do not close the clipped outline fragments: that would invent areas across
    gaps. Select regional world copies of whole rings, with holes kept together.
    The renderer clips the fill to BOUNDS without stroking those clipping edges.
    """
    polygons = []
    for patch in geometry.findall('.//g:PolygonPatch', NS):
        rings = []
        for member in [patch.find('g:exterior', NS), *patch.findall('g:interior', NS)]:
            if member is None:
                continue
            points = unwrap([p for curve in geometry_curves(member) for p in curve])
            if points and abs(abs(points[-1][0] - points[0][0]) - 360) < 1e-5 and abs(points[-1][1] - points[0][1]) < 1e-5:
                # A ring around a pole closes geographically after one world
                # turn. Close its planar copy beyond our regional latitude
                # bounds, not with a false chord across the visible region.
                if min(p[1] for p in points) > 0:
                    cap = 89.9999
                elif max(p[1] for p in points) < 0:
                    cap = -89.9999
                else:
                    raise ValueError('Ambiguous world-spanning selection ring')
                points += [[points[-1][0], cap], [points[0][0], cap], points[0][:]]
            if len(points) < 4 or math.dist(points[0], points[-1]) > 1e-5:
                raise ValueError('Unclosed selection polygon')
            points[-1] = points[0][:]
            if rings:
                outer_center = (min(p[0] for p in rings[0]) + max(p[0] for p in rings[0])) / 2
                hole_center = (min(p[0] for p in points) + max(p[0] for p in points)) / 2
                shift = 360 * round((outer_center - hole_center) / 360)
                points = [[lon + shift, lat] for lon, lat in points]
            rings.append(points)
        if not rings:
            continue
        west, east = min(p[0] for p in rings[0]), max(p[0] for p in rings[0])
        south, north = min(p[1] for p in rings[0]), max(p[1] for p in rings[0])
        for offset in (-720, -360, 0, 360, 720):
            if east + offset < BOUNDS[0] or west + offset > BOUNDS[2] or north < BOUNDS[1] or south > BOUNDS[3]:
                continue
            polygons.append([[[round(lon + offset, 6), round(lat, 6)] for lon, lat in ring] for ring in rings])
    return polygons


def clip_segment(a, b):
    """Liang–Barsky, with no artificial polygon edges at the clipping boundary."""
    west, south, east, north = BOUNDS
    dx, dy = b[0] - a[0], b[1] - a[1]
    lo, hi = 0, 1
    for p, q in zip((-dx, dx, -dy, dy), (a[0]-west, east-a[0], a[1]-south, north-a[1])):
        if p == 0:
            if q < 0:
                return None
        elif p < 0:
            lo = max(lo, q / p)
        else:
            hi = min(hi, q / p)
        if lo > hi:
            return None
    points = [[round(a[0] + t*dx, 6), round(a[1] + t*dy, 6)] for t in (lo, hi)]
    return points if points[0] != points[1] else None


def visible_lines(points):
    """Unwrap successive longitudes before selecting regional world copies."""
    continuous = []
    for lon, lat in points:
        if continuous:
            while lon - continuous[-1][0] > 180:
                lon -= 360
            while lon - continuous[-1][0] < -180:
                lon += 360
        continuous.append([lon, lat])
    result = []
    for offset in (-720, -360, 0, 360, 720):
        active = None
        for a, b in zip(continuous, continuous[1:]):
            segment = clip_segment([a[0]+offset, a[1]], [b[0]+offset, b[1]])
            if segment is None:
                active = None
            elif active is not None and active[-1] == segment[0]:
                active.append(segment[1])
            else:
                active = segment
                result.append(active)
    return result


def elevation(node, tag):
    element = node.find('.//i:' + tag, NS)
    if element is None:
        return ''
    if element.get(NIL) == 'true':
        return '? (' + element.get('nilReason', '').split('/')[-1] + ')'
    return (element.get('uom', '') + ' ' + (element.text or '').strip()).strip()


def build(path):
    raw = path.read_bytes()
    root = ET.fromstring(raw)
    if root.tag != '{' + NS['i'] + '}WAFSSignificantWeatherForecast':
        raise ValueError('Expected IWXXM 2025-2 WAFSSignificantWeatherForecast')
    features, areas = [], []
    counts = Counter()
    source_counts = Counter()
    short = {'CLOUD': 'CB', 'TURBULENCE': 'TURB', 'AIRFRAME_ICING': 'ICE',
             'JETSTREAM': 'JET', 'TROPOPAUSE': 'TROP', 'TROPICAL_CYCLONE': 'TC', 'VOLCANO': 'VOLCANO'}

    def add(geometry, properties, role, label):
        features.append({'type': 'Feature', 'id': len(features), 'geometry': geometry,
                         'properties': {**properties, 'role': role, 'label': label}})

    for feature in root.findall('i:feature/i:MeteorologicalFeature', NS):
        kind = feature.find('i:phenomenon', NS).get(HREF).split('/')[-1]
        source_counts[kind] += 1
        geom = feature.find('i:phenomenonGeometry', NS)
        identifier = feature.find('g:identifier', NS).text
        label = short.get(kind, kind)
        level = elevation(feature, 'elevation')
        upper, lower = elevation(feature, 'upperElevation'), elevation(feature, 'lowerElevation')
        def code_at(tag):
            node = feature.find('.//i:' + tag, NS)
            return node.get(HREF, '').split('/')[-1] if node is not None else ''
        # WMO code tables 020008, 011030 and 020041 (source URIs remain in details).
        distribution = {'10': 'OCNL', '12': 'FRQ'}.get(code_at('CloudDistribution'), '')
        severity = ({'6': 'MOD', '7': 'SEV'}.get(code_at('DegreeOfTurbulence'), '')
                    or {'4': 'MOD', '7': 'SEV'}.get(code_at('DegreeOfIcing'), ''))
        if distribution or severity:
            label = (distribution or severity) + ' ' + label
        name = feature.find('.//i:name', NS)
        if name is not None:
            label += '\n' + name.text
        elif kind == 'TROPOPAUSE':
            label += '\n' + level
        elif upper:
            label += '\n' + upper
            if kind in ('TURBULENCE', 'AIRFRAME_ICING'):
                label += ' / ' + (lower if lower and not lower.startswith('?') else '?')
        details = []
        for element in feature.iter():
            tag = element.tag.split('}')[-1]
            if tag in ('upperElevation', 'lowerElevation', 'elevation', 'windSpeed', 'name', 'IsotachUpperElevation', 'IsotachLowerElevation') or 'VerticalReference' in tag or tag == 'verticalReference':
                value = element.get('nilReason') if element.get(NIL) == 'true' else (element.text or '').strip()
                details.append(f'{tag}: {value} {element.get("uom", "")}'.strip())
            elif element.get(HREF) and tag != 'phenomenon':
                details.append(f'{tag}: {element.get(HREF)}')
        properties = {'objectId': identifier, 'phenomenon': kind, 'details': '\n'.join(details),
                      'upper': upper, 'lower': lower, 'level': level,
                      'distribution': distribution, 'severity': severity}
        start_count = len(features)
        lines = []
        # All ring members (including holes) are drawn independently as outlines.
        curves = geometry_curves(geom)
        for curve in curves:
            lines.extend(visible_lines(curve))
        if lines:
            add({'type': 'MultiLineString', 'coordinates': lines}, properties, 'boundary', label)
            longest = max(lines, key=len)
            add({'type': 'Point', 'coordinates': longest[len(longest)//2]}, properties, 'label', label)
            if kind in ('TURBULENCE', 'AIRFRAME_ICING'):
                areas.append({'objectId': identifier, 'phenomenon': kind, 'polygons': selection_polygons(geom)})
            if kind == 'JETSTREAM' and curves:
                end = curves[-1][-1]
                end = [((end[0]+180) % 360)-180, end[1]]
                if BOUNDS[0] <= end[0] <= BOUNDS[2] and BOUNDS[1] <= end[1] <= BOUNDS[3]:
                    add({'type': 'Point', 'coordinates': end}, properties, 'direction', '')
        for node in geom.findall('.//g:pos', NS):
            p = coordinates(node)[0]
            if BOUNDS[0] <= p[0] <= BOUNDS[2] and BOUNDS[1] <= p[1] <= BOUNDS[3]:
                add({'type': 'Point', 'coordinates': p}, properties, 'marker', label)
        for wind in feature.findall('.//i:WAFSJetStreamWindSymbol', NS):
            p = coordinates(wind.find('.//g:pos', NS))[0]
            if BOUNDS[0] <= p[0] <= BOUNDS[2] and BOUNDS[1] <= p[1] <= BOUNDS[3]:
                speed = wind.find('i:windSpeed', NS)
                unit = 'kt' if speed.get('uom') in ('kn_i', '[kn_i]') else speed.get('uom', '')
                wind_label = f'{speed.text} {unit}\n{elevation(wind, "elevation")}'
                add({'type': 'Point', 'coordinates': p}, {**properties,
                    'speedKt': float(speed.text) if unit == 'kt' else None,
                    'windLevel': elevation(wind, 'elevation'),
                    'isotachUpper': elevation(wind, 'IsotachUpperElevation'),
                    'isotachLower': elevation(wind, 'IsotachLowerElevation')}, 'wind', wind_label)
        if len(features) > start_count:
            counts[kind] += 1
    def time_at(tag):
        return root.find(f'i:{tag}/g:TimeInstant/g:timePosition', NS).text
    return {'type': 'FeatureCollection', 'features': features, 'areas': areas, 'metadata': {
        'sourceUrl': 'https://aviationweather.gov/data/products/sigwx/sample/' + path.name,
        'sourceSha256': hashlib.sha256(raw).hexdigest(), 'bounds': BOUNDS,
        'baseTime': time_at('phenomenonBaseTime'), 'issueTime': time_at('issueTime'),
        'validTime': time_at('phenomenonTime'), 'counts': counts, 'sourceCounts': source_counts,
        'geometryMode': 'C2 clamped spline; chord-length lon/lat parameters; normalized endpoint tangents; full hazard rings retained for selected fill; reference-chart validation pending',
    }}


if __name__ == '__main__':
    data = build(Path(sys.argv[1]))
    destination = Path(__file__).resolve().parents[1] / 'artifacts/wifs-sigwx/preview.geojson'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(data['metadata'], ensure_ascii=False, indent=2))
    print(f'{len(data["features"])} rendered features → {destination}')
