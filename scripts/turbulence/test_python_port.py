"""Regression checks for the omissions and legacy branch order in the port."""
import ast
import json
from pathlib import Path
import unittest
import numpy as np
from python_core import irregular,rimap,rinorm,smooth
from python_combine import combine,merge
from products import CATALOG


class PythonPortTest(unittest.TestCase):
    def test_runtime_import_graph_does_not_invoke_fortran(self):
        root=Path(__file__).parent
        pending=['calculate_python'];seen=set()
        while pending:
            name=pending.pop()
            if name in seen:continue
            seen.add(name)
            source=ast.parse((root/f'{name}.py').read_text())
            for node in ast.walk(source):
                modules=([node.module] if isinstance(node,ast.ImportFrom) else [a.name for a in node.names] if isinstance(node,ast.Import) else [])
                for module in modules:
                    self.assertFalse(module.startswith('fortran') or module=='subprocess',module)
                    if (root/f'{module}.py').exists():pending.append(module)
        self.assertIn('python_theta',seen)
        self.assertIn('python_structure',seen)
        self.assertNotIn('calculate',seen)  # disabled legacy approximation

    def test_selected_indices_are_exactly_the_24_product_codes(self):
        data=json.loads(Path(__file__).with_name('calibration.json').read_text())
        selected=set().union(*(set(v) for v in data['selected'].values()))
        self.assertEqual(selected,{code for _,_,code,_ in CATALOG if code<491})
        self.assertEqual([len(v) for v in data['selected'].values()],[7,8,13])
        self.assertEqual(len(data['fits']),28)

    def test_signed_irregular_coordinates_and_one_sided_ends(self):
        x=np.array([3,2,0],dtype='f4')[:,None,None]
        f=2*x+5
        np.testing.assert_array_equal(irregular(f,x),np.full_like(f,2))

    def test_ri_mapping_is_followed_by_smoothing_and_floor_is_at_division(self):
        raw=np.array([.0002,-.1,.0008],dtype='f4')[:,None,None]
        mapped=rimap(raw)
        self.assertAlmostEqual(float(mapped[1,0,0]),.0005,places=9)
        self.assertLess(float(mapped[0,0,0]),.001)
        normalized=rinorm(np.ones_like(raw),mapped)
        np.testing.assert_allclose(normalized,1000,rtol=1e-7)
        missing=np.full_like(mapped,np.nan)
        np.testing.assert_array_equal(rinorm(np.ones_like(raw),missing),normalized)

    def test_filter_keeps_requested_region_boundaries(self):
        a=np.ones((7,7,7),dtype='f4');a[:,0,:]=100;a[:,:,0]=100;a[0]=100
        region=np.zeros(a.shape,bool);region[2:6,2:6,2:6]=True
        result=smooth(a,1,1,region)
        np.testing.assert_array_equal(result[region],1)
        np.testing.assert_array_equal(result[~region],a[~region])

    def test_mwt_export_is_saved_before_final_gktg_filter(self):
        # A high-region mountain spike; CAT all zero. Source 493.F keeps
        # the spike while 494.F receives the final high-region smoothing.
        shape=(7,7,7);mask=np.ones((7,7),bool)
        raw=np.zeros(shape,dtype='f4');raw[5,3,3]=1
        data={'selected':{str(r):[415,477] for r in (1,2,3)},
              'fits':{f'{r}:{code}':{'a':0,'b':1} for r in (1,2,3) for code in (415,477)}}
        out=combine({415:np.zeros_like(raw),477:raw},[(0,1),(2,3),(4,6)],data,mask)
        self.assertGreater(float(out['mwt'][5,3,3]),float(out['gktg'][5,3,3]))
        self.assertEqual(out['mwt'].dtype,np.dtype('f4'))


if __name__=='__main__':unittest.main()
