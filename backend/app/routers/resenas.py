from fastapi import APIRouter
from app.database import get_db
from app.schemas import ResenaCreate

router = APIRouter(prefix="/api/resenas", tags=["Reseñas"])


@router.get("")
def listar_resenas():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, autor, comentario FROM resenas ORDER BY id DESC;")
            rows = cur.fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.post("")
def crear_resena(data: ResenaCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # VULNERABILIDAD INTENCIONAL: Almacena payloads HTML/JS sin sanitizar
            cur.execute(
                "INSERT INTO resenas (autor, comentario) VALUES (%s, %s);",
                (data.autor, data.comentario),
            )
        conn.commit()
    finally:
        conn.close()

    return {"message": "Reseña publicada"}
