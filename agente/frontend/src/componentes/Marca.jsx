// Símbolo del panel: una retícula (el agente "pone el foco" en cada alerta).
export default function Marca({ tam = 28 }) {
  return (
    <svg className="marca" width={tam} height={tam} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--marca)" />
      <g fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
        <circle cx="16" cy="16" r="6.5" />
        <path d="M16 5.5v3.5M16 23v3.5M5.5 16H9M23 16h3.5" />
      </g>
      <circle cx="16" cy="16" r="2" fill="#fff" />
    </svg>
  )
}
