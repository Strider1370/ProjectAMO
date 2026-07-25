// Horizontal legends read from weak/low at left to strong/high at right.
// Most source ramps already use that order; callers opt in only for descending data.
export function entriesLeftToRight(entries = [], reverse = false) {
  return reverse ? [...entries].reverse() : entries
}
