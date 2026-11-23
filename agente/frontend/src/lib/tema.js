// Tema claro u oscuro. Sin elección guardada se sigue al sistema (prefers-color-scheme);
// al usar el conmutador, la elección se recuerda en este navegador.
// index.html aplica el mismo criterio antes del primer pintado para evitar parpadeos.

import { useCallback, useEffect, useState } from 'react'

const CLAVE = 'agente-soc:tema'
const CONSULTA = '(prefers-color-scheme: dark)'
const COLOR_BARRA = { claro: '#ffffff', oscuro: '#13151a' }

function temaGuardado() {
  try {
    const valor = window.localStorage.getItem(CLAVE)
    return valor === 'claro' || valor === 'oscuro' ? valor : null
  } catch {
    return null
  }
}

function temaDelSistema() {
  return window.matchMedia?.(CONSULTA).matches ? 'oscuro' : 'claro'
}

export function useTema() {
  const [manual, setManual] = useState(() => temaGuardado() !== null)
  const [tema, setTema] = useState(() => temaGuardado() ?? temaDelSistema())

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema])
  }, [tema])

  // Mientras no haya elección manual, se acompaña al sistema si cambia.
  useEffect(() => {
    if (manual || !window.matchMedia) return undefined
    const consulta = window.matchMedia(CONSULTA)
    const alCambiar = (e) => setTema(e.matches ? 'oscuro' : 'claro')
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [manual])

  const alternar = useCallback(() => {
    const nuevo = tema === 'oscuro' ? 'claro' : 'oscuro'
    try {
      window.localStorage.setItem(CLAVE, nuevo)
    } catch {
      // Sin almacenamiento (modo privado estricto): el cambio vale solo para esta visita.
    }
    setManual(true)
    setTema(nuevo)
  }, [tema])

  return [tema, alternar]
}
