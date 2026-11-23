"""Recepción de alertas de Wazuh y ejecución de la investigación del agente."""

from __future__ import annotations

import asyncio
import datetime
import hashlib
import json
import logging
import time
from typing import Any

from google.adk.runners import Runner
from google.genai import types

from app import investigaciones

logger = logging.getLogger(__name__)

USER_ID = "wazuh"
_BUCKET_SECONDS = 600
_tasks: set[asyncio.Task] = set()


def _clave(alerta: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Clave de deduplicación: misma IP y regla dentro de una ventana de 10 minutos."""
    rule = alerta.get("rule", {})
    payload = alerta.get("data", {}).get("gcp", {}).get("jsonPayload", {})
    src_ip = str(
        payload.get("src_ip", alerta.get("data", {}).get("srcip", "desconocida"))
    )
    rule_id = str(rule.get("id", "sin-regla"))
    bucket = int(time.time() // _BUCKET_SECONDS)
    doc_id = hashlib.sha256(f"{src_ip}|{rule_id}|{bucket}".encode()).hexdigest()[:20]
    resumen = {
        "origen": "wazuh",
        "estado": "en_curso",
        "ip_origen": src_ip,
        "regla_id": rule_id,
        "regla_nivel": rule.get("level"),
        "regla_descripcion": rule.get("description"),
        "alerta": json.loads(json.dumps(alerta, default=str)),
    }
    return doc_id, resumen


async def _investigar(runner: Runner, doc_id: str, alerta: dict[str, Any]) -> None:
    inicio = time.monotonic()
    try:
        session = await runner.session_service.create_session(
            app_name=runner.app_name,
            user_id=USER_ID,
            state={"investigacion_id": doc_id},
        )
        prompt = (
            "Wazuh envió la siguiente alerta. Investígala, ejecuta las acciones de "
            "respuesta que la evidencia justifique y registra la investigación.\n\n"
            "<alerta_wazuh>\n"
            f"{json.dumps(alerta, ensure_ascii=False, default=str)[:6000]}\n"
            "</alerta_wazuh>"
        )
        respuesta = ""
        async for event in runner.run_async(
            user_id=USER_ID,
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
        ):
            if event.error_message:
                raise RuntimeError(event.error_message)
            if event.content and event.content.parts and event.is_final_response():
                respuesta = "".join(p.text or "" for p in event.content.parts)
        actual = await asyncio.to_thread(investigaciones.obtener, doc_id) or {}
        cambios: dict[str, Any] = {
            "duracion_segundos": round(time.monotonic() - inicio, 1),
            "respuesta_agente": respuesta,
        }
        if actual.get("estado") != "concluida":
            # El agente terminó sin llamar a registrar_investigacion.
            cambios["estado"] = "sin_registrar"
        await asyncio.to_thread(investigaciones.actualizar, doc_id, cambios)
    except Exception as exc:
        logger.exception("Falló la investigación %s", doc_id)
        await asyncio.to_thread(
            investigaciones.actualizar,
            doc_id,
            {
                "estado": "error",
                "error": str(exc)[:500],
                "duracion_segundos": round(time.monotonic() - inicio, 1),
                "finalizado_en": datetime.datetime.now(datetime.UTC),
            },
        )


async def recibir(runner: Runner, alerta: dict[str, Any]) -> dict[str, Any]:
    """Abre una investigación para la alerta y la ejecuta en segundo plano."""
    doc_id, resumen = _clave(alerta)
    creado = await asyncio.to_thread(investigaciones.crear, resumen, doc_id)
    if creado is None:
        return {"estado": "duplicada", "investigacion_id": doc_id}
    task = asyncio.create_task(_investigar(runner, doc_id, alerta))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"estado": "en_curso", "investigacion_id": doc_id}
