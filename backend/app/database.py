import os
import time
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/rappisim"
)


def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def init_db(retries: int = 8, delay: float = 2.0):
    conn = None
    for attempt in range(1, retries + 1):
        try:
            conn = get_db()
            break
        except psycopg2.OperationalError:
            if attempt == retries:
                raise
            time.sleep(delay)

    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT NOT NULL,
                    password TEXT NOT NULL,
                    nombre TEXT NOT NULL,
                    rol TEXT NOT NULL
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS productos (
                    id SERIAL PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    tienda TEXT NOT NULL,
                    precio FLOAT NOT NULL,
                    imagen TEXT NOT NULL
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS pedidos (
                    id SERIAL PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    producto TEXT NOT NULL,
                    direccion TEXT NOT NULL,
                    tarjeta_ultimos4 TEXT NOT NULL,
                    total FLOAT NOT NULL
                );
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS resenas (
                    id SERIAL PRIMARY KEY,
                    autor TEXT NOT NULL,
                    comentario TEXT NOT NULL
                );
            """)

            # Datos semilla iniciales
            cur.execute("SELECT COUNT(*) AS count FROM users;")
            if cur.fetchone()["count"] == 0:
                cur.executemany(
                    "INSERT INTO users (email, password, nombre, rol) VALUES (%s, %s, %s, %s);",
                    [
                        ("admin@rappi.com", "AdminRappi2026!", "Administrador SOC", "admin"),
                        ("gerardo@rappi.com", "123456", "Gerardo Araujo", "cliente"),
                        ("carlos@rappi.com", "carlos2026", "Carlos Perez", "cliente"),
                    ],
                )

            cur.execute("SELECT COUNT(*) AS count FROM productos;")
            if cur.fetchone()["count"] == 0:
                cur.executemany(
                    "INSERT INTO productos (nombre, tienda, precio, imagen) VALUES (%s, %s, %s, %s);",
                    [
                        ("Whopper Doble con Queso", "Burger King", 24.90, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500"),
                        ("1/4 Pollo a la Brasa + Papas", "Pardos Chicken", 26.50, "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=500"),
                        ("Pizza Pepperoni Familiar", "Pizza Hut", 39.90, "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500"),
                        ("Tabla Maki Acevichado (20 cortes)", "Edo Sushi Bar", 36.00, "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=500"),
                        ("Bembos Clásica Mediana", "Bembos", 19.90, "https://images.unsplash.com/photo-1550547660-d9450f859349?w=500"),
                        ("Burrito Crisp Pollo", "Taco Bell", 17.50, "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=500"),
                    ],
                )

            cur.execute("SELECT COUNT(*) AS count FROM pedidos;")
            if cur.fetchone()["count"] == 0:
                cur.executemany(
                    "INSERT INTO pedidos (user_email, producto, direccion, tarjeta_ultimos4, total) VALUES (%s, %s, %s, %s, %s);",
                    [
                        ("admin@rappi.com", "Tabla Maki Acevichado (20 cortes)", "Av. Javier Prado Este 4600, Surco", "4532", 36.00),
                        ("carlos@rappi.com", "Whopper Doble con Queso", "Calle Los Pinos 320, Dpto 402, Miraflores", "8891", 24.90),
                    ],
                )

            cur.execute("SELECT COUNT(*) AS count FROM resenas;")
            if cur.fetchone()["count"] == 0:
                cur.execute(
                    "INSERT INTO resenas (autor, comentario) VALUES (%s, %s);",
                    ("Gerardo Araujo", "Llegó en 20 minutos y súper caliente."),
                )

        conn.commit()
    finally:
        conn.close()
