import { SEVERIDADES } from '../lib/dominio.js'

const EN_PLURAL = { critica: 'críticas', alta: 'altas', media: 'medias', baja: 'bajas', ninguna: 'sin clasificar' }

// Barra fina segmentada: cómo se reparten las investigaciones por severidad. No lleva texto
// propio; quien la usa pone al lado la leyenda con los recuentos (los filtros de la lista o las
// filas de la tarjeta del resumen), en el mismo orden.
export default function Distribucion({ porSeveridad }) {
  const partes = [...SEVERIDADES, 'ninguna'].filter((s) => porSeveridad[s] > 0)
  const descripcion = partes.map((s) => `${porSeveridad[s]} ${EN_PLURAL[s]}`).join(', ')
  return (
    <div className="distrib" role="img" aria-label={`Distribución por severidad: ${descripcion}.`}>
      {partes.map((s) => (
        <span key={s} className={`distrib-parte sev-${s}`} style={{ flexGrow: porSeveridad[s] }} />
      ))}
    </div>
  )
}
