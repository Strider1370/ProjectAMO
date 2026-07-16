"""Print the KOCA eAIP publication currently marked effective."""

from __future__ import annotations

import json
import re
from urllib.parse import urljoin
from urllib.request import urlopen


INDEX = "https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html"


def main() -> None:
    html = urlopen(INDEX, timeout=30).read().decode("utf-8")
    match = re.search(r"Currently Effective Issue.*?href=[\"']([^\"']+)[\"']", html, re.DOTALL)
    if not match:
        raise SystemExit("current KOCA publication link not found")
    href = match.group(1)
    publication_id = href.split("/")[0]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-AIRAC)?", publication_id):
        raise SystemExit(f"unexpected publication id: {publication_id}")
    print(json.dumps({"publicationId": publication_id, "indexUrl": INDEX, "publicationUrl": urljoin(INDEX, href)}, indent=2))


if __name__ == "__main__":
    main()
