import * as React from 'react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react'

interface DocumentLightboxProps {
  docUrl: string
  fileName: string
  onClose: () => void
  guestName?: string
  roomNumber?: string
  docType?: string
}

export default function DocumentLightbox({ 
  docUrl, 
  fileName, 
  onClose,
  guestName,
  roomNumber,
  docType
}: DocumentLightboxProps) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation()
    setZoom((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation()
    setZoom((prev) => Math.max(prev - 0.25, 0.5))
  }

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRotation((prev) => (prev + 90) % 360)
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
    } catch (err) {
      // Fallback: open in new tab
      window.open(docUrl, '_blank')
    }
  }

  const formatDocType = (type?: string, fallbackName?: string) => {
    if (!type) return fallbackName || ''
    if (type === 'guest_photo') return 'Customer Photo'
    if (type === 'id_proof') return 'ID Proof'
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const isPdf = fileName.toLowerCase().endsWith('.pdf')

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-955/95 backdrop-blur-md p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div 
        className="w-full flex justify-between items-center z-10 px-4 py-3 bg-slate-900/60 border border-slate-800/40 rounded-2xl max-w-4xl backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-extrabold text-slate-100">
              {guestName || 'Customer Document'}
            </span>
            {roomNumber && (
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-lg text-[10px] font-extrabold">
                Room {roomNumber}
              </span>
            )}
          </div>
          <span className="text-xs font-semibold text-slate-400 truncate max-w-[200px] sm:max-w-md">
            {formatDocType(docType, fileName)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Main Container */}
      <div 
        className="flex-1 w-full max-w-4xl flex items-center justify-center overflow-hidden my-4"
        onClick={onClose}
      >
        <div 
          className="relative max-h-full max-w-full flex items-center justify-center p-4 transition-transform duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {isPdf ? (
            <iframe
              src={`${docUrl}#view=FitH`}
              className="w-[85vw] h-[70vh] max-w-4xl rounded-2xl border border-slate-800 bg-white"
              title={fileName}
            />
          ) : (
            <div className="overflow-auto max-h-[72vh] max-w-[90vw] flex items-center justify-center custom-scrollbar">
              <img
                src={docUrl}
                alt={fileName}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-out',
                }}
                className="max-h-[65vh] max-w-full rounded-xl object-contain shadow-2xl border border-slate-800/60"
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls Bar (only show zoom/rotate for images) */}
      <div 
        className="w-full flex justify-center items-center z-10 p-2 bg-slate-900/60 border border-slate-800/40 rounded-2xl max-w-md mb-2 backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 sm:gap-6 py-1 px-3">
          {!isPdf && (
            <>
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                className="p-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-slate-300 transition"
                title="Zoom Out"
              >
                <ZoomOut className="h-4.5 w-4.5" />
              </button>
              <span className="text-xs font-bold text-slate-400 min-w-[36px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                className="p-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 disabled:opacity-30 disabled:hover:text-slate-300 transition"
                title="Zoom In"
              >
                <ZoomIn className="h-4.5 w-4.5" />
              </button>
              <div className="w-px h-5 bg-slate-800" />
              <button
                onClick={handleRotate}
                className="p-2.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 transition"
                title="Rotate Clockwise"
              >
                <RotateCw className="h-4.5 w-4.5" />
              </button>
              <div className="w-px h-5 bg-slate-800" />
            </>
          )}
          <button
            onClick={handleDownload}
            className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition flex items-center gap-1.5 font-bold text-xs"
            title="Download Document"
          >
            <Download className="h-4.5 w-4.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
