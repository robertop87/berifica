import { useEffect, useState } from 'react'
import './App.css'
import berificaLogo from './assets/berifica_logo.png'
import type { AppMode } from './types'
import {
  billOptions,
  groupOptions,
  rangesByGroup,
  SERIAL_DIGITS_MAX_LENGTH,
  AMOUNT_REGION,
  SERIAL_RIGHT_REGION,
} from './constants'
import { sanitizeSerial, getSerialParts } from './utils/serial'
import { extractAmount, extractSerialSuffix, extractSerial } from './utils/ocr'
import { useOcrWorker } from './hooks/useOcrWorker'
import { useCamera } from './hooks/useCamera'
import { usePwaInstall } from './hooks/usePwaInstall'
import { useBillValidation } from './hooks/useBillValidation'

function App() {
  const [mode, setMode] = useState<AppMode>('manual')
  const [isManualValidating, setIsManualValidating] = useState(false)
  const [isReadingCamera, setIsReadingCamera] = useState(false)

  const { installPromptEvent, isInstalling, handleInstallApp } = usePwaInstall()

  const {
    group, setGroup,
    serial, setSerial,
    showRanges, setShowRanges,
    matchedRangeKey,
    result, setResult,
    validationHistory,
    latestValidationKey,
    rangesForGroup,
    hasValidGroupSelection,
    rangesSectionRef,
    validateBill,
  } = useBillValidation()

  const {
    isCameraOpen,
    isStartingCamera,
    cameraError,
    cameraStatus,
    setCameraError,
    setCameraStatus,
    videoRef,
    captureCanvasRef,
    openCamera,
    stopCameraStream,
  } = useCamera()

  const { readAmountCandidates, readSerialCandidates } = useOcrWorker()

  const isProcessing = isReadingCamera || isManualValidating
  const manualSerialDigits = serial.replace(/\D/g, '').slice(0, SERIAL_DIGITS_MAX_LENGTH)

  // Set favicon to app logo
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

  // Pre-fill from URL query params (?monto=10&serie=274462658)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const groupFromQuery = params.get('monto')?.trim() ?? ''
    const serialFromQuery = sanitizeSerial(params.get('serie') ?? '')

    if (!groupFromQuery && !serialFromQuery) return

    setGroup(groupFromQuery)
    setSerial(serialFromQuery)
    validateBill(groupFromQuery, serialFromQuery)
  }, [])

  // Stop camera and clear messages when switching to manual mode
  useEffect(() => {
    if (mode === 'manual') {
      stopCameraStream()
      setCameraError('')
      setCameraStatus('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Auto-scroll to ranges section when it appears in automatic mode
  useEffect(() => {
    if (!showRanges || mode !== 'automatic' || !rangesSectionRef.current) return
    rangesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showRanges, mode, rangesSectionRef])

  const handleValidate = () => {
    if (isProcessing) return

    if (!groupOptions.includes(group)) {
      setResult({ message: 'Selecciona un billete.', status: 'error' })
      return
    }

    if (!manualSerialDigits) {
      setResult({ message: 'Ingresa un número de serie.', status: 'error' })
      return
    }

    setIsManualValidating(true)
    setCameraError('')
    setCameraStatus('')
    setResult({ message: 'Validando billete...', status: 'loading' })

    const serialWithAssumedB = `${manualSerialDigits} B`
    setSerial(serialWithAssumedB)
    window.requestAnimationFrame(() => {
      validateBill(group, serialWithAssumedB)
      setIsManualValidating(false)
    })
  }

  const captureAndReadBill = async () => {
    if (!videoRef.current || !captureCanvasRef.current) return

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
    setCameraError('')
    setCameraStatus('')
    setResult({ message: 'Validando billete...', status: 'loading' })

    try {
      const context = canvas.getContext('2d')
      if (!context) {
        setCameraError('No se pudo procesar la imagen de cámara.')
        return
      }

      canvas.width = width
      canvas.height = height
      context.drawImage(video, 0, 0, width, height)

      // OCR call 1: denomination
      setResult({ message: 'Leyendo billete…', status: 'loading' })

      const amountReads = await readAmountCandidates(canvas, AMOUNT_REGION)
      const finalAmount = extractAmount(amountReads)

      if (finalAmount == null || !groupOptions.includes(finalAmount)) {
        setResult({
          message: '⚠️ No se pudo leer el monto. Coloca el billete dentro del recuadro naranja y vuelve a capturar.',
          status: 'error',
        })
        setCameraStatus('No puedo reconocer el monto. Reintenta o usa el modo manual.')
        return
      }

      // OCR call 2: serial
      const serialReads = await readSerialCandidates(canvas, SERIAL_RIGHT_REGION)
      const detectedSuffix = extractSerialSuffix(serialReads)

      if (detectedSuffix !== 'B') {
        const suffixLabel = detectedSuffix || 'desconocida'
        setResult({
          message: `ℹ️ Serie ${suffixLabel} detectada — no es serie B, no necesita validación.`,
          status: 'success',
        })
        setCameraStatus(`Detectado: Bs ${finalAmount} / Serie ${suffixLabel}`)
        return
      }

      const finalSerial = extractSerial(serialReads)

      if (finalSerial == null) {
        setResult({
          message: '⚠️ No se pudo leer la serie. Coloca el billete dentro del recuadro verde y vuelve a capturar.',
          status: 'error',
        })
        setCameraStatus('No puedo reconocer el número de serie. Reintenta o usa el modo manual.')
        return
      }

      const normalizedSerial = sanitizeSerial(finalSerial)
      setGroup(finalAmount)
      setSerial(normalizedSerial)
      validateBill(finalAmount, normalizedSerial)

      const { digits, suffix } = getSerialParts(normalizedSerial)
      const serialNumber = Number.parseInt(digits, 10)
      const isObserved =
        suffix === 'B' &&
        !Number.isNaN(serialNumber) &&
        (rangesByGroup[finalAmount] ?? []).some(
          (range) => serialNumber >= range.start && serialNumber <= range.end,
        )

      if (isObserved) setShowRanges(true)

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
            <p className="mode-disclaimer">
              ⚠ Modo experimental — el reconocimiento puede fallar según la iluminación o el ángulo.
              Si no detecta correctamente, usa el <strong>modo manual</strong>.
            </p>
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
