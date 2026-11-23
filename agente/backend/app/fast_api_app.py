# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import contextlib
import json
import os
from collections.abc import AsyncIterator

from a2a.server.tasks import InMemoryTaskStore
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.runners import Runner

from app import acceso, alertas, investigaciones
from app.app_utils import services
from app.app_utils.a2a import attach_a2a_routes
from app.chatkit_server import AdkChatKitServer

load_dotenv()
allow_origins = (
    os.getenv("ALLOW_ORIGINS", "").split(",") if os.getenv("ALLOW_ORIGINS") else None
)
otel_to_cloud = True

AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Frontend compilado (agente/frontend -> app/static). Si existe, el servicio lo
# sirve en "/" en lugar de la interfaz de desarrollo de ADK.
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
HAS_PANEL = os.path.isfile(os.path.join(STATIC_DIR, "index.html"))


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    from app.agent import app as adk_app
    from app.agent import root_agent

    runner = Runner(
        app=adk_app,
        session_service=services.get_session_service(),
        artifact_service=services.get_artifact_service(),
        auto_create_session=True,
    )
    app.state.runner = runner
    app.state.chatkit = AdkChatKitServer(runner)
    app.state.agent_app_name = adk_app.name
    await attach_a2a_routes(
        app,
        agent=root_agent,
        runner=runner,
        task_store=InMemoryTaskStore(),
        rpc_path=f"/a2a/{adk_app.name}",
    )
    yield


app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    web=not HAS_PANEL,
    artifact_service_uri=services.ARTIFACT_SERVICE_URI,
    allow_origins=allow_origins,
    session_service_uri=services.SESSION_SERVICE_URI,
    otel_to_cloud=otel_to_cloud,
    lifespan=lifespan,
)
app.title = "backend"
app.description = "API for interacting with the Agent backend"

app.middleware("http")(acceso.middleware)

if HAS_PANEL:
    app.mount(
        "/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), "assets"
    )

    @app.get("/", include_in_schema=False)
    async def panel() -> FileResponse:
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))


def _json(data: object) -> Response:
    return Response(
        json.dumps(data, ensure_ascii=False, default=str), media_type="application/json"
    )


@app.get("/api/investigaciones")
def listar_investigaciones(limite: int = 50) -> Response:
    """Investigaciones más recientes, sin el reporte completo."""
    return _json(investigaciones.listar(max(1, min(limite, 200))))


@app.get("/api/investigaciones/{investigacion_id}")
def obtener_investigacion(investigacion_id: str) -> Response:
    """Investigación completa, con el reporte en Markdown."""
    doc = investigaciones.obtener(investigacion_id)
    if doc is None:
        return Response(status_code=404)
    return _json({"id": investigacion_id, **doc})


@app.post("/chatkit")
async def chatkit_endpoint(request: Request) -> Response:
    """Endpoint del protocolo ChatKit que usa el frontend."""
    result = await request.app.state.chatkit.process(await request.body(), {})
    if hasattr(result, "json"):
        return Response(content=result.json, media_type="application/json")
    return StreamingResponse(result, media_type="text/event-stream")


@app.post("/alertas", status_code=202)
async def recibir_alerta(request: Request) -> dict:
    """Recibe una alerta de Wazuh (JSON) e inicia su investigación.

    Wazuh llama con un token de identidad de Google (ver `app/acceso.py`).
    """
    return await alertas.recibir(request.app.state.runner, await request.json())


# Main execution
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
