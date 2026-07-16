import unittest

from aip_enr31_poc import dms_coordinate, parse_height, parse_table, point_ident


class Enr31PocTest(unittest.TestCase):
    def test_parses_height_and_fix_ident(self):
        self.assertEqual(parse_height("1 500 ft AMSL")["value"], 1500)
        self.assertEqual(parse_height("FL 200")["reference"], "FL")
        self.assertEqual(point_ident("ANYANG VORTAC (SEL)"), "SEL")
        self.assertIsNone(point_ident("unknown reference: SP-ESNEG"))
        self.assertEqual(dms_coordinate("371000N 1240000E"), {"lat": 37.166666666666664, "lon": 124.0})

    def test_pairs_constraint_with_next_point(self):
        table = [
            {"class": "Table-row-type-1", "cells": [{"text": "G597"}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "Significant Point Name"}]},
            {"class": "Table-row-type-2", "cells": [{"text": "▲"}, {"text": "AGAVO(FIR BDRY)"}, {"text": "371000N 1240000E"}]},
            {"class": "Table-row-type-3", "cells": [{"text": ""}, {"text": ""}, {"text": "19.9"}, {"text": ""}, {"text": ""}, {"text": "1 500 ft AMSL"}, {"text": "10"}, {"text": ""}, {"text": "Even"}, {"text": "(1)"}]},
            {"class": "Table-row-type-2", "cells": [{"text": "∆"}, {"text": "GONAV"}]},
        ]
        segments, warnings = parse_table(table, {"publicationId": "fixture"})
        self.assertEqual(warnings, [])
        self.assertEqual(segments[0]["id"], "G597-001")
        self.assertEqual(segments[0]["fromFix"], "AGAVO")
        self.assertEqual(segments[0]["toFix"], "GONAV")
        self.assertEqual(segments[0]["fromCoordinates"]["lon"], 124.0)
        self.assertEqual(segments[0]["distanceNm"], 19.9)
        self.assertEqual(segments[0]["minimumFlightAltitude"]["value"], 1500)
        self.assertEqual(segments[0]["cruisingLevelSeries"], {"forward": None, "reverse": "Even"})


if __name__ == "__main__":
    unittest.main()
