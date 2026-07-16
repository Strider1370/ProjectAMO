"""Build a local ENR 4.1 en-route radio-navigation-aid cross-check file."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen

from aip_enr31_poc import dms_coordinate, point_ident


ROOT = Path(__file__).resolve().parents[1]
PUBLICATION_ID = os.getenv("AIP_PUBLICATION_ID", "2026-06-25")
URL = f"https://aim.koca.go.kr/eaipPub/Package/{PUBLICATION_ID}/html/eAIP/KR-ENR-4.1-en-GB.html"
OUTPUT = ROOT / "backend" / "data" / "aip"


class TableRows(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows, self.row, self.cell, self.in_cell = [], None, None, False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell, self.in_cell = [], True

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self.in_cell:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell, self.in_cell = None, False
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def main() -> None:
    body = urlopen(URL, timeout=30).read()
    parser = TableRows()
    parser.feed(body.decode("utf-8"))
    facilities = []
    for cells in parser.rows:
        if len(cells) < 7:
            continue
        ident, coordinate = point_ident(cells[1]), dms_coordinate(cells[4])
        if not ident or not coordinate:
            continue
        facilities.append({"ident": ident, "name": cells[0], "frequency": cells[2], "hours": cells[3], "coordinates": coordinate, "elevationFt": int(cells[5]) if cells[5].isdigit() else None, "rawRemarks": cells[6]})
    if not facilities:
        raise ValueError("no ENR 4.1 facilities parsed")
    raw_dir = OUTPUT / "raw" / PUBLICATION_ID
    normalized_dir = OUTPUT / "normalized" / PUBLICATION_ID
    raw_dir.mkdir(parents=True, exist_ok=True)
    normalized_dir.mkdir(parents=True, exist_ok=True)
    raw_name = "KR-ENR-4.1-en-GB.html"
    (raw_dir / raw_name).write_bytes(body)
    snapshot = {"status": "cross-check-not-current", "section": "ENR 4.1", "publicationId": PUBLICATION_ID, "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "source": {"url": URL, "rawFile": raw_name, "sha256": hashlib.sha256(body).hexdigest(), "capture": "artifacts/aip-pilot/2026-06-25/enr-4.1-rendered.png"}, "facilities": facilities}
    target = normalized_dir / "enroute-navaids.json"
    target.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": str(target), "status": snapshot["status"], "facilities": len(facilities)}, indent=2))


if __name__ == "__main__":
    main()
