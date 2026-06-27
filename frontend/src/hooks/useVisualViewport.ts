import { useEffect, useState } from 'react'

export interface VisualViewportInfo {
  height: number
  offsetTop: number
}

export function useVisualViewport() {
  const [viewport, setViewport] = useState<VisualViewportInfo | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return

    const handleResize = () => {
      setViewport({
        height: vv.height,
        offsetTop: vv.offsetTop,
      })
    }

    // Set initial size
    setViewport({
      height: vv.height,
      offsetTop: vv.offsetTop,
    })

    vv.addEventListener('resize', handleResize)
    vv.addEventListener('scroll', handleResize)

    return () => {
      vv.removeEventListener('resize', handleResize)
      vv.removeEventListener('scroll', handleResize)
    }
  }, [])

  return viewport
}
