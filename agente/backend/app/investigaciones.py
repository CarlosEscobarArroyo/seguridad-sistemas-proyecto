"""Persistencia de las investigaciones del agente.

Por defecto usa Firestore (colección `investigaciones`). Con
`INVESTIGACIONES_STORE=archivo` guarda cada investigación como JSON en
`reportes/`, útil para pruebas sin acceso a GCP.
"""

from __future__ import annotations

import datetime
import functools
import json
import os
import uuid
from pathlib import Path
from typing import Any

COLLECTION = "investigaciones"
LOCAL_DIR = Path(os.getenv("REPORTS_DIR", Path(__file__).parent.parent / "reportes"))


def _use_files() -> bool:
    return os.getenv("INVESTIGACIONES_STORE", "firestore").lower() == "archivo"


@functools.cache
def _db():
    from google.cloud import firestore

    return firestore.Client(
        project=os.getenv("GOOGLE_CLOUD_PROJECT"),
        database=os.getenv("FIRESTORE_DATABASE", "(default)"),
    )


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


def _path(doc_id: str) -> Path:
    return LOCAL_DIR / f"{doc_id}.json"


def crear(datos: dict[str, Any], doc_id: str | None = None) -> str | None:
    """Crea una investigación. Devuelve su id, o None si `doc_id` ya existía."""
    doc_id = doc_id or uuid.uuid4().hex
    datos = {**datos, "creado_en": _now()}
    if _use_files():
        LOCAL_DIR.mkdir(parents=True, exist_ok=True)
        try:
            with _path(doc_id).open("x", encoding="utf-8") as f:
                json.dump(datos, f, ensure_ascii=False, indent=2, default=str)
        except FileExistsError:
            return None
        return doc_id
    from google.api_core.exceptions import AlreadyExists

    try:
        _db().collection(COLLECTION).document(doc_id).create(datos)
    except AlreadyExists:
        return None
    return doc_id


def actualizar(doc_id: str, datos: dict[str, Any]) -> None:
    """Fusiona `datos` en una investigación existente (o la crea si no existe)."""
    datos = {**datos, "actualizado_en": _now()}
    if _use_files():
        LOCAL_DIR.mkdir(parents=True, exist_ok=True)
        path = _path(doc_id)
        actual = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        path.write_text(
            json.dumps({**actual, **datos}, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        return
    _db().collection(COLLECTION).document(doc_id).set(datos, merge=True)


def obtener(doc_id: str) -> dict[str, Any] | None:
    if _use_files():
        path = _path(doc_id)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    snapshot = _db().collection(COLLECTION).document(doc_id).get()
    return snapshot.to_dict() if snapshot.exists else None


def listar(limite: int = 10) -> list[dict[str, Any]]:
    """Devuelve las investigaciones más recientes, sin el reporte completo."""
    if _use_files():
        docs = [
            {"id": p.stem, **json.loads(p.read_text(encoding="utf-8"))}
            for p in LOCAL_DIR.glob("*.json")
        ]
        docs.sort(key=lambda d: str(d.get("creado_en", "")), reverse=True)
    else:
        from google.cloud import firestore

        query = (
            _db()
            .collection(COLLECTION)
            .order_by("creado_en", direction=firestore.Query.DESCENDING)
            .limit(limite)
        )
        docs = [{"id": s.id, **(s.to_dict() or {})} for s in query.stream()]
    resumen = []
    for doc in docs[:limite]:
        doc.pop("reporte_markdown", None)
        doc.pop("alerta", None)
        resumen.append({k: str(v) if "_en" in k else v for k, v in doc.items()})
    return resumen
