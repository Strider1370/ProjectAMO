// Deliberately synthetic two-page document for upload, Range and viewer verification.
export function organizationTestPdf(label = 'Organization briefing test') {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...[1, 2].map(page => { const stream = `BT /F1 22 Tf 60 700 Td (${label} - page ${page}) Tj ET`; return `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream` }),
  ]
  let value = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(value)); value += `${index + 1} 0 obj\n${body}\nendobj\n` })
  const xref = Buffer.byteLength(value)
  value += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(value)
}
