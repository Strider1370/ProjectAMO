from build_aip_change_candidates import changes


def segment(route: str, start: str, end: str, distance: float) -> dict:
    return {"routeId": route, "fromFix": start, "toFix": end, "distanceNm": distance, "source": {"publicationId": "old"}}


def main() -> None:
    result = changes([segment("A1", "ONE", "TWO", 10), segment("A1", "TWO", "THREE", 20)], [segment("A1", "ONE", "TWO", 11), segment("A1", "THREE", "FOUR", 30)])
    assert [item["changeType"] for item in result] == ["changed", "added", "removed"]
    print("build_aip_change_candidates ok")


if __name__ == "__main__":
    main()
