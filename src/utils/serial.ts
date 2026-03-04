import { SERIAL_DIGITS_MAX_LENGTH } from '../constants'

export const sanitizeSerial = (value: string): string => {
  const cleaned = value.toUpperCase().replace(/[^0-9A-Z]/g, '')
  const digits = cleaned.replace(/\D/g, '').slice(0, SERIAL_DIGITS_MAX_LENGTH)
  const suffix = cleaned.match(/[A-Z]/)?.[0] ?? ''

  if (!digits) {
    return suffix ? suffix : ''
  }

  return suffix ? `${digits} ${suffix}` : digits
}

export const getSerialParts = (value: string) => {
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
