import * as React from 'react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, RotateCw, Download, Maximize2 } from 'lucide-react'

interface DocumentLightboxProps {
  docUrl: string
  fileName: string
  onClose: () => void
  customerName?: string
  guestName?: string
  roomNumber?: string
  docType?: string
}

export default function DocumentLightbox({
  docUrl,
  fileName,
  onClose,
  customerName,
  guestName,
  roomNumber,
  docType,
}: DocumentLightboxProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)

  // Pinch-to-zoom refs
  const lastTouchDist = useRef<number | null>(null)
  const lastTapTime = useRef<number>(0)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-hide controls after 3s of inactivity (great for clear viewing on mobile)
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3500)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [resetHideTimer])

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation()
    setZoom((prev) => Math.min(prev + 0.5, 4))
    resetHideTimer()
  }

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation()
    setZoom((prev) => Math.max(prev - 0.5, 1))
    resetHideTimer()
  }

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRotation((prev) => (prev + 90) % 360)
    resetHideTimer()
  }

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation()
    setZoom(1)
    setRotation(0)
    resetHideTimer()
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const response = await fetch(docUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      window.open(docUrl, '_blank')
    }
  }

  // Double-tap to toggle 1× ↔ 2.5× zoom
  const handleTap = useCallback((e: React.TouchEvent) => {
    const now = Date.now()
    if (now - lastTapTime.current < 300) {
      e.preventDefault()
      setZoom((prev) => (prev > 1.2 ? 1 : 2.5))
      resetHideTimer()
    }
    lastTapTime.current = now
    resetHideTimer()
  }, [resetHideTimer])

  // Pinch-to-zoom on mobile
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) { lastTouchDist.current = null; return }
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (lastTouchDist.current !== null) {
      const delta = dist - lastTouchDist.current
      setZoom((prev) => Math.min(Math.max(prev + delta * 0.012, 1), 4))
    }
    lastTouchDist.current = dist
    resetHideTimer()
  }, [resetHideTimer])

  const handleTouchEnd = useCallback(() => { lastTouchDist.current = null }, [])

  const formatDocType = (type?: string, fallbackName?: string) => {
    if (!type) return fallbackName || ''
    if (type === 'customer_photo') return 'Customer Photo'
    if (type === 'id_proof') return 'ID Proof'
    return type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  const isPdf = fileName.toLowerCase().endsWith('.pdf')
  const displayName = customerName || guestName || 'Document'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onClick={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* ── Overlaid Top Header ── */}
      <div
        className={`
          absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-3
          px-4 pt-safe-top py-3
          bg-gradient-to-b from-black/85 via-black/50 to-transparent
          transition-all duration-300 ease-in-out
          ${controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-extrabold text-white leading-tight truncate">
            {displayName}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {roomNumber && (
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wide">
                Room {roomNumber}
              </span>
            )}
            <span className="text-[11px] font-medium text-white/45">
              {formatDocType(docType, fileName)}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/12 hover:bg-white/22 text-white/80 hover:text-white transition backdrop-blur-sm border border-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Full-screen Image / PDF Area ── */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden relative select-none"
        onClick={onClose}
        onTouchEnd={handleTap}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchEnd}
      >
        {/* Loading spinner */}
        {!imgLoaded && !isPdf && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
          </div>
        )}

        {isPdf ? (
          <iframe
            src={`${docUrl}#view=FitH`}
            className="w-full h-full border-0"
            title={fileName}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          /* KEY FIX: image fills the full viewport height — like Google Photos / WhatsApp */
          <img
            src={docUrl}
            alt={displayName}
            onLoad={() => setImgLoaded(true)}
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.22s cubic-bezier(0.25,0.46,0.45,0.94)',
              cursor: zoom > 1 ? 'grab' : 'zoom-in',
              opacity: imgLoaded ? 1 : 0,
              maxHeight: '100dvh',
              maxWidth: '100%',
              width: 'auto',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          />
        )}
      </div>

      {/* ── Overlaid Bottom Controls ── */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center
          pb-6 pt-8 px-4
          bg-gradient-to-t from-black/85 via-black/50 to-transparent
          transition-all duration-300 ease-in-out
          ${controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl px-3 py-2">
          {!isPdf && (
            <>
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                title="Zoom Out"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition"
              >
                <ZoomOut className="h-5 w-5" />
              </button>

              <span className="text-xs font-bold text-white/55 min-w-[42px] text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>

              <button
                onClick={handleZoomIn}
                disabled={zoom >= 4}
                title="Zoom In"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition"
              >
                <ZoomIn className="h-5 w-5" />
              </button>

              <div className="w-px h-5 bg-white/15 mx-1" />

              <button
                onClick={handleRotate}
                title="Rotate 90°"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition"
              >
                <RotateCw className="h-5 w-5" />
              </button>

              <div className="w-px h-5 bg-white/15 mx-1" />

              <button
                onClick={handleReset}
                title="Fit to Screen"
                className="w-10 h-10 flex items-center justify-center rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition"
              >
                <Maximize2 className="h-4.5 w-4.5" />
              </button>

              <div className="w-px h-5 bg-white/15 mx-1" />
            </>
          )}

          <button
            onClick={handleDownload}
            title="Download"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 transition"
          >
            <Download className="h-5 w-5" />
          </button>
        </div>

        {imgLoaded && zoom === 1 && !isPdf && (
          <p className="mt-2 text-[10px] text-white/22 font-medium pointer-events-none">
            Double-tap to zoom · Pinch to zoom
          </p>
        )}
      </div>
    </div>,
    document.body
  )
}
