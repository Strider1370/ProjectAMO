"""Validate the local reviewed airway snapshot and report its diff to the old route graph."""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.request import urlopen
import xml.etree.ElementTree as ET

from aip_enr31_poc import dms_coordinate, point_ident


ROOT = Path(__file__).resolve().parents[1]
PUBLICATION_ID = os.getenv("AIP_PUBLICATION_ID", "2026-06-25")
SNAPSHOT = ROOT / "backend" / "data" / "aip" / "normalized" / PUBLICATION_ID / "reviewed-airway-segments.json"
OLD_GRAPH = ROOT / "frontend" / "public" / "data" / "navdata" / "route-segments.json"
REPORT = ROOT / "backend" / "data" / "aip" / "validation" / PUBLICATION_ID / "route-graph-diff.json"
ENR44_URL = f"https://aim.koca.go.kr/eaipPub/Package/{PUBLICATION_ID}/html/eAIP/KR-ENR-4.4-en-GB.html"
NAVAIDS = ROOT / "backend" / "data" / "aip" / "normalized" / PUBLICATION_ID / "enroute-navaids.json"


def key(item: dict, old: bool = False) -> tuple[str, str, str]:
    return item["routeId"], item["from" if old else "fromFix"], item["to" if old else "toFix"]


def enr44_points() -> dict[str, set[tuple[float, float]]]:
    root = ET.fromstring(urlopen(ENR44_URL, timeout=30).read().decode("utf-8"))
    namespace = {"x": "http://www.w3.org/1999/xhtml"}
    points: dict[str, set[tuple[float, float]]] = {}
    for row in root.findall(".//x:tr", namespace):
        cells = row.findall("./x:td", namespace)
        if len(cells) < 2:
            continue
        ident = point_ident(" ".join("".join(cells[0].itertext()).split()))
        coordinate = dms_coordinate(" ".join("".join(cells[1].itertext()).split()))
        if ident and coordinate:
            points.setdefault(ident, set()).add((coordinate["lat"], coordinate["lon"]))
    return points


def main() -> None:
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    old_segments = json.loads(OLD_GRAPH.read_text(encoding="utf-8"))
    errors, seen = [], set()
    for segment in snapshot["segments"]:
        segment_key = key(segment)
        if segment_key in seen:
            errors.append({"segment": segment["id"], "reason": "duplicate_route_segment"})
        seen.add(segment_key)
        source, review = segment.get("source", {}), segment.get("review", {})
        if review.get("status") != "reviewed" or not source.get("effectiveAt") or not source.get("sourceUrl"):
            errors.append({"segment": segment["id"], "reason": "missing_review_or_source"})
        if not source.get("capture") or not (ROOT / source["capture"]).is_file():
            errors.append({"segment": segment["id"], "reason": "missing_capture"})
        if not isinstance(segment.get("distanceNm"), (int, float)) or segment["distanceNm"] <= 0:
            errors.append({"segment": segment["id"], "reason": "invalid_distance"})
        for point in (segment.get("fromCoordinates"), segment.get("toCoordinates")):
            if not point or not -90 <= point["lat"] <= 90 or not -180 <= point["lon"] <= 180:
                errors.append({"segment": segment["id"], "reason": "invalid_coordinate"})
                break
        if any(not isinstance(track, int) or not 1 <= track <= 360 for track in segment.get("trackMagDeg", [])):
            errors.append({"segment": segment["id"], "reason": "invalid_track"})
        limits = [segment.get("upperLimit"), segment.get("lowerLimit")]
        for pair in segment.get("limitPairs", []):
            limits.extend((pair["upperLimit"], pair["lowerLimit"]))
        for limit in filter(None, limits):
            if limit["reference"] == "UNL" and limit["value"] is not None:
                errors.append({"segment": segment["id"], "reason": "invalid_unlimited_limit"})
            if limit["reference"] in {"FL", "AMSL", "AGL"} and (limit["unit"] != "FT" or not isinstance(limit["value"], int)):
                errors.append({"segment": segment["id"], "reason": "invalid_limit_unit"})

    old_by_key = {key(item, old=True): item for item in old_segments}
    new_by_key = {key(item): item for item in snapshot["segments"]}
    shared = old_by_key.keys() & new_by_key.keys()
    changed = [
        {"segment": "/".join(item_key), "oldDistanceNm": old_by_key[item_key]["distanceNm"], "newDistanceNm": new_by_key[item_key]["distanceNm"]}
        for item_key in sorted(shared)
        if round(old_by_key[item_key]["distanceNm"], 1) != round(new_by_key[item_key]["distanceNm"], 1)
    ]
    points = enr44_points()
    missing_fixes, coordinate_mismatches = set(), set()
    for segment in snapshot["segments"]:
        for ident_key, coordinate_key in (("fromFix", "fromCoordinates"), ("toFix", "toCoordinates")):
            ident, coordinate = segment[ident_key], segment[coordinate_key]
            if ident not in points:
                missing_fixes.add(ident)
            elif (coordinate["lat"], coordinate["lon"]) not in points[ident]:
                coordinate_mismatches.add(ident)
    navaids = {facility["ident"]: (facility["coordinates"]["lat"], facility["coordinates"]["lon"]) for facility in json.loads(NAVAIDS.read_text(encoding="utf-8"))["facilities"]}
    navaid_mismatches = sorted(ident for ident in missing_fixes if any((segment[fix_key] == ident and (segment[coordinate_key]["lat"], segment[coordinate_key]["lon"]) != navaids.get(ident)) for segment in snapshot["segments"] for fix_key, coordinate_key in (("fromFix", "fromCoordinates"), ("toFix", "toCoordinates"))))
    navaid_missing = sorted(missing_fixes - navaids.keys())
    report = {
        "snapshot": str(SNAPSHOT.relative_to(ROOT)).replace("\\", "/"),
        "status": snapshot["status"],
        "validationErrors": errors,
        "diff": {
            "matched": len(shared),
            "added": ["/".join(item_key) for item_key in sorted(new_by_key.keys() - old_by_key.keys())],
            "removed": ["/".join(item_key) for item_key in sorted(old_by_key.keys() - new_by_key.keys())],
            "distanceChanged": changed,
        },
        "enr44CrossCheck": {
            "sourceUrl": ENR44_URL,
            "capture": "artifacts/aip-pilot/2026-06-25/enr-4.4-rendered.png",
            "navaidFixesAbsentFromEnr44": sorted(missing_fixes),
            "navaidMissingFromEnr41": navaid_missing,
            "navaidCoordinateMismatches": navaid_mismatches,
            "coordinateMismatches": sorted(coordinate_mismatches),
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"errors": len(errors), "matched": len(shared), "added": len(report["diff"]["added"]), "removed": len(report["diff"]["removed"]), "distanceChanged": len(changed), "enr44Missing": len(missing_fixes), "enr44CoordinateMismatches": len(coordinate_mismatches), "enr41Missing": len(navaid_missing), "enr41CoordinateMismatches": len(navaid_mismatches), "report": str(REPORT)}, indent=2))
    if errors or coordinate_mismatches or navaid_missing or navaid_mismatches:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
