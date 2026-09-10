import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Button } from './components.jsx'

GlobalWorkerOptions.workerSrc = workerUrl

export default function PdfViewer({ url, title }) {
  const canvasRef = useRef(null)
  const [document, setDocument] = useState(null)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setDocument(null); setPage(1); setError('')
    const task = getDocument({ url, withCredentials: true })
    task.promise.then((loaded) => { if (active) setDocument(loaded) }).catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false; task.destroy() }
  }, [url])
  useEffect(() => {
    if (!document) return
    let cancelled = false; let renderTask
    document.getPage(page).then((pdfPage) => {
      if (cancelled) return
      const pixelRatio = window.devicePixelRatio || 1
      const viewport = pdfPage.getViewport({ scale })
      const canvas = canvasRef.current; if (!canvas) return
      canvas.width = Math.floor(viewport.width * pixelRatio); canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${Math.floor(viewport.width)}px`; canvas.style.height = `${Math.floor(viewport.height)}px`
      renderTask = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport, transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0] })
      return renderTask.promise
    }).catch((reason) => { if (reason?.name !== 'RenderingCancelledException') setError(reason.message) })
    return () => { cancelled = true; renderTask?.cancel() }
  }, [document, page, scale])
  if (error) return <p className="ol-form-error" role="alert">PDF를 열 수 없습니다. {error}</p>
  return <div className="ol-pdf-viewer">
    <div className="ol-document-tools"><div><Button secondary aria-label="이전 쪽" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /></Button><span>{page} / {document?.numPages || '—'}</span><Button secondary aria-label="다음 쪽" disabled={!document || page >= document.numPages} onClick={() => setPage((value) => value + 1)}><ChevronRight /></Button></div><div><Button secondary aria-label="축소" onClick={() => setScale((value) => Math.max(.6, value - .2))}><Minus /></Button><span>{Math.round(scale * 100)}%</span><Button secondary aria-label="확대" onClick={() => setScale((value) => Math.min(2.2, value + .2))}><Plus /></Button></div></div>
    <div className="ol-pdf-stage" role="region" aria-label={`${title} PDF 페이지`} tabIndex="0"><canvas ref={canvasRef} /></div>
  </div>
}
