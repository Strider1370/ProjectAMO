import { useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { buildCurrentWarningModel } from './lib/currentWeatherViewModel.js'
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'

export default function WarningCarousel({ warning }) {
  const { tz } = useTimeZone()
  const model = useMemo(() => buildCurrentWarningModel(warning, tz), [warning, tz])
  const viewportRef = useRef(null)
  const measureRef = useRef(null)
  const [pages, setPages] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextPageIndex, setNextPageIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [pageHeight, setPageHeight] = useState(52)

  useEffect(() => {
    if (!model.active) {
      setPages([])
      setPageIndex(0)
      setNextPageIndex(0)
      setIsAnimating(false)
      return undefined
    }

    const updateLayout = () => {
      const viewport = viewportRef.current
      const measure = measureRef.current
      if (!viewport || !measure) return

      const itemNodes = Array.from(measure.children)
      const nextPages = []
      let currentTop = null
      let currentPage = []

      itemNodes.forEach((node, index) => {
        const top = Math.round(node.offsetTop)
        if (currentTop === null || top === currentTop) {
          currentTop = top
          currentPage.push(index)
          return
        }

        nextPages.push(currentPage)
        currentTop = top
        currentPage = [index]
      })

      if (currentPage.length > 0) nextPages.push(currentPage)

      const measuredHeight = itemNodes.length > 0
        ? Math.ceil(Math.max(...itemNodes.map((node) => node.getBoundingClientRect().height)) + 8)
        : Math.ceil(measure.getBoundingClientRect().height)

      if (measuredHeight > 0) setPageHeight(measuredHeight)
      setPages(nextPages)
    }

    updateLayout()
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateLayout) : null

    if (resizeObserver) {
      if (viewportRef.current) resizeObserver.observe(viewportRef.current)
      if (measureRef.current) resizeObserver.observe(measureRef.current)
      return () => resizeObserver.disconnect()
    }

    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [model.active, model.items])

  useEffect(() => {
    setPages([])
    setPageIndex(0)
    setNextPageIndex(0)
    setIsAnimating(false)
  }, [warning, model.count])

  useEffect(() => {
    if (pages.length <= 1) return undefined

    const interval = window.setInterval(() => {
      setNextPageIndex((pageIndex + 1) % pages.length)
      setIsAnimating(true)
    }, 4200)

    return () => window.clearInterval(interval)
  }, [pageIndex, pages])

  useEffect(() => {
    if (!isAnimating) return undefined

    const timer = window.setTimeout(() => {
      setPageIndex(nextPageIndex)
      setIsAnimating(false)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [isAnimating, nextPageIndex])

  if (!model.active) {
    return (
      <section className="ap-current-warning ap-current-warning--ok">
        <div className="ap-current-warning-side ap-current-warning-side--single">
          <Check className="ap-current-warning-icon" aria-hidden="true" />
          <span className="ap-current-warning-label">{model.label}</span>
        </div>
      </section>
    )
  }

  const normalizedPages = (pages.length > 0 ? pages : [model.items.map((_, index) => index)])
    .map((page) => page.filter((itemIndex) => itemIndex >= 0 && itemIndex < model.items.length))
    .filter((page) => page.length > 0)
  const activePage = normalizedPages[Math.min(pageIndex, normalizedPages.length - 1)] || []
  const incomingPage = normalizedPages[Math.min(nextPageIndex, normalizedPages.length - 1)] || activePage

  function renderItems(page, keyPrefix) {
    return page.map((itemIndex, index) => {
      const item = model.items[itemIndex]
      return (
        <span key={`${keyPrefix}-${item.key}-${index}`} className="ap-current-warning-item">
          <span className="ap-current-warning-entry">
            <strong className="ap-current-warning-name">{item.name}</strong>
            <span className="ap-current-warning-time">{item.timeText}</span>
          </span>
        </span>
      )
    })
  }

  return (
    <section className="ap-current-warning ap-current-warning--danger" aria-label={model.label}>
      <div className="ap-current-warning-side" aria-hidden="true" />
      <div
        ref={viewportRef}
        className="ap-current-warning-text"
        style={{ '--ap-warning-page-height': `${pageHeight}px` }}
      >
        <div className={`ap-current-warning-page${isAnimating ? ' ap-current-warning-page--leave' : ' ap-current-warning-page--active'}`}>
          <div className="ap-current-warning-group">{renderItems(activePage, `page-${pageIndex}`)}</div>
        </div>
        {isAnimating && (
          <div className="ap-current-warning-page ap-current-warning-page--enter">
            <div className="ap-current-warning-group">{renderItems(incomingPage, `page-${nextPageIndex}`)}</div>
          </div>
        )}
        <div className="ap-current-warning-measure" aria-hidden="true">
          <div ref={measureRef} className="ap-current-warning-group">
            {renderItems(model.items.map((_, index) => index), 'measure')}
          </div>
        </div>
      </div>
    </section>
  )
}
