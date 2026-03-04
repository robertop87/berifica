import type { RelativeRegion } from '../types'

export const toAbsoluteRectangle = (
  canvasWidth: number,
  canvasHeight: number,
  region: RelativeRegion,
) => ({
  left: Math.max(0, Math.round(canvasWidth * region.x)),
  top: Math.max(0, Math.round(canvasHeight * region.y)),
  width: Math.max(1, Math.round(canvasWidth * region.width)),
  height: Math.max(1, Math.round(canvasHeight * region.height)),
})

// Crops and upscales a relative region from a frame canvas by 3×.
// 3× upscale: serial strips can be ~80-120 px tall in a 720p frame;
// Tesseract LSTM needs ≥150 px character height for reliable results.
export const createRegionCanvas = (
  frameCanvas: HTMLCanvasElement,
  region: RelativeRegion,
): HTMLCanvasElement => {
  const rect = toAbsoluteRectangle(frameCanvas.width, frameCanvas.height, region)
  const canvas = document.createElement('canvas')
  canvas.width = rect.width * 3
  canvas.height = rect.height * 3

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(frameCanvas, rect.left, rect.top, rect.width, rect.height, 0, 0, canvas.width, canvas.height)

  return canvas
}

// Otsu's method: automatically finds the threshold that maximises inter-class
// variance between text and background. Robust across lighting conditions.
export const computeOtsuThreshold = (pixels: Uint8ClampedArray): number => {
  const hist = new Int32Array(256)
  const total = pixels.length / 4
  for (let i = 0; i < pixels.length; i += 4) {
    hist[pixels[i]]++
  }

  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]

  let sumB = 0, wB = 0, maxVar = 0, threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const variance = wB * wF * (mB - mF) ** 2
    if (variance > maxVar) { maxVar = variance; threshold = t }
  }

  return threshold
}

// Gaussian blur (3×3 kernel) — reduces camera noise before thresholding so noise
// pixels don't fragment character strokes.
export const createGaussianBlurCanvas = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.drawImage(source, 0, 0)
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const dst = ctx.createImageData(canvas.width, canvas.height)
  const w = canvas.width, h = canvas.height
  const s = src.data, d = dst.data

  // 3×3 Gaussian weights: 1/16 * [1,2,1; 2,4,2; 1,2,1]
  const kw = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const dx = [-1, 0, 1, -1, 0, 1, -1, 0, 1]
  const dy = [-1, -1, -1, 0, 0, 0, 1, 1, 1]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      for (let k = 0; k < 9; k++) {
        const nx = Math.min(w - 1, Math.max(0, x + dx[k]))
        const ny = Math.min(h - 1, Math.max(0, y + dy[k]))
        r += kw[k] * s[(ny * w + nx) * 4]
      }
      const v = Math.round(r / 16)
      const i = (y * w + x) * 4
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255
    }
  }

  ctx.putImageData(dst, 0, 0)
  return canvas
}

// Otsu-based binarization. Operates on grayscale (single-channel) input.
export const createBinaryCanvas = (source: HTMLCanvasElement, invert = false): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.drawImage(source, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imageData.data
  const threshold = computeOtsuThreshold(pixels)

  for (let i = 0; i < pixels.length; i += 4) {
    const thresholded = pixels[i] > threshold ? 255 : 0
    const value = invert ? 255 - thresholded : thresholded
    pixels[i] = value; pixels[i + 1] = value; pixels[i + 2] = value
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// 8-connected Laplacian sharpening: [-1,-1,-1; -1,9,-1; -1,-1,-1].
// Makes character strokes crisper before binarization.
export const createSharpenedCanvas = (source: HTMLCanvasElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.drawImage(source, 0, 0)
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const dst = ctx.createImageData(canvas.width, canvas.height)
  const w = canvas.width, h = canvas.height
  const s = src.data, d = dst.data
  const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1]

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

  ctx.putImageData(dst, 0, 0)
  return canvas
}

// Picks the single R/G/B channel with the highest variance (= most contrast
// between text and background). Avoids luminance averaging that cancels
// color-encoded contrast (e.g. blue text on blue background).
export const createBestChannelCanvas = (source: HTMLCanvasElement): HTMLCanvasElement => {
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
      const delta = px[i + c] - means[c]
      variances[c] += delta * delta
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
