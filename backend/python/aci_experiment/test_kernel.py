"""Small scientific parity tests; requires the isolated verification environment."""
import unittest
import json
from pathlib import Path
import numpy as np
from metpy.calc import dewpoint_from_specific_humidity, surface_based_cape_cin
from metpy.units import units
from kernel import cape_column
from engine import calculate

LEVELS=np.array([1000,975,950,925,900,875,850,800,750,700,650,600,550,500,450,400,350,300,250,200,150],dtype=float)*100

class KernelTests(unittest.TestCase):
    def compare(self,ps,t0,q0,t,q):
        got=calculate(np.array([[ps,t0,q0]]),LEVELS,t[None,:],q[None,:])[0][0]
        mask=LEVELS<ps-1
        p=np.r_[ps,LEVELS[mask]];temp=np.r_[t0,t[mask]];humidity=np.r_[q0,np.maximum(q[mask],1e-8)]
        td=dewpoint_from_specific_humidity(p*units.Pa,humidity*units.dimensionless).to('K').magnitude
        cape,cin=surface_based_cape_cin(p*units.Pa,temp*units.K,np.minimum(td,temp)*units.K)
        ref=float(cape.magnitude)
        if ref < -1e-8:self.assertEqual(got[2],2)
        else:
            self.assertEqual(got[2],0)
            self.assertLessEqual(abs(got[0]-ref),max(1,abs(ref)*.001))
            self.assertLessEqual(abs(got[1]-float(cin.magnitude)),max(1,abs(float(cin.magnitude))*.001))
        return got

    def test_stable_column(self):
        result=self.compare(101300,280,.003,np.full(len(LEVELS),280.),np.linspace(.003,.00001,len(LEVELS)))
        self.assertEqual(result[0],0)

    def test_unstable_column_and_convergence(self):
        t=300*(LEVELS/101300)**.31;q=np.linspace(.014,.000001,len(LEVELS))
        got=self.compare(101300,302,.018,t,q)
        self.assertGreater(got[0],0)
        finer=cape_column(101300,302,.018,LEVELS,t,q,50.)
        self.assertLess(abs(got[0]-finer[0]),.01)

    def test_underground_layers_ignored(self):
        t=np.linspace(300,205,len(LEVELS));q=np.linspace(.014,0,len(LEVELS))
        self.compare(83000,294,.012,t,q)
        a=cape_column(83000,294,.012,LEVELS,t,q)
        t[LEVELS>=83000]=np.nan;q[LEVELS>=83000]=np.nan
        np.testing.assert_equal(a,cape_column(83000,294,.012,LEVELS,t,q))

    def test_high_terrain_retains_valid_shorter_profile(self):
        got=self.compare(52000,275,.004,np.linspace(300,205,len(LEVELS)),np.linspace(.014,0,len(LEVELS)))
        self.assertEqual(got[2],0)

    def test_missing_active_layer_is_not_zero(self):
        t=np.linspace(300,205,len(LEVELS));q=np.linspace(.014,0,len(LEVELS));t[-1]=np.nan
        got=cape_column(101300,302,.018,LEVELS,t,q)
        self.assertTrue(np.isnan(got[0]));self.assertEqual(got[2],1)

    def test_saturated_surface(self):
        self.compare(101300,295,.04,np.linspace(295,210,len(LEVELS)),np.linspace(.014,0,len(LEVELS)))

    def test_real_crossing_regressions(self):
        cases=json.loads((Path(__file__).parent/'fixtures/crossings.json').read_text())
        for case in cases:
            p=case['point'];ref=case['expected']
            t=np.array([v['T'] for v in p['profile']],float);q=np.array([v['q'] for v in p['profile']],float)
            results,count=calculate(np.array([[p['ps'],p['t2m'],p['q2m']]]),LEVELS,t[None,:],q[None,:])
            if ref['cape'] is None:
                self.assertTrue(np.isnan(results[0,0]));self.assertEqual(results[0,2],2)
            else:
                self.assertEqual(count,1)
                self.assertAlmostEqual(results[0,0],ref['cape'],places=6)
                self.assertAlmostEqual(results[0,1],ref['cin'],places=6)

    def test_invalid_step_and_pressure_order(self):
        s=np.array([[101300,300,.014]])
        t=np.linspace(300,205,len(LEVELS))[None,:];q=np.linspace(.014,0,len(LEVELS))[None,:]
        for step in [0,-1,np.nan]:
            with self.assertRaises(ValueError):calculate(s,LEVELS,t,q,step)
        with self.assertRaises(ValueError):calculate(s,LEVELS[::-1],t,q)

if __name__=='__main__':unittest.main()
