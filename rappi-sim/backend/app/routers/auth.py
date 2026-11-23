from fastapi import APIRouter, HTTPException
from app.database import get_db
from app.schemas import LoginRequest

router = APIRouter(prefix="/api", tags=["Auth"])


@router.post("/login")
def login(data: LoginRequest):
    conn = get_db()
    try:
        with conn.cursor() as cur:
            # VULNERABILIDAD INTENCIONAL: Concatenación directa (SQL Injection)
            query = f"SELECT id, email, nombre, rol FROM users WHERE email = '{data.email}' AND password = '{data.password}'"
            cur.execute(query)
            user = cur.fetchone()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PostgreSQL Error: {str(e)}")
    finally:
        conn.close()

    if not user:
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")

    return {"message": "Login exitoso", "user": dict(user)}
