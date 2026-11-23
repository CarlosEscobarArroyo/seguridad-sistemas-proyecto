import { Aviso } from '../componentes/Aviso.jsx'
import Distribucion from '../componentes/Distribucion.jsx'
import Icono from '../componentes/Icono.jsx'
import { GlifoSeveridad, Severidad } from '../componentes/Insignias.jsx'
import { SEVERIDAD, SEVERIDADES, etiquetaAcciones, tituloDe } from '../lib/dominio.js'
import { duracion, plural, tiempoRelativo } from '../lib/formato.js'
import { RUTA_LISTA, rutaInvestigacion } from '../lib/ruta.js'

const MAX_ACCIONES = 6
const MAX_ORIGENES = 5

function Cifra({ etiqueta, valor, unidad, children }) {
  return (
    <div className="cifra">
      <dt>{etiqueta}</dt>
      <dd>
        <span className="cifra-valor">
          {valor}
          {unidad && <span className="cifra-unidad"> {unidad}</span>}
        </span>
        {children && <span className="cifra-nota">{children}</span>}
      </dd>
    </div>
  )
}

// Reparto por severidad: la barra segmentada y, debajo, una fila por nivel con su recuento y su
// porcentaje. El glifo de barras hace de muestra de color y dice el nivel sin depender de él.
function PorSeveridad({ porSeveridad, total }) {
  const niveles = [...SEVERIDADES, 'ninguna'].filter((s) => s !== 'ninguna' || porSeveridad.ninguna > 0)
  return (
    <>
      <Distribucion porSeveridad={porSeveridad} />
      <ul className="leyenda-sev">
        {niveles.map((s) => (
          <li key={s}>
            <GlifoSeveridad severidad={s === 'ninguna' ? null : s} />
            <span className="leyenda-nombre">{s === 'ninguna' ? 'Sin clasificar' : SEVERIDAD[s].etiqueta}</span>
            <span className="leyenda-n">{porSeveridad[s]}</span>
            <span className="leyenda-pct">{`${total ? Math.round((porSeveridad[s] / total) * 100) : 0}\u00a0%`}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

// Barras horizontales ordenadas de mayor a menor, de un solo color: cada fila lleva su nombre
// y su recuento, así que se leen sin depender del color ni de pasar el cursor.
function TiposDeIncidente({ tipos, sinTipo }) {
  if (!tipos.length) return <p className="tenue">Todavía no hay investigaciones clasificadas.</p>
  const maximo = tipos[0].n
  return (
    <>
      <ul className="barras">
        {tipos.map((tipo) => (
          <li key={tipo.clave}>
            <span className="barras-nombre">{tipo.etiqueta}</span>
            <span className="barras-pista" aria-hidden="true">
              <span className="barras-valor" style={{ width: `${(tipo.n / maximo) * 100}%` }} />
            </span>
            <span className="barras-n">{tipo.n}</span>
          </li>
        ))}
      </ul>
      {sinTipo > 0 && <p className="tenue nota-pie">{plural(sinTipo, 'investigación', 'investigaciones')} sin clasificar todavía.</p>}
    </>
  )
}

function UltimasAcciones({ acciones }) {
  if (!acciones.length) return <p className="tenue">El agente todavía no ha ejecutado acciones de respuesta.</p>
  const ahora = Date.now()
  return (
    <ul className="acciones">
      {acciones.slice(0, MAX_ACCIONES).map((accion, i) => (
        <li key={`${accion.inv.id}-${i}`}>
          <span className="accion-icono">
            <Icono nombre={accion.icono} />
          </span>
          <div className="accion-texto">
            <p>
              <span className="accion-etiqueta">{accion.etiqueta}</span>
              {accion.objetivo && <span className="mono accion-objetivo">{accion.objetivo}</span>}
            </p>
            <p className="tenue">
              <a className="enlace" href={rutaInvestigacion(accion.inv.id)}>
                {tituloDe(accion.inv)}
              </a>
              {' · '}
              {tiempoRelativo(accion.inv.finalizado_en ?? accion.inv.creado_en, ahora)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function Origenes({ origenes, alFiltrarIp }) {
  return (
    <>
      <div className="origenes-cab" aria-hidden="true">
        <span>Dirección IP</span>
        <span>Actividad</span>
        <span>Severidad máxima</span>
        <span>Respuesta</span>
      </div>
      <ul className="origenes">
        {origenes.slice(0, MAX_ORIGENES).map((origen) => (
          <li key={origen.ip}>
            <button
              type="button"
              className="origen"
              onClick={() => alFiltrarIp(origen.ip)}
              title="Ver las investigaciones de esta IP"
            >
              <span className="mono origen-ip">{origen.ip}</span>
              <span className="origen-n">{plural(origen.n, 'investigación', 'investigaciones')}</span>
              <span className="origen-sev">
                <span className="sr-only">Máxima </span>
                <Severidad severidad={origen.severidad} />
              </span>
              <span className="origen-bloqueo">
                {origen.bloqueada ? (
                  <span className="insignia bloqueada">
                    <Icono nombre="bloquear" tam={13} /> Bloqueada
                  </span>
                ) : (
                  <span className="tenue">Sin bloqueo</span>
                )}
              </span>
              <Icono nombre="derecha" className="origen-flecha" />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Esqueleto() {
  return (
    <div className="resumen-cuerpo" aria-hidden="true">
      <span className="hueso alto" style={{ width: '30%' }} />
      <span className="hueso" style={{ width: '60%' }} />
      <span className="hueso bloque" style={{ height: 96 }} />
      <span className="hueso bloque" style={{ height: 220 }} />
    </div>
  )
}

// Panel de lectura cuando no hay ninguna investigación abierta: cifras principales, tipos de
// incidente, últimas acciones del agente y orígenes con más actividad.
export default function Resumen({ resumen, alFiltrarIp }) {
  const barra = (
    <div className="panel-barra solo-estrecho">
      <a className="boton fantasma" href={RUTA_LISTA}>
        <Icono nombre="atras" /> Investigaciones
      </a>
    </div>
  )

  if (!resumen) {
    return (
      <div className="resumen">
        {barra}
        <h2 id="resumen-titulo" tabIndex={-1} className="sr-only">
          Resumen
        </h2>
        <Esqueleto />
      </div>
    )
  }

  const { total, enCurso, conError, conRespuesta, acciones, tipos, origenes } = resumen
  const clasificadas = tipos.reduce((suma, t) => suma + t.n, 0)
  const proporcion = total ? Math.round((conRespuesta / total) * 100) : 0
  const desglose = acciones.porVerbo.map((g) => etiquetaAcciones(g.verbo, g.n)).join(' · ')

  return (
    <div className="resumen">
      {barra}
      <div className="resumen-cuerpo">
        <header className="res-cab">
          <h2 id="resumen-titulo" tabIndex={-1}>
            Resumen
          </h2>
          <p>
            Qué investigó el agente y cómo respondió, según{' '}
            {total === 1 ? 'la investigación registrada' : `las ${total} investigaciones más recientes`}.
          </p>
        </header>

        {enCurso.length > 0 && (
          <Aviso
            tono="curso"
            titulo={
              enCurso.length === 1
                ? 'El agente está investigando una alerta'
                : `El agente está investigando ${enCurso.length} alertas`
            }
          >
            <ul className="aviso-lista">
              {enCurso.map((inv) => (
                <li key={inv.id}>
                  <a className="enlace" href={rutaInvestigacion(inv.id)}>
                    {tituloDe(inv)}
                  </a>
                  {inv.creado_en && <span> · iniciada {tiempoRelativo(inv.creado_en)}</span>}
                </li>
              ))}
            </ul>
          </Aviso>
        )}

        <dl className="cifras">
          <Cifra etiqueta="Investigaciones" valor={total}>
            {enCurso.length > 0 ? `${enCurso.length} en curso` : 'Ninguna en curso'}
            {conError > 0 && ` · ${conError} con error`}
          </Cifra>
          <Cifra etiqueta="Con respuesta" valor={conRespuesta} unidad={`de ${total}`}>
            <span className="medidor" aria-hidden="true">
              <span style={{ width: `${proporcion}%` }} />
            </span>
            <span className="sr-only">{proporcion} % de las investigaciones</span>
          </Cifra>
          <Cifra etiqueta="Acciones ejecutadas" valor={acciones.total}>
            {desglose || 'Ninguna todavía'}
          </Cifra>
          <Cifra etiqueta="Duración media" valor={resumen.duracion ? duracion(resumen.duracion.media) : '—'}>
            {resumen.duracion
              ? resumen.duracion.n > 1
                ? `Entre ${duracion(resumen.duracion.minima)} y ${duracion(resumen.duracion.maxima)}`
                : 'Una investigación medida'
              : 'Sin investigaciones terminadas'}
          </Cifra>
        </dl>

        <div className="res-rejilla">
          <section className="tarjeta" aria-labelledby="res-severidad">
            <h3 id="res-severidad">Severidad</h3>
            <PorSeveridad porSeveridad={resumen.porSeveridad} total={total} />
          </section>

          <section className="tarjeta" aria-labelledby="res-tipos">
            <h3 id="res-tipos">Tipos de incidente</h3>
            <TiposDeIncidente tipos={tipos} sinTipo={total - clasificadas} />
          </section>

          <section className="tarjeta ancha" aria-labelledby="res-acciones">
            <h3 id="res-acciones">Últimas acciones de respuesta</h3>
            <UltimasAcciones acciones={acciones.recientes} />
          </section>

          {origenes.length > 0 && (
            <section className="tarjeta ancha" aria-labelledby="res-origenes">
              <h3 id="res-origenes">Orígenes con más actividad</h3>
              <Origenes origenes={origenes} alFiltrarIp={alFiltrarIp} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
