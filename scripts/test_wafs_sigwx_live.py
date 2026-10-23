import importlib.util
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('wafs_sigwx_live', Path(__file__).with_name('wafs-sigwx-live.py'))
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)

BASE = datetime(2026, 10, 23, 6, tzinfo=timezone.utc)
VALID = [(BASE + timedelta(hours=hour)).isoformat().replace('+00:00', 'Z') for hour in range(6, 49, 3)]


class LiveCollectionTest(unittest.TestCase):
    def fake_frame(self, xml, source_url=None):
        valid = xml.read_text()
        return {'type': 'FeatureCollection', 'features': [{'type': 'Feature'}], 'areas': [{'id': 'area'}],
                'metadata': {'baseTime': BASE.isoformat().replace('+00:00', 'Z'),
                             'issueTime': (BASE + timedelta(hours=5)).isoformat().replace('+00:00', 'Z'),
                             'validTime': valid, 'sourceUrl': source_url, 'sourceCounts': {'CLOUD': 1}}}

    def make_fetch(self, calls, fail_at=None):
        def fetch(url, key):
            self.assertEqual(key, 'test-key')
            calls.append(url)
            if len(calls) == fail_at:
                raise ValueError('simulated WIFS outage')
            if url.endswith('?f=json'):
                return json.dumps({'extent': {'temporal': {'values': VALID}}}).encode()
            return parse_qs(urlparse(url).query)['datetime'][0].encode()
        return fetch

    def test_f06_to_f36_only_with_65_second_gaps_and_idempotent_run(self):
        calls, sleeps = [], []
        with tempfile.TemporaryDirectory() as root, patch.object(live.preview, 'build', self.fake_frame):
            result = live.collect(root, 'test-key', fetch=self.make_fetch(calls), sleep=sleeps.append)
            self.assertEqual(result, {'saved': True, 'runId': '2026102306', 'frames': 11})
            self.assertEqual(len(calls), 12)
            self.assertEqual(sleeps, [65] * 11)
            index = json.loads((Path(root) / 'sigwx_high/latest.json').read_text())
            self.assertEqual([frame['forecastHour'] for frame in index['frames']], list(range(6, 37, 3)))
            self.assertTrue(all((Path(root) / 'sigwx_high' / frame['file']).exists() for frame in index['frames']))
            self.assertEqual(live.collect(root, 'test-key', fetch=self.make_fetch(calls), sleep=sleeps.append)['saved'], False)
            self.assertEqual(len(calls), 13)  # metadata only; no repeat XML downloads
            self.assertEqual(len(sleeps), 11)

    def test_failed_frame_never_replaces_last_complete_index(self):
        with tempfile.TemporaryDirectory() as root, patch.object(live.preview, 'build', self.fake_frame):
            live.collect(root, 'test-key', fetch=self.make_fetch([]), sleep=lambda _: None)
            index_path = Path(root) / 'sigwx_high/latest.json'
            before = index_path.read_bytes()
            new_valid = [(BASE + timedelta(hours=6 + hour)).isoformat().replace('+00:00', 'Z') for hour in range(6, 49, 3)]
            def fail_new(url, key):
                if url.endswith('?f=json'):
                    return json.dumps({'extent': {'temporal': {'values': new_valid}}}).encode()
                raise ValueError('simulated WIFS outage')
            with self.assertRaisesRegex(ValueError, 'simulated WIFS outage'):
                live.collect(root, 'test-key', fetch=fail_new, sleep=lambda _: None)
            self.assertEqual(index_path.read_bytes(), before)
            self.assertFalse(any(p.name.startswith('.') for p in (Path(root) / 'sigwx_high/runs').iterdir()))

    def test_rejects_incomplete_or_wrongly_spaced_valid_times(self):
        with self.assertRaisesRegex(ValueError, 'missing'):
            live.validate_times({'extent': {'temporal': {'values': VALID[:10]}}})
        broken = VALID.copy()
        broken[2] = broken[1]
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            live.validate_times({'extent': {'temporal': {'values': broken}}})

    def test_http_429_stops_remaining_forecasts_and_reports_status(self):
        calls, events = [], []
        def limited(url, key):
            calls.append(url)
            if url.endswith('?f=json'):
                return json.dumps({'extent': {'temporal': {'values': VALID}}}).encode()
            if len(calls) == 4:
                raise live.WifsHttpError(429)
            return parse_qs(urlparse(url).query)['datetime'][0].encode()
        with tempfile.TemporaryDirectory() as root, patch.object(live.preview, 'build', self.fake_frame):
            with self.assertRaisesRegex(live.WifsHttpError, '429'):
                live.collect(root, 'test-key', fetch=limited, sleep=lambda _: None, on_event=events.append)
            self.assertEqual(len(calls), 4)
            self.assertEqual([event['status'] for event in events if event['event'] == 'completed'], [200, 200, 200, 429])
            self.assertFalse((Path(root) / 'sigwx_high/latest.json').exists())

    def test_http_403_on_metadata_stops_before_forecasts(self):
        calls, events = [], []
        def forbidden(url, key):
            calls.append(url)
            raise live.WifsHttpError(403)
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(live.WifsHttpError, '403'):
                live.collect(root, 'test-key', fetch=forbidden, sleep=lambda _: None, on_event=events.append)
        self.assertEqual(len(calls), 1)
        self.assertEqual(events[-1]['status'], 403)

    def test_transport_converts_http_error_without_retry_or_response_body(self):
        class ForbiddenOpener:
            def __init__(self):
                self.calls = 0
            def open(self, request, timeout):
                self.calls += 1
                raise HTTPError(request.full_url, 403, 'Forbidden', {}, None)
        opener = ForbiddenOpener()
        with self.assertRaisesRegex(live.WifsHttpError, '403'):
            live.fetch_url(live.COLLECTION + '?f=json', 'test-key', opener=opener)
        self.assertEqual(opener.calls, 1)


if __name__ == '__main__':
    unittest.main()
