// Paragraphs for an answer bubble: the model's own line breaks when it made
// them, otherwise one paragraph per sentence so a long answer is not one block.
export function answerParagraphs(text) {
  const value = String(text ?? '').trim()
  if (!value) return []
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  if (lines.length > 1) return lines
  // Korean answers end sentences with "요." / "다."; decimals such as "1.5km" are not split.
  return value.split(/(?<=[요다][.!?])\s+/).map((part) => part.trim()).filter(Boolean)
}
