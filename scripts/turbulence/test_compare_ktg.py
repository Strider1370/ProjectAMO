import unittest
import numpy as np
from compare_ktg import bilinear, ranks, statistics
from diagnostics24 import interpolate_columns


class ComparisonTests(unittest.TestCase):
    def test_interpolation_aligns_height_then_coordinates_without_extrapolation(self):
        grid = dict(nx=2, ny=2, lonMin=120, lonMax=121, latMin=30, latMax=31)
        z = np.stack([np.full((2, 2), 1000.), np.full((2, 2), 2000.)])
        a = z/1000 + np.array([[0, 1], [2, 3]])
        at_height = interpolate_columns(a, z, np.full((1, 2, 2), 1500.))[0]
        np.testing.assert_allclose(bilinear(at_height, grid, np.array([120.5]), np.array([30.5])), [3.])
        self.assertTrue(np.isnan(bilinear(at_height, grid, np.array([119.9]), np.array([30.5]))[0]))
        self.assertTrue(np.isnan(interpolate_columns(a, z, np.full((1, 2, 2), 500.))).all())
        at_height[1, 1] = np.nan
        self.assertTrue(np.isnan(bilinear(at_height, grid, np.array([120.5]), np.array([30.5]))[0]))
        self.assertEqual(bilinear(at_height, grid, np.array([120.]), np.array([30.]))[0], 1.5)

    def test_grades_use_each_products_thresholds_and_missing_pairs_are_excluded(self):
        a = np.array([0, .3, .475, .75, np.nan, .8])
        b = np.array([0, .15, .22, .34, .8, np.nan])
        m = statistics(a, b)
        self.assertEqual(m['pairs'], 4)
        self.assertEqual(m['agreement'], 1.)
        self.assertEqual(m['kappa'], 1.)
        self.assertEqual(m['light_or_higher_iou'], 1.)
        self.assertEqual(m['confusion_ktg_rows_gktg_columns'], np.eye(4, dtype=int).tolist())
        self.assertNotIn('rmse', m)
        self.assertNotIn('bias', m)

    def test_rank_ties_and_constant_fields(self):
        np.testing.assert_allclose(ranks(np.array([2, 0, 2, 1.])), [2.5, 0, 2.5, 1])
        m = statistics(np.array([.1, .1]), np.array([.1, .1]))
        self.assertIsNone(m['pearson'])
        self.assertIsNone(m['kappa'])
        self.assertEqual(statistics(np.array([np.nan]), np.array([.1])), {'pairs': 0})


if __name__ == '__main__':
    unittest.main()
