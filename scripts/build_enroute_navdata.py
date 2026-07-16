"""Build the one-file domestic en-route NAVDATA view from active reviewed AIP data."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "backend" / "data" / "aip" / "current"
NAVDATA = ROOT / "frontend" / "public" / "data" / "navdata"
AIRWAYS = ROOT / "frontend" / "public" / "data" / "airways.geojson"
OUTPUT = NAVDATA / "enroute.json"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def route_type(segment: dict) -> str:
    return "RNAV" if segment["source"]["section"] == "ENR 3.3" else "ATS"


def same_coordinate(left: dict, right: dict) -> bool:
    return abs(left["lat"] - right["lat"]) <= 1e-6 and abs(left["lon"] - right["lon"]) <= 1e-6


def route_sequence(segments: list[dict]) -> list[str]:
    ordered = sorted(segments, key=lambda segment: segment.get("sequence", 0))
    sequence = [ordered[0]["fromFix"]]
    for segment in ordered:
        if sequence[-1] != segment["fromFix"]:
            raise ValueError(f"non-contiguous route {segment['routeId']}")
        sequence.append(segment["toFix"])
    return sequence


def matching_direction(record: dict | None, sequence: list[str]) -> dict:
    if not record:
        return {"allowedDirection": "conditional", "directionStatus": "unavailable"}
    if record.get("sequenceStart") != sequence[0] or record.get("sequenceEnd") != sequence[-1] or record.get("sequenceLength") != len(sequence):
        return {"allowedDirection": "conditional", "directionStatus": "unavailable"}
    return {**record, "directionStatus": "carried"}


def build_enroute(snapshot: dict, navaids: dict, legacy_direction: dict) -> dict:
    segments = snapshot["segments"]
    if not segments or any(segment.get("review", {}).get("status") != "reviewed" for segment in segments):
        raise ValueError("active snapshot must contain reviewed segments only")

    facilities = {facility["ident"]: facility for facility in navaids.get("facilities", [])}
    points: dict[str, dict] = {}

    def add_point(ident: str, coordinates: dict) -> None:
        existing = points.get(ident)
        if existing and not same_coordinate(existing["coordinates"], coordinates):
            raise ValueError(f"conflicting coordinates for {ident}")
        facility = facilities.get(ident)
        points[ident] = {
            "id": ident,
            "kind": "navaid" if facility else "waypoint",
            "coordinates": coordinates,
            **({"name": facility["name"], "type": "NAVAID"} if facility else {}),
        }

    grouped: dict[str, list[dict]] = defaultdict(list)
    output_segments = []
    for segment in segments:
        add_point(segment["fromFix"], segment["fromCoordinates"])
        add_point(segment["toFix"], segment["toCoordinates"])
        grouped[segment["routeId"]].append(segment)
        output_segments.append({
            **segment,
            "from": segment["fromFix"],
            "to": segment["toFix"],
            "routeType": route_type(segment),
            "cycle": snapshot["publicationId"],
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [segment["fromCoordinates"]["lon"], segment["fromCoordinates"]["lat"]],
                    [segment["toCoordinates"]["lon"], segment["toCoordinates"]["lat"]],
                ],
            },
        })

    routes = {}
    for route_id, route_segments in sorted(grouped.items()):
        sequence = route_sequence(route_segments)
        direction = matching_direction(legacy_direction.get("routes", {}).get(route_id), sequence)
        routes[route_id] = {
            "id": route_id,
            "routeId": route_id,
            "type": route_type(route_segments[0]),
            "sequence": sequence,
            "segmentCount": len(route_segments),
            **direction,
        }

    return {
        "schemaVersion": 1,
        "publicationId": snapshot["publicationId"],
        "effectiveAt": snapshot["effectiveAt"],
        "points": dict(sorted(points.items())),
        "routes": routes,
        "segments": output_segments,
    }


def build_airways_geojson(enroute: dict) -> dict:
    features = []
    for segment in enroute["segments"]:
        coordinates = segment["geometry"]["coordinates"]
        lons, lats = zip(*coordinates)
        features.append({
            "type": "Feature",
            "id": segment["id"],
            "geometry": {"type": "MultiLineString", "coordinates": [coordinates]},
            "properties": {"ident_txt": segment["routeId"], "length_val": f"{segment['distanceNm']}NM"},
            "bbox": [min(lons), min(lats), max(lons), max(lats)],
        })
    return {"type": "FeatureCollection", "features": features}


def main() -> None:
    manifest = read_json(CURRENT / "manifest.json")
    if manifest.get("status") != "active":
        raise ValueError("no active AIP snapshot")
    snapshot = read_json(CURRENT / manifest["snapshot"])
    navaids = read_json(CURRENT / manifest["navaids"])
    if OUTPUT.exists():
        legacy_direction = {"routes": read_json(OUTPUT).get("routes", {})}
    else:
        raise ValueError("enroute.json bootstrap is required for direction metadata")
    enroute = build_enroute(snapshot, navaids, legacy_direction)
    for path, payload in ((OUTPUT, enroute), (AIRWAYS, build_airways_geojson(enroute))):
        pending = path.with_suffix(f"{path.suffix}.next")
        pending.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
        pending.replace(path)
    print(json.dumps({"publicationId": enroute["publicationId"], "points": len(enroute["points"]), "routes": len(enroute["routes"]), "segments": len(enroute["segments"])}, indent=2))


if __name__ == "__main__":
    main()
