# RappiSim - Aplicación Web Vulnerable para Proyecto SOC (Wazuh SIEM + GCP)

Aplicación full-stack (**React + FastAPI + PostgreSQL**) diseñada como entorno controlado de pruebas de seguridad con telemetría estructurada en **JSON (`stdout`)** para **Google Cloud Logging → Pub/Sub → Wazuh SIEM**.

---

## Estructura del Proyecto

```text
rappi-sim/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI, CORS, Middleware JSON Logs y StaticFiles
│   │   ├── database.py          # Conexión PostgreSQL y datos semilla
│   │   ├── schemas.py           # Modelos Pydantic
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth.py          # POST /api/login (SQL Injection)
│   │       ├── productos.py     # GET /api/productos (SQL Injection UNION SELECT)
│   │       ├── pedidos.py       # GET /api/pedidos/{id} (IDOR / BOLA)
│   │       └── resenas.py       # POST /api/resenas (Stored XSS)
│   ├── .env
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       └── App.css
├── Dockerfile                   # Build unificado (React + FastAPI) para Cloud Run
└── docker-compose.yml           # Entorno local completo (App + PostgreSQL)
```

---

## Opción 1: Levantar todo rápido con Docker Compose (Recomendado)

1. Abre una terminal en la carpeta `rappi-sim/` y ejecuta:
   ```bash
   docker-compose up --build
   ```
2. Abre en tu navegador:
   - **Web App (React + API):** `http://localhost:8080`
   - **Swagger Docs (FastAPI):** `http://localhost:8080/docs`

---

## Opción 2: Levantar en modo desarrollo local (sin Docker)

### Backend
1. Crea una base de datos llamada `rappisim` en tu PostgreSQL local.
2. Configura tus credenciales en `backend/.env`:
   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rappisim
   ```
3. Instala dependencias y arranca Uvicorn:
   ```powershell
   cd backend
   python -m venv venv
   .env\Scriptsctivate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```

### Frontend
En otra terminal:
```powershell
cd frontend
npm install
npm run dev
```
Abre `http://localhost:5173`.

---

## Despliegue en Google Cloud Run

1. Sube la imagen a Artifact Registry / Container Registry o despliega directo desde el código fuente:
   ```bash
   gcloud run deploy rappi-web-simulada \
     --source . \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars DATABASE_URL="postgresql://USUARIO:PASSWORD@IP_POSTGRES:5432/rappisim"
   ```
2. Todos los requests HTTP se imprimen en `stdout` en formato JSON estructurado, por lo que **Cloud Logging** los captura automáticamente para enviarlos por **Log Sink → Pub/Sub → Wazuh SIEM**.

---

## Guía de Pruebas de Ataque (Para el Integrante 4)

1. **SQL Injection - Bypass de Autenticación (`POST /api/login`)**
   - **Correo:** `' OR '1'='1' --`
   - **Contraseña:** `cualquiercosa`
   - **Resultado:** Inicia sesión como `admin@rappi.com` (`Administrador SOC`).

2. **SQL Injection - Extracción de Datos (`GET /api/productos?q=...`)**
   - En la barra de búsqueda superior escribir:
     ```sql
     ' UNION SELECT id, email, password, 99.9, rol FROM users --
     ```
   - **Resultado:** Expone los correos, contraseñas y roles de la tabla `users` en el catálogo.

3. **Stored XSS (`POST /api/resenas`)**
   - Ir a **Mis Pedidos y Reseñas** y publicar como comentario:
     ```html
     <img src=x onerror="alert('XSS ejecutado en RappiSim')">
     ```
   - **Resultado:** Ejecuta JavaScript arbitrario en el navegador cada vez que se carga la sección de reseñas.

4. **IDOR / BOLA (`GET /api/pedidos/{id}`)**
   - Consultar directamente `/api/pedidos/1` o `/api/pedidos/2` (o interceptar con Burp Suite al pulsar *Ver Boleta*).
   - **Resultado:** Expone direcciones privadas y últimos 4 dígitos de tarjeta de otros clientes.

---

## Conexión con Wazuh SIEM

La configuración de **Cloud Logging → Log Sink → Pub/Sub → Wazuh**, las reglas de detección y los scripts de prueba están en [`wazuh/`](wazuh/README.md).
