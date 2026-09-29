# SIGWX HIGH fixed sample

Source: WAFC Washington / AWC WIFS public IWXXM 2025-2 examples.
Original run: 2026-08-02 12:00 UTC; T+6 through T+48 every 3 hours.
These are historical demonstration data, not current forecasts.

The UI repeats this run on the current timeline with a 48-hour period and retains
original source timestamps. `index.json` records source URLs and SHA-256 hashes.

Regenerate offline from downloaded XMLs:
`python3 scripts/wafs-sigwx-samples.py`
Only `--download` accesses the upstream sample site.
