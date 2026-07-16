import unittest

from aip_enr33_poc import parse_enr33_table


class Enr33PocTest(unittest.TestCase):
    def test_l512_column_order(self):
        table = [
            {"class": "Table-row-type-1", "cells": [{"text": "L512 (RNAV2)"}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "TENAS"}, {"text": "373820N 1313427E"}]},
            {"class": "Table-row-type-3", "cells": [{"text": ""}, {"text": "099° 279°"}, {"text": "52.3"}, {"text": "UNL FL 270"}, {"text": "Odd"}, {"text": "Even"}, {"text": "(1)"}, {"text": "1 500 ft AMSL"}, {"text": ""}, {"text": ""}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "SABET"}, {"text": "373829N 1324019E"}]},
        ]
        segment = parse_enr33_table(table, {"publicationId": "fixture"})[0][0]
        self.assertEqual(segment["fromFix"], "TENAS")
        self.assertEqual(segment["toFix"], "SABET")
        self.assertEqual(segment["trackMagDeg"], [99, 279])
        self.assertEqual(segment["distanceNm"], 52.3)
        self.assertEqual(segment["upperLimit"]["reference"], "UNL")
        self.assertEqual(segment["lowerLimit"]["value"], 27000)
        self.assertEqual(segment["cruisingLevelSeries"], {"forward": "Odd", "reverse": "Even"})
        self.assertEqual(segment["meaMoca"]["value"], 1500)

    def test_amendment_deleted_rows_do_not_create_segments(self):
        table = [
            {"class": "Table-row-type-1", "cells": [{"text": "Y782 (RNAV2)"}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "START"}, {"text": "370000N 1270000E"}]},
            {"class": "Table-row-type-3", "cells": [{"text": ""}, {"text": "144° 324°"}, {"text": "10.0"}, {"text": "UNL 8 000 ft AMSL"}, {"text": "Odd"}, {"text": "Even"}, {"text": ""}, {"text": "3 000 ft AMSL"}, {"text": ""}, {"text": ""}]},
            {"class": "Table-row-type-2 AmdtDeleted", "cells": [{"text": ""}, {"text": "BITUX"}, {"text": "361645N 1280148E"}]},
            {"class": "Table-row-type-3 AmdtDeleted", "cells": [{"text": ""}, {"text": "144° 324°"}, {"text": "39.2"}, {"text": "UNL 10 000 ft AMSL"}, {"text": "Odd"}, {"text": "Even"}, {"text": ""}, {"text": "4 500 ft AMSL"}, {"text": ""}, {"text": ""}]},
            {"class": "Table-row-type-2 AmdtInserted", "cells": [{"text": ""}, {"text": "BITUX"}, {"text": "361645N 1280148E"}]},
            {"class": "Table-row-type-3 AmdtInserted", "cells": [{"text": ""}, {"text": "144° 325°"}, {"text": "39.2"}, {"text": "UNL 10 000 ft AMSL"}, {"text": "Odd"}, {"text": "Even"}, {"text": ""}, {"text": "4 500 ft AMSL"}, {"text": ""}, {"text": ""}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "END"}, {"text": "360000N 1290000E"}]},
        ]
        segments = parse_enr33_table(table, {"publicationId": "fixture"})[0]
        self.assertEqual([(segment["fromFix"], segment["toFix"]) for segment in segments], [("START", "BITUX"), ("BITUX", "END")])
        self.assertEqual(segments[1]["trackMagDeg"], [144, 325])

    def test_preserves_two_limit_pairs(self):
        table = [
            {"class": "Table-row-type-1", "cells": [{"text": "Y655 (RNAV2)"}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "TOLIS"}, {"text": "335030N 1242453E"}]},
            {"class": "Table-row-type-3", "cells": [{"text": ""}, {"text": "177° 357°"}, {"text": "99.0"}, {"text": "UNL FL 430 FL 220 FL 150"}, {"text": "Odd"}, {"text": "Even"}, {"text": "(4)"}, {"text": "1 500 ft AMSL"}, {"text": ""}, {"text": ""}]},
            {"class": "Table-row-type-2", "cells": [{"text": ""}, {"text": "ENSUM"}, {"text": "321302N 1244635E"}]},
        ]
        segment = parse_enr33_table(table, {"publicationId": "fixture"})[0][0]
        self.assertEqual([(pair["upperLimit"]["raw"], pair["lowerLimit"]["raw"]) for pair in segment["limitPairs"]], [("UNL", "FL 430"), ("FL 220", "FL 150")])


if __name__ == "__main__":
    unittest.main()
