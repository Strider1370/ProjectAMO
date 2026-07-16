"""Parse reviewable ENR 3.3 RNAV segments without reusing ENR 3.1 column order."""

from aip_enr31_poc import dms_coordinate, parse_height, parse_limit_pairs, point_ident, route_id
import re
import xml.etree.ElementTree as ET


def level_series(text: str) -> str | None:
    match = re.search(r"\b(ODD|EVEN)\b", text.upper())
    return match.group(1).title() if match else None


def parse_enr33_table(table: list[dict], publication: dict) -> tuple[list[dict], list[dict]]:
    route = route_id(table)
    if not route:
        return [], []
    points, warnings = [], []
    for row in table:
        if "AmdtDeleted" in row["class"]:
            continue
        cells = [cell["text"] for cell in row["cells"]]
        if "Table-row-type-2" in row["class"] and len(cells) >= 2:
            ident = point_ident(cells[1])
            if cells[1] == "Significant Point Name":
                continue
            if not ident:
                warnings.append({"routeId": route, "reason": "point_ident_unresolved", "raw": cells[1]})
            points.append({"ident": ident, "coordinates": dms_coordinate(cells[2]) if len(cells) > 2 else None, "raw": cells[1], "constraint": None})
        elif "Table-row-type-3" in row["class"] and points and len(cells) >= 10:
            # ENR 3.3: track, distance, limits, FL↓, FL↑, remarks, MEA(MOCA), DME fields.
            limit_pairs = parse_limit_pairs(cells[3])
            upper, lower = limit_pairs[0]
            points[-1]["constraint"] = {
                "trackMagDeg": [int(value) for value in re.findall(r"\d{1,3}", cells[1])],
                "distanceNm": float(cells[2]) if re.fullmatch(r"\d+(?:\.\d+)?", cells[2]) else None,
                "upperLimit": upper,
                "lowerLimit": lower,
                "limitPairs": [{"upperLimit": pair_upper, "lowerLimit": pair_lower} for pair_upper, pair_lower in limit_pairs] if len(limit_pairs) > 1 else None,
                "cruisingLevelSeries": {"forward": level_series(cells[4]), "reverse": level_series(cells[5])},
                "meaMoca": parse_height(cells[7]),
                "rawCells": cells,
            }
    segments = []
    for sequence, (start, end) in enumerate(zip(points, points[1:]), start=1):
        if not start["ident"] or not end["ident"]:
            continue
        constraint = start["constraint"] or {}
        segments.append({
            "id": f"{route}-{sequence:03d}", "routeId": route,
            "fromFix": start["ident"], "toFix": end["ident"],
            "fromCoordinates": start["coordinates"], "toCoordinates": end["coordinates"],
            "distanceNm": constraint.get("distanceNm"), "upperLimit": constraint.get("upperLimit"),
            "lowerLimit": constraint.get("lowerLimit"), "trackMagDeg": constraint.get("trackMagDeg", []),
            **({"limitPairs": constraint["limitPairs"]} if constraint.get("limitPairs") else {}),
            "cruisingLevelSeries": constraint.get("cruisingLevelSeries", {"forward": None, "reverse": None}),
            "meaMoca": constraint.get("meaMoca"), "source": publication,
            "raw": {"from": start["raw"], "to": end["raw"], "constraintCells": constraint.get("rawCells", [])},
        })
    return segments, warnings


def parse_enr33(html: str, publication: dict) -> tuple[list[dict], list[dict]]:
    root = ET.fromstring(html)
    ns = {"x": "http://www.w3.org/1999/xhtml"}
    segments, warnings = [], []
    for element in root.findall(".//x:table", ns):
        table = []
        for row in element.findall(".//x:tr", ns):
            cells = row.findall("./x:td", ns)
            table.append({"class": row.get("class", ""), "cells": [{"text": " ".join("".join(cell.itertext()).split())} for cell in cells]})
        parsed, issues = parse_enr33_table(table, publication)
        segments.extend(parsed)
        warnings.extend(issues)
    return segments, warnings
