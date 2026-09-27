// Card rows for the code-made route brief: 출발 → 항로 → 도착, everything the
// code ranked (the answer speaks only 경고/주의 and the wind).
const SECTIONS = ['출발', '항로', '도착']

export function routeBriefSections(brief) {
  if (!brief) return []
  const items = [...(brief.speak ?? []), ...(brief.cardOnly ?? [])]
  return SECTIONS.map((section) => ({
    section,
    quiet: brief.quiet?.[section] ?? null,
    items: items.filter((item) => item.section === section)
      .map((item) => ({ level: item.level, text: item.text, highlight: item.highlight ?? null })),
  }))
}
