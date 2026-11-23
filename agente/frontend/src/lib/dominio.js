// Vocabulario de las investigaciones y cálculos derivados de la lista.
// Cualquier campo puede faltar o venir con un formato inesperado (lo escribe un modelo de
// lenguaje), así que todo se normaliza aquí antes de mostrarse.

import { leerFecha } from './formato.js'

export const SEVERIDADES = ['critica', 'alta', 'media', 'baja']

export const SEVERIDAD = {
  critica: { etiqueta: 'Crítica', nivel: 4 },
  alta: { etiqueta: 'Alta', nivel: 3 },
  media: { etiqueta: 'Media', nivel: 2 },
  baja: { etiqueta: 'Baja', nivel: 1 },
}

const TIPOS = {
  sql_injection: 'Inyección SQL',
  xss: 'XSS',
  idor: 'IDOR',
  fuerza_bruta: 'Fuerza bruta',
  falso_positivo: 'Falso positivo',
  otro: 'Otro',
}

const ESTADOS = {
  concluida: 'Concluida',
  en_curso: 'En curso',
  sin_registrar: 'Sin registrar',
  error: 'Error',
}

// "Crítica " -> "critica" · "SQL Injection" -> "sql_injection"
export function clave(valor) {
  if (valor == null) return ''
  return String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function severidadDe(inv) {
  const s = clave(inv?.severidad)
  return s in SEVERIDAD ? s : null
}

// Devuelve { clave, etiqueta }; un tipo desconocido conserva su texto original.
export function tipoDe(inv) {
  if (inv?.tipo_ataque == null || inv.tipo_ataque === '') return null
  const t = clave(inv.tipo_ataque)
  return { clave: t, etiqueta: TIPOS[t] || String(inv.tipo_ataque) }
}

export function estadoDe(inv) {
  const e = clave(inv?.estado)
  if (e in ESTADOS) return { clave: e, etiqueta: ESTADOS[e] }
  return { clave: 'desconocido', etiqueta: inv?.estado ? String(inv.estado) : 'Sin estado' }
}

export function tituloDe(inv) {
  return inv?.titulo || inv?.regla_descripcion || 'Investigación sin título'
}

const ACCIONES = {
  bloquear_ip: { etiqueta: 'IP bloqueada', icono: 'bloquear', uno: 'IP bloqueada', varios: 'IP bloqueadas' },
  eliminar_resena: { etiqueta: 'Reseña eliminada', icono: 'papelera', uno: 'reseña eliminada', varios: 'reseñas eliminadas' },
}

// "bloquear_ip 203.0.113.45" -> { verbo, objetivo, etiqueta, icono, texto }
function interpretarAccion(texto) {
  const original = String(texto ?? '').trim()
  const corte = original.search(/\s/)
  const verbo = clave(corte === -1 ? original : original.slice(0, corte))
  const objetivo = corte === -1 ? '' : original.slice(corte).trim()
  const conocida = ACCIONES[verbo]
  if (conocida) {
    return {
      verbo,
      objetivo: verbo === 'eliminar_resena' && /^\d+$/.test(objetivo) ? `n.º ${objetivo}` : objetivo,
      etiqueta: conocida.etiqueta,
      icono: conocida.icono,
      texto: original,
    }
  }
  // Acción con forma de herramienta ("otra_accion objetivo"): se presenta el verbo legible.
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(verbo)) {
    const legible = verbo.replace(/_/g, ' ')
    return { verbo, objetivo, etiqueta: legible[0].toUpperCase() + legible.slice(1), icono: 'rayo', texto: original }
  }
  return { verbo: 'otra', objetivo: '', etiqueta: original, icono: 'rayo', texto: original }
}

export function accionesDe(inv) {
  const valor = inv?.acciones_ejecutadas
  const lista = Array.isArray(valor) ? valor : typeof valor === 'string' ? [valor] : []
  return lista.filter((a) => a != null && String(a).trim() !== '').map(interpretarAccion)
}

export function etiquetaAcciones(verbo, n) {
  const conocida = ACCIONES[verbo]
  if (conocida) return `${n} ${n === 1 ? conocida.uno : conocida.varios}`
  return `${n} ${n === 1 ? 'otra acción' : 'otras acciones'}`
}

// Texto donde busca el filtro: título, IP, regla, tipo, estado y conclusión.
function textoBuscable(inv) {
  const tipo = tipoDe(inv)
  const sev = severidadDe(inv)
  return clave(
    [
      inv.titulo,
      inv.regla_descripcion,
      inv.ip_origen,
      inv.regla_id,
      inv.id,
      tipo?.etiqueta,
      tipo?.clave,
      sev && SEVERIDAD[sev].etiqueta,
      estadoDe(inv).etiqueta,
      inv.conclusion,
    ]
      .filter(Boolean)
      .join(' '),
  )
}

// `severidad` puede ser una de SEVERIDADES, 'ninguna' (sin clasificar) o null (todas).
export function filtrar(items, { texto = '', severidad = null } = {}) {
  const terminos = clave(texto).split('_').filter(Boolean)
  return items.filter((inv) => {
    if (severidad && (severidadDe(inv) ?? 'ninguna') !== severidad) return false
    if (!terminos.length) return true
    const pajar = textoBuscable(inv)
    return terminos.every((t) => pajar.includes(t))
  })
}

// Cifras del resumen a partir de la lista que devuelve el backend.
export function resumir(items) {
  const porSeveridad = { critica: 0, alta: 0, media: 0, baja: 0, ninguna: 0 }
  const tipos = new Map()
  const origenes = new Map()
  const porVerbo = new Map()
  const recientes = []
  const duraciones = []
  const enCurso = []
  let conError = 0
  let conRespuesta = 0
  let totalAcciones = 0

  for (const inv of items) {
    const sev = severidadDe(inv)
    porSeveridad[sev ?? 'ninguna'] += 1

    const estado = estadoDe(inv).clave
    if (estado === 'en_curso') enCurso.push(inv)
    if (estado === 'error') conError += 1

    const tipo = tipoDe(inv)
    if (tipo) {
      const previo = tipos.get(tipo.clave)
      tipos.set(tipo.clave, { ...tipo, n: (previo?.n ?? 0) + 1 })
    }

    const acciones = accionesDe(inv)
    if (acciones.length) conRespuesta += 1
    totalAcciones += acciones.length
    for (const accion of acciones) {
      const grupo = accion.verbo in ACCIONES ? accion.verbo : 'otra'
      porVerbo.set(grupo, (porVerbo.get(grupo) ?? 0) + 1)
      recientes.push({ ...accion, inv })
    }

    const segundos = Number(inv.duracion_segundos)
    if (inv.duracion_segundos != null && Number.isFinite(segundos) && segundos >= 0) duraciones.push(segundos)

    if (inv.ip_origen) {
      const ip = String(inv.ip_origen)
      const o = origenes.get(ip) ?? { ip, n: 0, nivel: 0, severidad: null, bloqueada: false }
      o.n += 1
      if (sev && SEVERIDAD[sev].nivel > o.nivel) {
        o.nivel = SEVERIDAD[sev].nivel
        o.severidad = sev
      }
      if (acciones.some((a) => a.verbo === 'bloquear_ip' && a.objetivo.split(/\s/)[0] === ip)) o.bloqueada = true
      origenes.set(ip, o)
    }
  }

  // La lista llega ordenada de más reciente a más antigua; se conserva ese orden.
  const fechaDe = (inv) => leerFecha(inv.finalizado_en ?? inv.creado_en)?.getTime() ?? 0
  recientes.sort((a, b) => fechaDe(b.inv) - fechaDe(a.inv))

  return {
    total: items.length,
    porSeveridad,
    enCurso,
    conError,
    conRespuesta,
    acciones: {
      total: totalAcciones,
      porVerbo: [...porVerbo.entries()].map(([verbo, n]) => ({ verbo, n })).sort((a, b) => b.n - a.n),
      recientes,
    },
    tipos: [...tipos.values()].sort((a, b) => b.n - a.n),
    origenes: [...origenes.values()].sort((a, b) => b.n - a.n || b.nivel - a.nivel),
    duracion: duraciones.length
      ? {
          media: duraciones.reduce((s, d) => s + d, 0) / duraciones.length,
          minima: Math.min(...duraciones),
          maxima: Math.max(...duraciones),
          n: duraciones.length,
        }
      : null,
  }
}

// Solicitud HTTP que disparó la alerta (formato gcp-pubsub de Wazuh), si existe.
export function solicitudDe(doc) {
  const carga = doc?.alerta?.data?.gcp?.jsonPayload
  return carga && typeof carga === 'object' ? carga : null
}

// Decodifica una cadena de consulta para leerla mejor; null si no cambia o no es válida.
export function decodificarConsulta(consulta) {
  if (!consulta) return null
  try {
    const legible = decodeURIComponent(String(consulta).replace(/\+/g, ' '))
    return legible !== consulta ? legible : null
  } catch {
    return null
  }
}
