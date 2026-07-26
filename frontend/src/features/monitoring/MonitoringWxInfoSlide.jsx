import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import AirportInfoDocument from '../airport-panel/AirportInfoDocument.jsx'
import { fitScale } from './lib/fitScale.js'

// The bulletin runs from ~370 to ~680 characters depending on the airport and the weather, and the
// panel size depends on the monitor. Rather than pick a font size that is wrong for most of those
// combinations, lay the document out at full panel width and scale it to fill whatever room there
// is — always as large as it can be without clipping.
export default function MonitoringWxInfoSlide({ info }) {
  const boxRef = useRef(null)
  const contentRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [fontsReady, setFontsReady] = useState(() => !document.fonts || document.fonts.status === 'loaded')

  // Web fonts landing after the first measurement change how the text wraps, which would leave the
  // document either clipped or smaller than it needs to be.
  useEffect(() => {
    if (fontsReady || !document.fonts?.ready) return
    let cancelled = false
    document.fonts.ready.then(() => { if (!cancelled) setFontsReady(true) }).catch(() => {})
    return () => { cancelled = true }
  }, [fontsReady])

  useLayoutEffect(() => {
    const box = boxRef.current
    const content = contentRef.current
    if (!box || !content) return undefined

    // The search mutates the content width to measure it; those mutations must not be mistaken for
    // real content changes or the observer feeds itself.
    let measuring = false

    function refit() {
      measuring = true
      try {
        const panelWidth = box.clientWidth
        const panelHeight = box.clientHeight
        const next = fitScale(
          (width) => {
            content.style.width = `${width}px`
            return content.scrollHeight
          },
          panelWidth,
          panelHeight
        )
        content.style.width = `${panelWidth / next}px`
        setScale(next)
      } finally {
        measuring = false
      }
    }

    refit()
    if (typeof ResizeObserver === 'undefined') return undefined
    // Observing the content as well as the panel is what makes this correct: the bulletin grows
    // after the first layout when the 항공기상청 logo decodes and when a web font swaps in. Fitting
    // only once left the document ~10% taller than the panel, silently clipping the tail of the
    // 위험 기상예보 section.
    const observer = new ResizeObserver(() => { if (!measuring) refit() })
    observer.observe(box)
    observer.observe(content)
    return () => observer.disconnect()
  }, [info, fontsReady])

  if (!info) return null

  return (
    <div className="monitoring-wxinfo-slide" ref={boxRef}>
      <div
        className="monitoring-wxinfo-slide-content ap-info-doc"
        ref={contentRef}
        style={{ transform: `scale(${scale})` }}
      >
        <AirportInfoDocument info={info} />
      </div>
    </div>
  )
}
