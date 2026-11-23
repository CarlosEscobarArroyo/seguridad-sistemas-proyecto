import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createSession, sendMessage } from './api.js'
import Icono from './componentes/Icono.jsx'
import Marca from './componentes/Marca.jsx'
import Markdown from './componentes/Markdown.jsx'

const TOOL_LABELS = {
  consultar_alertas_wazuh: 'Consultando alertas de Wazuh…',
  consultar_logs_cloud_run: 'Consultando los logs de la web…',
  buscar_conocimiento: 'Buscando en los playbooks…',
  bloquear_ip: 'Bloqueando la IP…',
  listar_resenas: 'Revisando las reseñas…',
  eliminar_resena: 'Eliminando la reseña…',
  registrar_investigacion: 'Registrando la investigación…',
  listar_investigaciones: 'Consultando las investigaciones…',
}

const SUGGESTIONS = [
  {
    icono: 'investigaciones',
    titulo: 'Repasar las investigaciones',
    texto: '¿Qué investigaciones hay registradas y qué acciones se ejecutaron?',
  },
  {
    icono: 'buscar',
    titulo: 'Revisar la actividad reciente',
    texto: 'Revisa los logs de la web de la última hora y dime si ves algo sospechoso',
  },
  {
    icono: 'bloquear',
    titulo: 'Entender los bloqueos',
    texto: '¿Qué direcciones IP se han bloqueado y por qué motivo?',
  },
  {
    icono: 'documento',
    titulo: 'Explicar la última investigación',
    texto: 'Resume la investigación más reciente y explica por qué se le asignó esa severidad',
  },
]

// Margen (px) dentro del cual se considera que el usuario sigue leyendo el final de la conversación.
const MARGEN_FINAL = 96

export default function Chat({ borrador, activo }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [anuncio, setAnuncio] = useState('')
  const sessionRef = useRef(null)
  const listaRef = useRef(null)
  const campoRef = useRef(null)
  const pegadoAlFinal = useRef(true)

  // La conversación acompaña a la respuesta mientras se escribe, salvo que el usuario haya
  // subido a leer algo anterior. Sin mensajes (pantalla inicial) se queda arriba.
  useEffect(() => {
    const lista = listaRef.current
    if (!lista) return
    if (messages.length === 0) lista.scrollTop = 0
    else if (pegadoAlFinal.current) lista.scrollTop = lista.scrollHeight
  }, [messages, status])

  // El campo crece con el texto (hasta el máximo que fija el CSS).
  useLayoutEffect(() => {
    const campo = campoRef.current
    if (!campo) return
    campo.style.height = 'auto'
    campo.style.height = `${campo.scrollHeight}px`
  }, [input, activo])

  // Pregunta preparada desde el detalle de una investigación: se deja escrita, sin enviarla.
  // Se aplica una sola vez y cuando el chat ya está a la vista (antes no se le puede dar el foco).
  const borradorAplicado = useRef(null)
  useEffect(() => {
    if (!borrador || !activo || borradorAplicado.current === borrador.marca) return
    borradorAplicado.current = borrador.marca
    setInput(borrador.texto)
    campoRef.current?.focus()
  }, [borrador, activo])

  const updateLast = (patch) =>
    setMessages((prev) => [...prev.slice(0, -1), { ...prev[prev.length - 1], ...patch }])

  async function submit(text) {
    text = text.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setStatus('Pensando…')
    setAnuncio('')
    pegadoAlFinal.current = true
    setMessages((prev) => [...prev, { role: 'user', text }, { role: 'agent', text: '' }])

    // `done` acumula los tramos de texto ya finalizados; `pending` el tramo en streaming.
    let done = ''
    let pending = ''
    try {
      if (!sessionRef.current) sessionRef.current = await createSession()
      await sendMessage(sessionRef.current, text, (event) => {
        const failure = event.error || event.errorMessage
        if (failure) throw new Error(failure)
        for (const part of event.content?.parts ?? []) {
          if (part.functionCall) {
            setStatus(TOOL_LABELS[part.functionCall.name] ?? `Ejecutando ${part.functionCall.name}…`)
          } else if (part.functionResponse) {
            setStatus('Analizando…')
          } else if (part.text && !part.thought) {
            if (event.partial) {
              pending += part.text
            } else {
              done += (done ? '\n\n' : '') + part.text
              pending = ''
            }
            setStatus('')
            updateLast({ text: done + (done && pending ? '\n\n' : '') + pending })
          }
        }
      })
      setAnuncio('El agente terminó de responder.')
    } catch (err) {
      updateLast({ text: done + pending, error: err.message })
      setAnuncio('La respuesta del agente terminó con un error.')
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  function nuevaConversacion() {
    if (busy) return
    sessionRef.current = null
    setMessages([])
    setInput('')
    setAnuncio('')
    campoRef.current?.focus()
  }

  function alDesplazar() {
    const lista = listaRef.current
    pegadoAlFinal.current = lista.scrollHeight - lista.scrollTop - lista.clientHeight < MARGEN_FINAL
  }

  function alTeclear(e) {
    // Intro envía; Mayús + Intro inserta un salto de línea. No se envía a mitad de una composición (IME).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit(input)
    }
  }

  const vacio = messages.length === 0

  return (
    <div className="conversacion">
      <header className="conv-cab">
        <div>
          <h1>Chat con el agente</h1>
          <p className="tenue">Consulta las investigaciones o pide una revisión de la actividad de la web.</p>
        </div>
        <button
          type="button"
          className="boton"
          onClick={nuevaConversacion}
          disabled={busy || vacio}
          aria-label="Nueva conversación"
          title="Empezar una conversación nueva"
        >
          <Icono nombre="nuevo" />
          <span className="barra-texto" aria-hidden="true">
            Nueva conversación
          </span>
        </button>
      </header>

      <div
        className="conv-mensajes"
        ref={listaRef}
        onScroll={alDesplazar}
        role="log"
        aria-label="Conversación con el agente"
        aria-live="off"
        tabIndex={0}
      >
        <div className="conv-columna">
          {vacio && (
            <div className="conv-vacio">
              <Marca tam={40} />
              <h2>¿Qué quieres revisar?</h2>
              <p className="tenue">
                El agente puede consultar las investigaciones registradas, los logs de la web y los playbooks, y
                ejecutar acciones de respuesta.
              </p>
              <ul className="sugerencias">
                {SUGGESTIONS.map((s) => (
                  <li key={s.texto}>
                    <button type="button" className="sugerencia" onClick={() => submit(s.texto)}>
                      <span className="sugerencia-icono">
                        <Icono nombre={s.icono} />
                      </span>
                      <span>
                        <span className="sugerencia-titulo">{s.titulo}</span>
                        <span className="sugerencia-texto">{s.texto}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="msg msg-usuario">
                <span className="sr-only">Tú: </span>
                {m.text}
              </div>
            ) : (
              (m.text || m.error) && (
                <div key={i} className="msg msg-agente">
                  <p className="msg-autor">
                    <Marca tam={18} /> Agente
                  </p>
                  {m.text && <Markdown nivelBase={3}>{m.text}</Markdown>}
                  {m.error && (
                    <p className="msg-error" role="alert">
                      <Icono nombre="fallo" /> Error: {m.error}
                    </p>
                  )}
                </div>
              )
            ),
          )}

          <div className="conv-estado" role="status">
            {status && (
              <span className="conv-estado-caja">
                <Icono nombre="cargando" className="girando" />
                {status}
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="sr-only" role="status">
        {anuncio}
      </p>

      <form
        className="redactor"
        onSubmit={(e) => {
          e.preventDefault()
          submit(input)
        }}
      >
        <div className="redactor-caja">
          <textarea
            ref={campoRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Pregunta al agente…"
            aria-label="Mensaje para el agente"
          />
          <button
            type="submit"
            className="boton-enviar"
            disabled={busy || !input.trim()}
            aria-label="Enviar mensaje"
            title="Enviar"
          >
            <Icono nombre={busy ? 'cargando' : 'enviar'} tam={18} className={busy ? 'girando' : ''} />
          </button>
        </div>
        <p className="redactor-ayuda tenue">Intro para enviar · Mayús + Intro para una línea nueva</p>
      </form>
    </div>
  )
}
