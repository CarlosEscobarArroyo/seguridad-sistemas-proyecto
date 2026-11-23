import { SEVERIDAD, estadoDe, severidadDe, tipoDe } from '../lib/dominio.js'
import Icono from './Icono.jsx'

const BARRAS = [
  { x: 1.25, alto: 4.5 },
  { x: 5, alto: 7.5 },
  { x: 8.75, alto: 10.5 },
  { x: 12.5, alto: 13.5 },
]

// Cuatro barras crecientes: se rellenan tantas como el nivel de severidad (1 a 4). La severidad
// se lee así por la forma además de por el color, y siempre va acompañada de su nombre.
export function GlifoSeveridad({ severidad, tam = 16 }) {
  const nivel = severidad ? SEVERIDAD[severidad].nivel : 0
  return (
    <svg
      className={`glifo-sev sev-${severidad ?? 'ninguna'}`}
      width={tam}
      height={tam}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {BARRAS.map((barra, i) => (
        <rect
          key={barra.x}
          className={i < nivel ? 'encendida' : 'apagada'}
          x={barra.x}
          y={15 - barra.alto}
          width="2.25"
          height={barra.alto}
          rx="1"
        />
      ))}
    </svg>
  )
}

export function Severidad({ inv, severidad = severidadDe(inv), enCaja = false }) {
  return (
    <span className={`sev ${enCaja ? 'insignia' : ''}`.trim()}>
      <GlifoSeveridad severidad={severidad} />
      <span className="sr-only">Severidad: </span>
      {severidad ? SEVERIDAD[severidad].etiqueta : 'Sin clasificar'}
    </span>
  )
}

const ICONO_ESTADO = {
  concluida: 'correcto',
  en_curso: 'cargando',
  sin_registrar: 'alerta',
  error: 'fallo',
  desconocido: 'pendiente',
}

export function Estado({ inv, enCaja = false }) {
  const estado = estadoDe(inv)
  return (
    <span className={`estado estado-${estado.clave} ${enCaja ? 'insignia' : ''}`.trim()}>
      <Icono nombre={ICONO_ESTADO[estado.clave]} tam={14} className={estado.clave === 'en_curso' ? 'girando' : ''} />
      <span className="sr-only">Estado: </span>
      {estado.etiqueta}
    </span>
  )
}

export function Tipo({ inv }) {
  const tipo = tipoDe(inv)
  if (!tipo) return null
  return (
    <span className="insignia tipo">
      <span className="sr-only">Tipo: </span>
      {tipo.etiqueta}
    </span>
  )
}
