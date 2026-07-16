import unittest

from aip_enr31_poc import dms_coordinate, parse_height, parse_limit_pairs, parse_limits, parse_table, point_ident


class Enr31PocTest(unittest.TestCase):
    def test_parses_height_and_fix_ident(self):
        self.assertEqual(parse_height("1 500 ft AMSL")["value"], 1500)
        self.assertEqual(parse_height("FL 200")["reference"], "FL")
        self.assertEqual(parse_limits("(25/83) 8 000 ft AMSL")[0]["raw"], "(25/83)")
        self.assertEqual(parse_limits("(25/83) 8 000 ft AMSL")[1]["value"], 8000)
        self.assertEqual(parse_limit_pairs("UNL FL 430 / FL 220 / FL 150"), [
            ({"value": None, "unit": None, "reference": "UNL", "raw": "UNL"}, {"value": 43000, "unit": "FT", "reference": "FL", "raw": "FL 430"}),
            ({"value": 22000, "unit": "FT", "reference": "FL", "raw": "FL 220"}, {"value": 15000, "unit": "FT", "reference": "FL", "raw": "FL 150"}),
        ])
        self.assertEqual(point_ident("ANYANG VORTAC (SEL)"), "SEL")
        self.assertEqual(point_ident("BUSAN VORTAC (PSN)"), "PSN")
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

    def test_preserves_outgoing_limits_and_directional_fields(self):
        table = [
            {"class": "Table-row-type-1", "cells": [{"text": "B332"}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "KANSU(FIR BDRY)"}, {"text": "383800N 1322830E"}]},
            {"class": "Table-row-type-3", "cells": [{"text": ""}, {"text": "180° 360°"}, {"text": "40.2"}, {"text": ""}, {"text": "UNL FL 200"}, {"text": "1 500 ft AMSL"}, {"text": "50"}, {"text": "Odd"}, {"text": "Even"}, {"text": "(1)"}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "PALDU"}, {"text": "375813N 1323625E"}]},
        ]
        segment = parse_table(table, {"publicationId": "fixture"})[0][0]
        self.assertEqual(segment["fromFix"], "KANSU")
        self.assertEqual(segment["toFix"], "PALDU")
        self.assertEqual(segment["trackMagDeg"], [180, 360])
        self.assertEqual(segment["upperLimit"]["reference"], "UNL")
        self.assertEqual(segment["lowerLimit"], {"value": 20000, "unit": "FT", "reference": "FL", "raw": "FL 200"})
        self.assertEqual(segment["lateralLimitNm"], 50.0)
        self.assertEqual(segment["cruisingLevelSeries"], {"forward": "Odd", "reverse": "Even"})

    def test_recovers_a_shifted_change_over_point(self):
        table = [
            {"class": "Table-row-type-1", "cells": [{"text": "V543"}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "TEDAN"}, {"text": "350744N 1271852E"}]},
            {"class": "Table-row-type-3", "cells": [{"text": ""}, {"text": "098째 278째"}, {"text": "13.5"}, {"text": ""}, {"text": "(25/83) 8 000 ft AMSL"}, {"text": "8 000 ft AMSL"}, {"text": "10"}, {"text": "Odd"}, {"text": ""}, {"text": "(2)"}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "ANUBA"}, {"text": "350746N 1273523E"}]},
        ]
        segment = parse_table(table, {"publicationId": "fixture"})[0][0]
        self.assertEqual(segment["changeOverPoint"], "(25/83)")
        self.assertEqual(segment["upperLimit"], {"value": None, "unit": None, "reference": "UNL", "raw": "UNL"})
        self.assertEqual(segment["lowerLimit"]["value"], 8000)


if __name__ == "__main__":
    unittest.main()
