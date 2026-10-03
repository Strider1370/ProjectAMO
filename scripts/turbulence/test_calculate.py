import unittest

import numpy as np

from calculate import calculate, derivative, filter_diagnostic, mapped_ri, mean_on_height, smooth


class NumericalContract(unittest.TestCase):
    def test_nonuniform_vertical_polynomial(self):
        z = np.array([0., 130., 470., 1100., 3000.])[:, None, None]
        a = np.broadcast_to(z**2, (5, 3, 4))
        np.testing.assert_allclose(derivative(a, z, 0)[1:-1], np.broadcast_to(2 * z[1:-1], (3, 3, 4)))

    def test_constant_height_correction(self):
        x = np.linspace(0, 10000, 9)[None, None, :]
        z = np.array([100, 300, 800, 2000])[:, None, None] + .02 * x
        a = 3 * z
        az = derivative(a, z, 0)
        corrected = derivative(a, x, 2) - az * derivative(z, x, 2)
        np.testing.assert_allclose(corrected, 0, atol=1e-12)
        self.assertGreater(np.nanmax(np.abs(derivative(a, x, 2))), .05)

    def test_no_regional_wrap_and_preserved_missing(self):
        a = np.zeros((4, 30, 30))
        a[:, :, -1] = 1000
        a[2, 15, 15] = np.nan
        result = smooth(a, 2, 1)
        self.assertTrue(np.all(result[:, :, 0] == 0))
        self.assertTrue(np.isnan(result[2, 15, 15]))

    def test_source_filter_skips_missing_triplets_and_keeps_endpoints(self):
        a = np.broadcast_to(np.array([0., 0., 100., np.nan, 10.])[:, None, None], (5, 3, 3)).copy()
        out = smooth(a, 0, 1)
        np.testing.assert_allclose(out[:, 1, 1], [0, 25, 100, np.nan, 10], equal_nan=True)

    def test_inverse_ri_cap_follows_smoothing(self):
        a = np.broadcast_to(np.array([0., 0., 1000., 0., 0.])[:, None, None], (5, 3, 3)).copy()
        out = filter_diagnostic('sat_inv_ri', a, 0, 1, 0)
        np.testing.assert_allclose(out[:, 1, 1], [0, 100, 100, 100, 0])

    def test_source_stability_mean_on_irregular_height(self):
        z = np.array([0., 100., 400., 1000., 2000.])[:, None, None]
        a = np.array([280., 282., 290., 310., 350.])[:, None, None]
        out = mean_on_height(a, z)
        self.assertAlmostEqual(out[0, 0, 0], 281)
        self.assertAlmostEqual(out[1, 0, 0], ((280+282)*100+(282+290)*300)/800)
        self.assertAlmostEqual(out[-1, 0, 0], 330)

    def test_negative_ri_region(self):
        a = np.array([2, -.1, -.2, 4, 8.])[:, None, None]
        np.testing.assert_allclose(mapped_ri(a).ravel(), [2, 3, 3, 4, 8])
        self.assertTrue(np.isnan(mapped_ri(-np.ones((5, 1, 1)))).all())

    def cube(self):
        shape = (5, 31, 31)
        z = np.broadcast_to(np.array([200., 600., 1400., 3000., 6000.])[:, None, None], shape)
        t = np.full(shape, 280.)
        return {"grid": {"nx": 31, "ny": 31, "lonMin": 124., "lonMax": 128., "latMin": 30., "latMax": 34.},
                "pressures": [97500, 92500, 85000, 70000, 45000],
                "fields": {"u": np.zeros(shape), "v": np.zeros(shape), "w": np.full(shape, 2.),
                           "T": t, "q": np.full(shape, .001), "hgt": z},
                "surface": {"ps": np.full(shape[1:], 100000.), "topo": np.zeros(shape[1:]), "hpbl": np.zeros(shape[1:])}}

    def test_calm_flow_and_known_vertical_velocity(self):
        result = calculate(self.cube())
        for name in ('ngm1', 'defsq', 'mwt5', 'mwt12'):
            np.testing.assert_allclose(result[name][:, 15, 15], 0, atol=1e-10)
        np.testing.assert_allclose(result['wsq'][:, 15, 15], 4)
        self.assertTrue(np.isnan(result['wsq'][:, 0, :]).all())

    def test_terrain_pressure_mask_after_filter(self):
        cube = self.cube()
        cube['surface']['ps'][15, 15] = 90000
        result = calculate(cube)
        self.assertTrue(np.isnan(result['wsq'][:2, 15, 15]).all())
        np.testing.assert_allclose(result['wsq'][2:, 15, 15], 4)
        cube['fields']['hgt'] = np.zeros((5, 31, 31))
        self.assertTrue(np.isnan(calculate(cube)['wsq']).all())

    def test_bad_shape_rejected(self):
        cube = self.cube()
        cube['fields']['u'] = [1, 2]
        with self.assertRaises(ValueError):
            calculate(cube)


if __name__ == '__main__':
    unittest.main()
