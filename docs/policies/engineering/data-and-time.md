# Data and time

## Applies when

Changing timestamps, KMA/KIM data, parser contracts, snapshots, caches, collectors, or a backend data type.

## Does not apply when

Pure presentation work without time/data semantics belongs to design; map rendering belongs to map and layers.

## Re-check trigger

Re-check the policy index when a change crosses parser, store, collector, API, or user-facing formatter boundaries.

## Time contract

- Store and compare instants as UTC or epoch values.
- Interpret compact source times at the parser boundary using the source's documented timezone.
- Pass the user-selected display timezone to every user-facing formatter.
- Test UTC and KST output whenever a timestamp display has configurable timezone output.

Do not prescribe a date library; preserve the existing contract with the smallest suitable built-in or installed tool.

## Data lifecycle

- A new backend data type follows the existing boundary: API client, parser, processor, per-type guarded scheduler registration, snapshot-store ownership, cached API route, then frontend client only when needed.
- The store owns snapshot publication and change detection. Preserve the last usable snapshot when a collection run partially fails; do not replace good data with an incomplete result.
- Choose cache policy from the consumer contract: immutable/versioned data may use revalidation; changing operational data needs explicit freshness and stale-data behavior.
- Collectors validate source input at the boundary, use a per-type lock, and publish only validated successful portions according to the store contract.
