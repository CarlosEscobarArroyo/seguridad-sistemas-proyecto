"""Pruebas del puente ChatKit -> ADK con un runner simulado (sin llamar al modelo)."""

import json
from types import SimpleNamespace

import pytest
from google.genai import types

from app.chatkit_server import AdkChatKitServer


def _event(part: types.Part, partial: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        error_message=None, partial=partial, content=types.Content(parts=[part])
    )


class FakeRunner:
    async def run_async(self, **kwargs):
        self.kwargs = kwargs
        yield _event(
            types.Part(
                function_call=types.FunctionCall(
                    name="consultar_alertas_wazuh", args={}
                )
            )
        )
        yield _event(types.Part(text="Hola "), partial=True)
        yield _event(types.Part(text="mundo"), partial=True)
        yield _event(types.Part(text="Hola mundo"))


async def _request(server: AdkChatKitServer, payload: dict) -> list[dict]:
    result = await server.process(json.dumps(payload), {})
    if hasattr(result, "json"):
        return [json.loads(result.json)]
    events = []
    async for chunk in result:
        for line in chunk.decode().splitlines():
            if line.startswith("data:"):
                events.append(json.loads(line[5:]))
    return events


@pytest.mark.asyncio
async def test_crear_hilo_transmite_respuesta_del_agente() -> None:
    runner = FakeRunner()
    server = AdkChatKitServer(runner)
    events = await _request(
        server,
        {
            "type": "threads.create",
            "params": {
                "input": {
                    "content": [{"type": "input_text", "text": "revisa las alertas"}],
                    "attachments": [],
                    "inference_options": {},
                }
            },
        },
    )
    types_seen = [e["type"] for e in events]
    assert "error" not in types_seen
    assert types_seen[0] == "thread.created"
    assert "progress_update" in types_seen

    thread_id = events[0]["thread"]["id"]
    assert runner.kwargs["session_id"] == thread_id
    assert runner.kwargs["new_message"].parts[0].text == "revisa las alertas"

    deltas = [
        e["update"]["delta"]
        for e in events
        if e["type"] == "thread.item.updated"
        and e["update"]["type"] == "assistant_message.content_part.text_delta"
    ]
    assert deltas == ["Hola ", "mundo"]

    done = [
        e["item"]
        for e in events
        if e["type"] == "thread.item.done" and e["item"]["type"] == "assistant_message"
    ]
    assert [d["content"][0]["text"] for d in done] == ["Hola mundo"]

    # El hilo y sus ítems quedan guardados y se pueden volver a cargar.
    [thread] = await _request(
        server, {"type": "threads.get_by_id", "params": {"thread_id": thread_id}}
    )
    assert [i["type"] for i in thread["items"]["data"]] == [
        "user_message",
        "assistant_message",
    ]
