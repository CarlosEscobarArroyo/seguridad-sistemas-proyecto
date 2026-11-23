from fastapi import APIRouter, HTTPException
from app.database import get_db

router = APIRouter(prefix="/api/productos", tags=["Productos"])


@router.get("")
def listar_productos(q: str = ""):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # VULNERABILIDAD INTENCIONAL: Permite UNION SELECT desde el buscador
            query = f"SELECT id, nombre, tienda, precio, imagen FROM productos WHERE nombre ILIKE '%{q}%' OR tienda ILIKE '%{q}%'"
            cur.execute(query)
            rows = cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PostgreSQL Error: {str(e)}")
    finally:
        conn.close()

    return [dict(r) for r in rows]
