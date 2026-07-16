"""Build one local reviewed ENR 3.1/3.3 snapshot; never publishes `current`."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from aip_enr31_poc import parse_enr31
from aip_enr33_poc import parse_enr33


ROOT = Path(__file__).resolve().parents[1]
PUBLICATION_ID = os.getenv("AIP_PUBLICATION_ID", "2026-06-25")
EFFECTIVE_AT = f"{PUBLICATION_ID[:10]}T16:00:00Z"
OUTPUT = ROOT / "backend" / "data" / "aip"
ARTIFACTS = ROOT / "artifacts" / "aip-pilot" / PUBLICATION_ID
SOURCES = {
    "ENR 3.1": f"https://aim.koca.go.kr/eaipPub/Package/{PUBLICATION_ID}/html/eAIP/KR-ENR-3.1-en-GB.html",
    "ENR 3.3": f"https://aim.koca.go.kr/eaipPub/Package/{PUBLICATION_ID}/html/eAIP/KR-ENR-3.3-en-GB.html",
}


def capture_for(section: str, route_id: str) -> str:
    prefix = f"{section.lower().replace(' ', '-')}-{route_id.lower()}"
    captures = sorted(ARTIFACTS.glob(f"{prefix}*-rendered.png"))
    if not captures:
        raise ValueError(f"missing rendered capture for {section} {route_id}")
    return captures[0].relative_to(ROOT).as_posix()


def enrich(segments: list[dict], section: str) -> list[dict]:
    source_url = SOURCES[section]
    for segment in segments:
        segment["source"] = {
            "section": section,
            "publicationId": PUBLICATION_ID,
            "effectiveAt": EFFECTIVE_AT,
            "sourceUrl": source_url,
            "capture": capture_for(section, segment["routeId"]),
        }
        segment["review"] = {
            "status": "reviewed",
            "transcribedBy": "independent route transcription",
            "reviewedBy": "main-agent",
            "reviewedAt": "2026-07-16T16:00:00Z",
        }
    return segments


def main() -> None:
    raw_dir = OUTPUT / "raw" / PUBLICATION_ID
    normalized_dir = OUTPUT / "normalized" / PUBLICATION_ID
    raw_dir.mkdir(parents=True, exist_ok=True)
    normalized_dir.mkdir(parents=True, exist_ok=True)

    parsed = {}
    source_manifest = []
    for section, url in SOURCES.items():
        body = urlopen(url, timeout=30).read()
        raw_name = f"KR-{section.replace(' ', '-')}-en-GB.html"
        (raw_dir / raw_name).write_bytes(body)
        publication = {"publicationId": PUBLICATION_ID}
        parser = parse_enr31 if section == "ENR 3.1" else parse_enr33
        segments, warnings = parser(body.decode("utf-8"), publication)
        if warnings:
            raise ValueError(f"{section} parser warnings: {warnings}")
        parsed[section] = enrich(segments, section)
        source_manifest.append({"section": section, "url": url, "rawFile": raw_name, "sha256": hashlib.sha256(body).hexdigest()})

    segments = parsed["ENR 3.1"] + parsed["ENR 3.3"]
    if len(parsed["ENR 3.1"]) != 114 or len(parsed["ENR 3.3"]) != 184:
        raise ValueError("unexpected ENR segment count")
    snapshot = {
        "status": "reviewed-not-current",
        "publicationId": PUBLICATION_ID,
        "effectiveAt": EFFECTIVE_AT,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sources": source_manifest,
        "segments": segments,
    }
    target = normalized_dir / "reviewed-airway-segments.json"
    target.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": str(target), "status": snapshot["status"], "segments": len(segments), "enr31": len(parsed["ENR 3.1"]), "enr33": len(parsed["ENR 3.3"])}, indent=2))


if __name__ == "__main__":
    main()
