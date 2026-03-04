import { useMemo, useRef, useState } from 'react'
import type { ResultState, ValidationHistoryEntry } from '../types'
import { groupOptions, rangesByGroup } from '../constants'
import { getSerialParts } from '../utils/serial'

export function useBillValidation() {
  const [group, setGroup] = useState('')
  const [serial, setSerial] = useState('')
  const [showRanges, setShowRanges] = useState(false)
  const [matchedRangeKey, setMatchedRangeKey] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState>({
    message: 'ℹ️ Ingresa los datos para validar.',
    status: 'neutral',
  })
  const [validationHistory, setValidationHistory] = useState<ValidationHistoryEntry[]>([])
  const [latestValidationKey, setLatestValidationKey] = useState<string | null>(null)

  const rangesSectionRef = useRef<HTMLElement | null>(null)

  const rangesForGroup = useMemo(() => rangesByGroup[group] ?? [], [group])
  const hasValidGroupSelection = groupOptions.includes(group.trim())

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

      if (alreadyExists) return previous

      return [
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          amount: normalizedAmount,
          serie: normalizedSerie,
          isOk,
        },
        ...previous,
      ]
    })
  }

  const validateBill = (groupInput: string, serialInput: string) => {
    setShowRanges(false)
    setMatchedRangeKey(null)

    const groupValue = groupInput.trim()
    const { normalized: serialValue, digits: serialDigits, suffix: serialSuffix } =
      getSerialParts(serialInput.trim())

    if (!groupOptions.includes(groupValue) || serialSuffix !== 'B') {
      setResult({ message: 'ℹ️ Billete no es serie B, no necesita validación. Es válido.', status: 'success' })
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

  return {
    group,
    setGroup,
    serial,
    setSerial,
    showRanges,
    setShowRanges,
    matchedRangeKey,
    result,
    setResult,
    validationHistory,
    latestValidationKey,
    rangesForGroup,
    hasValidGroupSelection,
    rangesSectionRef,
    validateBill,
  }
}
