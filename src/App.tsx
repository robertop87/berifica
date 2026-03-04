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
const SERIAL_DIGITS_MAX_LENGTH = 12

const AMOUNT_REGION: RelativeRegion = { x: 0.68, y: 0.62, width: 0.28, height: 0.32 }
const SERIAL_RIGHT_REGION: RelativeRegion = { x: 0.5, y: 0.06, width: 0.45, height: 0.22 }

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
    // Disable all language model DAWGs — we work with alphanumeric patterns only.
    // This significantly speeds up recognition and avoids dictionary-biased corrections.
    await worker.setParameters({
      user_defined_dpi: '300',
      load_system_dawg: '0',
      load_freq_dawg: '0',
      load_punc_dawg: '0',
      load_number_dawg: '0',
      load_bigram_dawg: '0',
      load_unambig_dawg: '0',
      load_fixed_length_dawgs: '0',
      load_extra_dawgs: '0',
      // Better LSTM output: emit all character alternatives up to rank 2
      lstm_choice_mode: '2',
      // Suppress small dot-noise that binarized camera frames often produce
      textord_heavy_nr: '1',
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
    // 3× upscale: camera frames are ~720-1080 p, so serial strips can be as narrow as
    // 100 px — Tesseract LSTM needs ≥150 px text height for reliable results.
    // 2× upscale: enough for Tesseract LSTM while keeping the sharpening kernel fast.
    // 3× was slower with no meaningful accuracy gain on camera-quality frames.
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2

    const context = canvas.getContext('2d')
    if (!context) {
      return canvas
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
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

  // threshold: 0-255. Lower value keeps more dark pixels as text (good for dark-on-light).
  const createBinaryCanvas = (source: HTMLCanvasElement, invert = false, threshold = 150) => {
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
      const thresholded = luminance > threshold ? 255 : 0
      const value = invert ? 255 - thresholded : thresholded
      pixels[i] = value
      pixels[i + 1] = value
      pixels[i + 2] = value
    }

    context.putImageData(imageData, 0, 0)
    return canvas
  }

  // Unsharp-mask style sharpen: emphasises edges so binarization produces cleaner strokes.
  // Uses the classic 3×3 Laplacian kernel [-1,-1,-1; -1,9,-1; -1,-1,-1].
  const createSharpenedCanvas = (source: HTMLCanvasElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height

    const context = canvas.getContext('2d')
    if (!context) {
      return canvas
    }

    context.drawImage(source, 0, 0)
    const src = context.getImageData(0, 0, canvas.width, canvas.height)
    const dst = context.createImageData(canvas.width, canvas.height)
    const w = canvas.width
    const h = canvas.height
    const s = src.data
    const d = dst.data
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        for (let c = 0; c < 3; c++) {
          const tl = s[(Math.max(0, y - 1) * w + Math.max(0, x - 1)) * 4 + c]
          const tc = s[(Math.max(0, y - 1) * w + x) * 4 + c]
          const tr = s[(Math.max(0, y - 1) * w + Math.min(w - 1, x + 1)) * 4 + c]
          const ml = s[(y * w + Math.max(0, x - 1)) * 4 + c]
          const mc = s[i + c]
          const mr = s[(y * w + Math.min(w - 1, x + 1)) * 4 + c]
          const bl = s[(Math.min(h - 1, y + 1) * w + Math.max(0, x - 1)) * 4 + c]
          const bc = s[(Math.min(h - 1, y + 1) * w + x) * 4 + c]
          const br = s[(Math.min(h - 1, y + 1) * w + Math.min(w - 1, x + 1)) * 4 + c]
          const samples = [tl, tc, tr, ml, mc, mr, bl, bc, br]
          let sum = 0
          for (let k = 0; k < 9; k++) sum += kernel[k] * samples[k]
          d[i + c] = Math.min(255, Math.max(0, sum))
        }
        d[i + 3] = 255
      }
    }

    context.putImageData(dst, 0, 0)
    return canvas
  }

  // Contrast stretching: remaps the ROI’s full luminance range to 0–255.
  // Critical for colored-serial bills (e.g. 50 Bs: dark purple on lavender) where
  // text and background have similar absolute luminance values.
  const createContrastStretchedCanvas = (source: HTMLCanvasElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas

    ctx.drawImage(source, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = imageData.data

    let lo = 255, hi = 0
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      if (lum < lo) lo = lum
      if (lum > hi) hi = lum
    }
    const range = hi - lo || 1
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      const v = Math.round(((lum - lo) / range) * 255)
      px[i] = v; px[i + 1] = v; px[i + 2] = v
    }
    ctx.putImageData(imageData, 0, 0)
    return canvas
  }

  // Best-channel extraction: picks the single R/G/B channel with the highest variance
  // (= most contrast between text and background). Avoids luminance averaging that
  // cancels out color-encoded contrast (e.g. blue text on blue background).
  const createBestChannelCanvas = (source: HTMLCanvasElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas

    ctx.drawImage(source, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = imageData.data
    const n = px.length / 4

    const means = [0, 0, 0]
    for (let i = 0; i < px.length; i += 4) {
      means[0] += px[i]; means[1] += px[i + 1]; means[2] += px[i + 2]
    }
    means[0] /= n; means[1] /= n; means[2] /= n

    const variances = [0, 0, 0]
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const d = px[i + c] - means[c]
        variances[c] += d * d
      }
    }
    const best = variances.indexOf(Math.max(...variances))

    for (let i = 0; i < px.length; i += 4) {
      const v = px[i + best]
      px[i] = v; px[i + 1] = v; px[i + 2] = v
    }
    ctx.putImageData(imageData, 0, 0)
    return canvas
  }

  const normalizeOcrText = (value: string) =>
    value
      .toUpperCase()
      // Common single-char OCR substitutions for digit-like glyphs
      .replace(/[|!lI]/g, '1')
      .replace(/[OQ]/g, '0')
      // Only replace S→5 / Z→2 when sandwiched between digits
      .replace(/(?<=\d)[SsZz](?=\d)/g, (c) => (c.toLowerCase() === 's' ? '5' : '2'))
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
    const sharpened = createSharpenedCanvas(base)

    // Three preprocessing variants ordered from most likely to succeed to most aggressive.
    // Using sharpened as base improves edge quality before binarization.
    //  1. Binary 140   — reliable for dark print on light background.
    //  2. Binary 180   — catches lighter/thinner text on pale backgrounds.
    //  3. Sharpened     — full colour, LSTM decides on its own.
    const variants = [
      createBinaryCanvas(sharpened, false, 140),
      createBinaryCanvas(sharpened, false, 180),
      sharpened,
    ]

    const reads: Array<{ text: string; confidence: number }> = []

    for (const variant of variants) {
      for (const psm of psmModes) {
        await setOcrParams(worker, whitelist, psm)
        const { data: { text, confidence } } = await worker.recognize(variant)
        const normalized = normalizeOcrText(text)
        reads.push({ text: normalized, confidence })
        if (mustMatch && mustMatch.test(normalized) && confidence >= 60) return reads
      }
    }
    return reads
  }

  // Serial-specific reader: adds contrast-stretched and best-channel variants on top
  // of the standard ones. The extra variants are essential for colored-background bills
  // (50 Bs purple, 10 Bs blue) where luminance-only binarization fails.
  const readSerialCandidates = async (
    frameCanvas: HTMLCanvasElement,
    region: RelativeRegion,
    mustMatch?: RegExp,
  ) => {
    const worker = await getOcrWorker()
    const base = createRegionCanvas(frameCanvas, region)
    const sharpened = createSharpenedCanvas(base)
    const stretched = createContrastStretchedCanvas(base)
    const bestCh = createBestChannelCanvas(base)

    // Six variants — color-aware ones first, luminance-only as fallback
    const variants = [
      createBinaryCanvas(stretched, false, 128),   // stretched → binary at midpoint
      createBinaryCanvas(bestCh, false, 128),       // best channel → binary
      createBinaryCanvas(bestCh, false, 160),       // best channel, higher threshold
      createBinaryCanvas(sharpened, false, 140),    // sharpened luminance
      createBinaryCanvas(sharpened, false, 170),    // sharpened, lighter text
      sharpened,                                    // raw sharpened colour
    ]
    const psmModes = [Tesseract.PSM.SINGLE_LINE, Tesseract.PSM.RAW_LINE]
    const whitelist = '0123456789ABC'
    const reads: Array<{ text: string; confidence: number }> = []

    for (const variant of variants) {
      for (const psm of psmModes) {
        await setOcrParams(worker, whitelist, psm)
        const { data: { text, confidence } } = await worker.recognize(variant)
        const normalized = normalizeOcrText(text)
        reads.push({ text: normalized, confidence })
        // Accept at lower threshold (55) — serial LSTM confidence on small prints is inherently lower
        if (mustMatch && mustMatch.test(normalized) && confidence >= 55) return reads
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

  // Extracts only the serie-type letter (A/B/C) from OCR reads, without needing the
  // full digit string. Used in Phase 2 to gate processing before the heavier digit parse.
  const extractSerialSuffix = (texts: Array<{ text: string; confidence: number }>): string => {
    for (const { text } of texts) {
      // Collapse OCR-inserted spaces within digit runs first
      const collapsed = text.replace(/(\d)\s+(\d)/g, '$1$2').replace(/(\d)\s+(\d)/g, '$1$2')
      const m1 = collapsed.match(/(\d{5,12})\s*([ABC])(?!\w)/)
      if (m1) return m1[2]
      if (/\d{5,11}4(?!\d)/.test(collapsed)) return 'A'
    }
    return ''
  }

  const extractSerial = (texts: Array<{ text: string; confidence: number }>) => {
    let best: { value: string; score: number } | null = null

    const consider = (digits: string, suffix: string, confidence: number, bonus: number) => {
      if (digits.length < 5 || digits.length > 12) return
      const value = suffix ? `${digits} ${suffix}` : digits
      const score = confidence + bonus + Math.min(digits.length, 10)
      if (!best || score > best.score) {
        best = { value, score }
      }
    }

    for (const entry of texts) {
      const { confidence } = entry
      // Collapse OCR-inserted spaces within digit runs (e.g. '181 590370' → '181590370')
      // Apply twice to handle alternating digit-space-digit-space patterns
      const text = entry.text
        .replace(/(\d)\s+(\d)/g, '$1$2')
        .replace(/(\d)\s+(\d)/g, '$1$2')

      // Pass 1 — standard format: DIGITS [space] A|B|C
      for (const m of text.matchAll(/(\d{5,12})\s*([ABC])/g)) {
        const suffix = m[2]
        consider(m[1], suffix, confidence, suffix === 'B' ? 20 : 10)
      }

      // Pass 2 — A confused with 4 at end
      for (const m of text.matchAll(/(\d{5,11})4(?!\d)/g)) {
        consider(m[1], 'A', confidence, 5)
      }

      // Pass 3 — pure digit string (no suffix detected)
      for (const m of text.matchAll(/(\d{5,12})(?!\d|[A-Z])/g)) {
        consider(m[1], '', confidence, 0)
      }
    }

    return (best as { value: string; score: number } | null)?.value ?? null
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

      // ── Phase 1: Detect denomination ─────────────────────────────────────────────────
      // Cheapest scan: small region, tightest whitelist, exits early on match.
      setResult({ message: 'Fase 1/3: Leyendo monto del billete…', status: 'loading' })

      const amountReads = await readCandidates(
        canvas,
        AMOUNT_REGION,
        '01250',
        [Tesseract.PSM.SINGLE_WORD, Tesseract.PSM.SINGLE_LINE],
        /(?:^|\D)(10|20|50)(?:\D|$)/,
      )

      let finalAmount = extractAmount(amountReads)

      if (finalAmount == null) {
        const AMOUNT_WIDE_REGION: RelativeRegion = { x: 0.55, y: 0.55, width: 0.44, height: 0.44 }
        const fallbackAmountReads = await readCandidates(
          canvas,
          AMOUNT_WIDE_REGION,
          '01250',
          [Tesseract.PSM.SINGLE_BLOCK, Tesseract.PSM.SPARSE_TEXT],
        )
        finalAmount = extractAmount(fallbackAmountReads)
      }

      if (finalAmount == null) {
        setResult({ message: '⚠️ No se pudo leer el monto del billete. Usa el modo manual para ingresar los datos.', status: 'error' })
        setCameraStatus('No puedo reconocer el monto. Usa el modo manual.')
        return
      }

      if (!groupOptions.includes(finalAmount)) {
        setResult({ message: `⚠️ Se detectó Bs ${finalAmount}, que no es 10, 20 ni 50. Verifica el billete o usa el modo manual.`, status: 'error' })
        setCameraStatus(`Detectado: Bs ${finalAmount} — verifica o usa el modo manual`)
        return
      }

      // ── Phase 2: Detect serie type (A / B / C) ────────────────────────────────────────
      // Uses the color-aware readSerialCandidates; reuses reads in Phase 3.
      setResult({ message: 'Fase 2/3: Verificando tipo de serie…', status: 'loading' })

      const serialReads = await readSerialCandidates(
        canvas,
        SERIAL_RIGHT_REGION,
        /\d{5,12}(?:\s*[ABC])?/,
      )

      const detectedSuffix = extractSerialSuffix(serialReads)

      if (detectedSuffix !== 'B') {
        const suffixLabel = detectedSuffix || 'desconocida'
        setResult({ message: `⚠️ Se detectó serie ${suffixLabel}, no serie B. Verifica el billete o usa el modo manual.`, status: 'error' })
        setCameraStatus(`Detectado: Bs ${finalAmount} / Serie ${suffixLabel} — verifica o usa el modo manual`)
        return
      }

      // ── Phase 3: Extract serial digits and validate ───────────────────────────────────
      // Reuses the serialReads from Phase 2 — no extra OCR call needed.
      setResult({ message: 'Fase 3/3: Validando número de serie…', status: 'loading' })

      let finalSerial = extractSerial(serialReads)

      if (finalSerial == null) {
        const SERIAL_WIDE_REGION: RelativeRegion = { x: 0.45, y: 0.0, width: 0.55, height: 0.35 }
        const fallbackSerialReads = await readSerialCandidates(canvas, SERIAL_WIDE_REGION)
        finalSerial = extractSerial(fallbackSerialReads)
      }

      if (finalSerial == null) {
        setResult({ message: 'No puedo reconocer tu billete, ingresa los datos manualmente', status: 'error' })
        setCameraStatus('No puedo reconocer el número de serie. Ingresa los datos manualmente.')
        return
      }

      const normalizedSerial = sanitizeSerial(finalSerial)
      setGroup(finalAmount)
      setSerial(normalizedSerial)
      validateBill(finalAmount, normalizedSerial)

      const { digits, suffix } = getSerialParts(normalizedSerial)
      const serialNumber = Number.parseInt(digits, 10)
      const isObservedByCamera =
        suffix === 'B' &&
        !Number.isNaN(serialNumber) &&
        (rangesByGroup[finalAmount] ?? []).some(
          (range) => serialNumber >= range.start && serialNumber <= range.end,
        )

      if (isObservedByCamera) {
        setShowRanges(true)
      }

      setCameraStatus(`Detectado: Bs ${finalAmount} / Serie ${normalizedSerial}`)
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
          <>
            <ol className="camera-steps">
              <li>Coloca el billete plano, con el <strong>lado derecho</strong> apuntando a la cámara.</li>
              <li>Acerca hasta que la serie (arriba) y el monto (abajo) queden dentro de los recuadros.</li>
              <li><strong>Sin sombras</strong> sobre la serie ni el monto — apunta la luz desde arriba.</li>
              <li>Espera que enfoque y presiona <strong>Capturar y validar</strong>.</li>
            </ol>
            <p className="mode-disclaimer">⚠ Modo experimental — el reconocimiento puede fallar según la iluminación o el ángulo. Si no detecta correctamente, usa el <strong>modo manual</strong>.</p>
          </>
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
              Lado derecho del billete dentro del encuadre. Verde = serie · Naranja = monto.
            </p>

            {isCameraOpen && (
              <>
                <div className="camera-viewfinder">
                  <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                  <div className="camera-guide-overlay" aria-hidden="true">
                    <div className="camera-zone camera-zone-serial">
                      <span className="camera-zone-label">SERIE</span>
                    </div>
                    <div className="camera-zone camera-zone-amount">
                      <span className="camera-zone-label">MONTO</span>
                    </div>
                  </div>
                </div>
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
              {result.message}
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
