# AIP Airway Operations Plan

## Goal

Operate the reviewed ENR airway pipeline without including airport procedures: discover a KOCA publication, first use its AIRAC amendment's change summary and page-control list to identify affected ENR sections, then create a versioned dry-run snapshot and diff only for affected airway data. Replace `current` only after validation succeeds.

## Tasks

1. Define the local airway snapshot manifest and activation guard. Keep `current` unchanged on any missing source, parse warning, validation error, or unreviewed change.
2. For each newly effective AIRAC issue, read the official AIRAC amendment's change summary and page-control list first. If ENR 3.1, ENR 3.3, ENR 4.1, and ENR 4.4 are absent, record that no airway re-review is needed for that issue.
3. When an ENR section is listed, collect and compare only that section's source. Treat the amendment PDF as a page-level filter, not a route-segment data source; inspect the changed segments and capture their rendered tables before review.
4. Add one dry-run command that builds the affected reviewed snapshot and writes the validation/diff report.
5. Add an explicit activation command that only promotes an already validated versioned snapshot; it must never parse, infer, or fetch new data.
6. Verify a successful dry run and a blocked activation case. Do not wire a timer or product API in this phase.

## Done When

- A versioned airway snapshot is traceable to its KOCA source and validation report.
- Each AIRAC issue has a recorded amendment-page decision: no affected ENR pages, or a reviewed diff for every affected ENR section.
- Failed or incomplete runs leave the previous `current` snapshot untouched.
- The only scope is ENR airway data and supporting navigation aids; AD 2 procedures remain excluded.
