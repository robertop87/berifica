type OcrRead = { text: string; confidence: number }

export const normalizeOcrText = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[|!lI]/g, '1')
    .replace(/[OQ]/g, '0')
    // Replace S→5 / Z→2 only when sandwiched between digits
    .replace(/(?<=\d)[SsZz](?=\d)/g, (c) => (c.toLowerCase() === 's' ? '5' : '2'))
    .replace(/\s+/g, ' ')
    .trim()

export const extractAmount = (reads: OcrRead[]): string | null => {
  let best: { value: string; confidence: number } | null = null

  for (const { text, confidence } of reads) {
    const match = text.match(/(?:^|\D)(10|20|50)(?:\D|$)/)
    if (!match) continue
    if (!best || confidence > best.confidence) {
      best = { value: match[1], confidence }
    }
  }

  return best?.value ?? null
}

// Extracts only the serie-type letter (A/B/C) from OCR reads, without needing
// the full digit string. Used to decide whether to proceed with range validation.
export const extractSerialSuffix = (reads: OcrRead[]): string => {
  for (const { text } of reads) {
    // Collapse OCR-inserted spaces within digit runs first
    const collapsed = text.replace(/(\d)\s+(\d)/g, '$1$2').replace(/(\d)\s+(\d)/g, '$1$2')
    const match = collapsed.match(/(\d{5,12})\s*([ABC])(?!\w)/)
    if (match) return match[2]
    // A commonly confused with 4 at end of digit string
    if (/\d{5,11}4(?!\d)/.test(collapsed)) return 'A'
  }
  return ''
}

export const extractSerial = (reads: OcrRead[]): string | null => {
  let best: { value: string; score: number } | null = null

  const consider = (digits: string, suffix: string, confidence: number, bonus: number) => {
    if (digits.length < 5 || digits.length > 12) return
    const value = suffix ? `${digits} ${suffix}` : digits
    const score = confidence + bonus + Math.min(digits.length, 10)
    if (!best || score > best.score) {
      best = { value, score }
    }
  }

  for (const { text, confidence } of reads) {
    // Collapse OCR-inserted spaces within digit runs (e.g. '181 590370' → '181590370')
    const normalized = text
      .replace(/(\d)\s+(\d)/g, '$1$2')
      .replace(/(\d)\s+(\d)/g, '$1$2')

    // Pass 1 — standard format: DIGITS [space] A|B|C
    for (const m of normalized.matchAll(/(\d{5,12})\s*([ABC])/g)) {
      const suffix = m[2]
      consider(m[1], suffix, confidence, suffix === 'B' ? 20 : 10)
    }

    // Pass 2 — A confused with 4 at end
    for (const m of normalized.matchAll(/(\d{5,11})4(?!\d)/g)) {
      consider(m[1], 'A', confidence, 5)
    }

    // Pass 3 — pure digit string (no suffix detected)
    for (const m of normalized.matchAll(/(\d{5,12})(?!\d|[A-Z])/g)) {
      consider(m[1], '', confidence, 0)
    }
  }

  return (best as { value: string; score: number } | null)?.value ?? null
}
