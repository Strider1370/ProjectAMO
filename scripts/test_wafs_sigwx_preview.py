import importlib.util
import json
import math
from collections import Counter
from datetime import datetime
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('preview', Path(__file__).with_name('wafs-sigwx-preview.py'))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewGeometryTest(unittest.TestCase):
    def test_spline_passes_through_control_points_and_respects_endpoint_directions(self):
        knots = [[0, 0], [1, 2], [3, 1], [4, 3]]
        curve = preview.cubic_spline(knots, [1, 0], [0, 1], steps=1000)
        for i, point in enumerate(knots):
            self.assertEqual(curve[i*1000], point)
        self.assertLess(abs(curve[1][1] / curve[1][0]), 0.02)
        self.assertLess(abs((curve[-1][0]-curve[-2][0]) / (curve[-1][1]-curve[-2][1])), 0.02)

    def test_spline_uses_vector_directions_not_arbitrary_magnitudes(self):
        knots = [[1, 1], [2, 3], [4, 2]]
        self.assertEqual(preview.cubic_spline(knots, [1, 0], [0, 1]),
                         preview.cubic_spline(knots, [100, 0], [0, 200]))

    def test_spline_dateline_and_closed_ring_stay_local_and_finite(self):
        curve = preview.cubic_spline([[175, 30], [-179, 32], [-175, 34]], [1, 0], [1, 0])
        self.assertTrue(all(175 <= p[0] <= 185 for p in curve))
        self.assertEqual(preview.visible_lines(curve), [])
        closed = preview.cubic_spline([[100, 30], [102, 32], [104, 30], [100, 30]], [0, 1], [0, 1])
        self.assertEqual(closed[0], closed[-1])
        self.assertTrue(all(math.isfinite(v) for p in closed for v in p))

    def test_dateline_crossing_does_not_draw_across_asia(self):
        self.assertEqual(preview.visible_lines([[175, 35], [-175, 35]]), [])
        self.assertEqual(preview.visible_lines([[-175, 35], [175, 35]]), [])

    def test_line_entering_region_from_dateline_is_clipped_at_east(self):
        self.assertEqual(preview.visible_lines([[-175, 35], [160, 35]]), [[[170, 35], [160, 35]]])

    def test_outside_vertices_can_still_cross_region(self):
        self.assertEqual(preview.visible_lines([[70, 0], [175, 0]]), [[[75, 0], [170, 0]]])

    def test_disconnected_fragments_are_not_joined_across_clipped_area(self):
        parts = preview.visible_lines([[100, 65], [110, 75], [130, 75], [140, 65]])
        self.assertEqual(parts, [[[100, 65], [105, 70]], [[135, 70], [140, 65]]])

    def test_lat_long_becomes_geojson_long_lat(self):
        element = preview.ET.fromstring('<pos>31.6 130.65</pos>')
        self.assertEqual(preview.coordinates(element), [[130.65, 31.6]])

    def test_nil_height_is_not_zero(self):
        element = preview.ET.fromstring('''<x xmlns:i="http://icao.int/iwxxm/2025-2"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <i:lowerElevation xsi:nil="true" nilReason="http://codes.wmo.int/iwxxm/nil/unknown"/>
            </x>''')
        self.assertEqual(preview.elevation(element, 'lowerElevation'), '? (unknown)')


class PreviewSeriesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / 'frontend/src/features/weather-overlays/fixtures/wafs-sigwx-series.json'
        cls.frames = json.loads(path.read_text())['frames']

    def test_complete_forecast_runs_and_utc_lead_times(self):
        self.assertEqual(len(self.frames), 30)
        runs = {}
        for frame in self.frames:
            meta = frame['metadata']
            hours = (datetime.fromisoformat(meta['validTime']) - datetime.fromisoformat(meta['baseTime'])).total_seconds() / 3600
            self.assertEqual(hours, meta['forecastHour'])
            runs.setdefault(meta['baseTime'], []).append(hours)
        self.assertEqual(len(runs), 2)
        for hours in runs.values():
            self.assertEqual(hours, list(range(6, 49, 3)))

    def test_all_frames_have_consistent_object_counts_and_clipped_coordinates(self):
        for frame in self.frames:
            objects = {}
            for feature in frame['features']:
                props = feature['properties']
                objects[props['objectId']] = props['phenomenon']
                geom = feature['geometry']
                points = [geom['coordinates']] if geom['type'] == 'Point' else [p for line in geom['coordinates'] for p in line]
                self.assertTrue(all(75 <= lon <= 170 and -20 <= lat <= 70 for lon, lat in points))
            self.assertEqual(Counter(objects.values()), frame['metadata']['counts'])

    def test_later_forecasts_remove_absent_cyclone_instead_of_carrying_it_forward(self):
        for frame in self.frames:
            present = any(f['properties']['phenomenon'] == 'TROPICAL_CYCLONE' for f in frame['features'])
            self.assertEqual(present, frame['metadata']['forecastHour'] <= 24)

    def test_hazard_selection_preserves_closed_rings_and_regional_world_copies(self):
        for frame in self.frames:
            hazards = {f['properties']['objectId'] for f in frame['features']
                       if f['properties']['role'] == 'boundary' and f['properties']['phenomenon'] in ('TURBULENCE', 'AIRFRAME_ICING')}
            self.assertEqual(hazards, {a['objectId'] for a in frame['areas']})
            for area in frame['areas']:
                self.assertTrue(area['polygons'])
                for polygon in area['polygons']:
                    for ring in polygon:
                        self.assertGreaterEqual(len(ring), 4)
                        self.assertEqual(ring[0], ring[-1])
                        self.assertTrue(all(math.isfinite(v) for p in ring for v in p))
                    self.assertLessEqual(min(p[0] for p in polygon[0]), 170)
                    self.assertGreaterEqual(max(p[0] for p in polygon[0]), 75)

    def test_cloud_distributions_severities_and_isotach_values_survive_conversion(self):
        props = [f['properties'] for frame in self.frames for f in frame['features']]
        self.assertEqual({p['distribution'] for p in props if p['distribution']}, {'OCNL', 'FRQ'})
        for kind in ['TURBULENCE', 'AIRFRAME_ICING']:
            self.assertEqual({p['severity'] for p in props if p['phenomenon'] == kind}, {'MOD', 'SEV'})
        wind = [p for p in props if p['role'] == 'wind']
        self.assertTrue(any(p['isotachUpper'].startswith('FL ') for p in wind))
        self.assertTrue(any(p['isotachLower'].startswith('FL ') for p in wind))
        self.assertTrue(any(p['isotachLower'] == '' for p in wind))


if __name__ == '__main__':
    unittest.main()
