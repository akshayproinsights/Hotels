import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera, RefreshCw, Trash2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface CameraCaptureModalProps {
  isOpen: boolean
  onClose: () => void
  onCaptureComplete: (files: File[]) => void
  language: 'en' | 'mr'
}

export default function CameraCaptureModal({
  isOpen,
  onClose,
  onCaptureComplete,
  language,
}: CameraCaptureModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState<string>('')
  const [capturedPhotos, setCapturedPhotos] = useState<{ file: File; preview: string }[]>([])
  const [flash, setFlash] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Enumerate video devices
  useEffect(() => {
    if (!isOpen) return

    const getDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices()
        const videoDevs = devs.filter(d => d.kind === 'videoinput')
        setDevices(videoDevs)

        // Try to find a back camera ("environment") first
        const backCam = videoDevs.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('environment') ||
          d.label.toLowerCase().includes('rear')
        )
        if (backCam) {
          setActiveDeviceId(backCam.deviceId)
        } else if (videoDevs.length > 0) {
          setActiveDeviceId(videoDevs[0].deviceId)
        }
      } catch (err) {
        console.error('Error enumerating devices:', err)
      }
    }

    getDevices()
  }, [isOpen])

  // Initialize camera stream
  useEffect(() => {
    if (!isOpen) return

    let activeStream: MediaStream | null = null

    const startCamera = async () => {
      // Stop existing stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }

      const constraints: MediaStreamConstraints = {
        video: activeDeviceId
          ? { deviceId: { exact: activeDeviceId } }
          : { facingMode: 'environment' }
      }

      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints)
        activeStream = s
        setStream(s)
        if (videoRef.current) {
          videoRef.current.srcObject = s
        }
        setPermissionError(null)
      } catch (err: any) {
        console.error('Error starting camera stream:', err)
        setPermissionError(err.message || 'Could not access camera.')
        // Fallback: request default camera constraint
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true })
          activeStream = fallbackStream
          setStream(fallbackStream)
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream
          }
          setPermissionError(null)
        } catch (fbErr: any) {
          setPermissionError(
            language === 'mr'
              ? 'कॅमेरा सुरू करता आला नाही. कृपया कॅमेरा परवानगी तपासा.'
              : 'Unable to start camera. Please verify camera permissions.'
          )
        }
      }
    }

    startCamera()

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [isOpen, activeDeviceId])

  // Stop camera and cleanup on close
  useEffect(() => {
    if (!isOpen && stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
      // Revoke previews
      capturedPhotos.forEach(p => URL.revokeObjectURL(p.preview))
      setCapturedPhotos([])
    }
  }, [isOpen])

  const toggleCamera = () => {
    if (devices.length < 2) return
    const currentIndex = devices.findIndex(d => d.deviceId === activeDeviceId)
    const nextIndex = (currentIndex + 1) % devices.length
    setActiveDeviceId(devices[nextIndex].deviceId)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !stream) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    
    // Set canvas dimensions to match the actual stream resolution
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      // Trigger flash visual effect
      setFlash(true)
      setTimeout(() => setFlash(false), 150)

      canvas.toBlob((blob) => {
        if (blob) {
          const timestamp = new Date().getTime()
          const filename = `id_capture_${timestamp}.jpg`
          const file = new File([blob], filename, { type: 'image/jpeg' })
          const preview = URL.createObjectURL(file)
          setCapturedPhotos(prev => [...prev, { file, preview }])
        }
      }, 'image/jpeg', 0.85)
    }
  }

  const removeCapturedPhoto = (index: number) => {
    setCapturedPhotos(prev => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[index].preview)
      copy.splice(index, 1)
      return copy
    })
  }

  const handleDone = () => {
    if (capturedPhotos.length === 0) {
      toast.error(language === 'mr' ? 'कमीत कमी एक फोटो काढा' : 'Please capture at least one photo')
      return
    }
    const files = capturedPhotos.map(p => p.file)
    onCaptureComplete(files)
    onClose()
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800 shrink-0">
        <h3 className="text-sm font-bold uppercase tracking-wider">
          {language === 'mr' ? 'ओळखपत्र फोटो काढा' : 'Capture ID Documentation'}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-slate-800 transition text-slate-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Viewport */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {permissionError ? (
          <div className="p-6 text-center max-w-sm">
            <p className="text-red-400 font-bold mb-2">⚠️ {permissionError}</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {language === 'mr'
                ? 'कृपया ब्राउझर सेटिंग्जमध्ये कॅमेरा परवानगी द्या आणि पुन्हा प्रयत्न करा.'
                : 'Please allow camera access in your browser settings and try again.'}
            </p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Guide overlay */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-8">
              <div className="w-full max-w-md aspect-[1.586/1] border-2 border-dashed border-emerald-400/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
              </div>
              <p className="text-[10px] sm:text-xs font-medium text-center text-slate-300 mt-4 px-4 py-1.5 bg-black/60 rounded-full backdrop-blur-sm">
                {language === 'mr'
                  ? 'ओळखपत्र चौकटीच्या आत ठेवा'
                  : 'Align ID card inside the boundary'}
              </p>
            </div>

            {/* Flash Overlay */}
            {flash && <div className="absolute inset-0 bg-white z-50 animate-flash" />}
          </>
        )}
      </div>

      {/* Captured Thumbnails */}
      {capturedPhotos.length > 0 && (
        <div className="bg-slate-900 border-t border-slate-800 p-3 flex gap-2 overflow-x-auto shrink-0 scrollbar-thin">
          {capturedPhotos.map((photo, index) => (
            <div key={index} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 shrink-0 group">
              <img src={photo.preview} alt="Captured ID" className="w-full h-full object-cover" />
              <button
                onClick={() => removeCapturedPhoto(index)}
                className="absolute inset-0 bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-150 text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center text-[9px] font-black text-slate-955">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Controls */}
      <div className="p-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between shrink-0">
        {devices.length > 1 ? (
          <button
            onClick={toggleCamera}
            className="p-3 bg-slate-800 rounded-full hover:bg-slate-700 transition active:scale-95 text-slate-300 hover:text-white"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        ) : (
          <div className="w-11 h-11" />
        )}

        <button
          onClick={capturePhoto}
          disabled={!!permissionError}
          className="relative flex items-center justify-center w-16 h-16 rounded-full bg-white active:scale-90 transition disabled:opacity-50"
        >
          <div className="w-14 h-14 rounded-full border-2 border-slate-950 bg-white hover:bg-slate-100 flex items-center justify-center">
            <Camera className="h-6 w-6 text-slate-900" />
          </div>
        </button>

        <button
          onClick={handleDone}
          disabled={capturedPhotos.length === 0}
          className="flex items-center gap-1.5 py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 transition font-black text-xs rounded-xl text-slate-950 uppercase tracking-wider"
        >
          <CheckCircle className="h-4 w-4" />
          {language === 'mr' ? `झाले (${capturedPhotos.length})` : `Done (${capturedPhotos.length})`}
        </button>
      </div>

      <style>{`
        @keyframes flashEffect {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        .animate-flash {
          animation: flashEffect 0.15s ease-out forwards;
        }
      `}</style>
    </div>,
    document.body
  )
}
