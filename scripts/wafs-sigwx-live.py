"""Collect one WIFS KKCI SIGWX run (F06–F36), slowly, and publish atomically.

The backend schedules this once daily. A failed or incomplete run never changes
latest.json. Only the converted regional JSON is published under /data/.
"""

import argparse
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = Path(__file__).with_name('wafs-sigwx-preview.py')
spec = importlib.util.spec_from_file_location('wafs_sigwx_preview', PREVIEW)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)

COLLECTION = 'https://aviationweather.gov/wifs/api/collections/kkci_iwxxm_forecasts'
LOCATION = COLLECTION + '/locations/GLOBAL'
HOURS = tuple(range(6, 37, 3))
REQUEST_GAP_SECONDS = 65


class RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, new_url):
        raise WifsHttpError(code)


class WifsHttpError(ValueError):
    def __init__(self, status):
        self.status = status
        super().__init__(f'WIFS HTTP {status}; collection stopped')


def iso(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def validate_times(metadata):
    values = metadata.get('extent', {}).get('temporal', {}).get('values')
    if not isinstance(values, list) or len(values) < len(HOURS):
        raise ValueError('WIFS SIGWX valid times missing')
    times = [iso(value) for value in values[:len(HOURS)]]
    base = times[0] - timedelta(hours=6)
    if base.tzinfo is None or base.utcoffset() != timedelta(0) or base.hour not in (0, 6, 12, 18):
        raise ValueError('WIFS SIGWX base time invalid')
    if any(actual != base + timedelta(hours=hour) for actual, hour in zip(times, HOURS)):
        raise ValueError('WIFS SIGWX forecast hours incomplete')
    return base, values[:len(HOURS)]


def fetch_url(url, api_key, opener=None):
    opener = opener or urllib.request.build_opener(RejectRedirects())
    request = urllib.request.Request(url, headers={
        'X-API-Key': api_key,
        'User-Agent': 'ProjectAMO-WIFS-SIGWX/1.0',
    })
    try:
        with opener.open(request, timeout=60) as response:
            if response.status != 200:
                raise WifsHttpError(response.status)
            raw = response.read(12_000_001)
    except urllib.error.HTTPError as error:
        error.close()
        raise WifsHttpError(error.code) from None
    if len(raw) > 12_000_000:
        raise ValueError('WIFS SIGWX response too large')
    return raw


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


def read_latest(directory):
    try:
        return json.loads((directory / 'latest.json').read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        return None


def collect(data_root, api_key, *, fetch=fetch_url, sleep=time.sleep,
            now=lambda: datetime.now(timezone.utc), on_event=lambda event: None):
    if not api_key:
        raise ValueError('WIFS_API_KEY is missing')
    def request(url, endpoint, hour=None):
        on_event({'event': 'started', 'endpoint': endpoint, 'forecastHour': hour})
        started = time.monotonic()
        try:
            raw = fetch(url, api_key)
        except Exception as error:
            on_event({'event': 'completed', 'endpoint': endpoint, 'forecastHour': hour,
                      'status': getattr(error, 'status', getattr(error, 'code', None)),
                      'bytes': 0, 'durationMs': round((time.monotonic() - started) * 1000)})
            raise
        on_event({'event': 'completed', 'endpoint': endpoint, 'forecastHour': hour,
                  'status': 200, 'bytes': len(raw),
                  'durationMs': round((time.monotonic() - started) * 1000)})
        return raw
    # The index is the only initial request. Do not download a run twice.
    metadata = json.loads(request(COLLECTION + '?f=json', 'metadata'))
    base, valid_times = validate_times(metadata)
    run_id = base.strftime('%Y%m%d%H')
    directory = Path(data_root) / 'sigwx_high'
    previous = read_latest(directory)
    if previous and not previous.get('previewOnly') and str(previous.get('runId', '0')) >= run_id:
        return {'saved': False, 'runId': previous['runId'], 'frames': len(previous['frames'])}

    runs = directory / 'runs'
    runs.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f'.{run_id}-', dir=runs))
    try:
        frames = []
        for position, (hour, valid_time) in enumerate(zip(HOURS, valid_times)):
            # 65 seconds also separate the metadata request from the first XML.
            sleep(REQUEST_GAP_SECONDS)
            query = urllib.parse.urlencode({'f': 'iwxxm', 'datetime': valid_time})
            url = LOCATION + '?' + query
            raw = request(url, 'forecast', hour)
            # Keep the full global IWXXM outside the web-served data tree.
            with tempfile.NamedTemporaryFile(suffix='.xml', delete=False) as temporary:
                temporary.write(raw)
                xml = Path(temporary.name)
            try:
                frame = preview.build(xml, source_url=url)
            finally:
                xml.unlink(missing_ok=True)
            meta = frame['metadata']
            if iso(meta['baseTime']) != base or iso(meta['validTime']) != iso(valid_time):
                raise ValueError(f'WIFS SIGWX time mismatch at F{hour:02d}')
            if iso(meta['issueTime']) > iso(meta['validTime']):
                raise ValueError(f'WIFS SIGWX issue time invalid at F{hour:02d}')
            if not meta.get('sourceCounts') or not isinstance(frame.get('features'), list) or not isinstance(frame.get('areas'), list):
                raise ValueError(f'WIFS SIGWX regional frame invalid at F{hour:02d}')
            meta.update({'forecastHour': hour, 'frameId': meta['baseTime'] + '/' + meta['validTime']})
            filename = f'frame-{position:02d}.json'
            write_json(stage / filename, frame)
            frames.append({'file': f'runs/{run_id}/{filename}', **meta})

        published_at = now().isoformat().replace('+00:00', 'Z')
        index = {'sample': False, 'source': 'WIFS KKCI', 'runId': run_id,
                 'maxForecastHour': 36, 'publishedAt': published_at, 'frames': frames}
        write_json(stage / 'index.json', index)
        final = runs / run_id
        if final.exists():
            # A prior interrupted publication may have left this complete run.
            if not (final / 'index.json').exists():
                raise ValueError('WIFS SIGWX run directory is incomplete')
            shutil.rmtree(stage)
        else:
            os.replace(stage, final)
        tmp = directory / f'.latest.{os.getpid()}.tmp'
        try:
            write_json(tmp, index)
            os.replace(tmp, directory / 'latest.json')
        finally:
            tmp.unlink(missing_ok=True)
        # Keep recent immutable runs for browsers that still hold an old index.
        completed = sorted((p for p in runs.iterdir() if p.is_dir() and len(p.name) == 10 and p.name.isdigit()), reverse=True)
        for old in completed[3:]:
            shutil.rmtree(old)
        return {'saved': True, 'runId': run_id, 'frames': len(frames)}
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True, help='Backend data root')
    args = parser.parse_args()
    def emit(event):
        print(json.dumps(event, separators=(',', ':')), flush=True)
    result = collect(args.root, os.environ.get('WIFS_API_KEY', ''), on_event=emit)
    print(json.dumps({'event': 'result', **result}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, urllib.error.URLError) as error:
        print(f'wifs_sigwx_collection_failed: {error}', file=sys.stderr)
        sys.exit(1)
