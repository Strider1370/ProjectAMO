"""Run the local airway dry-run; promotion requires an explicit rights confirmation."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CURRENT = ROOT / "backend" / "data" / "aip" / "current"


def publication_id() -> str:
    output = subprocess.check_output([sys.executable, str(ROOT / "scripts" / "discover_aip_publication.py")], text=True)
    return json.loads(output)["publicationId"]


def paths(publication: str) -> tuple[Path, Path]:
    normalized = ROOT / "backend" / "data" / "aip" / "normalized" / publication
    validation = ROOT / "backend" / "data" / "aip" / "validation" / publication / "route-graph-diff.json"
    return normalized, validation


def can_activate(report: dict) -> bool:
    check = report["enr44CrossCheck"]
    return not (report["validationErrors"] or check["coordinateMismatches"] or check["navaidMissingFromEnr41"] or check["navaidCoordinateMismatches"])


def activate(publication: str) -> None:
    normalized, validation = paths(publication)
    report = json.loads(validation.read_text(encoding="utf-8"))
    if not can_activate(report):
        raise ValueError("validation report blocks activation")
    snapshot = json.loads((normalized / "reviewed-airway-segments.json").read_text(encoding="utf-8"))
    version_dir = CURRENT / snapshot["publicationId"]
    version_dir.mkdir(parents=True, exist_ok=True)
    for name in ("reviewed-airway-segments.json", "enroute-navaids.json"):
        shutil.copy2(normalized / name, version_dir / name)
    shutil.copy2(validation, version_dir / "route-graph-diff.json")
    manifest = {"status": "active", "publicationId": snapshot["publicationId"], "effectiveAt": snapshot["effectiveAt"], "snapshot": f"{snapshot['publicationId']}/reviewed-airway-segments.json", "navaids": f"{snapshot['publicationId']}/enroute-navaids.json", "validation": f"{snapshot['publicationId']}/route-graph-diff.json"}
    current_manifest = CURRENT / "manifest.json"
    previous_manifest = current_manifest.read_text(encoding="utf-8") if current_manifest.exists() else None
    pending = CURRENT / "manifest.next.json"
    pending.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    pending.replace(current_manifest)
    try:
        subprocess.check_call([sys.executable, str(ROOT / "scripts" / "build_enroute_navdata.py")])
    except Exception:
        if previous_manifest is not None:
            current_manifest.write_text(previous_manifest, encoding="utf-8")
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--confirm-aip-rights", action="store_true")
    parser.add_argument("--publication-id")
    args = parser.parse_args()
    if args.activate and not args.confirm_aip_rights:
        raise SystemExit("activation requires --confirm-aip-rights")
    if args.activate:
        if not args.publication_id:
            raise SystemExit("activation requires --publication-id")
        activate(args.publication_id)
        print("activated")
        return

    publication = args.publication_id or publication_id()
    output = subprocess.check_output([sys.executable, str(ROOT / "scripts" / "inspect_airac_amendment.py"), publication], text=True)
    amendment = json.loads(output)
    if amendment["affectedSections"]:
        output = subprocess.check_output([sys.executable, str(ROOT / "scripts" / "build_aip_change_candidates.py"), publication, *amendment["affectedSections"]], text=True)
        candidates = json.loads(output)
        print(json.dumps({"publicationId": publication, "decision": "review-required", "affectedSections": amendment["affectedSections"], "candidateFile": candidates["file"], "candidateChanges": candidates["candidateChanges"], "message": "current unchanged; capture and review only the listed ENR sections"}, indent=2))
        return
    print(json.dumps({"publicationId": publication, "decision": "no-airway-review-required", "message": "current unchanged; amendment page control lists no target ENR section"}, indent=2))


if __name__ == "__main__":
    main()
