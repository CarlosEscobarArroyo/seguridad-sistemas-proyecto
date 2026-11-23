import { useState, useEffect } from "react";
import "./App.css";

// En local usa localhost:8000; en Cloud Run / Docker (mismo contenedor) usa ruta relativa ""
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function App() {
  const [vista, setVista] = useState("catalogo"); // catalogo | pedidos | login
  const [user, setUser] = useState(null);

  // Estados Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Estados Catálogo
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [searchError, setSearchError] = useState("");

  // Estados Pedidos (IDOR)
  const [pedidos, setPedidos] = useState([]);
  const [boletaDetalle, setBoletaDetalle] = useState(null);
  const [direccion, setDireccion] = useState("Av. Javier Prado 1234, San Isidro");

  // Estados Reseñas (Stored XSS)
  const [resenas, setResenas] = useState([]);
  const [comentario, setComentario] = useState("");

  const cargarProductos = async (q = "") => {
    setSearchError("");
    try {
      const res = await fetch(`${API_URL}/api/productos?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.detail || "Error en búsqueda");
        return;
      }
      setProductos(data);
    } catch {
      setSearchError("No se pudo conectar con el backend");
    }
  };

  const cargarPedidos = async () => {
    const res = await fetch(`${API_URL}/api/pedidos`);
    if (res.ok) setPedidos(await res.json());
  };

  const cargarResenas = async () => {
    const res = await fetch(`${API_URL}/api/resenas`);
    if (res.ok) setResenas(await res.json());
  };

  useEffect(() => {
    cargarProductos();
    cargarPedidos();
    cargarResenas();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoginError(data.detail || "Error al iniciar sesión");
      return;
    }
    setUser(data.user);
    setVista("catalogo");
  };

  const handleBuscar = (e) => {
    e.preventDefault();
    cargarProductos(busqueda);
  };

  const handlePedir = async (prod) => {
    const res = await fetch(`${API_URL}/api/pedidos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_email: user ? user.email : "invitado@rappi.com",
        producto: prod.nombre,
        direccion,
        tarjeta_ultimos4: "4532",
        total: prod.precio,
      }),
    });
    if (res.ok) {
      alert(`¡Pedido de "${prod.nombre}" creado!`);
      cargarPedidos();
      setVista("pedidos");
    }
  };

  const handleVerBoleta = async (id) => {
    // Endpoint vulnerable a IDOR: /api/pedidos/{id}
    const res = await fetch(`${API_URL}/api/pedidos/${id}`);
    if (res.ok) {
      setBoletaDetalle(await res.json());
    }
  };

  const handlePublicarResena = async (e) => {
    e.preventDefault();
    if (!comentario.trim()) return;
    await fetch(`${API_URL}/api/resenas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autor: user ? user.nombre : "Usuario Anónimo",
        comentario,
      }),
    });
    setComentario("");
    cargarResenas();
  };

  return (
    <div>
      {/* NAVBAR */}
      <header className="navbar">
        <div className="logo" onClick={() => setVista("catalogo")}>
          RappiSim
        </div>

        <form className="search-form" onSubmit={handleBuscar}>
          <input
            type="text"
            placeholder="¿Qué se te antoja hoy? (ej. Burger, Pollo...)"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <button type="submit" className="btn">
            Buscar
          </button>
        </form>

        <div>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span>
                Hola, <strong>{user.nombre}</strong> ({user.rol})
              </span>
              <button className="btn-outline" onClick={() => setUser(null)}>
                Salir
              </button>
            </div>
          ) : (
            <button className="btn" onClick={() => setVista("login")}>
              Iniciar Sesión
            </button>
          )}
        </div>
      </header>

      <main className="container">
        {/* VISTA LOGIN */}
        {vista === "login" && (
          <div className="login-box">
            <h2 style={{ marginBottom: "16px" }}>Ingresa a RappiSim</h2>
            {loginError && <div className="error-msg">{loginError}</div>}
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Correo electrónico</label>
                <input
                  type="text"
                  placeholder="gerardo@rappi.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Contraseña</label>
                <input
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn" style={{ width: "100%" }}>
                Ingresar
              </button>
            </form>
            <p style={{ marginTop: "12px", fontSize: "0.85rem", color: "#666" }}>
              Demo: <code>gerardo@rappi.com</code> / <code>123456</code>
            </p>
          </div>
        )}

        {/* NAVEGACIÓN PRINCIPAL */}
        {vista !== "login" && (
          <>
            <div className="tabs">
              <button
                className={`tab ${vista === "catalogo" ? "active" : ""}`}
                onClick={() => setVista("catalogo")}
              >
                Restaurantes y Platos
              </button>
              <button
                className={`tab ${vista === "pedidos" ? "active" : ""}`}
                onClick={() => setVista("pedidos")}
              >
                Mis Pedidos y Reseñas
              </button>
            </div>

            {/* VISTA CATÁLOGO */}
            {vista === "catalogo" && (
              <>
                {searchError && <div className="error-msg">{searchError}</div>}
                <div className="grid">
                  {productos.map((p, idx) => (
                    <div className="card" key={idx}>
                      <img src={p.imagen} alt={p.nombre} />
                      <div className="card-body">
                        <span className="tienda-tag">{p.tienda}</span>
                        <h3>{p.nombre}</h3>
                        <div className="price-row">
                          <strong>S/ {Number(p.precio).toFixed(2)}</strong>
                          <button className="btn" onClick={() => handlePedir(p)}>
                            Pedir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* VISTA PEDIDOS (IDOR) Y RESEÑAS (STORED XSS) */}
            {vista === "pedidos" && (
              <div>
                <div className="panel-box">
                  <h3 style={{ marginBottom: "12px" }}>Historial de Pedidos (Boletas)</h3>
                  <div className="form-group" style={{ maxWidth: "400px" }}>
                    <label>Dirección de entrega para nuevos pedidos:</label>
                    <input
                      type="text"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                    />
                  </div>

                  {pedidos.map((ped) => (
                    <div className="pedido-item" key={ped.id}>
                      <div>
                        <strong>Boleta #{ped.id}</strong> — {ped.producto} (S/ {ped.total})
                      </div>
                      <button
                        className="btn-outline"
                        onClick={() => handleVerBoleta(ped.id)}
                      >
                        Ver Boleta
                      </button>
                    </div>
                  ))}

                  {boletaDetalle && (
                    <div className="boleta-modal">
                      <h4>Detalle Confidencial de Boleta #{boletaDetalle.id}</h4>
                      <p><strong>Cliente:</strong> {boletaDetalle.user_email}</p>
                      <p><strong>Producto:</strong> {boletaDetalle.producto}</p>
                      <p><strong>Dirección:</strong> {boletaDetalle.direccion}</p>
                      <p><strong>Tarjeta:</strong> **** **** **** {boletaDetalle.tarjeta_ultimos4}</p>
                      <p><strong>Total:</strong> S/ {boletaDetalle.total}</p>
                    </div>
                  )}
                </div>

                <div className="panel-box">
                  <h3 style={{ marginBottom: "12px" }}>Reseñas de la Comunidad</h3>
                  <form onSubmit={handlePublicarResena} style={{ marginBottom: "16px" }}>
                    <div className="form-group">
                      <textarea
                        rows="2"
                        placeholder="Escribe tu comentario sobre el servicio..."
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn">
                      Publicar Reseña
                    </button>
                  </form>

                  {resenas.map((r) => (
                    <div className="resena-item" key={r.id} style={{ display: "block" }}>
                      <strong>{r.autor}:</strong>
                      {/* VULNERABILIDAD INTENCIONAL: Renderizado HTML sin sanitizar (Stored XSS) */}
                      <div
                        style={{ marginTop: "4px" }}
                        dangerouslySetInnerHTML={{ __html: r.comentario }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
