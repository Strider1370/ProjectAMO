# Destination time hierarchy audit

## Verdict

The first time-zone pass was not suitable for a distant terminal display. It added correct information but rendered destination-local time at roughly the same visual weight as incidental metadata. The revised pass promotes destination-local time to a scan-level value and leaves Korean time as its comparison label.

## Steps and evidence

1. Option 1 before — needs revision
   - Evidence: `artifacts/time-hierarchy-audit/01-board-before.png`
   - Destination-local and Korean time were compressed into an 11 px line below the airport name.
   - The time could not compete with the destination, flight, departure, gate, or temperature values at terminal viewing distance.

2. Option 3 before — needs revision
   - Evidence: `artifacts/time-hierarchy-audit/02-rail-before.png`
   - The local clock was visually attached to the city label but remained a low-contrast metadata line.
   - The timeline showed time more prominently than the destination’s current local clock, reversing the intended hierarchy.

3. Option 1 after — healthy
   - Evidence: `artifacts/time-hierarchy-audit/03-board-after.png`
   - Current destination-local time is now a 25 px tabular value aligned with the airport identity block.
   - Date and Korean comparison time remain available without competing with the local clock.

4. Option 3 after — healthy
   - Evidence: `artifacts/time-hierarchy-audit/04-rail-after.png`
   - Current destination-local time is now a 24 px tabular value directly under the destination.
   - Current Korean time and local arrival time remain visible on the flight timeline, so both frames of reference are available.

## Accessibility limits

- Screenshot inspection confirms hierarchy, contrast, and lack of clipping at 1672 × 941.
- It does not prove readability at every physical screen size or viewing distance; production acceptance should include an on-device distance check.
