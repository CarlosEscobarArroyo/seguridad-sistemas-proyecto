const APP_NAME = 'app'
const USER_ID = 'analista'

// Error de una llamada al backend, con un mensaje listo para mostrar.
class ErrorApi extends Error {
  constructor(mensaje, estado = 0) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
  }
}

function mensajeHttp(estado) {
  if (estado === 401 || estado === 403) return 'El servidor rechazó el acceso. Recarga la página para volver a identificarte.'
  if (estado === 404) return 'El servidor no encontró lo que se pidió (HTTP 404).'
  if (estado >= 500) return `El servidor respondió con un error (HTTP ${estado}).`
  return `Respuesta inesperada del servidor (HTTP ${estado}).`
}

// Mismo origen y sin cabeceras propias: el navegador ya gestiona la autenticación HTTP Basic.
async function pedirJson(url, signal) {
  let res
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ErrorApi('No se pudo conectar con el servidor.')
  }
  if (!res.ok) throw new ErrorApi(mensajeHttp(res.status), res.status)
  try {
    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ErrorApi('El servidor devolvió una respuesta que no se pudo interpretar.')
  }
}

const FECHAS = ['creado_en', 'finalizado_en', 'actualizado_en']
const TEXTOS = [
  'titulo',
  'severidad',
  'tipo_ataque',
  'estado',
  'origen',
  'ip_origen',
  'conclusion',
  'regla_id',
  'regla_descripcion',
  'error',
  'respuesta_agente',
  'reporte_markdown',
]
const SIN_VALOR = new Set(['', 'None', 'null'])

function comoTexto(valor) {
  if (typeof valor === 'string') return valor
  if (typeof valor === 'object') {
    try {
      return JSON.stringify(valor)
    } catch {
      return String(valor)
    }
  }
  return String(valor)
}

// Deja cada investigación en una forma segura de pintar. Los campos los escribe un modelo de
// lenguaje y cualquiera puede faltar o llegar con otro tipo: aquí los de texto pasan a ser
// siempre cadenas, las acciones una lista de cadenas y las fechas ausentes (que la lista
// serializa como "None") desaparecen. No se interpreta nada: solo se normalizan los tipos.
function normalizar(doc, id = doc.id) {
  const inv = { ...doc, id: String(id) }
  for (const campo of TEXTOS) {
    if (inv[campo] == null) delete inv[campo]
    else inv[campo] = comoTexto(inv[campo])
  }
  for (const campo of FECHAS) {
    if (inv[campo] == null || SIN_VALOR.has(String(inv[campo]).trim())) delete inv[campo]
    else inv[campo] = comoTexto(inv[campo])
  }
  const acciones = inv.acciones_ejecutadas
  inv.acciones_ejecutadas = (Array.isArray(acciones) ? acciones : acciones == null ? [] : [acciones])
    .filter((a) => a != null)
    .map(comoTexto)
  if (inv.regla_nivel != null && typeof inv.regla_nivel === 'object') inv.regla_nivel = comoTexto(inv.regla_nivel)
  return inv
}

// Investigaciones más recientes primero, sin el reporte completo.
export async function listarInvestigaciones(signal) {
  const datos = await pedirJson('/api/investigaciones', signal)
  if (!Array.isArray(datos)) throw new ErrorApi('El servidor devolvió una lista con un formato inesperado.')
  return datos.filter((d) => d && typeof d === 'object' && !Array.isArray(d) && d.id != null).map((d) => normalizar(d))
}

// Investigación completa: incluye `reporte_markdown` y la alerta de Wazuh.
export async function obtenerInvestigacion(id, signal) {
  const datos = await pedirJson(`/api/investigaciones/${encodeURIComponent(id)}`, signal)
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorApi('El servidor devolvió una investigación con un formato inesperado.')
  }
  return normalizar(datos, id)
}

export async function createSession() {
  const res = await fetch(`/apps/${APP_NAME}/users/${USER_ID}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(`No se pudo crear la sesión (HTTP ${res.status})`)
  return (await res.json()).id
}

// Envía un mensaje al agente y entrega cada evento ADK recibido por SSE.
export async function sendMessage(sessionId, text, onEvent) {
  const res = await fetch('/run_sse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_name: APP_NAME,
      user_id: USER_ID,
      session_id: sessionId,
      new_message: { role: 'user', parts: [{ text }] },
      streaming: true,
    }),
  })
  if (!res.ok || !res.body) throw new Error(`El agente respondió HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data) onEvent(JSON.parse(data))
    }
  }
}
