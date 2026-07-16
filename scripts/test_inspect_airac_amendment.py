from inspect_airac_amendment import affected_sections, amendment_for, pdf_titles


def main() -> None:
    assert affected_sections({"ENR 5.1-1", "ENR 6-2"}) == []
    assert affected_sections({"ENR 3.1-5", "ENR 4.4-2"}) == ["ENR 3.1", "ENR 4.4"]
    assert pdf_titles(b"/Title(ENR 3.3-2) /Title(AD 2-1)") == {"ENR 3.3-2"}
    assert amendment_for('2026-07-08-AIRAC', '<tr><td><a href="2026-07-08-AIRAC/html/index-en-GB.html">08 JUL</a></td><td>28 MAY</td><td>AIRAC AIP AMDT 6/26</td></tr>') == "AIRAC AIP AMDT 6/26"
    print("inspect_airac_amendment ok")


if __name__ == "__main__":
    main()
