import Icono from './Icono.jsx'

const ICONOS = { curso: 'cargando', peligro: 'fallo', atencion: 'advertencia', info: 'info' }

// Franja de aviso dentro del contenido. `tono`: curso | peligro | atencion | info.
export function Aviso({ tono = 'info', titulo, children, accion }) {
  return (
    <div className={`aviso aviso-${tono}`} role={tono === 'peligro' ? 'alert' : undefined}>
      <Icono nombre={ICONOS[tono]} tam={18} className={tono === 'curso' ? 'girando' : ''} />
      <div className="aviso-texto">
        {titulo && <p className="aviso-titulo">{titulo}</p>}
        {children}
      </div>
      {accion}
    </div>
  )
}

// Estado vacío o de error a pantalla completa dentro de un panel.
export function EstadoCentral({ icono, titulo, children, tono = 'neutro' }) {
  return (
    <div className={`central central-${tono}`}>
      <span className="central-icono">
        <Icono nombre={icono} tam={24} />
      </span>
      <h2 className="central-titulo">{titulo}</h2>
      {children}
    </div>
  )
}
