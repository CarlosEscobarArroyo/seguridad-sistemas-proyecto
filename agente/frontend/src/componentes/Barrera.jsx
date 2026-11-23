import { Component } from 'react'
import { EstadoCentral } from './Aviso.jsx'
import Icono from './Icono.jsx'

// Si una vista falla al pintarse (por ejemplo, por un dato con una forma imprevista), se muestra
// este aviso en su lugar en vez de dejar toda la página en blanco.
export default class Barrera extends Component {
  state = { fallo: null }

  static getDerivedStateFromError(fallo) {
    return { fallo }
  }

  componentDidCatch(fallo, info) {
    console.error('Error al mostrar la vista:', fallo, info?.componentStack)
  }

  render() {
    if (!this.state.fallo) return this.props.children
    return (
      <EstadoCentral icono="advertencia" titulo="Esta vista no se pudo mostrar" tono="peligro">
        <p>Ocurrió un error inesperado al presentar los datos. El resto del panel sigue disponible.</p>
        <button type="button" className="boton" onClick={() => window.location.reload()}>
          <Icono nombre="actualizar" /> Recargar la página
        </button>
      </EstadoCentral>
    )
  }
}
