import os
import json
import time
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import init_db
from app.routers import auth, productos, pedidos, resenas

app = FastAPI(title="RappiSim - Web Vulnerable SOC")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    init_db()


# MIDDLEWARE DE TELEMETRÍA JSON PARA CLOUD LOGGING -> PUB/SUB -> WAZUH SIEM
@app.middleware("http")
async def structured_json_logger(request: Request, call_next):
    start_time = time.time()
    body_bytes = await request.body()
    body_str = body_bytes.decode("utf-8", errors="ignore")

    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    client_ip = request.headers.get(
        "x-forwarded-for",
        request.client.host if request.client else "unknown"
    )

    log_payload = {
        "severity": "WARNING" if response.status_code >= 400 else "INFO",
        "message": f"{request.method} {request.url.path} - {response.status_code}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "rappi-web-simulada",
        "src_ip": client_ip,
        "method": request.method,
        "path": request.url.path,
        "query": str(request.url.query),
        "body": body_str[:1000],
        "user_agent": request.headers.get("user-agent", ""),
        "status_code": response.status_code,
        "duration_ms": duration_ms,
    }
    print(json.dumps(log_payload), flush=True)
    return response


app.include_router(auth.router)
app.include_router(productos.router)
app.include_router(pedidos.router)
app.include_router(resenas.router)

# En producción (Cloud Run), sirve el frontend compilado desde /static
if os.path.isdir("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
