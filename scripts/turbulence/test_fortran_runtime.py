"""Input/build failures must not silently change the original calculation."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np

from fortran_runtime import load_build, validate_cube


def cube():
    shape = 17,169,205
    return {'grid':{'nx':205,'ny':169,'lonMin':119,'lonMax':136,'latMin':30,'latMax':44,'dx':.083333,'dy':.083333},
            'pressures':np.linspace(100000,15000,17).tolist(),
            'fields':{name:np.full(shape,value,dtype=np.float32) for name,value in
                      [('u',5),('v',5),('w',0),('hgt',1000),('T',280),('q',.01)]},
            'surface':{name:np.full((169,205),value,dtype=np.float32) for name,value in
                       [('ps',100000),('topo',100),('hpbl',1000)]}}


class OriginalRuntimeTest(unittest.TestCase):
    def test_grid_spacing_metadata_does_not_reject_supported_grid(self):
        self.assertEqual(validate_cube(cube()),(17,169,205))

    def test_missing_input_is_rejected_instead_of_nan_sent_to_fortran(self):
        data = cube()
        data['fields']['q'][3,20,20] = np.nan
        with self.assertRaisesRegex(ValueError,'q'):
            validate_cube(data)

    def test_wrong_pressure_order_and_units_are_rejected(self):
        data = cube()
        data['pressures'].reverse()
        with self.assertRaisesRegex(ValueError,'pressure'):
            validate_cube(data)
        data = cube()
        data['pressures'] = [p/100 for p in data['pressures']]
        with self.assertRaisesRegex(ValueError,'pressure'):
            validate_cube(data)
        data = cube()
        data['fields']['T'] += 273.15
        with self.assertRaisesRegex(ValueError,'temperature'):
            validate_cube(data)

    def test_changed_executable_cannot_use_previous_build_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            executable = path/'calculator'
            executable.write_bytes(b'original')
            (path/'build.json').write_text(json.dumps({'files':[],'executable':str(executable),
                'executableSha256':hashlib.sha256(executable.read_bytes()).hexdigest()}))
            self.assertEqual(load_build(path)['executable'],str(executable))
            executable.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'executable'):
                load_build(path)


if __name__ == '__main__':
    unittest.main()
