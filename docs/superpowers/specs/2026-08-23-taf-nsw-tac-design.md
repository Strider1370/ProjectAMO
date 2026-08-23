# TAF NSW TAC reconstruction

## Problem

The airport panel's raw TAF view reconstructs Korean KMA IWXXM forecasts as
TAC. IWXXM represents *no significant weather* with a weather element whose
`nilReason` is `nothingOfOperationalSignificance`. The parser currently turns
that into an empty weather list, and the TAC serializer omits empty lists.
Consequently, a change from rain to no significant weather can render as a
blank weather group instead of `NSW`.

## Scope

Preserve the explicit NSW meaning from the IWXXM parser through the normalized
TAF state and render `NSW` in reconstructed TAC. This applies to the base
forecast and to change groups, including transitions such as `RA` followed by
`BECMG ... NSW`.

No inference is permitted: an absent weather field remains absent and must not
be displayed as `NSW`.

## Design

1. The IWXXM weather resolver reports whether its empty weather result means
   explicit no-significant-weather.
2. TAF forecast state and change groups carry this as an `nsw_flag` alongside
   the existing touched/cavok/NSC state.
3. State merging preserves or replaces the flag only when a weather field is
   touched. CAVOK clears it because CAVOK is rendered as its own TAC group.
4. The TAC serializer emits a plain `NSW` token when `nsw_flag` is true.
5. A regression test uses a minimal IWXXM TAF where a change group explicitly
   sets NSW, and asserts that reconstructed raw TAC includes `NSW`.

## Verification

Run the focused parser/serializer regression test and the related TAF parser
test set. Then update the knowledge graph after code changes. Browser work is
not required because the defect is covered at the parser-to-TAC boundary and
the existing airport-panel raw view renders the provided TAC text.
