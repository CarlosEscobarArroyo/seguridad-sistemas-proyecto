"""Control de acceso del servicio cuando se publica en internet.

- `POST /alertas`: exige un token de identidad de Google emitido para la cuenta
  de servicio de la VM de Wazuh (`ALERTAS_SA_EMAIL`).
- El resto (panel, chat y API): autenticación HTTP Basic con `PANEL_USER` y
  `PANEL_PASSWORD`.

Si las variables no están definidas, la comprobación correspondiente se omite
(desarrollo local, o servicio privado protegido por IAM de Cloud Run).
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hmac
import os

from fastapi import Request, Response
from fastapi.responses import JSONResponse


def _basic_ok(header: str) -> bool:
    password = os.getenv("PANEL_PASSWORD", "")
    try:
        scheme, _, encoded = header.partition(" ")
        if scheme.lower() != "basic":
            return False
        user, _, given = base64.b64decode(encoded).decode().partition(":")
    except (binascii.Error, UnicodeDecodeError):
        return False
    user_ok = hmac.compare_digest(
        user.encode(), os.getenv("PANEL_USER", "soc").encode()
    )
    return hmac.compare_digest(given.encode(), password.encode()) and user_ok


def _token_ok(header: str, audience: str) -> bool:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return False
    try:
        claims = id_token.verify_oauth2_token(
            token, google_requests.Request(), audience=audience
        )
    except Exception:
        return False
    return bool(claims.get("email_verified")) and hmac.compare_digest(
        str(claims.get("email", "")), os.getenv("ALERTAS_SA_EMAIL", "")
    )


async def middleware(request: Request, call_next) -> Response:
    header = request.headers.get("authorization", "")
    if request.url.path == "/alertas":
        if os.getenv("ALERTAS_SA_EMAIL"):
            audience = os.getenv("SERVICE_URL") or f"https://{request.url.netloc}"
            if not await asyncio.to_thread(_token_ok, header, audience):
                return JSONResponse({"detail": "Token de identidad inválido"}, 401)
    elif os.getenv("PANEL_PASSWORD") and not _basic_ok(header):
        return Response(
            "Autenticación requerida",
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="Agente SOC", charset="UTF-8"'},
        )
    return await call_next(request)
