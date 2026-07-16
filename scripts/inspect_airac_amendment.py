"""Record whether an AIRAC amendment replaces an en-route airway section."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zlib
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
HISTORY_URL = "https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html"
TARGET_SECTIONS = ("ENR 3.1", "ENR 3.3", "ENR 4.1", "ENR 4.4")


def amendment_for(publication_id: str, history: str) -> str:
    link = re.search(rf'href=["\']{re.escape(publication_id)}/html/index-en-GB.html["\']', history)
    if not link:
        raise ValueError(f"publication not found in KOCA history: {publication_id}")
    row_end = history.find("</tr>", link.end())
    amendment = re.search(r"AIRAC AIP AMDT\s+(\d+)/(\d+)", history[link.start():row_end])
    if not amendment:
        raise ValueError(f"AIRAC amendment number not found: {publication_id}")
    return f"AIRAC AIP AMDT {amendment.group(1)}/{amendment.group(2)}"


def pdf_titles(pdf: bytes) -> set[str]:
    streams = [pdf]
    for match in re.finditer(rb"stream\r?\n", pdf):
        end = pdf.find(b"endstream", match.end())
        if end < 0 or b"/FlateDecode" not in pdf[max(0, match.start() - 300):match.start()]:
            continue
        try:
            streams.append(zlib.decompress(pdf[match.end():end].strip(b"\r\n")))
        except zlib.error:
            pass
    titles = set()
    for stream in streams:
        for value in re.findall(rb"/Title\(((?:\\.|[^\\)])*)\)", stream):
            title = value.decode("latin1", "replace").replace(r"\(", "(").replace(r"\)", ")")
            if re.fullmatch(r"ENR\s+\d+(?:\.\d+)?(?:-\d+)?", title):
                titles.add(title)
    return titles


def affected_sections(titles: set[str]) -> list[str]:
    return [section for section in TARGET_SECTIONS if any(title == section or title.startswith(f"{section}-") for title in titles)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("publication_id")
    args = parser.parse_args()

    history = urlopen(HISTORY_URL, timeout=30).read().decode("utf-8")
    amendment = amendment_for(args.publication_id, history)
    number, year = re.search(r"(\d+)/(\d+)$", amendment).groups()
    pdf_url = f"https://aim.koca.go.kr/eaipPub/Package/{args.publication_id}/pdf/{quote(f'AIRAC AIP AMDT {number}_{year}.pdf')}"
    pdf = urlopen(pdf_url, timeout=60).read()
    if not pdf.startswith(b"%PDF-"):
        raise ValueError("KOCA amendment is not a PDF")

    raw_dir = ROOT / "backend" / "data" / "aip" / "raw" / args.publication_id
    raw_dir.mkdir(parents=True, exist_ok=True)
    pdf_file = raw_dir / f"AIRAC-AIP-AMDT-{number}_{year}.pdf"
    pdf_file.write_bytes(pdf)
    titles = sorted(pdf_titles(pdf))
    affected = affected_sections(set(titles))
    report = {
        "publicationId": args.publication_id,
        "amendment": amendment,
        "historyUrl": HISTORY_URL,
        "pdfUrl": pdf_url,
        "pdfFile": pdf_file.relative_to(ROOT).as_posix(),
        "sha256": hashlib.sha256(pdf).hexdigest(),
        "checkedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "pageControlTitles": titles,
        "targetSections": list(TARGET_SECTIONS),
        "affectedSections": affected,
        "decision": "review-required" if affected else "no-airway-review-required",
    }
    target = raw_dir / "amendment-page-control.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"file": str(target), "publicationId": args.publication_id, "amendment": amendment, "affectedSections": affected, "decision": report["decision"]}, indent=2))


if __name__ == "__main__":
    main()
