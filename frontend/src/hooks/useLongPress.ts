import { useCallback, useRef } from 'react'

interface LongPressOptions {
  delay?: number
}

export default function useLongPress(
  onLongPress: (e: any) => void,
  onClick: (e: any) => void,
  { delay = 600 }: LongPressOptions = {}
) {
  const timeoutRef = useRef<any>(null)
  const isLongPressTriggered = useRef(false)
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  const start = useCallback(
    (e: any) => {
      if (e.touches && e.touches[0]) {
        touchStartPos.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        }
      }
      isLongPressTriggered.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      
      timeoutRef.current = setTimeout(() => {
        onLongPress(e)
        isLongPressTriggered.current = true
      }, delay)
    },
    [onLongPress, delay]
  )

  const move = useCallback((e: any) => {
    if (!touchStartPos.current || !e.touches || !e.touches[0]) return
    const dx = e.touches[0].clientX - touchStartPos.current.x
    const dy = e.touches[0].clientY - touchStartPos.current.y
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  const clear = useCallback(
    (e: any, shouldTriggerClick = true) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      if (shouldTriggerClick && !isLongPressTriggered.current) {
        onClick(e)
      }
      
      touchStartPos.current = null
      isLongPressTriggered.current = false
    },
    [onClick]
  )

  return {
    onMouseDown: (e: any) => {
      start(e)
    },
    onTouchStart: (e: any) => {
      start(e)
    },
    onTouchMove: (e: any) => {
      move(e)
    },
    onMouseUp: (e: any) => {
      clear(e, true)
    },
    onTouchEnd: (e: any) => {
      if (e.cancelable) e.preventDefault()
      clear(e, true)
    },
    onMouseLeave: (e: any) => {
      clear(e, false)
    },
    onContextMenu: (e: any) => {
      e.preventDefault()
    }
  }
}
