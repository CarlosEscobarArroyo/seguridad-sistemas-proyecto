"""RAG sobre la base de conocimiento del SOC con Vector Search 2.0 de Agent Platform.

- Colección: guarda cada fragmento (fuente, título, sección y texto) y genera
  su embedding en el servidor con Gemini (`gemini-embedding-001`).
- Ingesta (`uv run python -m app.rag`): crea la colección si no existe, divide
  cada Markdown de `app/knowledge/` por secciones (`## `) y sincroniza los
  fragmentos (crea, actualiza y elimina los que ya no existen).
- Consulta (`search`): búsqueda semántica en la colección; el embedding de la
  pregunta también lo genera el servicio.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

from google.api_core import exceptions
from google.cloud import vectorsearch_v1beta as vs

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIMENSIONS = 3072
VECTOR_FIELD = "embedding"
DATA_FIELDS = ["fuente", "titulo", "seccion", "texto"]
_BATCH = 100


def _parent() -> str:
    project = os.environ["GOOGLE_CLOUD_PROJECT"]
    location = os.getenv("VECTOR_SEARCH_LOCATION", "us-central1")
    return f"projects/{project}/locations/{location}"


def _collection_id() -> str:
    return os.getenv("VECTOR_SEARCH_COLLECTION", "soc-conocimiento")


def _collection_path() -> str:
    return f"{_parent()}/collections/{_collection_id()}"


def load_chunks() -> list[dict]:
    """Divide cada Markdown en fragmentos por sección de segundo nivel."""
    chunks = []
    for path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        title_match = re.search(r"^# (.+)$", text, flags=re.MULTILINE)
        title = title_match.group(1).strip() if title_match else path.stem
        for section in re.split(r"\n(?=## )", text):
            section = section.strip()
            heading = re.match(r"## (.+)", section)
            if not heading or len(section) < 40:
                continue
            chunks.append(
                {
                    "fuente": path.name,
                    "titulo": title,
                    "seccion": heading.group(1).strip(),
                    "texto": f"{title}\n{section}",
                }
            )
    return chunks


def _chunk_id(chunk: dict) -> str:
    key = f"{chunk['fuente']}|{chunk['seccion']}"
    return "c" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]


def ensure_collection() -> bool:
    """Crea la colección con embeddings automáticos. Devuelve True si la creó."""
    client = vs.VectorSearchServiceClient()
    try:
        client.get_collection(request=vs.GetCollectionRequest(name=_collection_path()))
        return False
    except exceptions.NotFound:
        pass
    request = vs.CreateCollectionRequest(
        parent=_parent(),
        collection_id=_collection_id(),
        collection={
            "data_schema": {
                "type": "object",
                "properties": {field: {"type": "string"} for field in DATA_FIELDS},
            },
            "vector_schema": {
                VECTOR_FIELD: {
                    "dense_vector": {
                        "dimensions": EMBEDDING_DIMENSIONS,
                        "vertex_embedding_config": {
                            "model_id": EMBEDDING_MODEL,
                            "text_template": "{texto}",
                            "task_type": "RETRIEVAL_DOCUMENT",
                        },
                    },
                },
            },
        },
    )
    client.create_collection(request=request).result()
    return True


def _existing_ids() -> set[str]:
    client = vs.DataObjectSearchServiceClient()
    request = vs.QueryDataObjectsRequest(
        parent=_collection_path(),
        output_fields=vs.OutputFields(data_fields=["fuente"]),
        page_size=500,
    )
    return {obj.data_object_id for obj in client.query_data_objects(request=request)}


def ingest() -> dict:
    """Sincroniza la base de conocimiento con la colección."""
    creada = ensure_collection()
    chunks = {_chunk_id(c): c for c in load_chunks()}
    existentes = set() if creada else _existing_ids()
    client = vs.DataObjectServiceClient()
    path = _collection_path()

    # Los fragmentos existentes se eliminan y se vuelven a crear para que el
    # servicio recalcule el embedding si el texto cambió.
    a_eliminar = sorted(existentes)
    for i in range(0, len(a_eliminar), _BATCH):
        client.batch_delete_data_objects(
            request=vs.BatchDeleteDataObjectsRequest(
                parent=path,
                requests=[
                    vs.DeleteDataObjectRequest(name=f"{path}/dataObjects/{doc_id}")
                    for doc_id in a_eliminar[i : i + _BATCH]
                ],
            )
        )
    items = list(chunks.items())
    for i in range(0, len(items), _BATCH):
        client.batch_create_data_objects(
            request=vs.BatchCreateDataObjectsRequest(
                parent=path,
                requests=[
                    # Sin vectores: la colección genera el embedding.
                    {
                        "data_object_id": doc_id,
                        "data_object": {"data": chunk, "vectors": {}},
                    }
                    for doc_id, chunk in items[i : i + _BATCH]
                ],
            )
        )
    return {
        "coleccion": path,
        "coleccion_creada": creada,
        "indexados": len(chunks),
        "obsoletos_eliminados": len(existentes - set(chunks)),
    }


def search(query: str, top_k: int = 4) -> list[dict]:
    """Devuelve los `top_k` fragmentos semánticamente más cercanos a la consulta."""
    client = vs.DataObjectSearchServiceClient()
    request = vs.SearchDataObjectsRequest(
        parent=_collection_path(),
        semantic_search=vs.SemanticSearch(
            search_text=query,
            search_field=VECTOR_FIELD,
            task_type="RETRIEVAL_QUERY",
            top_k=top_k,
            output_fields=vs.OutputFields(data_fields=DATA_FIELDS),
        ),
    )
    results = []
    for result in client.search_data_objects(request=request):
        data = dict(result.data_object.data)
        results.append(
            {
                **{field: data.get(field) for field in DATA_FIELDS},
                # El servicio devuelve la puntuación de similitud: mayor es más relevante.
                "puntuacion": round(float(result.distance), 4),
            }
        )
    return results


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()
    print(ingest())
