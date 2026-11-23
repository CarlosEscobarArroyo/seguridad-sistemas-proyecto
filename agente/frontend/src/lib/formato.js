// Fechas, duraciones y cifras tal como se muestran en el panel.

const FECHA_PYTHON = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?(\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/

// El backend serializa las fechas con `str(datetime)` ("2026-11-22 20:02:58.373000+00:00"),
// un formato que no todos los navegadores aceptan: aquí se lleva a ISO 8601 estricto.
export function leerFecha(valor) {
  if (valor == null || valor === '') return null
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor
  if (typeof valor === 'number') return new Date(valor)
  const texto = String(valor).trim()
  const m = FECHA_PYTHON.exec(texto)
  let fecha
  if (m) {
    const [, dia, hora, segundos = ':00', fraccion = '', zona = ''] = m
    const milesimas = fraccion ? fraccion.slice(0, 4).padEnd(4, '0') : ''
    const desfase = zona && zona !== 'Z' && !zona.includes(':') ? `${zona.slice(0, 3)}:${zona.slice(3)}` : zona
    fecha = new Date(`${dia}T${hora}${segundos}${milesimas}${desfase}`)
  } else {
    fecha = new Date(texto)
  }
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

const FORMATO_LARGO = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
})
const FORMATO_DIA = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const FORMATO_DIA_ANIO = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' })
const FORMATO_HORA = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// "22 nov 2026, 15:02:58 GMT-5". Si el valor no es una fecha, se devuelve tal cual.
export function fechaLarga(valor) {
  const fecha = leerFecha(valor)
  if (!fecha) return valor ? String(valor) : '—'
  return FORMATO_LARGO.format(fecha)
}

export function horaExacta(valor) {
  const fecha = leerFecha(valor)
  return fecha ? FORMATO_HORA.format(fecha) : '—'
}

export function fechaIso(valor) {
  const fecha = leerFecha(valor)
  return fecha ? fecha.toISOString() : undefined
}

// "hace 5 min", "hace 2 h", "ayer", "hace 3 días" o el día ("12 nov") si es más antiguo.
export function tiempoRelativo(valor, ahora = Date.now()) {
  const fecha = leerFecha(valor)
  if (!fecha) return valor ? String(valor) : '—'
  const segundos = Math.round((ahora - fecha.getTime()) / 1000)
  if (segundos < 10) return 'ahora'
  if (segundos < 60) return `hace ${segundos} s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  const mismoAnio = fecha.getFullYear() === new Date(ahora).getFullYear()
  return (mismoAnio ? FORMATO_DIA : FORMATO_DIA_ANIO).format(fecha)
}

const UN_DECIMAL = new Intl.NumberFormat('es', { maximumFractionDigits: 1 })

// 8.4 -> "8,4 s" · 48.2 -> "48 s" · 92 -> "1 min 32 s" · 7500 -> "2 h 5 min"
export function duracion(segundos) {
  const valor = Number(segundos)
  if (segundos == null || segundos === '' || !Number.isFinite(valor) || valor < 0) return '—'
  if (valor < 10) return `${UN_DECIMAL.format(valor)} s`
  const total = Math.round(valor)
  if (total < 60) return `${total} s`
  const minutos = Math.floor(total / 60)
  const resto = total % 60
  if (minutos < 60) return resto ? `${minutos} min ${resto} s` : `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const minutosResto = minutos % 60
  return minutosResto ? `${horas} h ${minutosResto} min` : `${horas} h`
}

// plural(1, 'acción', 'acciones') -> "1 acción"
export function plural(n, singular, variosTexto) {
  return `${n} ${n === 1 ? singular : variosTexto}`
}
