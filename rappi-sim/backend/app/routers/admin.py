"""Operaciones de respuesta a incidentes. Las usa el agente SOC.

Todas exigen la cabecera `X-Admin-Token` con el valor de `ADMIN_API_TOKEN`.
Si la variable no está definida, las operaciones quedan deshabilitadas.
"""
import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException

from app.database import get_db
from app.schemas import BloqueoCreate


def verificar_token(x_admin_token: str = Header(default="")):
    esperado = os.getenv("ADMIN_API_TOKEN", "")
    if not esperado:
        raise HTTPException(status_code=503, detail="Operaciones de respuesta deshabilitadas")
    if not hmac.compare_digest(x_admin_token.encode(), esperado.encode()):
        raise HTTPException(status_code=401, detail="Token de administración inválido")


router = APIRouter(
    prefix="/api/admin", tags=["Respuesta a incidentes"], dependencies=[Depends(verificar_token)]
)


@router.get("/bloqueos")
def listar_bloqueos():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT ip, motivo, creado_en FROM ips_bloqueadas ORDER BY creado_en DESC;")
            rows = cur.fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.post("/bloqueos")
def bloquear_ip(data: BloqueoCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO ips_bloqueadas (ip, motivo) VALUES (%s, %s) "
                "ON CONFLICT (ip) DO UPDATE SET motivo = EXCLUDED.motivo;",
                (data.ip, data.motivo),
            )
        conn.commit()
    finally:
        conn.close()
    return {"message": "IP bloqueada", "ip": data.ip}


@router.delete("/bloqueos/{ip}")
def desbloquear_ip(ip: str):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ips_bloqueadas WHERE ip = %s;", (ip,))
            eliminadas = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    if not eliminadas:
        raise HTTPException(status_code=404, detail="La IP no estaba bloqueada")
    return {"message": "IP desbloqueada", "ip": ip}


@router.delete("/resenas/{resena_id}")
def eliminar_resena(resena_id: int):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM resenas WHERE id = %s;", (resena_id,))
            eliminadas = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    if not eliminadas:
        raise HTTPException(status_code=404, detail="Reseña no encontrada")
    return {"message": "Reseña eliminada", "id": resena_id}
