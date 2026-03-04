import { useEffect, useMemo, useState } from 'react'
import './App.css'
import berificaLogo from './assets/berifica_logo.png'
import bill10 from './assets/10.jpg'
import bill20 from './assets/20.jpg'
import bill50 from './assets/50.jpg'

type Range = { start: number; end: number }

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
const SERIAL_MAX_LENGTH = 12

const sanitizeSerial = (value: string) => value.replace(/\D/g, '').slice(0, SERIAL_MAX_LENGTH)

type ResultState = {
  message: string
  status: 'neutral' | 'success' | 'error'
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

function App() {
  const [group, setGroup] = useState('')
  const [serial, setSerial] = useState('')
  const [showRanges, setShowRanges] = useState(false)
  const [matchedRangeKey, setMatchedRangeKey] = useState<string | null>(null)
  const [installPromptEvent, setInstallPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalling, setIsInstalling] = useState(false)
  const [validationHistory, setValidationHistory] = useState<ValidationHistoryEntry[]>([])
  const [latestValidationKey, setLatestValidationKey] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState>({
    message: 'ℹ️ Ingresa los datos para validar.',
    status: 'neutral',
  })

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

  const rangesForGroup = useMemo(() => rangesByGroup[group] ?? [], [group])
  const hasValidGroupSelection = groupOptions.includes(group.trim())

  const validateBill = (groupInput: string, serialInput: string) => {
    setShowRanges(false)
    setMatchedRangeKey(null)
    const groupValue = groupInput.trim()
    const serialValue = sanitizeSerial(serialInput.trim())

    if (!groupOptions.includes(groupValue)) {
      setResult({
        message: '⚠️ Selecciona un monto válido: 50, 20 o 10.',
        status: 'error',
      })
      addValidationToHistory(groupValue, serialValue, false)
      return
    }

    const serialNumber = Number.parseInt(serialValue, 10)
    if (Number.isNaN(serialNumber)) {
      setResult({ message: '⚠️ Ingresa un número de serie válido.', status: 'error' })
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
    } else {
      setResult({ message: '✅ Billete no observado.', status: 'success' })
      addValidationToHistory(groupValue, serialValue, true)
    }
  }

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

  const handleValidate = () => {
    validateBill(group, serial)
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
        <h2>¿Cómo usar?</h2>
        <p>1) Elige el billete. 2) Ingresa el número de serie. 3) Presiona “Validar”.</p>
      </section>

      <main className="card">
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
                  <img
                    src={option.image}
                    alt={`Billete de ${option.label}`}
                    loading="lazy"
                  />
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="field">
          <label htmlFor="serial">Número de serie</label>
          <input
            id="serial"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={SERIAL_MAX_LENGTH}
            value={serial}
            onChange={(event) => setSerial(sanitizeSerial(event.target.value))}
            placeholder="Ej. 87280145"
          />
        </div>

        <button type="button" className="primary" onClick={handleValidate}>
          Validar
        </button>

        <div className={`result ${result.status}`}>{result.message}</div>

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
        <section className="ranges">
          <h2>Rangos de serie inválidos para {group} Bs.</h2>
          <ul>
            {rangesForGroup.map((range) => (
              <li
                key={`${range.start}-${range.end}`}
                className={
                  matchedRangeKey === `${range.start}-${range.end}` ? 'matched' : ''
                }
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
          responsabilidad por pérdidas económicas resultantes del uso de esta aplicación.
          Se recomienda verificar la información directamente con el BCB para transacciones
          de alto valor.
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
