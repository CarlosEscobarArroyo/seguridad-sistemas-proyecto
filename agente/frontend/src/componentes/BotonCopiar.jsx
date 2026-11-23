import { useEffect, useRef, useState } from 'react'
import Icono from './Icono.jsx'

// Copia `texto` al portapapeles. No se muestra si el navegador no ofrece la API
// (por ejemplo, fuera de un contexto seguro).
export default function BotonCopiar({ texto, etiqueta = 'Copiar', soloIcono = false, className = '' }) {
  const [copiado, setCopiado] = useState(false)
  const temporizador = useRef(null)

  useEffect(() => () => clearTimeout(temporizador.current), [])

  if (!navigator.clipboard?.writeText || !texto) return null

  async function copiar() {
    try {
      await navigator.clipboard.writeText(String(texto))
      setCopiado(true)
      clearTimeout(temporizador.current)
      temporizador.current = setTimeout(() => setCopiado(false), 1800)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <button
      type="button"
      className={`${soloIcono ? 'boton-icono chico' : 'boton chico'} ${className}`.trim()}
      onClick={copiar}
      aria-label={soloIcono ? etiqueta : undefined}
      title={soloIcono ? etiqueta : undefined}
    >
      <Icono nombre={copiado ? 'hecho' : 'copiar'} tam={14} />
      {!soloIcono && <span>{copiado ? 'Copiado' : etiqueta}</span>}
      <span className="sr-only" role="status">
        {copiado ? 'Copiado al portapapeles' : ''}
      </span>
    </button>
  )
}
