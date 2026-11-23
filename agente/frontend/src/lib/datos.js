// Carga de datos del backend: la lista (con refresco periódico) y el detalle de una investigación.

import { useCallback, useEffect, useRef, useState } from 'react'
import { listarInvestigaciones, obtenerInvestigacion } from '../api.js'

const INTERVALO_MS = 10000

// Lista de investigaciones. Mientras `activo` sea verdadero se refresca cada 10 s; con la
// pestaña del navegador oculta se pausa y se retoma al volver, para no gastar lecturas.
// Si un refresco falla se conservan los últimos datos y se informa en `error`.
export function useInvestigaciones(activo) {
  const [estado, setEstado] = useState({ items: null, error: null, actualizadoEn: null, cargando: false })
  const enVuelo = useRef(null)

  const cargar = useCallback(() => {
    if (enVuelo.current) return
    const control = new AbortController()
    enVuelo.current = control
    setEstado((previo) => ({ ...previo, cargando: true }))
    listarInvestigaciones(control.signal)
      .then((items) => setEstado({ items, error: null, actualizadoEn: new Date(), cargando: false }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setEstado((previo) => ({ ...previo, error: err.message || 'Error desconocido.', cargando: false }))
      })
      .finally(() => {
        if (enVuelo.current === control) enVuelo.current = null
      })
  }, [])

  useEffect(() => {
    if (!activo) return undefined
    const refrescar = () => {
      if (!document.hidden) cargar()
    }
    refrescar()
    const temporizador = setInterval(refrescar, INTERVALO_MS)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      clearInterval(temporizador)
      document.removeEventListener('visibilitychange', refrescar)
      enVuelo.current?.abort()
      enVuelo.current = null
    }
  }, [activo, cargar])

  return { ...estado, recargar: cargar }
}

// Detalle de una investigación. `firma` resume lo que la lista sabe de ella (estado y fechas):
// cuando cambia, el detalle se vuelve a pedir sin vaciar la pantalla. Así una investigación
// en curso se completa sola al terminar.
export function useInvestigacion(id, firma) {
  const [estado, setEstado] = useState({ id: null, doc: null, error: null, http: 0 })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!id) return undefined
    const control = new AbortController()
    obtenerInvestigacion(id, control.signal)
      .then((doc) => setEstado({ id, doc, error: null, http: 200 }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setEstado((previo) =>
          // Un refresco fallido no borra lo que ya se estaba leyendo.
          previo.id === id && previo.doc
            ? previo
            : { id, doc: null, error: err.message || 'Error desconocido.', http: err.estado ?? 0 },
        )
      })
    return () => control.abort()
  }, [id, firma, intento])

  const vigente = estado.id === id
  const reintentar = useCallback(() => {
    setEstado({ id: null, doc: null, error: null, http: 0 })
    setIntento((n) => n + 1)
  }, [])

  return {
    doc: vigente ? estado.doc : null,
    error: vigente ? estado.error : null,
    noExiste: vigente && estado.http === 404,
    cargando: !vigente,
    reintentar,
  }
}
