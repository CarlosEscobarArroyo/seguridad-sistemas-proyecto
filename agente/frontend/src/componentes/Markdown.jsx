import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// SEGURIDAD: los reportes y los mensajes del agente citan cargas de atacantes
// (<script>, <img onerror=…>). Por eso aquí:
//   · react-markdown se usa sin `rehype-raw`: el HTML crudo nunca se interpreta, se ve como texto;
//   · las imágenes de Markdown no se cargan (serían peticiones a servidores ajenos);
//   · solo son clicables los enlaces http(s) y mailto, y se abren en otra pestaña sin `opener`.
// No añadas `rehype-raw` ni `dangerouslySetInnerHTML` en ningún punto del panel.

const ENLACE_SEGURO = /^(https?:\/\/|mailto:)/i

function Enlace({ node: _nodo, href, children, ...resto }) {
  if (!href || !ENLACE_SEGURO.test(href)) return <span className="md-enlace-inerte">{children}</span>
  return (
    <a {...resto} href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  )
}

function Imagen({ alt, src }) {
  return <span className="md-imagen">[imagen no cargada{alt ? `: ${alt}` : ''}{src ? ` · ${src}` : ''}]</span>
}

function Tabla({ node: _nodo, ...resto }) {
  return (
    <div className="md-tabla" role="region" aria-label="Tabla del documento" tabIndex={0}>
      <table {...resto} />
    </div>
  )
}

// Los títulos del Markdown se encajan en la jerarquía de la página: el nivel 1 del documento se
// representa con <h{nivelBase}>, el 2 con el siguiente, etc. Con `idPrefijo` reciben un id estable
// (según su línea en el texto) para que el índice del reporte pueda saltar a ellos.
function fabricarTitulos(nivelBase, idPrefijo) {
  const titulos = {}
  for (let nivel = 1; nivel <= 6; nivel += 1) {
    const Etiqueta = `h${Math.min(6, nivelBase + nivel - 1)}`
    titulos[`h${nivel}`] = function Titulo({ node, children }) {
      const linea = node?.position?.start?.line
      const id = idPrefijo && linea ? `${idPrefijo}-l${linea}` : undefined
      return (
        <Etiqueta id={id} tabIndex={id ? -1 : undefined} className={`md-t md-t${nivel}`}>
          {children}
        </Etiqueta>
      )
    }
  }
  return titulos
}

const JUEGOS = new Map()
function componentesPara(nivelBase, idPrefijo) {
  const llave = `${nivelBase}|${idPrefijo ?? ''}`
  if (!JUEGOS.has(llave)) {
    JUEGOS.set(llave, { a: Enlace, img: Imagen, table: Tabla, ...fabricarTitulos(nivelBase, idPrefijo) })
  }
  return JUEGOS.get(llave)
}

const COMPLEMENTOS = [remarkGfm]

function Markdown({ children, nivelBase = 3, idPrefijo, className = '' }) {
  return (
    <div className={`prosa ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={COMPLEMENTOS} components={componentesPara(nivelBase, idPrefijo)}>
        {typeof children === 'string' ? children : String(children ?? '')}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Markdown)

function textoPlano(titulo) {
  return titulo
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+#+\s*$/, '')
    .trim()
}

// Índice de un documento Markdown: los títulos del nivel que hace de "sección" (el más alto que
// aparece al menos dos veces), con el mismo id que les asigna <Markdown idPrefijo>.
export function indiceDe(markdown, idPrefijo) {
  if (typeof markdown !== 'string') return []
  const titulos = []
  let cerca = null
  markdown.split('\n').forEach((linea, i) => {
    const valla = /^\s{0,3}(`{3,}|~{3,})/.exec(linea)
    if (valla) {
      if (!cerca) cerca = valla[1][0]
      else if (valla[1][0] === cerca) cerca = null
      return
    }
    if (cerca) return
    const m = /^\s{0,3}(#{1,3})\s+(.+)$/.exec(linea)
    if (m) titulos.push({ nivel: m[1].length, texto: textoPlano(m[2]), id: `${idPrefijo}-l${i + 1}` })
  })
  for (let nivel = 1; nivel <= 3; nivel += 1) {
    const delNivel = titulos.filter((t) => t.nivel === nivel && t.texto)
    if (delNivel.length >= 2) return delNivel
  }
  return []
}
