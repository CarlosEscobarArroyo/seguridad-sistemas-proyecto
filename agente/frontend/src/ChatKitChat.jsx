import { useEffect } from 'react'
import { ChatKit, useChatKit } from '@openai/chatkit-react'

const CHATKIT_SCRIPT = 'https://cdn.platform.openai.com/deployments/chatkit/chatkit.js'

// Chat alternativo con ChatKit. Solo se usa si el frontend se compila con
// VITE_CHATKIT_DOMAIN_KEY (clave del dominio registrado en la plataforma de OpenAI).
export default function ChatKitChat() {
  useEffect(() => {
    if (document.querySelector(`script[src="${CHATKIT_SCRIPT}"]`)) return
    const script = document.createElement('script')
    script.src = CHATKIT_SCRIPT
    script.async = true
    document.head.appendChild(script)
  }, [])

  const { control } = useChatKit({
    // Backend propio (ADK + servidor ChatKit), en el mismo origen que el panel.
    api: {
      url: '/chatkit',
      domainKey: import.meta.env.VITE_CHATKIT_DOMAIN_KEY,
    },
    locale: 'es',
    theme: 'dark',
    startScreen: {
      greeting: 'Agente SOC · Wazuh SIEM',
      prompts: [
        {
          label: 'Revisar alertas recientes',
          prompt: 'Revisa las alertas de Wazuh de las últimas 24 horas e investiga las más graves',
        },
        {
          label: 'Resumen de investigaciones',
          prompt: '¿Qué investigaciones hay registradas y qué acciones se ejecutaron?',
        },
      ],
    },
    composer: { placeholder: 'Escribe un mensaje para el agente…' },
  })

  return <ChatKit control={control} className="chat" />
}
