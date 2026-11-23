import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EstadoCentral } from './componentes/Aviso.jsx'
import Icono from './componentes/Icono.jsx'
import Detalle from './investigaciones/Detalle.jsx'
import Lista from './investigaciones/Lista.jsx'
import Resumen from './investigaciones/Resumen.jsx'
import { useInvestigaciones } from './lib/datos.js'
import { filtrar, resumir } from './lib/dominio.js'
import { RUTA_CHAT, RUTA_LISTA, navegar } from './lib/ruta.js'

const SIN_FILTRO = { texto: '', severidad: null }

// Vista principal. Dos paneles: a la izquierda la lista (con la distribución por severidad, que
// también filtra) y a la derecha el panel de lectura, que muestra el resumen o el detalle de la
// investigación elegida. En pantallas estrechas se ve un panel cada vez, según la ruta.
export default function Investigaciones({ activa, ruta, alPreguntar }) {
  const { items, error, actualizadoEn, recargar } = useInvestigaciones(activa)
  const [filtro, setFiltro] = useState(SIN_FILTRO)
  const raiz = useRef(null)
  const panel = useRef(null)

  const resumen = useMemo(() => (items ? resumir(items) : null), [items])
  const visibles = useMemo(() => (items ? filtrar(items, filtro) : []), [items, filtro])

  const seleccion = ruta.panel === 'detalle' ? ruta.id : null
  const elegida = useMemo(
    () => (seleccion && items?.find((inv) => String(inv.id) === seleccion)) || null,
    [items, seleccion],
  )
  const posicion = useMemo(() => {
    const indice = seleccion ? visibles.findIndex((inv) => String(inv.id) === seleccion) : -1
    return {
      indice,
      total: visibles.length,
      anterior: indice > 0 ? visibles[indice - 1] : null,
      siguiente: indice >= 0 && indice < visibles.length - 1 ? visibles[indice + 1] : null,
    }
  }, [visibles, seleccion])

  // Al cambiar de panel, el de lectura vuelve arriba y, si el foco quedó sobre algo que ya no se
  // ve (en una sola columna, el panel anterior se oculta), pasa al título del panel nuevo; al
  // volver a la lista, regresa a la fila que se estaba leyendo.
  const previa = useRef({ panel: ruta.panel, id: ruta.id })
  useEffect(() => {
    const antes = previa.current
    previa.current = { panel: ruta.panel, id: ruta.id }
    if (antes.panel === ruta.panel && antes.id === ruta.id) return
    if (panel.current) panel.current.scrollTop = 0
    if (!activa || !raiz.current) return
    const enfocado = document.activeElement
    const focoPerdido = !enfocado || enfocado === document.body || enfocado.getClientRects().length === 0
    if (!focoPerdido) return
    let destino = null
    if (ruta.panel === 'detalle') destino = document.getElementById('detalle-titulo')
    else if (ruta.panel === 'resumen') destino = document.getElementById('resumen-titulo')
    else {
      const filas = [...raiz.current.querySelectorAll('a.fila')]
      destino = filas.find((fila) => fila.dataset.id === antes.id) ?? document.getElementById('lista-titulo')
    }
    if (destino && destino.getClientRects().length > 0) destino.focus()
  }, [activa, ruta.panel, ruta.id])

  // La fila abierta se mantiene a la vista (enlace directo, botones anterior/siguiente).
  const hayLista = items !== null
  useEffect(() => {
    if (!seleccion || !hayLista || !raiz.current) return
    raiz.current.querySelector('a.fila[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [seleccion, hayLista])

  const filtrarPorIp = useCallback((ip) => {
    setFiltro({ texto: ip, severidad: null })
    navegar(RUTA_LISTA)
  }, [])

  // Sin nada que listar y sin detalle abierto no tiene sentido partir la pantalla en dos.
  if (ruta.panel !== 'detalle' && items === null && error) {
    return (
      <div className="inv inv-unico">
        <EstadoCentral icono="sinConexion" titulo="No se pudieron cargar las investigaciones" tono="peligro">
          <p>{error}</p>
          <p className="tenue">Se reintenta automáticamente cada 10 segundos.</p>
          <button type="button" className="boton" onClick={recargar}>
            <Icono nombre="actualizar" /> Reintentar ahora
          </button>
        </EstadoCentral>
      </div>
    )
  }
  if (ruta.panel !== 'detalle' && items?.length === 0) {
    return (
      <div className="inv inv-unico">
        <EstadoCentral icono="bandeja" titulo="Todavía no hay investigaciones">
          <p>
            Aparecerán aquí en cuanto Wazuh envíe una alerta al agente. Cada investigación reúne la evidencia, la
            severidad, las acciones de respuesta y el reporte completo.
          </p>
          <p className="tenue">Esta vista se actualiza sola cada 10 segundos.</p>
          <a className="boton" href={RUTA_CHAT}>
            <Icono nombre="chat" /> Pedir una revisión al agente
          </a>
        </EstadoCentral>
      </div>
    )
  }

  return (
    <div className="inv" data-panel={ruta.panel} ref={raiz}>
      <section className="inv-lista" aria-labelledby="lista-titulo">
        <div className="lista">
          <Lista
            items={items}
            visibles={visibles}
            resumen={resumen}
            filtro={filtro}
            alFiltrar={setFiltro}
            seleccion={seleccion}
            error={error}
            actualizadoEn={actualizadoEn}
            alRecargar={recargar}
          />
        </div>
      </section>
      <section
        className="inv-panel"
        ref={panel}
        aria-label={seleccion ? 'Detalle de la investigación' : 'Resumen de las investigaciones'}
      >
        {seleccion ? (
          <Detalle id={seleccion} deLista={elegida} posicion={posicion} alPreguntar={alPreguntar} />
        ) : (
          <Resumen resumen={resumen} alFiltrarIp={filtrarPorIp} />
        )}
      </section>
    </div>
  )
}
