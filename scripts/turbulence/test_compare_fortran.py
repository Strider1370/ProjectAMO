"""Checks that protect the numerical comparison from silent layout errors."""
from pathlib import Path
import struct
import tempfile
import unittest

import numpy as np

from compare_fortran import metrics, read_f_record


class FortranComparisonTest(unittest.TestCase):
    def test_i_fast_record_layout_and_missing_sentinel(self):
        # Two native levels, two rows, three columns; i varies fastest.
        values = np.arange(12, dtype='<f4')
        values[8] = -9999
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder)/'494.F'
            file.write_bytes(struct.pack('<i',48)+values.tobytes()+struct.pack('<i',48))
            result = read_f_record(file,(2,2,3))
        self.assertEqual(result[1,0,1],7)
        self.assertTrue(np.isnan(result[1,0,2]))
        self.assertEqual(result[1,1,2],11)

    def test_rejects_damaged_trailer_and_wrong_shape(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder)/'494.F'
            file.write_bytes(struct.pack('<i',8)+np.zeros(2,dtype='<f4').tobytes()+struct.pack('<i',4))
            with self.assertRaises(ValueError):
                read_f_record(file,(1,1,2))
            with self.assertRaises(ValueError):
                read_f_record(file,(1,2,2))

    def test_unpaired_missing_values_do_not_hide_bias(self):
        reference = np.array([[1,2,np.nan],[4,np.nan,100]])
        port = np.array([[2,np.nan,3],[5,np.nan,200]])
        mask = np.array([[True,True,True],[True,True,False]])
        result = metrics(reference,port,mask)
        self.assertEqual(result['pairs'],2)
        self.assertEqual(result['fortranOnly'],1)
        self.assertEqual(result['pythonOnly'],1)
        self.assertEqual(result['bothMissing'],1)
        self.assertEqual(result['bias'],1)
        self.assertEqual(result['rmse'],1)
        self.assertEqual(result['withinTolerance'],0)


if __name__ == '__main__':
    unittest.main()
