import { useMemo } from 'react'
import { Aviso, EstadoCentral } from '../componentes/Aviso.jsx'
import BotonCopiar from '../componentes/BotonCopiar.jsx'
import Icono from '../componentes/Icono.jsx'
import { Estado, Severidad, Tipo } from '../componentes/Insignias.jsx'
import Markdown, { indiceDe } from '../componentes/Markdown.jsx'
import { useInvestigacion } from '../lib/datos.js'
import { accionesDe, decodificarConsulta, estadoDe, solicitudDe, tituloDe } from '../lib/dominio.js'
import { duracion, fechaIso, fechaLarga, leerFecha, tiempoRelativo } from '../lib/formato.js'
import { RUTA_LISTA, rutaInvestigacion } from '../lib/ruta.js'

const ID_REPORTE = 'reporte'

function menosMovimiento() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Lleva la vista (y el foco) a una sección del reporte. No se usan enlaces "#…" porque el
// fragmento de la URL ya lo ocupa la navegación del panel.
function irASeccion(id) {
  const destino = document.getElementById(id)
  if (!destino) return
  destino.scrollIntoView({ behavior: menosMovimiento() ? 'auto' : 'smooth', block: 'start' })
  destino.focus({ preventScroll: true })
}

function Fecha({ valor }) {
  if (!valor) return null
  return <time dateTime={fechaIso(valor)}>{fechaLarga(valor)}</time>
}

function Datos({ inv }) {
  const deWazuh = inv.origen === 'wazuh'
  return (
    <section className="ficha" aria-labelledby="det-datos">
      <h3 id="det-datos" className="rotulo">
        Datos
      </h3>
      <dl className="datos">
        <div>
          <dt>IP de origen</dt>
          <dd className="con-accion">
            {inv.ip_origen ? (
              <>
                <span className="mono">{inv.ip_origen}</span>
                <BotonCopiar texto={inv.ip_origen} etiqueta="Copiar la IP" soloIcono />
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Origen</dt>
          <dd>{deWazuh ? 'Alerta de Wazuh' : inv.origen === 'chat' ? 'Chat con el agente' : '—'}</dd>
        </div>
        {(inv.regla_id || inv.regla_descripcion) && (
          <div>
            <dt>Regla de Wazuh</dt>
            <dd>
              {inv.regla_id && <span className="mono">{inv.regla_id}</span>}
              {inv.regla_nivel != null && <span> · nivel {inv.regla_nivel}</span>}
              {inv.regla_descripcion && <span className="dato-nota">{inv.regla_descripcion}</span>}
            </dd>
          </div>
        )}
        <div>
          <dt>Identificador</dt>
          <dd className="mono dato-id">{inv.id}</dd>
        </div>
      </dl>
    </section>
  )
}

// Recorrido de la investigación: cuándo llegó la alerta, cuánto tardó el agente y cómo terminó.
function Cronologia({ inv }) {
  const estado = estadoDe(inv).clave
  const inicio = leerFecha(inv.creado_en)
  const fin = leerFecha(inv.finalizado_en)
  const deWazuh = inv.origen === 'wazuh'

  let tramo = null
  if (inv.duracion_segundos != null && duracion(inv.duracion_segundos) !== '—') {
    tramo = `${duracion(inv.duracion_segundos)} de investigación`
  } else if (estado === 'en_curso' && inicio) {
    tramo = `Iniciada ${tiempoRelativo(inicio)}`
  } else if (inicio && fin && fin >= inicio && deWazuh) {
    tramo = `${duracion((fin - inicio) / 1000)} hasta el registro`
  }

  const cierre = {
    concluida: { icono: 'correcto', texto: 'Investigación concluida', clase: 'hecho' },
    en_curso: { icono: 'cargando', texto: 'El agente sigue investigando', clase: 'activo' },
    sin_registrar: { icono: 'alerta', texto: 'Terminó sin registrar el resultado', clase: 'atencion' },
    error: { icono: 'fallo', texto: 'La investigación falló', clase: 'peligro' },
    desconocido: { icono: 'pendiente', texto: 'Estado desconocido', clase: '' },
  }[estado]

  return (
    <section className="ficha" aria-labelledby="det-crono">
      <h3 id="det-crono" className="rotulo">
        Cronología
      </h3>
      <ol className="crono">
        <li className="crono-paso hecho">
          <span className="crono-punto">
            <Icono nombre={deWazuh ? 'sirena' : 'chat'} tam={14} />
          </span>
          <div>
            <p className="crono-titulo">{deWazuh ? 'Alerta recibida' : 'Investigación abierta'}</p>
            <p className="crono-fecha">{inv.creado_en ? <Fecha valor={inv.creado_en} /> : 'Fecha no registrada'}</p>
          </div>
        </li>
        {tramo && (
          <li className="crono-tramo">
            <Icono nombre="cronometro" tam={13} />
            {tramo}
          </li>
        )}
        <li className={`crono-paso ${cierre.clase}`.trim()}>
          <span className="crono-punto">
            <Icono nombre={cierre.icono} tam={14} className={estado === 'en_curso' ? 'girando' : ''} />
          </span>
          <div>
            <p className="crono-titulo">{cierre.texto}</p>
            {estado !== 'en_curso' && (inv.finalizado_en || inv.actualizado_en) && (
              <p className="crono-fecha">
                <Fecha valor={inv.finalizado_en ?? inv.actualizado_en} />
              </p>
            )}
          </div>
        </li>
      </ol>
    </section>
  )
}

function Acciones({ inv }) {
  const acciones = accionesDe(inv)
  const enCurso = estadoDe(inv).clave === 'en_curso'
  return (
    <section className="seccion" aria-labelledby="det-acciones">
      <h3 id="det-acciones">
        Acciones de respuesta
        {acciones.length > 0 && <span className="contador">{acciones.length}</span>}
      </h3>
      {acciones.length > 0 ? (
        <ul className="acciones en-caja">
          {acciones.map((accion, i) => (
            <li key={i} title={accion.texto}>
              <span className="accion-icono">
                <Icono nombre={accion.icono} />
              </span>
              <div className="accion-texto">
                <p>
                  <span className="accion-etiqueta">{accion.etiqueta}</span>
                  {accion.objetivo && <span className="mono accion-objetivo">{accion.objetivo}</span>}
                </p>
              </div>
              <span className="accion-hecha">
                <Icono nombre="hecho" tam={14} /> Ejecutada
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tenue">
          {enCurso
            ? 'Todavía no hay acciones registradas: el agente sigue investigando.'
            : 'El agente no ejecutó acciones de respuesta en esta investigación.'}
        </p>
      )}
    </section>
  )
}

// La solicitud HTTP del atacante y la alerta cruda. Todo se pinta como texto: son datos hostiles.
function Solicitud({ doc }) {
  const carga = solicitudDe(doc)
  const alerta = doc.alerta
  const json = useMemo(() => {
    if (alerta == null) return null
    try {
      return JSON.stringify(alerta, null, 2)
    } catch {
      return String(alerta)
    }
  }, [alerta])
  if (!carga && !json) return null

  const consulta = carga?.query ? String(carga.query) : ''
  const legible = decodificarConsulta(consulta)
  const cuerpo = carga?.body == null ? '' : typeof carga.body === 'string' ? carga.body : JSON.stringify(carga.body, null, 2)

  return (
    <section className="seccion" aria-labelledby="det-solicitud">
      <h3 id="det-solicitud">Solicitud que originó la alerta</h3>
      <div className="solicitud">
        {carga && (
          <>
            <p className="sol-linea">
              {carga.method && <span className="sol-metodo">{String(carga.method)}</span>}
              <span className="mono sol-ruta">{carga.path ? String(carga.path) : '(ruta no registrada)'}</span>
              {carga.status_code != null && (
                <span className="sol-codigo">
                  <span className="sr-only">Código de respuesta </span>
                  HTTP {String(carga.status_code)}
                </span>
              )}
            </p>
            <dl className="sol-datos">
              {consulta && (
                <div>
                  <dt>Consulta</dt>
                  <dd>
                    <pre>{consulta}</pre>
                  </dd>
                </div>
              )}
              {legible && (
                <div>
                  <dt>Consulta decodificada</dt>
                  <dd>
                    <pre>{legible}</pre>
                  </dd>
                </div>
              )}
              {cuerpo && (
                <div>
                  <dt>Cuerpo</dt>
                  <dd>
                    <pre>{cuerpo}</pre>
                  </dd>
                </div>
              )}
              {carga.src_ip && (
                <div>
                  <dt>IP del cliente</dt>
                  <dd className="mono">{String(carga.src_ip)}</dd>
                </div>
              )}
              {carga.user_agent && (
                <div>
                  <dt>Agente de usuario</dt>
                  <dd className="mono">{String(carga.user_agent)}</dd>
                </div>
              )}
              {carga.timestamp && (
                <div>
                  <dt>Fecha de la solicitud</dt>
                  <dd>
                    <Fecha valor={carga.timestamp} />
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}
        {json && (
          <details className="sol-cruda">
            <summary>
              <Icono nombre="llaves" tam={14} /> Alerta completa de Wazuh (JSON)
            </summary>
            <div className="sol-cruda-caja">
              <BotonCopiar texto={json} etiqueta="Copiar JSON" />
              <pre tabIndex={0}>{json}</pre>
            </div>
          </details>
        )}
      </div>
    </section>
  )
}

function Reporte({ doc, cargando }) {
  const reporte = typeof doc?.reporte_markdown === 'string' ? doc.reporte_markdown.trim() : ''
  const respuesta = typeof doc?.respuesta_agente === 'string' ? doc.respuesta_agente.trim() : ''

  if (cargando) {
    return (
      <section className="seccion" aria-labelledby="det-reporte">
        <h3 id="det-reporte">Reporte del agente</h3>
        <p className="sr-only" role="status">
          Cargando el reporte…
        </p>
        <div className="reporte" aria-hidden="true">
          {[40, 96, 90, 72, 0, 30, 94, 84].map((ancho, i) =>
            ancho ? <span key={i} className="hueso" style={{ width: `${ancho}%` }} /> : <span key={i} className="hueso-salto" />,
          )}
        </div>
      </section>
    )
  }
  if (!reporte && !respuesta) return null

  return (
    <section className="seccion" aria-labelledby="det-reporte">
      <div className="seccion-cab">
        <h3 id="det-reporte">{reporte ? 'Reporte del agente' : 'Respuesta final del agente'}</h3>
        <BotonCopiar texto={reporte || respuesta} etiqueta="Copiar Markdown" />
      </div>
      <div className="reporte">
        <Markdown nivelBase={4} idPrefijo={reporte ? ID_REPORTE : undefined}>
          {reporte || respuesta}
        </Markdown>
      </div>
      {reporte && respuesta && (
        <details className="respuesta-final">
          <summary>Respuesta final del agente al terminar</summary>
          <Markdown nivelBase={4}>{respuesta}</Markdown>
        </details>
      )}
    </section>
  )
}

function Indice({ doc }) {
  const reporte = doc?.reporte_markdown
  const titulos = useMemo(() => indiceDe(reporte, ID_REPORTE), [reporte])
  if (titulos.length < 3) return null
  return (
    <nav className="ficha indice" aria-labelledby="det-indice">
      <h3 id="det-indice" className="rotulo">
        En el reporte
      </h3>
      <ul>
        {titulos.map((titulo) => (
          <li key={titulo.id}>
            <button type="button" onClick={() => irASeccion(titulo.id)}>
              {titulo.texto}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Barra({ inv, posicion, alPreguntar }) {
  const ir = (destino) => window.location.replace(rutaInvestigacion(destino.id))
  return (
    <div className="panel-barra">
      <a className="boton fantasma" href={RUTA_LISTA}>
        <Icono nombre="atras" />
        <span className="solo-estrecho">Investigaciones</span>
        <span className="solo-ancho">Resumen</span>
      </a>
      <span className="panel-barra-hueco" />
      {posicion.indice >= 0 && (
        <span className="posicion">
          {posicion.indice + 1} de {posicion.total}
        </span>
      )}
      <div className="pareja">
        <button
          type="button"
          className="boton-icono"
          onClick={() => ir(posicion.anterior)}
          disabled={!posicion.anterior}
          aria-label="Investigación anterior"
          title="Investigación anterior"
        >
          <Icono nombre="arriba" />
        </button>
        <button
          type="button"
          className="boton-icono"
          onClick={() => ir(posicion.siguiente)}
          disabled={!posicion.siguiente}
          aria-label="Investigación siguiente"
          title="Investigación siguiente"
        >
          <Icono nombre="abajo" />
        </button>
      </div>
      {alPreguntar && inv && (
        <button
          type="button"
          className="boton"
          onClick={() => alPreguntar(inv)}
          aria-label="Preguntar al agente"
          title="Abrir el chat con una pregunta sobre esta investigación"
        >
          <Icono nombre="pregunta" />
          <span className="barra-texto" aria-hidden="true">
            Preguntar al agente
          </span>
        </button>
      )}
    </div>
  )
}

export default function Detalle({ id, deLista, posicion, alPreguntar }) {
  // La lista ya sabe el estado y las fechas: si cambian, el detalle se vuelve a pedir.
  const firma = deLista ? `${deLista.estado}|${deLista.actualizado_en}|${deLista.finalizado_en}` : ''
  const { doc, error, noExiste, cargando, reintentar } = useInvestigacion(id, firma)
  // Mientras llega el detalle se adelanta lo que ya se conoce por la lista.
  const inv = doc ?? deLista
  const estado = inv ? estadoDe(inv).clave : null

  return (
    <div className="detalle-marco">
      <Barra inv={inv} posicion={posicion} alPreguntar={alPreguntar} />
      <p className="sr-only" role="status">
        {inv ? `Investigación abierta: ${tituloDe(inv)}` : ''}
      </p>

      {!inv && error ? (
        <EstadoCentral
          icono={noExiste ? 'buscar' : 'sinConexion'}
          titulo={noExiste ? 'Esta investigación no existe' : 'No se pudo cargar la investigación'}
          tono={noExiste ? 'neutro' : 'peligro'}
        >
          <h2 id="detalle-titulo" tabIndex={-1} className="sr-only">
            {noExiste ? 'Investigación no encontrada' : 'Error al cargar la investigación'}
          </h2>
          <p>{noExiste ? 'Puede que el enlace esté incompleto o que el registro se haya eliminado.' : error}</p>
          {noExiste ? (
            <a className="boton" href={RUTA_LISTA}>
              <Icono nombre="atras" /> Volver a las investigaciones
            </a>
          ) : (
            <button type="button" className="boton" onClick={reintentar}>
              <Icono nombre="actualizar" /> Reintentar
            </button>
          )}
        </EstadoCentral>
      ) : !inv ? (
        <div className="detalle" aria-busy="true">
          <h2 id="detalle-titulo" tabIndex={-1} className="sr-only">
            Cargando la investigación…
          </h2>
          <div aria-hidden="true" className="detalle-esqueleto">
            <span className="hueso" style={{ width: '28%' }} />
            <span className="hueso titulo" style={{ width: '70%' }} />
            <span className="hueso" style={{ width: '40%' }} />
            <span className="hueso bloque" style={{ height: 120 }} />
            <span className="hueso bloque" style={{ height: 260 }} />
          </div>
        </div>
      ) : (
        <article className="detalle" key={id} aria-labelledby="detalle-titulo">
          <header className="det-cab">
            <p className="antetitulo">
              {inv.origen === 'wazuh'
                ? ['Alerta de Wazuh', inv.regla_id && `regla ${inv.regla_id}`, inv.regla_nivel != null && `nivel ${inv.regla_nivel}`]
                    .filter(Boolean)
                    .join(' · ')
                : inv.origen === 'chat'
                  ? 'Registrada desde el chat'
                  : 'Investigación'}
            </p>
            <h2 id="detalle-titulo" tabIndex={-1}>
              {tituloDe(inv)}
            </h2>
            <div className="det-insignias">
              <Severidad inv={inv} enCaja />
              <Tipo inv={inv} />
              <Estado inv={inv} enCaja />
            </div>
          </header>

          <div className="det-cuerpo">
            <div className="det-inicio">
              {error && (
                <Aviso
                  tono="peligro"
                  titulo="No se pudo cargar el detalle completo"
                  accion={
                    <button type="button" className="boton chico" onClick={reintentar}>
                      Reintentar
                    </button>
                  }
                >
                  <p>{error} Se muestran solo los datos de la lista.</p>
                </Aviso>
              )}
              {estado === 'en_curso' && (
                <Aviso tono="curso" titulo="El agente está investigando esta alerta">
                  <p>
                    Reúne evidencia y decide la respuesta. Esta página se completa sola en cuanto registre el resultado.
                  </p>
                </Aviso>
              )}
              {estado === 'error' && (
                <Aviso tono="peligro" titulo="La investigación terminó con un error">
                  {inv.error ? <pre className="aviso-pre">{String(inv.error)}</pre> : <p>El agente no pudo completarla.</p>}
                </Aviso>
              )}
              {estado === 'sin_registrar' && (
                <Aviso tono="atencion" titulo="El agente terminó sin registrar el resultado">
                  <p>No hay severidad, conclusión ni reporte. Si dejó una respuesta final, aparece más abajo.</p>
                </Aviso>
              )}
              {inv.conclusion && (
                <section className="conclusion" aria-labelledby="det-conclusion">
                  <h3 id="det-conclusion" className="rotulo">
                    Conclusión
                  </h3>
                  <p>{inv.conclusion}</p>
                </section>
              )}
            </div>

            <aside className="det-lateral" aria-label="Datos de la investigación">
              <Datos inv={inv} />
              <Cronologia inv={inv} />
              <Indice doc={doc} />
            </aside>

            <div className="det-resto">
              <Acciones inv={inv} />
              {doc && <Solicitud doc={doc} />}
              <Reporte doc={doc} cargando={cargando && !error} />
            </div>
          </div>
        </article>
      )}
    </div>
  )
}
