from fastapi import APIRouter, HTTPException
from app.database import get_db
from app.schemas import PedidoCreate

router = APIRouter(prefix="/api/pedidos", tags=["Pedidos"])


@router.get("")
def listar_pedidos():
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, user_email, producto, total FROM pedidos ORDER BY id DESC;")
            rows = cur.fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.get("/{pedido_id}")
def detalle_pedido(pedido_id: int):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # VULNERABILIDAD INTENCIONAL (IDOR): No valida si el pedido pertenece al usuario actual
            cur.execute("SELECT * FROM pedidos WHERE id = %s;", (pedido_id,))
            pedido = cur.fetchone()
    finally:
        conn.close()

    if not pedido:
        raise HTTPException(status_code=404, detail="Boleta/Pedido no encontrado")

    return dict(pedido)


@router.post("")
def crear_pedido(data: PedidoCreate):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pedidos (user_email, producto, direccion, tarjeta_ultimos4, total)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (data.user_email, data.producto, data.direccion, data.tarjeta_ultimos4, data.total),
            )
            nuevo_id = cur.fetchone()["id"]
        conn.commit()
    finally:
        conn.close()

    return {"id": nuevo_id, "message": "Pedido registrado con éxito"}
