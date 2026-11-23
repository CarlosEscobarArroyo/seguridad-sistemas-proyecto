import { Aviso } from '../componentes/Aviso.jsx'
import Distribucion from '../componentes/Distribucion.jsx'
import Icono from '../componentes/Icono.jsx'
import { Estado, GlifoSeveridad, Severidad } from '../componentes/Insignias.jsx'
import { SEVERIDAD, SEVERIDADES, accionesDe, estadoDe, severidadDe, tipoDe, tituloDe } from '../lib/dominio.js'
import { fechaIso, fechaLarga, horaExacta, plural, tiempoRelativo } from '../lib/formato.js'
import { RUTA_RESUMEN, rutaInvestigacion } from '../lib/ruta.js'

function Filtros({ resumen, filtro, alFiltrar }) {
  const elegir = (severidad) =>
    alFiltrar({ ...filtro, severidad: filtro.severidad === severidad ? null : severidad })
  return (
    <div className="lista-filtros">
      <div className="chips" role="group" aria-label="Filtrar por severidad">
        <button type="button" className="chip" aria-pressed={!filtro.severidad} onClick={() => elegir(null)}>
          Todas <span className="chip-n">{resumen.total}</span>
        </button>
        {SEVERIDADES.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            aria-pressed={filtro.severidad === s}
            onClick={() => elegir(s)}
            disabled={resumen.porSeveridad[s] === 0 && filtro.severidad !== s}
          >
            <GlifoSeveridad severidad={s} tam={14} />
            {SEVERIDAD[s].etiqueta} <span className="chip-n">{resumen.porSeveridad[s]}</span>
          </button>
        ))}
        {resumen.porSeveridad.ninguna > 0 && (
          <button
            type="button"
            className="chip"
            aria-pressed={filtro.severidad === 'ninguna'}
            onClick={() => elegir('ninguna')}
          >
            <GlifoSeveridad severidad={null} tam={14} />
            Sin clasificar <span className="chip-n">{resumen.porSeveridad.ninguna}</span>
          </button>
        )}
      </div>
      <div className="buscador">
        <Icono nombre="buscar" />
        <input
          type="search"
          value={filtro.texto}
          onChange={(e) => alFiltrar({ ...filtro, texto: e.target.value })}
          placeholder="Buscar por título, IP, tipo o regla"
          aria-label="Buscar investigaciones"
          autoComplete="off"
          spellCheck="false"
        />
        {filtro.texto && (
          <button
            type="button"
            className="boton-icono chico"
            onClick={() => alFiltrar({ ...filtro, texto: '' })}
            aria-label="Borrar la búsqueda"
          >
            <Icono nombre="cerrar" tam={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function Fila({ inv, seleccionada, ahora }) {
  const estado = estadoDe(inv)
  const severidad = severidadDe(inv)
  const tipo = tipoDe(inv)
  const acciones = accionesDe(inv)
  return (
    <li>
      <a
        className="fila"
        href={rutaInvestigacion(inv.id)}
        data-id={inv.id}
        aria-current={seleccionada ? 'true' : undefined}
      >
        <span className="fila-arriba">
          {/* Sin severidad asignada (en curso, error…) basta con el estado. */}
          {(severidad || estado.clave === 'concluida') && <Severidad severidad={severidad} />}
          {estado.clave !== 'concluida' && <Estado inv={inv} />}
          {inv.creado_en && (
            <time className="fila-hora" dateTime={fechaIso(inv.creado_en)} title={fechaLarga(inv.creado_en)}>
              {tiempoRelativo(inv.creado_en, ahora)}
            </time>
          )}
        </span>
        <span className="fila-titulo">{tituloDe(inv)}</span>
        <span className="fila-meta">
          {tipo && <span>{tipo.etiqueta}</span>}
          {inv.ip_origen && <span className="mono">{inv.ip_origen}</span>}
          {inv.origen === 'chat' && <span>Desde el chat</span>}
          {acciones.length > 0 && (
            <span className="fila-acciones" title={acciones.map((a) => a.texto).join('\n')}>
              <Icono nombre="escudo" tam={14} />
              {acciones.length}
              <span className="sr-only"> {acciones.length === 1 ? 'acción de respuesta' : 'acciones de respuesta'}</span>
            </span>
          )}
        </span>
      </a>
    </li>
  )
}

// Flechas, Inicio y Fin mueven el foco entre filas; Intro abre la que tiene el foco.
function moverEntreFilas(e) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
  const filas = [...e.currentTarget.querySelectorAll('a.fila')]
  const actual = filas.indexOf(document.activeElement)
  if (actual === -1) return
  const destino = { ArrowDown: actual + 1, ArrowUp: actual - 1, Home: 0, End: filas.length - 1 }[e.key]
  if (filas[destino]) {
    e.preventDefault()
    filas[destino].focus()
  }
}

function Esqueleto() {
  return (
    <>
      <p className="sr-only" role="status">
        Cargando investigaciones…
      </p>
      <ul className="filas" aria-hidden="true">
        {[72, 88, 60, 80, 66, 76].map((ancho) => (
          <li key={ancho}>
            <div className="fila fila-esqueleto">
              <span className="hueso" style={{ width: '34%' }} />
              <span className="hueso alto" style={{ width: `${ancho}%` }} />
              <span className="hueso" style={{ width: '52%' }} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function Lista({ items, visibles, resumen, filtro, alFiltrar, seleccion, error, actualizadoEn, alRecargar }) {
  const ahora = Date.now()
  const hayFiltro = Boolean(filtro.texto.trim() || filtro.severidad)
  const enCurso = resumen?.enCurso.length ?? 0

  return (
    <>
      <header className="lista-cab">
        <div className="lista-cab-fila">
          <h1 id="lista-titulo" tabIndex={-1}>
            Investigaciones
          </h1>
          <div className="vivo">
            <span
              className={`vivo-estado ${error ? 'con-error' : actualizadoEn ? '' : 'en-espera'}`.trim()}
              title="Se actualiza sola cada 10 segundos"
            >
              <span className="vivo-punto" aria-hidden="true" />
              {error ? (
                'Sin actualizar'
              ) : actualizadoEn ? (
                <>
                  <span className="vivo-palabra">Actualizado </span>
                  {horaExacta(actualizadoEn)}
                </>
              ) : (
                'Cargando…'
              )}
            </span>
            <button
              type="button"
              className="boton-icono"
              onClick={alRecargar}
              aria-label="Actualizar ahora"
              title="Actualizar ahora"
            >
              <Icono nombre="actualizar" />
            </button>
          </div>
        </div>
        {resumen && resumen.total > 0 && (
          <div className="lista-sub">
            <p className="lista-cuentas">
              <span>{plural(resumen.total, 'investigación', 'investigaciones')}</span>
              {enCurso > 0 && (
                <span className="sub-curso">
                  <span className="punto-vivo" aria-hidden="true" />
                  {enCurso} en curso
                </span>
              )}
              <span>
                <Icono nombre="escudo" tam={14} />
                {plural(resumen.acciones.total, 'acción de respuesta', 'acciones de respuesta')}
              </span>
            </p>
            <a className="enlace solo-estrecho" href={RUTA_RESUMEN}>
              Ver resumen
              <Icono nombre="derecha" tam={14} />
            </a>
          </div>
        )}
      </header>

      <div role="status">
        {error && items && (
          <Aviso tono="atencion" titulo="No se pudo actualizar la lista">
            <p>{error} Se muestran los últimos datos recibidos y se sigue reintentando.</p>
          </Aviso>
        )}
      </div>

      {resumen && resumen.total > 0 && (
        <>
          <Distribucion porSeveridad={resumen.porSeveridad} />
          <Filtros resumen={resumen} filtro={filtro} alFiltrar={alFiltrar} />
        </>
      )}

      {items === null && !error && <Esqueleto />}

      {items === null && error && (
        <div className="lista-hueco">
          <p>No se pudo cargar la lista. {error}</p>
          <button type="button" className="boton chico" onClick={alRecargar}>
            <Icono nombre="actualizar" tam={14} /> Reintentar
          </button>
        </div>
      )}

      {items?.length === 0 && (
        <div className="lista-hueco">
          <p>Todavía no hay investigaciones registradas.</p>
        </div>
      )}

      {items?.length > 0 && (
        <>
          <p className={hayFiltro ? 'lista-cuenta' : 'sr-only'} role="status">
            {hayFiltro ? (
              <>
                <span>
                  {visibles.length} de {plural(items.length, 'investigación', 'investigaciones')}
                </span>
                <button type="button" className="enlace" onClick={() => alFiltrar({ texto: '', severidad: null })}>
                  Quitar filtros
                </button>
              </>
            ) : (
              ''
            )}
          </p>
          {visibles.length > 0 ? (
            <ul className="filas" onKeyDown={moverEntreFilas}>
              {visibles.map((inv) => (
                <Fila key={inv.id} inv={inv} seleccionada={String(inv.id) === seleccion} ahora={ahora} />
              ))}
            </ul>
          ) : (
            <div className="lista-hueco">
              <Icono nombre="buscar" tam={20} />
              <p>Ninguna investigación coincide con el filtro.</p>
            </div>
          )}
        </>
      )}
    </>
  )
}
