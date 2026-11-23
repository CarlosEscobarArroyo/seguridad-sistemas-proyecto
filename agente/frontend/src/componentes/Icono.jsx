import { TRAZOS } from './iconos.js'

// Icono de contorno. Es decorativo por defecto: el texto o el `aria-label` del control que lo
// contiene es quien da el nombre accesible.
export default function Icono({ nombre, tam = 16, className = '', ...resto }) {
  const nodos = TRAZOS[nombre]
  if (!nodos) return null
  return (
    <svg
      className={`icono ${className}`.trim()}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {nodos.map(([Etiqueta, atributos], i) => (
        <Etiqueta key={i} {...atributos} />
      ))}
    </svg>
  )
}
