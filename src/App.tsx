import { useEffect, useMemo, useState } from 'react'
import './App.css'
import alenasoftIcon from './assets/alenasoft_icon.png'
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

type ResultState = {
  message: string
  status: 'neutral' | 'success' | 'error'
}

function App() {
  const [group, setGroup] = useState('')
  const [serial, setSerial] = useState('')
  const [showRanges, setShowRanges] = useState(false)
  const [showRangesLink, setShowRangesLink] = useState(false)
  const [matchedRangeKey, setMatchedRangeKey] = useState<string | null>(null)
  const [result, setResult] = useState<ResultState>({
    message: 'ℹ️ Ingresa los datos para validar.',
    status: 'neutral',
  })

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) {
      link.href = alenasoftIcon
    } else {
      const newLink = document.createElement('link')
      newLink.rel = 'icon'
      newLink.href = alenasoftIcon
      document.head.appendChild(newLink)
    }
  }, [])

  const rangesForGroup = useMemo(() => rangesByGroup[group] ?? [], [group])

  const handleValidate = () => {
    setShowRanges(false)
    setShowRangesLink(false)
    setMatchedRangeKey(null)
    const groupValue = group.trim()
    const serialValue = serial.trim()

    if (!groupOptions.includes(groupValue)) {
      setResult({
        message: '⚠️ Selecciona un monto válido: 50, 20 o 10.',
        status: 'error',
      })
      return
    }

    const serialNumber = Number.parseInt(serialValue, 10)
    if (Number.isNaN(serialNumber)) {
      setResult({ message: '⚠️ Ingresa un número de serie válido.', status: 'error' })
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
    } else {
      setResult({ message: '✅ Billete no observado.', status: 'success' })
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <span className="pill">B-erifica</span>
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
            value={serial}
            onChange={(event) => setSerial(event.target.value.replace(/\D/g, ''))}
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

        {!showRanges && showRangesLink && (
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
