import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import Chat from './Chat.jsx'
import Barrera from './componentes/Barrera.jsx'
import Icono from './componentes/Icono.jsx'
import Marca from './componentes/Marca.jsx'
import Investigaciones from './Investigaciones.jsx'
import { RUTA_CHAT, RUTA_LISTA, interpretarRuta, navegar, useRuta } from './lib/ruta.js'
import { useTema } from './lib/tema.js'

// ChatKit exige un dominio registrado en OpenAI; sin su clave se usa el chat propio.
const ChatKitChat = import.meta.env.VITE_CHATKIT_DOMAIN_KEY ? lazy(() => import('./ChatKitChat.jsx')) : null

const TITULOS = { investigaciones: 'Investigaciones', chat: 'Chat con el agente' }

export default function App() {
  const ruta = useRuta()
  const [tema, alternarTema] = useTema()
  const [borrador, setBorrador] = useState(null)

  // Mientras se está en el chat, la vista de investigaciones conserva su última ruta: sigue
  // montada tal cual y, al volver, se retoma la investigación que se estaba leyendo.
  const [rutaInvestigaciones, setRutaInvestigaciones] = useState(() =>
    ruta.vista === 'investigaciones' ? ruta : interpretarRuta(RUTA_LISTA),
  )
  useEffect(() => {
    if (ruta.vista === 'investigaciones') setRutaInvestigaciones(ruta)
    document.title = `${TITULOS[ruta.vista]} · Agente SOC`
  }, [ruta])

  // Abre el chat con una pregunta ya escrita sobre una investigación; no se envía sola.
  const preguntarPor = useCallback((inv) => {
    setBorrador({
      texto: `Explícame la investigación con id ${inv.id}: qué evidencia la respalda y qué acciones adicionales recomiendas.`,
      marca: Date.now(),
    })
    navegar(RUTA_CHAT)
  }, [])

  const enChat = ruta.vista === 'chat'

  return (
    <div className="app">
      <a
        className="saltar"
        href="#contenido"
        onClick={(e) => {
          // El fragmento de la URL es de la navegación: el salto se hace moviendo el foco.
          e.preventDefault()
          document.getElementById('contenido')?.focus()
        }}
      >
        Saltar al contenido
      </a>
      <header className="barra">
        <a className="barra-marca" href={RUTA_LISTA} aria-label="Agente SOC: ir a las investigaciones">
          <Marca />
          <span className="barra-nombre">Agente SOC</span>
          <span className="barra-contexto">Wazuh · RappiSim</span>
        </a>
        <nav className="barra-nav" aria-label="Secciones">
          <a href={enChat ? rutaInvestigaciones.hash : RUTA_LISTA} aria-current={enChat ? undefined : 'page'}>
            <Icono nombre="investigaciones" />
            Investigaciones
          </a>
          <a href={RUTA_CHAT} aria-current={enChat ? 'page' : undefined}>
            <Icono nombre="chat" />
            Chat
          </a>
        </nav>
        <button
          type="button"
          className="boton-icono"
          onClick={alternarTema}
          aria-label={tema === 'oscuro' ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro'}
          title={tema === 'oscuro' ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro'}
        >
          <Icono nombre={tema === 'oscuro' ? 'sol' : 'luna'} tam={18} />
        </button>
      </header>

      {/* Las dos vistas siguen montadas: así no se pierde la conversación al cambiar de sección. */}
      <main className="vista" id={enChat ? undefined : 'contenido'} tabIndex={-1} hidden={enChat}>
        <Barrera>
          <Investigaciones
            activa={!enChat}
            ruta={enChat ? rutaInvestigaciones : ruta}
            alPreguntar={ChatKitChat ? null : preguntarPor}
          />
        </Barrera>
      </main>
      <main className="vista vista-chat" id={enChat ? 'contenido' : undefined} tabIndex={-1} hidden={!enChat}>
        <Barrera>
          {ChatKitChat ? (
            <>
              <h1 className="sr-only">Chat con el agente</h1>
              <Suspense fallback={null}>
                <ChatKitChat />
              </Suspense>
            </>
          ) : (
            <Chat borrador={borrador} activo={enChat} />
          )}
        </Barrera>
      </main>
    </div>
  )
}
