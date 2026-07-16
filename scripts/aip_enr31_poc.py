"""Download one KOCA ENR 3.1 publication and write reviewable segment JSON.

POC only: it preserves source fields and refuses to invent upper/lower limits.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
NAVDATA = ROOT / "frontend" / "public" / "data" / "navdata"


def parse_height(text: str) -> dict | None:
    text = " ".join(text.upper().split())
    fl = re.fullmatch(r"FL\s*(\d+)", text)
    if fl:
        return {"value": int(fl.group(1)) * 100, "unit": "FT", "reference": "FL", "raw": text}
    ft = re.fullmatch(r"([\d ]+)\s*FT(?:\s+(AMSL|AGL))?", text)
    if ft:
        return {"value": int(ft.group(1).replace(" ", "")), "unit": "FT", "reference": ft.group(2), "raw": text}
    return None


def parse_limit_pairs(text: str) -> list[tuple[dict | None, dict | None]]:
    raw = " ".join(text.upper().split())
    values = [parse_height(value) or {"value": None, "unit": None, "reference": value, "raw": value} for value in re.findall(r"\([^)]*\)|UNL|FL\s*\d+|[\d ]+\s*FT(?:\s+(?:AMSL|AGL))?", raw)]
    return [tuple((values + [None])[index:index + 2]) for index in range(0, len(values), 2)] or [(None, None)]


def parse_limits(text: str) -> tuple[dict | None, dict | None]:
    return parse_limit_pairs(text)[0]


def point_ident(label: str) -> str | None:
    label = " ".join(label.upper().split())
    if label.startswith("UNKNOWN REFERENCE"):
        return None
    paren = re.search(r"\(([A-Z0-9]{3,5})\)", label)
    if paren:
        return paren.group(1)
    first = re.match(r"([A-Z0-9]{3,5})(?:\(|\s|$)", label)
    if first:
        return first.group(1)
    return None


def dms_coordinate(text: str) -> dict | None:
    match = re.search(r"(\d{6})([NS])\s*(\d{7})([EW])", text.upper())
    if not match:
        return None
    lat, ns, lon, ew = match.groups()
    lat_value = int(lat[:2]) + int(lat[2:4]) / 60 + int(lat[4:]) / 3600
    lon_value = int(lon[:3]) + int(lon[3:5]) / 60 + int(lon[5:]) / 3600
    return {"lat": -lat_value if ns == "S" else lat_value, "lon": -lon_value if ew == "W" else lon_value}


def route_id(table: list[dict]) -> str | None:
    for row in table:
        if "AmdtDeleted" in row["class"] or "Table-row-type-1" not in row["class"]:
            continue
        if row["cells"]:
            match = re.match(r"([A-Z]\d{2,3})\b", row["cells"][0]["text"])
            if match:
                return match.group(1)
    return None


def parse_table(table: list[dict], publication: dict) -> tuple[list[dict], list[dict]]:
    route = route_id(table)
    if not route:
        return [], []
    points, warnings = [], []
    for row in table:
        if "AmdtDeleted" in row["class"]:
            continue
        cells = [cell["text"] for cell in row["cells"]]
        if "Table-row-type-2" in row["class"] and len(cells) >= 2:
            if cells[1] == "Significant Point Name":
                continue
            ident = point_ident(cells[1])
            if not ident:
                warnings.append({"routeId": route, "reason": "point_ident_unresolved", "raw": cells[1]})
            points.append({"ident": ident, "coordinates": dms_coordinate(cells[2]) if len(cells) > 2 else None, "raw": cells[1], "constraint": None})
        elif "Table-row-type-3" in row["class"] and points and len(cells) >= 9:
            # KOCA ENR 3.1's current table order: MAG↓, MAG↑, distance, COP,
            # upper/lower, minimum altitude, lateral limit, FL↓, FL↑, remark.
            current = points[-1]
            upper, lower = parse_limits(cells[4])
            change_over_point = cells[3] or None
            if not change_over_point and upper and re.fullmatch(r"\([^)]*\)", upper["raw"]) and lower:
                change_over_point = upper["raw"]
                upper = {"value": None, "unit": None, "reference": "UNL", "raw": "UNL"}
            current["constraint"] = {
                "trackMagDeg": [int(value) for value in re.findall(r"\d{1,3}", cells[1])],
                "distanceNm": float(cells[2]) if re.fullmatch(r"\d+(?:\.\d+)?", cells[2]) else None,
                "changeOverPoint": change_over_point,
                "upperLimit": upper,
                "lowerLimit": lower,
                "minimumFlightAltitude": parse_height(cells[5]),
                "lateralLimitNm": float(cells[6]) if re.fullmatch(r"\d+(?:\.\d+)?", cells[6]) else None,
                "cruisingLevelSeries": {"forward": cells[7] or None, "reverse": cells[8] or None},
                "rawCells": cells,
            }
    segments = []
    for sequence, (start, end) in enumerate(zip(points, points[1:]), start=1):
        if not start["ident"] or not end["ident"]:
            continue
        constraint = start["constraint"] or {}
        segments.append({
            "id": f"{route}-{sequence:03d}",
            "routeId": route,
            "fromFix": start["ident"],
            "toFix": end["ident"],
            "fromCoordinates": start["coordinates"],
            "toCoordinates": end["coordinates"],
            "sequence": sequence,
            "distanceNm": constraint.get("distanceNm"),
            "changeOverPoint": constraint.get("changeOverPoint"),
            "minimumFlightAltitude": constraint.get("minimumFlightAltitude"),
            "upperLimit": constraint.get("upperLimit"),
            "lowerLimit": constraint.get("lowerLimit"),
            "trackMagDeg": constraint.get("trackMagDeg", []),
            "lateralLimitNm": constraint.get("lateralLimitNm"),
            "cruisingLevelSeries": constraint.get("cruisingLevelSeries", {"forward": None, "reverse": None}),
            "source": publication,
            "raw": {"from": start["raw"], "to": end["raw"], "constraintCells": constraint.get("rawCells", [])},
        })
    return segments, warnings


def parse_enr31(html: str, publication: dict) -> tuple[list[dict], list[dict]]:
    root = ET.fromstring(html)
    ns = {"x": "http://www.w3.org/1999/xhtml"}
    segments, warnings = [], []
    for element in root.findall(".//x:table", ns):
        table = []
        for row in element.findall(".//x:tr", ns):
            cells = row.findall("./x:td", ns)
            table.append({"class": row.get("class", ""), "cells": [{"text": " ".join("".join(cell.itertext()).split())} for cell in cells]})
        parsed, issues = parse_table(table, publication)
        segments.extend(parsed)
        warnings.extend(issues)
    return segments, warnings


def graph_validation(segments: list[dict]) -> dict:
    graph_segments = json.loads((NAVDATA / "enroute.json").read_text(encoding="utf-8"))["segments"]
    known = {(item["routeId"], item["from"], item["to"]) for item in graph_segments}
    routes = {item["routeId"] for item in graph_segments}
    status = {"matched": 0, "route_changed": 0, "route_not_in_graph": 0}
    for item in segments:
        key = (item["routeId"], item["fromFix"], item["toFix"])
        item["graphValidation"] = "matched" if key in known else "route_changed" if item["routeId"] in routes else "route_not_in_graph"
        status[item["graphValidation"]] += 1
    return {"parsed": len(segments), **status}


def fetch(url: str) -> bytes:
    with urlopen(url, timeout=30) as response:
        return response.read()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--publication-id", required=True)
    parser.add_argument("--effective-at", required=True)
    parser.add_argument("--output", default=str(ROOT / "backend" / "data" / "aip"))
    args = parser.parse_args()

    output = Path(args.output)
    raw_dir = output / "raw" / args.publication_id
    normalized_dir = output / "normalized" / args.publication_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    normalized_dir.mkdir(parents=True, exist_ok=True)
    raw_path = raw_dir / "KR-ENR-3.1-en-GB.html"
    body = fetch(args.url)
    raw_path.write_bytes(body)
    sha256 = hashlib.sha256(body).hexdigest()
    publication = {"section": "ENR 3.1", "publicationId": args.publication_id, "effectiveAt": args.effective_at, "sourceUrl": args.url, "sha256": sha256}
    segments, warnings = parse_enr31(body.decode("utf-8"), publication)
    manifest = {**publication, "downloadedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "rawFile": raw_path.name}
    report = {"publication": publication, "validation": graph_validation(segments), "warnings": warnings}
    (raw_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (normalized_dir / "enr-3.1-segments.json").write_text(json.dumps(segments, indent=2) + "\n", encoding="utf-8")
    (normalized_dir / "validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"raw": str(raw_path), "normalized": str(normalized_dir), **report["validation"], "warnings": len(warnings)}, indent=2))


if __name__ == "__main__":
    main()
