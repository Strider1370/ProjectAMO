import json
from pathlib import Path
import unittest

import numpy as np

from calculate import CATALOG, smooth
from combine import combine, merge_regions, native_region_bounds, remap
from diagnostics24 import interpolate_columns, structures


class CombinationContract(unittest.TestCase):
    def test_all_selected_24_have_coefficients_and_calculation(self):
        calibration = json.loads((Path(__file__).parent / 'calibration.json').read_text())
        selected = set(sum(calibration['selected'].values(), []))
        self.assertEqual(len(selected), 24)
        self.assertEqual([len(c) for c in calibration['selected'].values()], [7, 8, 13])
        self.assertEqual(selected, {c for _, _, c, _ in CATALOG if c < 491})
        for region, codes in calibration['selected'].items():
            for code in codes:
                self.assertGreater(calibration['fits'][f'{region}:{code}']['b'], 0)

    def test_log_normal_and_clamps(self):
        x = np.array([0, 1, 4, np.nan, 10000])
        mapped = remap(np.log(.2), .5, x)
        np.testing.assert_allclose(mapped[[0, 1, 2, 4]], [0, .2, .4, 1.5])
        self.assertTrue(np.isnan(mapped[3]))

    def calibration(self):
        return {'selected': {str(r): [415, 422, 480] for r in range(1, 4)},
                'fits': {f'{r}:{code}': {'a': np.log(r), 'b': 1} for r in range(1, 4) for code in (415, 422, 480)}}

    def test_native_left_boundary_reference_and_region_bounds(self):
        height = np.broadcast_to(np.array([200., 1500., 3500., 4500., 6500., 8000., 10000.])[:, None, None], (7, 3, 4)).copy()
        height[:, 0, 0] += 2000
        self.assertEqual(native_region_bounds(height, 0, 0, 2), [(0, 2), (2, 4), (4, 6)])

    def test_merge_regions_uses_updated_centre_for_above_and_below(self):
        a = np.array([.1, .2, .3, .6, .9, 1., 1.])[:, None, None]
        merge_regions(a, 3)
        np.testing.assert_allclose(a.ravel(), [.1, .2, (.2+.3+.6)/3, .6, (.6+.9+1)/3, 1, 1])

    def test_native_category_weights_and_actual_max(self):
        raw = {415: np.full((9, 3, 3), .1), 422: np.full((9, 3, 3), .3), 480: np.full((9, 3, 3), .4)}
        out = combine(raw, [(0, 2), (3, 5), (6, 8)], self.calibration(), smooth)
        self.assertAlmostEqual(out['cat'][0, 1, 1], .2)
        self.assertAlmostEqual(out['gktg'][0, 1, 1], .4)
        self.assertAlmostEqual(out['cat'][8, 1, 1], .6)
        self.assertAlmostEqual(out['gktg'][8, 1, 1], 1)

    def test_actual_missing_sum_retains_fixed_weights_and_max_requires_cat(self):
        raw = {415: np.full((9, 3, 3), .1), 422: np.full((9, 3, 3), np.nan), 480: np.full((9, 3, 3), .4)}
        out = combine(raw, [(0, 2), (3, 5), (6, 8)], self.calibration(), smooth)
        self.assertAlmostEqual(out['cat'][0, 1, 1], .05)
        self.assertAlmostEqual(out['gktg'][0, 1, 1], .4)
        raw[415][:] = np.nan
        out = combine(raw, [(0, 2), (3, 5), (6, 8)], self.calibration(), smooth)
        self.assertTrue(np.isnan(out['cat']).all())
        self.assertTrue(np.isnan(out['gktg']).all())

    def test_final_filter_is_last_region_only_and_cat_is_not_filtered(self):
        raw = {415: np.full((9, 5, 5), .01), 422: np.full((9, 5, 5), .01), 480: np.zeros((9, 5, 5))}
        raw[480][0, 2, 2] = .3
        raw[480][8, 2, 2] = .3
        out = combine(raw, [(0, 2), (3, 5), (6, 8)], self.calibration(), smooth)
        self.assertAlmostEqual(out['gktg'][0, 2, 2], .3)
        self.assertAlmostEqual(out['mwt'][8, 2, 2], .225)
        self.assertAlmostEqual(out['cat'][8, 2, 2], .03)

    def test_same_height_interpolation_and_no_extrapolation(self):
        z = np.broadcast_to(np.array([100., 500., 1500.])[:, None, None], (3, 2, 2))
        target = z + 50
        out = interpolate_columns(2*z, z, target)
        np.testing.assert_allclose(out[:2], 2*target[:2])
        self.assertTrue(np.isnan(out[-1]).all())

    def test_structure_function_of_constant_fields_is_zero(self):
        from calculate import shifted
        shape = (3, 9, 9)
        z = np.broadcast_to(np.array([100., 500., 1500.])[:, None, None], shape)
        result = structures({name: np.full(shape, 5.) for name in ('u', 'v', 'T', 'w')}, z,
                            {'nx': 9, 'ny': 9, 'lonMin': 124, 'lonMax': 125, 'latMin': 32, 'latMax': 33}, shifted)
        for a in result.values():
            np.testing.assert_allclose(a[:, 4, 4], 0)


if __name__ == '__main__':
    unittest.main()
