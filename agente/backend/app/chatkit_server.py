"""Servidor ChatKit que ejecuta el agente ADK.

El frontend (ChatKit) habla el protocolo de ChatKit contra `POST /chatkit`; este
módulo traduce cada mensaje del usuario en una ejecución del `Runner` de ADK y
convierte los eventos de ADK en eventos de ChatKit. Cada hilo de ChatKit se
corresponde con una sesión de ADK con el mismo identificador.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from chatkit.errors import CustomStreamError
from chatkit.server import ChatKitServer
from chatkit.store import NotFoundError, Store
from chatkit.types import (
    AssistantMessageContent,
    AssistantMessageContentPartAdded,
    AssistantMessageContentPartDone,
    AssistantMessageContentPartTextDelta,
    AssistantMessageItem,
    Attachment,
    Page,
    ProgressUpdateEvent,
    ThreadItem,
    ThreadItemAddedEvent,
    ThreadItemDoneEvent,
    ThreadItemUpdatedEvent,
    ThreadMetadata,
    ThreadStreamEvent,
    UserMessageItem,
)
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.genai import types

USER_ID = "analista"

TOOL_LABELS = {
    "consultar_alertas_wazuh": "Consultando alertas de Wazuh…",
    "buscar_conocimiento": "Buscando en la base de conocimiento…",
    "guardar_reporte": "Guardando el reporte…",
}


def _paginate(rows: list, after: str | None, limit: int, order: str) -> Page:
    rows = sorted(rows, key=lambda r: r.created_at, reverse=order == "desc")
    if after:
        index = next((i for i, r in enumerate(rows) if r.id == after), -1)
        rows = rows[index + 1 :]
    page = rows[:limit]
    has_more = len(rows) > limit
    return Page(data=page, has_more=has_more, after=page[-1].id if has_more else None)


class MemoryStore(Store[dict]):
    """Almacén en memoria: los hilos se pierden al reiniciar el servidor."""

    def __init__(self) -> None:
        self.threads: dict[str, ThreadMetadata] = {}
        self.items: dict[str, list[ThreadItem]] = {}

    async def load_thread(self, thread_id: str, context: dict) -> ThreadMetadata:
        if thread_id not in self.threads:
            raise NotFoundError(f"Hilo {thread_id} no encontrado")
        return self.threads[thread_id]

    async def save_thread(self, thread: ThreadMetadata, context: dict) -> None:
        # Se guarda solo la metadata (sin `items`).
        self.threads[thread.id] = ThreadMetadata(**thread.model_dump(exclude={"items"}))

    async def load_threads(
        self, limit: int, after: str | None, order: str, context: dict
    ) -> Page[ThreadMetadata]:
        return _paginate(list(self.threads.values()), after, limit, order)

    async def delete_thread(self, thread_id: str, context: dict) -> None:
        self.threads.pop(thread_id, None)
        self.items.pop(thread_id, None)

    async def load_thread_items(
        self, thread_id: str, after: str | None, limit: int, order: str, context: dict
    ) -> Page[ThreadItem]:
        return _paginate(self.items.get(thread_id, []), after, limit, order)

    async def add_thread_item(
        self, thread_id: str, item: ThreadItem, context: dict
    ) -> None:
        self.items.setdefault(thread_id, []).append(item)

    async def save_item(self, thread_id: str, item: ThreadItem, context: dict) -> None:
        items = self.items.setdefault(thread_id, [])
        for i, existing in enumerate(items):
            if existing.id == item.id:
                items[i] = item
                return
        items.append(item)

    async def load_item(
        self, thread_id: str, item_id: str, context: dict
    ) -> ThreadItem:
        for item in self.items.get(thread_id, []):
            if item.id == item_id:
                return item
        raise NotFoundError(f"Ítem {item_id} no encontrado")

    async def delete_thread_item(
        self, thread_id: str, item_id: str, context: dict
    ) -> None:
        self.items[thread_id] = [
            i for i in self.items.get(thread_id, []) if i.id != item_id
        ]

    async def save_attachment(self, attachment: Attachment, context: dict) -> None:
        raise NotImplementedError("Los adjuntos no están habilitados")

    async def load_attachment(self, attachment_id: str, context: dict) -> Attachment:
        raise NotFoundError("Los adjuntos no están habilitados")

    async def delete_attachment(self, attachment_id: str, context: dict) -> None:
        raise NotFoundError("Los adjuntos no están habilitados")


class AdkChatKitServer(ChatKitServer[dict]):
    """Responde a los mensajes de ChatKit ejecutando el agente ADK."""

    def __init__(self, runner: Runner) -> None:
        super().__init__(MemoryStore())
        self.runner = runner

    async def respond(
        self,
        thread: ThreadMetadata,
        input_user_message: UserMessageItem | None,
        context: dict[str, Any],
    ) -> AsyncIterator[ThreadStreamEvent]:
        if input_user_message is None:
            return
        text = "".join(
            part.text
            for part in input_user_message.content
            if getattr(part, "text", None)
        )
        if thread.title is None:
            thread.title = text[:60]

        # Mensaje del asistente en curso (un tramo de texto entre llamadas a herramientas).
        item_id: str | None = None

        def start_item() -> list[ThreadStreamEvent]:
            nonlocal item_id
            item_id = self.store.generate_item_id("message", thread, context)
            return [
                ThreadItemAddedEvent(
                    item=AssistantMessageItem(
                        id=item_id,
                        thread_id=thread.id,
                        created_at=datetime.now(),
                        content=[],
                    )
                ),
                ThreadItemUpdatedEvent(
                    item_id=item_id,
                    update=AssistantMessageContentPartAdded(
                        content_index=0, content=AssistantMessageContent(text="")
                    ),
                ),
            ]

        async for event in self.runner.run_async(
            user_id=USER_ID,
            session_id=thread.id,
            new_message=types.Content(role="user", parts=[types.Part(text=text)]),
            run_config=RunConfig(streaming_mode=StreamingMode.SSE),
        ):
            if event.error_message:
                raise CustomStreamError(
                    f"Error del agente: {event.error_message[:300]}", allow_retry=True
                )
            if not event.content or not event.content.parts:
                continue
            for part in event.content.parts:
                if part.function_call:
                    name = part.function_call.name or ""
                    yield ProgressUpdateEvent(
                        text=TOOL_LABELS.get(name, f"Ejecutando {name}…")
                    )
                elif part.function_response:
                    yield ProgressUpdateEvent(text="Analizando…")
                elif part.text and not part.thought:
                    if event.partial:
                        if item_id is None:
                            for started in start_item():
                                yield started
                        yield ThreadItemUpdatedEvent(
                            item_id=item_id,
                            update=AssistantMessageContentPartTextDelta(
                                content_index=0, delta=part.text
                            ),
                        )
                    else:
                        # Evento final: trae el texto completo del tramo.
                        if item_id is None:
                            for started in start_item():
                                yield started
                        content = AssistantMessageContent(text=part.text)
                        yield ThreadItemUpdatedEvent(
                            item_id=item_id,
                            update=AssistantMessageContentPartDone(
                                content_index=0, content=content
                            ),
                        )
                        yield ThreadItemDoneEvent(
                            item=AssistantMessageItem(
                                id=item_id,
                                thread_id=thread.id,
                                created_at=datetime.now(),
                                content=[content],
                            )
                        )
                        item_id = None
