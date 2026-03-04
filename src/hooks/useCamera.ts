import { useEffect, useRef, useState } from 'react'

export function useCamera() {
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isStartingCamera, setIsStartingCamera] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [cameraStatus, setCameraStatus] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsCameraOpen(false)
  }

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Tu navegador no soporta acceso a cámara.')
      return
    }

    setIsStartingCamera(true)
    setCameraError('')
    setCameraStatus('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream
      setIsCameraOpen(true)
    } catch {
      setCameraError('No se pudo abrir la cámara. Verifica permisos del navegador.')
    } finally {
      setIsStartingCamera(false)
    }
  }

  // Attach the stream to the video element once the camera is opened
  useEffect(() => {
    const videoElement = videoRef.current
    const stream = streamRef.current

    if (!isCameraOpen || !videoElement || !stream) return

    void (async () => {
      try {
        videoElement.srcObject = stream
        await videoElement.play()
      } catch {
        setCameraError('No se pudo mostrar la cámara. Intenta cerrar y abrir nuevamente.')
      }
    })()
  }, [isCameraOpen])

  // Stop the stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    isCameraOpen,
    isStartingCamera,
    cameraError,
    cameraStatus,
    setCameraError,
    setCameraStatus,
    videoRef,
    streamRef,
    captureCanvasRef,
    openCamera,
    stopCameraStream,
  }
}
