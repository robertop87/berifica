import { useEffect, useMemo, useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import './App.css'
import berificaLogo from './assets/berifica_logo.png'
import bill10 from './assets/10.jpg'
import bill20 from './assets/20.jpg'
import bill50 from './assets/50.jpg'

type Range = { start: number; end: number }
type RelativeRegion = { x: number; y: number; width: number; height: number }

type ResultState = {
  message: string
  status: 'neutral' | 'loading' | 'success' | 'error'
}

type ValidationHistoryEntry = {
  id: number
  amount: string
  serie: string
  isOk: boolean
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type AppMode = 'manual' | 'automatic'

const rangesByGroup: Record<string, Range[]> = {
  '50': [
    { start: 67250001, end: 67700000 },
    { start: 69050001, end: 69500000 },
    { start: 69500001, end: 69950000 },
    { start: 69950001, end: 70400000 },
    { start: 70400001, end: 70850000 },
    { start: 70850001, end: 71300000 },
    { start: 76310012, end: 85139995 },
    { start: 86400001, end: 86850000 },
    { start: 90900001, end: 91350000 },
    { start: 91800001, end: 92250000 },
  ],
  '20': [
    { start: 87280145, end: 91646549 },
    { start: 96650001, end: 97100000 },
    { start: 99800001, end: 100250000 },
    { start: 100250001, end: 100700000 },
    { start: 109250001, end: 109700000 },
    { start: 110600001, end: 111050000 },
    { start: 111050001, end: 111500000 },
    { start: 111950001, end: 112400000 },
    { start: 112400001, end: 112850000 },
    { start: 112850001, end: 113300000 },
    { start: 114200001, end: 114650000 },
    { start: 114650001, end: 115100000 },
    { start: 115100001, end: 115550000 },
    { start: 118700001, end: 119150000 },
    { start: 119150001, end: 119600000 },
    { start: 120500001, end: 120950000 },
  ],
  '10': [
    { start: 77100001, end: 77550000 },
    { start: 78000001, end: 78450000 },
    { start: 78900001, end: 96350000 },
    { start: 96350001, end: 96800000 },
    { start: 96800001, end: 97250000 },
    { start: 98150001, end: 98600000 },
    { start: 104900001, end: 105350000 },
    { start: 105350001, end: 105800000 },
    { start: 106700001, end: 107150000 },
    { start: 107600001, end: 108050000 },
    { start: 108050001, end: 108500000 },
    { start: 109400001, end: 109850000 },
  ],
}

const billOptions = [
  { value: '50', label: 'Bs 50', image: bill50 },
  { value: '20', label: 'Bs 20', image: bill20 },
  { value: '10', label: 'Bs 10', image: bill10 },
]

const groupOptions = billOptions.map((option) => option.value)
const SERIAL_DIGITS_MAX_LENGTH = 10

const AMOUNT_REGION: RelativeRegion = { x: 0.68, y: 0.62, width: 0.28, height: 0.32 }
const SERIAL_RIGHT_REGION: RelativeRegion = { x: 0.5, y: 0.06, width: 0.45, height: 0.22 }
const RIGHT_SIDE_FALLBACK_REGION: RelativeRegion = { x: 0.45, y: 0.05, width: 0.55, height: 0.9 }

const sanitizeSerial = (value: string) => {
  const cleaned = value.toUpperCase().replace(/[^0-9A-Z]/g, '')
  const digits = cleaned.replace(/\D/g, '').slice(0, SERIAL_DIGITS_MAX_LENGTH)
  const suffix = cleaned.match(/[A-Z]/)?.[0] ?? ''

  if (!digits) {
    return suffix ? suffix : ''
  }

  return suffix ? `${digits} ${suffix}` : digits
}

const getSerialParts = (value: string) => {
  const normalized = sanitizeSerial(value)
  const match = normalized.match(/^(\d+)(?:\s([A-Z]))?$/)

  if (!match) {
    return { normalized, digits: '', suffix: '' }
  }

  return {
    normalized,
    digits: match[1],
    suffix: match[2] ?? '',
  }
}

function App() {
  const [mode, setMode] = useState<AppMode>('manual')
  const [group, setGroup] = useState('')
  const [serial, setSerial] = useState('')
  const [showRanges, setShowRanges] = useState(false)
  const [matchedRangeKey, setMatchedRangeKey] = useState<string | null>(null)
  const [validationHistory, setValidationHistory] = useState<ValidationHistoryEntry[]>([])
  const [latestValidationKey, setLatestValidationKey] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState>({
    message: 'ℹ️ Ingresa los datos para validar.',
    status: 'neutral',
  })

  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)

  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isStartingCamera, setIsStartingCamera] = useState(false)
  const [isReadingCamera, setIsReadingCamera] = useState(false)
  const [isManualValidating, setIsManualValidating] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [cameraStatus, setCameraStatus] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rangesSectionRef = useRef<HTMLElement | null>(null)
  const ocrWorkerRef = useRef<Tesseract.Worker | null>(null)
  const ocrParamsRef = useRef<{ whitelist: string; psm: Tesseract.PSM } | null>(null)

  const rangesForGroup = useMemo(() => rangesByGroup[group] ?? [], [group])
  const hasValidGroupSelection = groupOptions.includes(group.trim())
  const manualSerialDigits = serial.replace(/\D/g, '').slice(0, SERIAL_DIGITS_MAX_LENGTH)
  const isProcessing = isReadingCamera || isManualValidating

  const addValidationToHistory = (amount: string, serie: string, isOk: boolean) => {
    const normalizedAmount = amount || '-'
    const normalizedSerie = serie || '-'
    const validationKey = `${normalizedAmount}::${normalizedSerie}::${isOk ? 'ok' : 'nok'}`

    setLatestValidationKey(validationKey)

    setValidationHistory((previous) => {
      const alreadyExists = previous.some(
        (entry) =>
          entry.amount === normalizedAmount &&
          entry.serie === normalizedSerie &&
          entry.isOk === isOk,
      )

      if (alreadyExists) {
        return previous
      }

      const nextEntry: ValidationHistoryEntry = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        amount: normalizedAmount,
        serie: normalizedSerie,
        isOk,
      }

      return [nextEntry, ...previous]
    })
  }

  const validateBill = (groupInput: string, serialInput: string) => {
    setShowRanges(false)
    setMatchedRangeKey(null)

    const groupValue = groupInput.trim()
    const { normalized: serialValue, digits: serialDigits, suffix: serialSuffix } =
      getSerialParts(serialInput.trim())

    if (!groupOptions.includes(groupValue) || serialSuffix !== 'B') {
      setResult({
        message: 'ℹ️ Billete no es serie B, no necesita validación.',
        status: 'success',
      })
      return
    }

    const serialNumber = Number.parseInt(serialDigits, 10)
    if (Number.isNaN(serialNumber)) {
      setResult({ message: '⚠️ Ingresa un número de serie válido con sufijo B.', status: 'error' })
      addValidationToHistory(groupValue, serialValue, false)
      return
    }

    const ranges = rangesByGroup[groupValue] ?? []
    const matchedRange = ranges.find(
      (range) => serialNumber >= range.start && serialNumber <= range.end,
    )

    if (matchedRange) {
      setResult({ message: '❌ Billete observado.', status: 'error' })
      setMatchedRangeKey(`${matchedRange.start}-${matchedRange.end}`)
      setShowRanges(true)
      addValidationToHistory(groupValue, serialValue, false)
      return
    }

    setResult({ message: '✅ Billete no observado.', status: 'success' })
    addValidationToHistory(groupValue, serialValue, true)
  }

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
        video: { facingMode: { ideal: 'environment' } },
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

  const getOcrWorker = async () => {
    if (ocrWorkerRef.current) {
      return ocrWorkerRef.current
    }

    const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY)
    await worker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })

    ocrWorkerRef.current = worker
    ocrParamsRef.current = null
    return worker
  }

  const setOcrParams = async (
    worker: Tesseract.Worker,
    whitelist: string,
    psm: Tesseract.PSM,
  ) => {
    const current = ocrParamsRef.current
    if (current && current.whitelist === whitelist && current.psm === psm) {
      return
    }

    await worker.setParameters({
      tessedit_char_whitelist: whitelist,
      tessedit_pageseg_mode: psm,
    })
    ocrParamsRef.current = { whitelist, psm }
  }

  const toAbsoluteRectangle = (
    canvasWidth: number,
    canvasHeight: number,
    region: RelativeRegion,
  ) => ({
    left: Math.max(0, Math.round(canvasWidth * region.x)),
    top: Math.max(0, Math.round(canvasHeight * region.y)),
    width: Math.max(1, Math.round(canvasWidth * region.width)),
    height: Math.max(1, Math.round(canvasHeight * region.height)),
  })

  const createRegionCanvas = (frameCanvas: HTMLCanvasElement, region: RelativeRegion) => {
    const rect = toAbsoluteRectangle(frameCanvas.width, frameCanvas.height, region)
    const canvas = document.createElement('canvas')
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2

    const context = canvas.getContext('2d')
    if (!context) {
      return canvas
    }

    context.imageSmoothingEnabled = false
    context.drawImage(
      frameCanvas,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    return canvas
  }

  const createBinaryCanvas = (source: HTMLCanvasElement, invert = false) => {
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height

    const context = canvas.getContext('2d')
    if (!context) {
      return canvas
    }

    context.drawImage(source, 0, 0)
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const pixels = imageData.data

    for (let i = 0; i < pixels.length; i += 4) {
      const luminance = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
      const thresholded = luminance > 150 ? 255 : 0
      const value = invert ? 255 - thresholded : thresholded
      pixels[i] = value
      pixels[i + 1] = value
      pixels[i + 2] = value
    }

    context.putImageData(imageData, 0, 0)
    return canvas
  }

  const normalizeOcrText = (value: string) =>
    value
      .toUpperCase()
      .replace(/[|!]/g, '1')
      .replace(/[OQ]/g, '0')
      .replace(/S/g, '5')
      .replace(/Z/g, '2')
      .replace(/\s+/g, ' ')
      .trim()

  const readCandidates = async (
    frameCanvas: HTMLCanvasElement,
    region: RelativeRegion,
    whitelist: string,
    psmModes: Tesseract.PSM[],
    mustMatch?: RegExp,
  ) => {
    const worker = await getOcrWorker()
    const base = createRegionCanvas(frameCanvas, region)
    const variants = [base, createBinaryCanvas(base), createBinaryCanvas(base, true)]

    const reads: Array<{ text: string; confidence: number }> = []

    for (const variant of variants) {
      for (const psm of psmModes) {
        await setOcrParams(worker, whitelist, psm)
        const {
          data: { text, confidence },
        } = await worker.recognize(variant)

        const normalized = normalizeOcrText(text)
        reads.push({ text: normalized, confidence })

        if (mustMatch && mustMatch.test(normalized) && confidence >= 65) {
          return reads
        }
      }
    }

    return reads
  }

  const extractAmount = (texts: Array<{ text: string; confidence: number }>) => {
    let best: { value: string; confidence: number } | null = null

    for (const entry of texts) {
      const match = entry.text.match(/(?:^|\D)(10|20|50)(?:\D|$)/)
      if (!match) {
        continue
      }

      if (!best || entry.confidence > best.confidence) {
        best = { value: match[1], confidence: entry.confidence }
      }
    }

    return best?.value ?? null
  }

  const extractSerial = (texts: Array<{ text: string; confidence: number }>) => {
    let best: { value: string; score: number } | null = null

    for (const entry of texts) {
      const matches = entry.text.matchAll(/(\d{8,10})\s*([A-Z])?/g)
      for (const m of matches) {
        const digits = m[1]
        const suffix = m[2] ?? ''
        const value = suffix ? `${digits} ${suffix}` : digits
        const score = entry.confidence + (suffix === 'B' ? 20 : suffix ? 8 : 0) + digits.length

        if (!best || score > best.score) {
          best = { value, score }
        }
      }
    }

    return best?.value ?? null
  }

  const captureAndReadBill = async () => {
    if (!videoRef.current || !captureCanvasRef.current) {
      return
    }

    const video = videoRef.current
    const canvas = captureCanvasRef.current
    const width = video.videoWidth
    const height = video.videoHeight

    if (!width || !height) {
      setCameraError('No se pudo capturar imagen. Intenta nuevamente.')
      return
    }

    setIsReadingCamera(true)
    setShowRanges(false)
    setMatchedRangeKey(null)
    setCameraError('')
    setCameraStatus('')
    setResult({
      message: 'Validando billete...',
      status: 'loading',
    })

    try {
      const context = canvas.getContext('2d')
      if (!context) {
        setCameraError('No se pudo procesar la imagen de cámara.')
        return
      }

      canvas.width = width
      canvas.height = height
      context.drawImage(video, 0, 0, width, height)

      const amountReads = await readCandidates(
        canvas,
        AMOUNT_REGION,
        '0125',
        [Tesseract.PSM.SINGLE_WORD, Tesseract.PSM.SINGLE_LINE],
        /(?:^|\D)(10|20|50)(?:\D|$)/,
      )

      const serialReads = await readCandidates(
        canvas,
        SERIAL_RIGHT_REGION,
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        [Tesseract.PSM.SINGLE_LINE, Tesseract.PSM.SINGLE_WORD],
        /\d{8,10}(?:\s*[A-Z])?/,
      )

      const fallbackReads = await readCandidates(
        canvas,
        RIGHT_SIDE_FALLBACK_REGION,
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        [Tesseract.PSM.SPARSE_TEXT, Tesseract.PSM.SINGLE_BLOCK],
      )

      const detectedAmount = extractAmount([...amountReads, ...fallbackReads])
      const detectedSerial = extractSerial([...serialReads, ...fallbackReads])

      if (!detectedAmount || !detectedSerial) {
        setCameraStatus('No puedo reconocer tu billete, ingresa los datos manualmente')
        setResult({
          message: 'No puedo reconocer tu billete, ingresa los datos manualmente',
          status: 'error',
        })
        return
      }

      const normalizedSerial = sanitizeSerial(detectedSerial)
      setGroup(detectedAmount)
      setSerial(normalizedSerial)
      validateBill(detectedAmount, normalizedSerial)

      const { digits, suffix } = getSerialParts(normalizedSerial)
      const serialNumber = Number.parseInt(digits, 10)
      const isObservedByCamera =
        suffix === 'B' &&
        !Number.isNaN(serialNumber) &&
        (rangesByGroup[detectedAmount] ?? []).some(
          (range) => serialNumber >= range.start && serialNumber <= range.end,
        )

      if (isObservedByCamera) {
        setShowRanges(true)
      }

      setCameraStatus(`Detectado: Bs ${detectedAmount} / Serie ${normalizedSerial}`)
    } catch {
      setCameraError('No puedo reconocer tu billete, ingresa los datos manualmente')
      setResult({
        message: 'No puedo reconocer tu billete, ingresa los datos manualmente',
        status: 'error',
      })
      setCameraStatus('')
    } finally {
      setIsReadingCamera(false)
    }
  }

  const handleValidate = () => {
    if (isProcessing) {
      return
    }

    setIsManualValidating(true)
    setCameraError('')
    setCameraStatus('')
    setResult({
      message: 'Validando billete...',
      status: 'loading',
    })

    const serialWithAssumedB = manualSerialDigits ? `${manualSerialDigits} B` : ''
    setSerial(serialWithAssumedB)
    window.requestAnimationFrame(() => {
      validateBill(group, serialWithAssumedB)
      setIsManualValidating(false)
    })
  }

  const handleInstallApp = async () => {
    if (!installPromptEvent) {
      return
    }

    setIsInstalling(true)
    await installPromptEvent.prompt()
    await installPromptEvent.userChoice
    setInstallPromptEvent(null)
    setIsInstalling(false)
  }

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) {
      link.href = berificaLogo
    } else {
      const newLink = document.createElement('link')
      newLink.rel = 'icon'
      newLink.href = berificaLogo
      document.head.appendChild(newLink)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const groupFromQuery = params.get('monto')?.trim() ?? ''
    const serialFromQuery = sanitizeSerial(params.get('serie') ?? '')

    if (!groupFromQuery && !serialFromQuery) {
      return
    }

    setGroup(groupFromQuery)
    setSerial(serialFromQuery)
    validateBill(groupFromQuery, serialFromQuery)
  }, [])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPromptEvent(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => {
      setInstallPromptEvent(null)
      setIsInstalling(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    const videoElement = videoRef.current
    const stream = streamRef.current

    if (!isCameraOpen || !videoElement || !stream) {
      return
    }

    void (async () => {
      try {
        videoElement.srcObject = stream
        await videoElement.play()
      } catch {
        setCameraError('No se pudo mostrar la cámara. Intenta cerrar y abrir nuevamente.')
      }
    })()
  }, [isCameraOpen])

  useEffect(() => {
    if (!isCameraOpen) {
      return
    }

    void getOcrWorker()
  }, [isCameraOpen])

  useEffect(() => {
    if (mode === 'manual') {
      stopCameraStream()
      setCameraError('')
      setCameraStatus('')
    }
  }, [mode])

  useEffect(() => {
    if (!showRanges || mode !== 'automatic' || !rangesSectionRef.current) {
      return
    }

    rangesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showRanges, mode])

  useEffect(() => {
    return () => {
      stopCameraStream()
      if (ocrWorkerRef.current) {
        void ocrWorkerRef.current.terminate()
        ocrWorkerRef.current = null
      }
    }
  }, [])

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <span className="pill">B-erifica</span>
          {installPromptEvent && (
            <button
              type="button"
              className="install install-header"
              onClick={handleInstallApp}
              disabled={isInstalling}
            >
              {isInstalling ? 'Abriendo…' : 'Instalar app'}
            </button>
          )}
        </div>
        <h1>Verificador de billetes de serie <b>B</b></h1>
        <p>Verifica en segundos si un billete de la serie B está observado.</p>
      </header>

      <section className="info">
        <h2>¿Cómo usar? · {mode === 'manual' ? 'Modo manual' : 'Modo automático'}</h2>
        {mode === 'manual' ? (
          <p>
            1) Elige billete (10, 20 o 50) de serie B. 2) Ingresa solo los dígitos de serie. 3) Presiona "Validar".
          </p>
        ) : (
          <p>
            1) Abre la cámara. 2) Usa buena luz, evita reflejos y enfoca el lado derecho. 3)
            Presiona "Capturar y validar".
          </p>
        )}
      </section>

      <main className="card">
        <div className="mode-switch" role="tablist" aria-label="Modo de validación">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manual'}
            className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
            disabled={isProcessing}
          >
            Manual
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'automatic'}
            className={`mode-tab ${mode === 'automatic' ? 'active' : ''}`}
            onClick={() => setMode('automatic')}
            disabled={isProcessing}
          >
            Automático
          </button>
        </div>

        {mode === 'manual' && (
          <>
            <div className="field">
              <span id="group-label" className="field-label">Billete</span>
              <div className="bill-picker" role="radiogroup" aria-labelledby="group-label">
                {billOptions.map((option) => {
                  const selected = group === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`bill-option ${selected ? 'selected' : ''}`}
                      onClick={() => setGroup(option.value)}
                    >
                      <img src={option.image} alt={`Billete de ${option.label}`} loading="lazy" />
                      <span>{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="field">
              <label htmlFor="serial">Número de serie (serie B asumida)</label>
              <input
                id="serial"
                inputMode="numeric"
                maxLength={SERIAL_DIGITS_MAX_LENGTH}
                value={manualSerialDigits}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '').slice(0, SERIAL_DIGITS_MAX_LENGTH)
                  setSerial(digits ? `${digits} B` : '')
                }}
                placeholder="Ej. 274462658"
              />
            </div>

            <button type="button" className="primary" onClick={handleValidate}>
              {isManualValidating ? 'Validando…' : 'Validar'}
            </button>
          </>
        )}

        {mode === 'automatic' && (
          <div className="camera-panel">
            <div className="camera-header">
              <strong>Lectura con cámara</strong>
              {!isCameraOpen ? (
                <button
                  type="button"
                  className="install"
                  onClick={openCamera}
                  disabled={isStartingCamera}
                >
                  {isStartingCamera ? 'Abriendo cámara…' : 'Abrir cámara'}
                </button>
              ) : (
                <button type="button" className="install" onClick={stopCameraStream}>
                  Cerrar cámara
                </button>
              )}
            </div>

            <p className="camera-help">
              Billete plano y completo, buena luz, sin reflejos. Acerca el lado derecho y
              espera enfoque antes de capturar.
            </p>

            {isCameraOpen && (
              <>
                <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                <button
                  type="button"
                  className="primary"
                  onClick={captureAndReadBill}
                  disabled={isProcessing}
                >
                  {isReadingCamera ? 'Capturando y validando…' : 'Capturar y validar'}
                </button>
              </>
            )}

            {!isProcessing && cameraStatus && <div className="camera-status">{cameraStatus}</div>}
            {!isProcessing && cameraError && <div className="camera-error">{cameraError}</div>}
            <canvas ref={captureCanvasRef} className="camera-canvas" aria-hidden="true" />
          </div>
        )}

        <div className={`result ${result.status}`}>
          {result.status === 'loading' ? (
            <span className="result-loading">
              <span className="result-spinner" aria-hidden="true" />
              Validando billete...
            </span>
          ) : (
            result.message
          )}
        </div>

        {showRanges && (
          <button type="button" className="link" onClick={() => setShowRanges(false)}>
            Ocultar rangos
          </button>
        )}

        {!showRanges && hasValidGroupSelection && (
          <button type="button" className="link" onClick={() => setShowRanges(true)}>
            Ver rangos de serie inválidos
          </button>
        )}
      </main>

      {showRanges && (
        <section className="ranges" ref={rangesSectionRef}>
          <h2>Rangos de serie inválidos para {group} Bs.</h2>
          <ul>
            {rangesForGroup.map((range) => (
              <li
                key={`${range.start}-${range.end}`}
                className={matchedRangeKey === `${range.start}-${range.end}` ? 'matched' : ''}
              >
                {range.start} - {range.end}
              </li>
            ))}
          </ul>
          <a
            className="source"
            href="https://www.bcb.gob.bo/?q=content/verificador-de-n%C3%BAmero-de-serie"
            target="_blank"
            rel="noreferrer"
          >
            Ver fuente de datos (BCB)
          </a>
        </section>
      )}

      {validationHistory.length > 0 && (
        <section className="history" aria-label="Historial de validaciones">
          <h3>Historial</h3>
          <table>
            <thead>
              <tr>
                <th>Monto</th>
                <th>Serie</th>
                <th>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {validationHistory.map((entry) => (
                <tr
                  key={entry.id}
                  className={
                    `${entry.amount}::${entry.serie}::${entry.isOk ? 'ok' : 'nok'}` ===
                    latestValidationKey
                      ? 'latest'
                      : ''
                  }
                >
                  <td>{entry.amount}</td>
                  <td>{entry.serie}</td>
                  <td aria-label={entry.isOk ? 'OK' : 'NOK'}>
                    <span className={`history-icon ${entry.isOk ? 'ok' : 'nok'}`}>
                      {entry.isOk ? '✓' : '✕'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="disclaimer">
        <h3>Aviso importante</h3>
        <p>
          Los rangos de validación se basan en datos del{' '}
          <a
            href="https://www.bcb.gob.bo/?q=content/verificador-de-n%C3%BAmero-de-serie"
            target="_blank"
            rel="noreferrer"
          >
            Banco Central de Bolivia
          </a>
          . Esta herramienta se proporciona con carácter informativo. Alenasoft no asume
          responsabilidad por pérdidas económicas resultantes del uso de esta aplicación. Se
          recomienda verificar la información directamente con el BCB para transacciones de
          alto valor.
        </p>
      </section>

      <footer className="footer">
        Desarrollado por{' '}
        <a href="https://alenasoft.com" target="_blank" rel="noreferrer">
          alenasoft.com
        </a>
      </footer>
    </div>
  )
}

export default App
