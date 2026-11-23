"""Pruebas de la recepción de alertas de Wazuh (runner simulado, sin modelo)."""

import asyncio
from types import SimpleNamespace

import pytest
from google.genai import types

from app import alertas, investigaciones, tools


class FakeSessionService:
    async def create_session(self, **kwargs):
        self.kwargs = kwargs
        return SimpleNamespace(id="sesion-1")


class FakeRunner:
    app_name = "app"

    def __init__(self) -> None:
        self.session_service = FakeSessionService()

    async def run_async(self, **kwargs):
        self.prompt = kwargs["new_message"].parts[0].text
        yield SimpleNamespace(
            error_message=None,
            content=types.Content(parts=[types.Part(text="Investigación terminada")]),
            is_final_response=lambda: True,
        )


@pytest.mark.asyncio
async def test_alerta_abre_investigacion_y_deduplica(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INVESTIGACIONES_STORE", "archivo")
    monkeypatch.setattr(investigaciones, "LOCAL_DIR", tmp_path)
    runner = FakeRunner()
    alerta = tools._SAMPLE_ALERTS[0]

    primera = await alertas.recibir(runner, alerta)
    assert primera["estado"] == "en_curso"
    segunda = await alertas.recibir(runner, alerta)
    assert segunda == {
        "estado": "duplicada",
        "investigacion_id": primera["investigacion_id"],
    }

    await asyncio.gather(*alertas._tasks)
    doc = investigaciones.obtener(primera["investigacion_id"])
    assert doc["origen"] == "wazuh"
    assert doc["ip_origen"] == "203.0.113.45"
    assert doc["regla_id"] == "100110"
    # El agente simulado no llamó a registrar_investigacion.
    assert doc["estado"] == "sin_registrar"
    assert doc["respuesta_agente"] == "Investigación terminada"
    assert runner.session_service.kwargs["state"] == {
        "investigacion_id": primera["investigacion_id"]
    }
    assert "100110" in runner.prompt
