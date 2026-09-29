"""Download the public WIFS 2025-2 XML samples and audit/generate the preview series.

python3 scripts/wafs-sigwx-samples.py --download
Without --download, reuses artifacts/wifs-sigwx/downloads.json and the downloaded XMLs.
Only individual forecast files enter the map series. Combined bulletins are
checked against those files, not counted as extra forecasts.
"""
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from html.parser import HTMLParser
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'artifacts/wifs-sigwx'
FIXTURES = ROOT / 'frontend/src/features/weather-overlays/fixtures'
PAGE = 'https://aviationweather.gov/wifs/'
spec = importlib.util.spec_from_file_location('preview', Path(__file__).with_name('wafs-sigwx-preview.py'))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
KINDS = ['CLOUD', 'JETSTREAM', 'TURBULENCE', 'AIRFRAME_ICING', 'TROPOPAUSE', 'TROPICAL_CYCLONE', 'VOLCANO']


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def download_all():
    class Links(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links = set()

        def handle_starttag(self, tag, attrs):
            href = dict(attrs).get('href', '')
            if tag == 'a' and href.startswith('/data/products/sigwx/sample/') and 'schema-2025-2_' in href and href.endswith('.xml'):
                self.links.add(href)
    listing = Links()
    listing.feed(urllib.request.urlopen(PAGE, timeout=30).read().decode())
    if not listing.links:
        raise ValueError('WIFS sample catalogue is empty')

    def fetch(link):
        path = DIRECTORY / Path(link).name
        raw = path.read_bytes() if path.exists() else urllib.request.urlopen('https://aviationweather.gov' + link, timeout=60).read()
        root = ET.fromstring(raw)
        if not path.exists():
            temporary = path.with_suffix('.tmp')
            temporary.write_bytes(raw)
            temporary.replace(path)
        return {'file': path.name, 'url': 'https://aviationweather.gov' + link, 'bytes': len(raw),
                'sha256': hashlib.sha256(raw).hexdigest(), 'root': root.tag}
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(fetch, sorted(listing.links)))
    write_json(DIRECTORY / 'downloads.json', records)
    return records


def local(tag):
    return tag.split('}')[-1]


def features(root):
    return [e for e in root.iter() if local(e.tag) == 'MeteorologicalFeature']


def canonical(element):
    """Compare semantic content across namespaces/UUIDs, including numeric geometry."""
    attrs = sorted((local(k), v) for k, v in element.attrib.items() if local(k) not in ('id', 'schemaLocation'))
    children = [canonical(c) for c in element if local(c.tag) != 'identifier']
    return [local(element.tag), attrs, ' '.join((element.text or '').split()), children]


def semantic_hash(root):
    records = sorted(json.dumps(canonical(f), sort_keys=True) for f in features(root))
    return hashlib.sha256('\n'.join(records).encode()).hexdigest()


def frame_hashes(frame):
    groups = defaultdict(list)
    for feature in frame['features']:
        props = {k: v for k, v in feature['properties'].items() if k != 'objectId'}
        groups[props['phenomenon']].append(json.dumps([feature['geometry'], props], sort_keys=True))
    return {kind: hashlib.sha256('\n'.join(sorted(groups[kind])).encode()).hexdigest() for kind in KINDS}


def audit(records):
    records = [r for r in records if 'schema-2025-2_' in r['file']]
    frames, rows, combined = [], [], []
    codes, regional_codes = defaultdict(Counter), defaultdict(Counter)
    leaves, nils, geometry, declared, source_counts = Counter(), Counter(), Counter(), Counter(), Counter()
    isotach = Counter()
    for record in records:
        path = DIRECTORY / record['file']
        if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
            raise ValueError('Checksum mismatch: ' + path.name)
    current = sorted(DIRECTORY / r['file'] for r in records if 'schema-2025-2' in r['file'] and '_T+' in r['file'])
    for path in current:
        root = ET.parse(path).getroot()
        frame = preview.build(path)
        meta = frame['metadata']
        delta = datetime.fromisoformat(meta['validTime']) - datetime.fromisoformat(meta['baseTime'])
        meta['forecastHour'] = int(delta.total_seconds() / 3600)
        meta['frameId'] = meta['baseTime'] + '/' + meta['validTime']
        meta['sourceFile'] = path.name
        frames.append(frame)
        regional_ids = {f['properties']['objectId'] for f in frame['features']}
        row = {**meta, 'regionalObjectCount': sum(meta['counts'].values()), 'semanticHash': semantic_hash(root)}
        rows.append(row)
        source_counts.update(meta['sourceCounts'])
        for e in root.findall('i:phenomenaList', preview.NS):
            declared[e.get(preview.HREF).split('/')[-1]] += 1
        geometry.update(local(e.tag) for e in root.findall('.//g:segments/*', preview.NS))
        for f in features(root):
            fid = f.find('g:identifier', preview.NS).text
            for e in f.iter():
                name = local(e.tag)
                if not len(e) and e.tag.startswith('{' + preview.NS['i'] + '}'):
                    leaves[name] += 1
                if e.get(preview.HREF) and name != 'phenomenon':
                    code = e.get(preview.HREF).split('/')[-1]
                    codes[name][code] += 1
                    if fid in regional_ids:
                        regional_codes[name][code] += 1
                if e.get(preview.NIL) == 'true':
                    nils[name + ':' + e.get('nilReason', '').split('/')[-1]] += 1
            for wind in f.findall('.//i:WAFSJetStreamWindSymbol', preview.NS):
                isotach['windSymbols'] += 1
                for name in ('IsotachUpperElevation', 'IsotachLowerElevation'):
                    e = wind.find('i:' + name, preview.NS)
                    if e is not None:
                        isotach[name + ('Nil' if e.get(preview.NIL) == 'true' else 'Value')] += 1
    for path in sorted(DIRECTORY / r['file'] for r in records if 'schema-2025-2' in r['file'] and '_T+' not in r['file']):
        root = ET.parse(path).getroot()
        collections = root.findall('.//i:WAFSSignificantWeatherForecast', preview.NS)
        matches = 0
        for collection in collections:
            base = collection.find('i:phenomenonBaseTime/g:TimeInstant/g:timePosition', preview.NS).text
            valid = collection.find('i:phenomenonTime/g:TimeInstant/g:timePosition', preview.NS).text
            target = next(row for row in rows if row['baseTime'] == base and row['validTime'] == valid)
            matches += semantic_hash(collection) == target['semanticHash']
        combined.append({'file': path.name, 'forecasts': len(collections), 'matchingIndividualFiles': matches})
    frames.sort(key=lambda f: (f['metadata']['baseTime'], f['metadata']['validTime']))
    runs = []
    for base in sorted({f['metadata']['baseTime'] for f in frames}):
        run_frames = [f for f in frames if f['metadata']['baseTime'] == base]
        hours = [f['metadata']['forecastHour'] for f in run_frames]
        if hours != list(range(6, 49, 3)):
            raise ValueError(f'Incomplete or duplicate forecast hours for {base}: {hours}')
        hashes = [frame_hashes(f) for f in run_frames]
        runs.append({'baseTime': base, 'forecastHours': hours,
            'ranges': {k: [min(f['metadata']['counts'].get(k, 0) for f in run_frames),
                           max(f['metadata']['counts'].get(k, 0) for f in run_frames)] for k in KINDS},
            'changingSteps': {k: sum(a[k] != b[k] for a, b in zip(hashes, hashes[1:])) for k in KINDS}})
    report = {'sourcePage': PAGE, 'downloadCount': len(records), 'downloadBytes': sum(r['bytes'] for r in records),
        'mapSchema': '2025-2', 'frameCount': len(frames), 'uniqueValidTimes': len({f['metadata']['validTime'] for f in frames}),
        'globalObjectOccurrences': source_counts, 'declaredPhenomenaFrameCounts': declared,
        'globalPropertyCodeOccurrences': codes, 'regionalPropertyCodeOccurrences': regional_codes,
        'leafElementOccurrences': leaves, 'nilReasons': nils, 'geometrySegments': geometry,
        'jetIsotachOccurrences': isotach, 'combinedFiles': combined,
        'runs': runs, 'frames': rows,
        'caveat': 'Counts repeat objects across forecast frames; regional counts use clipped sampled spline outlines, not exact spline polygon intersections.'}
    write_json(DIRECTORY / 'audit.json', report)
    with (DIRECTORY / 'frame-counts.csv').open('w', newline='', encoding='utf-8') as output:
        writer = csv.writer(output, lineterminator='\n')
        writer.writerow(['baseTime', 'validTime', 'forecastHour', *KINDS, 'sourceFile'])
        for frame in frames:
            meta = frame['metadata']
            writer.writerow([meta['baseTime'], meta['validTime'], meta['forecastHour'],
                             *[meta['counts'].get(k, 0) for k in KINDS], meta['sourceFile']])
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / 'wafs-sigwx-series.json').write_text(json.dumps({'frames': frames}, ensure_ascii=False, separators=(',', ':')) + '\n')
    # Runtime demo loads a small index and individual frames from public assets.
    # Preserve the first reviewed run and all original source timestamps.
    public = ROOT / 'frontend/public/samples/sigwx-high'
    public.mkdir(parents=True, exist_ok=True)
    sample_frames = [f for f in frames if f['metadata']['baseTime'] == runs[0]['baseTime']]
    entries = []
    for index, frame in enumerate(sample_frames):
        filename = f'frame-{index:02}.json'
        (public / filename).write_text(json.dumps(frame, ensure_ascii=False, separators=(',', ':')) + '\n')
        entries.append({'file': filename, **frame['metadata']})
    write_json(public / 'index.json', {'sample': True, 'cycleHours': 48, 'frames': entries})
    return report


if __name__ == '__main__':
    records = download_all() if '--download' in sys.argv else json.loads((DIRECTORY / 'downloads.json').read_text())
    report = audit(records)
    print(json.dumps({k: report[k] for k in ['downloadCount', 'downloadBytes', 'frameCount', 'uniqueValidTimes',
        'globalObjectOccurrences', 'globalPropertyCodeOccurrences', 'regionalPropertyCodeOccurrences', 'jetIsotachOccurrences', 'runs', 'combinedFiles']}, ensure_ascii=False, indent=2))
