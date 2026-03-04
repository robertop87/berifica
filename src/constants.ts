import type { Range, RelativeRegion } from './types'
import bill10 from './assets/10.jpg'
import bill20 from './assets/20.jpg'
import bill50 from './assets/50.jpg'

export const rangesByGroup: Record<string, Range[]> = {
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

export const billOptions = [
  { value: '50', label: 'Bs 50', image: bill50 },
  { value: '20', label: 'Bs 20', image: bill20 },
  { value: '10', label: 'Bs 10', image: bill10 },
]

export const groupOptions = billOptions.map((option) => option.value)

export const SERIAL_DIGITS_MAX_LENGTH = 12

// Relative region for the serial number strip.
// When the user fills the viewfinder with just the serial area, the strip
// covers nearly the full frame — generous margins absorb slight mis-framing.
// Camera is 1280×720 (16:9). The viewfinder displays it with aspect-ratio 4:1 and
// object-fit: cover, which center-crops the frame vertically to the middle 44% of
// its height (visible band: y ≈ 0.28 → 0.72). The region must match that window
// exactly so the OCR sees only what the user sees in the green box.
export const SERIAL_RIGHT_REGION: RelativeRegion = { x: 0.02, y: 0.28, width: 0.96, height: 0.44 }
