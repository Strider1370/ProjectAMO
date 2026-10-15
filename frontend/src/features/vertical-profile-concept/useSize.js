import { useLayoutEffect, useRef, useState } from 'react'

export default function useSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 800, height: 400 })
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) })
    })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}
