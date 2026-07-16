"""Build unreviewed airway change candidates for only amended ENR route sections."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from aip_enr31_poc import parse_enr31
from aip_enr33_poc import parse_enr33


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "backend" / "data" / "aip"
ROUTE_SECTIONS = {"ENR 3.1": parse_enr31, "ENR 3.3": parse_enr33}


def segment_key(segment: dict) -> tuple[str, str, str]:
    return segment["routeId"], segment["fromFix"], segment["toFix"]


def comparable(segment: dict) -> dict:
    return {key: value for key, value in segment.items() if key not in {"source", "review"}}


def changes(previous: list[dict], candidate: list[dict]) -> list[dict]:
    old, new = ({segment_key(item): item for item in rows} for rows in (previous, candidate))
    result = []
    for key in sorted(old.keys() | new.keys()):
        if key not in old:
            result.append({"changeType": "added", "segment": new[key]})
        elif key not in new:
            result.append({"changeType": "removed", "segment": old[key]})
        elif comparable(old[key]) != comparable(new[key]):
            result.append({"changeType": "changed", "before": old[key], "segment": new[key]})
    return result


def latest_reviewed_snapshot() -> Path:
    snapshots = sorted((OUTPUT / "normalized").glob("*/reviewed-airway-segments.json"), reverse=True)
    if not snapshots:
        raise ValueError("no local reviewed airway snapshot available for comparison")
    return snapshots[0]


def parse_section(section: str, publication_id: str) -> list[dict]:
    url = f"https://aim.koca.go.kr/eaipPub/Package/{publication_id}/html/eAIP/KR-{section.replace(' ', '-')}-en-GB.html"
    body = urlopen(url, timeout=30).read()
    raw_dir = OUTPUT / "raw" / publication_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / f"KR-{section.replace(' ', '-')}-en-GB.html").write_bytes(body)
    segments, warnings = ROUTE_SECTIONS[section](body.decode("utf-8"), {"section": section, "publicationId": publication_id, "sourceUrl": url})
    if warnings:
        raise ValueError(f"{section} parser warnings: {warnings}")
    for segment in segments:
        segment["source"] = {"section": section, "publicationId": publication_id, "sourceUrl": url}
        segment["review"] = {"status": "reviewRequired", "reason": "AIRAC amendment page-control change"}
    return segments


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("publication_id")
    parser.add_argument("sections", nargs="+")
    args = parser.parse_args()

    selected = [section for section in args.sections if section in ROUTE_SECTIONS]
    baseline_file = latest_reviewed_snapshot()
    baseline = [segment for segment in json.loads(baseline_file.read_text(encoding="utf-8"))["segments"] if segment.get("source", {}).get("section") in selected]
    candidates = [segment for section in selected for segment in parse_section(section, args.publication_id)]
    report = {
        "status": "review-required",
        "publicationId": args.publication_id,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "affectedSections": args.sections,
        "baseline": baseline_file.relative_to(ROOT).as_posix(),
        "changes": changes(baseline, candidates) if selected else [],
        "note": "Candidates are not reviewed and cannot be activated. Capture the rendered amended tables before review.",
    }
    target_dir = OUTPUT / "normalized" / args.publication_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "airway-change-candidates.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": str(target), "publicationId": args.publication_id, "affectedSections": args.sections, "candidateChanges": len(report["changes"]), "status": report["status"]}, indent=2))


if __name__ == "__main__":
    main()
