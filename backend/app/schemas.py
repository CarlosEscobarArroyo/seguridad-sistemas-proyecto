from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


class PedidoCreate(BaseModel):
    user_email: str
    producto: str
    direccion: str
    tarjeta_ultimos4: str = "4111"
    total: float


class ResenaCreate(BaseModel):
    autor: str
    comentario: str
