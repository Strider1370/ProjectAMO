import { Fragment } from 'react'
import { rawReports } from './rawReport.js'

// The report text the answer was based on, coloured by the app (not the model).
export default function RawReportCard({ result }) {
  const reports = rawReports(result)
  if (!reports.length) return null
  return <section className="copilot-raw" aria-label="참고한 원문">
    {reports.map((report) => <figure className="copilot-raw-report" key={`${report.icao}:${report.title}`}>
      <figcaption>원문 · {report.title}</figcaption>
      <pre>{report.lines.map((line, i) => <span className="copilot-raw-line" key={i}>
        {line.map((token, j) => <Fragment key={j}>{j ? ' ' : ''}<span className={token.className ?? undefined}>{token.text}</span></Fragment>)}
      </span>)}</pre>
    </figure>)}
  </section>
}
