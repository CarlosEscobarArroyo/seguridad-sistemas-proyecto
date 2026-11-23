# Proyecto SOC — Monorepo

| Carpeta | Contenido |
|---|---|
| [`rappi-sim/`](rappi-sim/README.md) | Aplicación web vulnerable (React + FastAPI + PostgreSQL) que genera la telemetría para Wazuh. |
| [`wazuh/`](wazuh/README.md) | Tubería Cloud Logging → Pub/Sub → Wazuh: script de GCP, reglas de detección de RappiSim y pruebas de ataque. |
| `agente/backend/` | Agente SOC en Google ADK: recibe alertas de Wazuh, reúne evidencia (Cloud Logging y Wazuh), consulta playbooks (RAG), ejecuta acciones de respuesta y registra la investigación en Firestore. |
| `agente/frontend/` | Chat en React con ChatKit, conectado al agente por `POST /chatkit`. |

## Flujo desplegado en GCP (`seguridad-sistemas-proyecto`)

```
RappiSim (Cloud Run) → Cloud Logging → sink → Pub/Sub → Wazuh (VM) ──alerta nivel ≥10──► Agente SOC (Cloud Run)
                                                                                          │ evidencia: Cloud Logging y Wazuh
        ◄── acciones de respuesta: bloquear IP, eliminar reseña ──────────────────────────┤ playbooks: RAG local
                                                                                          └► Firestore (investigaciones)
```

| Recurso | Dónde |
|---|---|
| Web simulada | https://rappi-web-simulada-574593344568.us-central1.run.app |
| Agente SOC y panel (usuario y contraseña) | https://agente-soc-574593344568.us-central1.run.app |
| Investigaciones | Firestore, colección `investigaciones` |
| Wazuh | VM `wazuh` (`us-central1-a`) |

Probar de punta a punta: `bash wazuh/pruebas/simular_ataques.sh <URL de la web>` y, uno o dos minutos después, revisar el panel del agente. El agente puede bloquear la IP desde la que se lanzan los ataques; para desbloquearla:

```bash
TOKEN=$(gcloud secrets versions access latest --secret rappi-admin-token --project seguridad-sistemas-proyecto)
curl -X DELETE -H "X-Admin-Token: $TOKEN" <URL de la web>/api/admin/bloqueos/<IP>
```

## Panel del agente (investigaciones y chat)

https://agente-soc-574593344568.us-central1.run.app — pide usuario `soc` y la contraseña guardada en Secret Manager:

```bash
gcloud secrets versions access latest --secret panel-password --project seguridad-sistemas-proyecto
```

- **Investigaciones:** lista con severidad, estado, acciones y duración; al elegir una se ve la conclusión, la alerta que la originó y el reporte completo. Se actualiza sola.
- **Chat con el agente:** chat propio conectado al agente. ChatKit queda como alternativa si se registra el dominio en la plataforma de OpenAI y se compila el frontend con `VITE_CHATKIT_DOMAIN_KEY`.

`POST /alertas` no acepta esa contraseña: solo el token de identidad de la cuenta de servicio de la VM de Wazuh.

## Redesplegar

```bash
# Web simulada
cd rappi-sim && gcloud run deploy rappi-web-simulada --source . --region us-central1 --project seguridad-sistemas-proyecto
# Agente + panel (compila el frontend y conserva la configuración del servicio)
bash agente/desplegar.sh
```

## Ejecutar el agente en local

1. Configura `agente/backend/.env` (copia de `.env.example`): credenciales de Gemini y, opcionalmente, el indexador de Wazuh. Sin `WAZUH_INDEXER_URL`, el agente usa alertas de ejemplo simuladas.
2. Backend (puerto 8000):
   ```bash
   cd agente/backend
   agents-cli install
   uv run uvicorn app.fast_api_app:app --port 8000 --reload
   ```
3. Frontend (puerto 5174; el backend lo admite por `ALLOW_ORIGINS` en `.env`):
   ```bash
   cd agente/frontend
   npm install
   npm run dev
   ```

La base de conocimiento del RAG son los Markdown de `agente/backend/app/knowledge/`. Se indexan en una colección de Vector Search 2.0 de Agent Platform (`soc-conocimiento`), que genera los embeddings; tras añadir o cambiar un playbook, vuelve a indexar con `cd agente/backend && uv run python -m app.rag`. Las investigaciones se guardan en Firestore (o en `agente/backend/reportes/` con `INVESTIGACIONES_STORE=archivo`).
