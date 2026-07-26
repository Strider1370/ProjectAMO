# Spec: Automatic-route altitude comparison latency

## Goal

Reduce the time from pressing altitude comparison to showing the vertical profile for long automatic routes, without changing weather values, candidate selection, or briefing safety semantics.

## Problem

For an RKSS→RKPC automatic route at 29,000 ft, the production UI took roughly nine seconds. The server repeatedly searched each level's sample array by distance during every candidate calculation, then the client requested the already-created cross-section again for the vertical-profile window.

## Requirements

- Access aligned cross-section samples by their existing route-axis index, not repeated distance equality searches.
- Calculate route sample weights once per comparison request.
- Include the already-built cross-section in the altitude-comparison response and reuse it only for the immediately following vertical-profile request.
- Preserve all existing response fields, weather values, unavailable states, and independent vertical-profile behavior.
- Add a browser contract proving the altitude comparison flow makes no second cross-section request.

## Non-goals

- Do not add a new route cache, worker, dependency, or change weather-model data.
- Do not reduce chart detail in this change.

## Success criteria

- Existing altitude-comparison results remain unchanged for the fixed fixture.
- The affected route-workflow browser contract passes on desktop, iPad, and mobile.
- Production measurement repeats the RKSS→RKPC automatic-route, 29,000-ft flow before and after deployment.
