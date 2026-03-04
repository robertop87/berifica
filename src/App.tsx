import { useEffect, useState } from 'react'
import './App.css'
import berificaLogo from './assets/berifica_logo.png'
import {
  billOptions,
  groupOptions,
  SERIAL_DIGITS_MAX_LENGTH,
  SERIAL_RIGHT_REGION,
} from './constants'
import { sanitizeSerial, getSerialParts } from './utils/serial'
import { extractSerial } from './utils/ocr'
import { useOcrWorker } from './hooks/useOcrWorker'
import { useCamera } from './hooks/useCamera'
import { usePwaInstall } from './hooks/usePwaInstall'
import { useBillValidation } from './hooks/useBillValidation'

function App() {
  const [isCapturing, setIsCapturing] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [showCamera, setShowCamera] = useState(false)

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
    setCameraError,
    setCameraStatus,
    videoRef,
    captureCanvasRef,
    openCamera,
    stopCameraStream,
  } = useCamera()

  const { readSerialCandidates } = useOcrWorker()

  const isProcessing = isCapturing || isValidating
  const serialDigits = serial.replace(/\D/g, '').slice(0, SERIAL_DIGITS_MAX_LENGTH)

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

  // Auto-scroll to ranges section when it appears
  useEffect(() => {
    if (!showRanges || !rangesSectionRef.current) return
    rangesSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showRanges, rangesSectionRef])

  const handleToggleCamera = () => {
    if (showCamera) {
      setShowCamera(false)
      stopCameraStream()
      setCameraError('')
      setCameraStatus('')
    } else {
      setShowCamera(true)
      openCamera()
    }
  }

  const handleValidate = () => {
    if (isProcessing) return

    if (!groupOptions.includes(group)) {
      setResult({ message: 'Selecciona un billete (10, 20 o 50 Bs).', status: 'error' })
      return
    }

    if (!serialDigits) {
      setResult({ message: 'Ingresa el número de serie.', status: 'error' })
      return
    }

    setIsValidating(true)
    setCameraError('')
    setCameraStatus('')
    setResult({ message: 'Validando…', status: 'loading' })

    const serialWithB = `${serialDigits} B`
    setSerial(serialWithB)
    window.requestAnimationFrame(() => {
      validateBill(group, serialWithB)
      setIsValidating(false)
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

    setIsCapturing(true)
    setCameraError('')
    setCameraStatus('')
    setResult({ message: 'Leyendo serie…', status: 'loading' })

    try {
      const context = canvas.getContext('2d')
      if (!context) {
        setCameraError('No se pudo procesar la imagen de cámara.')
        return
      }

      canvas.width = width
      canvas.height = height
      context.drawImage(video, 0, 0, width, height)

      const serialReads = await readSerialCandidates(canvas, SERIAL_RIGHT_REGION)
      const rawSerial = extractSerial(serialReads)

      if (rawSerial == null) {
        setCameraError(
          'No se pudo leer el número. Asegúrate de que quede dentro del recuadro verde y vuelve a capturar.',
        )
        setResult({ message: 'No se pudo leer. Reintenta o ingrésalo manualmente.', status: 'error' })
        return
      }

      const { digits } = getSerialParts(rawSerial)
      setSerial(digits)
      setShowCamera(false)
      stopCameraStream()
      setCameraStatus('')
      setResult({
        message: `Serie leída: ${digits} — Presiona Validar para continuar.`,
        status: 'neutral',
      })
    } catch {
      setCameraError('Error al procesar imagen. Ingresa los datos manualmente.')
      setResult({ message: 'Error al procesar. Ingresa los datos manualmente.', status: 'error' })
    } finally {
      setIsCapturing(false)
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
        <h1>Verificador de billetes de <b>serie B</b></h1>
        <p>Verifica si un billete de la serie B está observado por el BCB.</p>
      </header>

      <section className="info">
        <h2>¿Cómo usar?</h2>
        <ol className="info-steps">
          <li>Elige el billete (10, 20 o 50 Bs).</li>
          <li>
            Ingresa el número de serie: escríbelo directamente o presiona el botón{' '}
            <strong>📷</strong> para usar la cámara.
          </li>
          <li>Presiona <strong>Validar</strong>.</li>
        </ol>
        <p className="serie-b-notice">
          ⚠ <strong>Solo los billetes de serie B necesitan validación.</strong>{' '}
          Usar con otras series (A, C, etc.) no tiene ninguna utilidad.
        </p>
      </section>

      <main className="card">
        {/* Bill picker */}
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
                  disabled={isProcessing}
                >
                  <img src={option.image} alt={`Billete de ${option.label}`} loading="lazy" />
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Serial input with inline camera toggle */}
        <div className="field">
          <label htmlFor="serial">Número de serie</label>
          <div className="serial-input-row">
            <input
              id="serial"
              inputMode="numeric"
              maxLength={SERIAL_DIGITS_MAX_LENGTH}
              value={serialDigits}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, SERIAL_DIGITS_MAX_LENGTH)
                setSerial(digits)
              }}
              placeholder="Ej. 274462658"
              disabled={isCapturing}
              aria-label="Número de serie"
            />
            <button
              type="button"
              className={`camera-toggle-btn${showCamera ? ' active' : ''}`}
              onClick={handleToggleCamera}
              disabled={isProcessing}
              aria-label={showCamera ? 'Cerrar cámara' : 'Usar cámara'}
              title={showCamera ? 'Cerrar cámara' : 'Usar cámara'}
            >
              📷
            </button>
          </div>
        </div>

        {/* Inline camera section */}
        {showCamera && (
          <div className="camera-section">
            <p className="camera-help">
              Acerca el <strong>número de serie</strong> del billete hasta que llene el recuadro
              verde. Buena iluminación y <strong>sin sombras</strong>.
            </p>

            {!isCapturing && cameraError && (
              <div className="camera-error">{cameraError}</div>
            )}

            {isCameraOpen ? (
              <>
                <div className="camera-viewfinder">
                  <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                  <div className="camera-guide-overlay" aria-hidden="true">
                    <div className="camera-zone camera-zone-serial">
                      <span className="camera-zone-label">SERIE</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="primary"
                  onClick={captureAndReadBill}
                  disabled={isProcessing}
                >
                  {isCapturing ? 'Leyendo serie…' : 'Capturar número de serie'}
                </button>
              </>
            ) : (
              <p className="camera-starting">
                {isStartingCamera ? 'Abriendo cámara…' : 'Esperando cámara…'}
              </p>
            )}

            <canvas ref={captureCanvasRef} className="camera-canvas" aria-hidden="true" />
          </div>
        )}

        {/* Always-visible validate button */}
        <button
          type="button"
          className="primary"
          onClick={handleValidate}
          disabled={isProcessing}
        >
          {isValidating ? 'Validando…' : 'Validar'}
        </button>

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
