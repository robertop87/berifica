import { useEffect, useRef } from 'react'
import Tesseract from 'tesseract.js'
import type { RelativeRegion } from '../types'
import {
  createRegionCanvas,
  createBestChannelCanvas,
  createGaussianBlurCanvas,
  createSharpenedCanvas,
  createBinaryCanvas,
} from '../utils/imageProcessing'
import { normalizeOcrText } from '../utils/ocr'

export function useOcrWorker() {
  const workerRef = useRef<Tesseract.Worker | null>(null)
  const paramsRef = useRef<{ whitelist: string; psm: Tesseract.PSM } | null>(null)

  const getWorker = async (): Promise<Tesseract.Worker> => {
    if (workerRef.current) return workerRef.current

    const worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY)

    // Disable language-model DAWGs — we match alphanumeric patterns, not words.
    // DPI=200: camera frames are ~72 dpi; 3× upscale gives ~216 dpi effective.
    // tessedit_do_invert: '0' skips auto-invert detection — saves ~80 ms.
    // classify_bln_numeric_mode: '0' — keep letter recognition for A/B/C suffixes.
    await worker.setParameters({
      user_defined_dpi: '200',
      load_system_dawg: '0',
      load_freq_dawg: '0',
      load_punc_dawg: '0',
      load_number_dawg: '0',
      load_bigram_dawg: '0',
      load_unambig_dawg: '0',
      load_fixed_length_dawgs: '0',
      load_extra_dawgs: '0',
      tessedit_do_invert: '0',
      classify_bln_numeric_mode: '0',
    })

    workerRef.current = worker
    paramsRef.current = null
    return worker
  }

  const setParams = async (
    worker: Tesseract.Worker,
    whitelist: string,
    psm: Tesseract.PSM,
  ): Promise<void> => {
    const current = paramsRef.current
    if (current && current.whitelist === whitelist && current.psm === psm) return

    await worker.setParameters({
      tessedit_char_whitelist: whitelist,
      tessedit_pageseg_mode: psm,
    })
    paramsRef.current = { whitelist, psm }
  }

  // Pipeline: best-channel → Gaussian denoise → sharpen → Otsu binary.
  // Three passes to handle varied lighting and bill color:
  //   1. Dark-text-on-light  (standard binary)  + PSM.SINGLE_LINE
  //   2. Light-text-on-dark  (inverted binary)  + PSM.SINGLE_LINE
  //   3. Grayscale only (no binarization)       + PSM.SPARSE_TEXT  ← most forgiving
  const readSerialCandidates = async (
    frameCanvas: HTMLCanvasElement,
    region: RelativeRegion,
  ): Promise<Array<{ text: string; confidence: number }>> => {
    const worker = await getWorker()
    const base = createRegionCanvas(frameCanvas, region)
    const bestCh = createBestChannelCanvas(base)
    const denoised = createGaussianBlurCanvas(bestCh)
    const sharpened = createSharpenedCanvas(denoised)

    const results: Array<{ text: string; confidence: number }> = []

    // Pass 1 — dark text on light background
    const binary = createBinaryCanvas(sharpened)
    await setParams(worker, '0123456789ABC', Tesseract.PSM.SINGLE_LINE)
    const r1 = await worker.recognize(binary)
    results.push({ text: normalizeOcrText(r1.data.text), confidence: r1.data.confidence })

    // Pass 2 — inverted: catches bills with light serial on dark background
    const inverted = createBinaryCanvas(sharpened, true)
    await setParams(worker, '0123456789ABC', Tesseract.PSM.SINGLE_LINE)
    const r2 = await worker.recognize(inverted)
    results.push({ text: normalizeOcrText(r2.data.text), confidence: r2.data.confidence })

    // Pass 3 — grayscale, no binarization, SPARSE_TEXT: most tolerant of tilt and noise
    await setParams(worker, '0123456789ABC', Tesseract.PSM.SPARSE_TEXT)
    const r3 = await worker.recognize(bestCh)
    results.push({ text: normalizeOcrText(r3.data.text), confidence: r3.data.confidence })

    return results
  }

  // Pre-warm on mount so the first capture doesn't pay the ~300 ms init cost.
  useEffect(() => {
    void getWorker()

    return () => {
      if (workerRef.current) {
        void workerRef.current.terminate()
        workerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { readSerialCandidates }
}
