// Navegación por fragmento (#/…). El backend solo sirve "/" y "/assets", así que las rutas
// viven en el hash: funcionan el botón de atrás, los enlaces directos y la recarga.
//
//   #/investigaciones        lista (y resumen, si hay sitio para los dos paneles)
//   #/investigaciones/<id>   detalle de una investigación
//   #/resumen                resumen a pantalla completa en pantallas estrechas
//   #/chat                   conversación con el agente

import { useMemo, useSyncExternalStore } from 'react'

export const RUTA_LISTA = '#/investigaciones'
export const RUTA_RESUMEN = '#/resumen'
export const RUTA_CHAT = '#/chat'

export function rutaInvestigacion(id) {
  return `${RUTA_LISTA}/${encodeURIComponent(id)}`
}

function decodificar(parte) {
  try {
    return decodeURIComponent(parte)
  } catch {
    return parte
  }
}

export function interpretarRuta(hash) {
  const partes = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodificar)
  if (partes[0] === 'chat') return { vista: 'chat', panel: null, id: null, hash: RUTA_CHAT }
  if (partes[0] === 'resumen') return { vista: 'investigaciones', panel: 'resumen', id: null, hash: RUTA_RESUMEN }
  if (partes[0] === 'investigaciones' && partes[1]) {
    return { vista: 'investigaciones', panel: 'detalle', id: partes[1], hash: rutaInvestigacion(partes[1]) }
  }
  return { vista: 'investigaciones', panel: 'lista', id: null, hash: RUTA_LISTA }
}

function suscribir(avisar) {
  window.addEventListener('hashchange', avisar)
  return () => window.removeEventListener('hashchange', avisar)
}

export function useRuta() {
  const hash = useSyncExternalStore(suscribir, () => window.location.hash)
  return useMemo(() => interpretarRuta(hash), [hash])
}

export function navegar(hash) {
  window.location.hash = hash
}
