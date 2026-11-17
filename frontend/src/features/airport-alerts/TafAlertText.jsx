import { tafAlertSegments, tafHighlightDescription } from './tafAlertText.js'
import './tafAlertText.css'

export default function TafAlertText({ payload, className }) {
  const segments = tafAlertSegments(payload)
  return <pre className={className}>{segments.map((segment, index) => segment.metrics?.length
    ? <mark key={index} className="taf-alert-hit" title={tafHighlightDescription(segment.metrics)}>{segment.text}</mark>
    : segment.text)}</pre>
}
