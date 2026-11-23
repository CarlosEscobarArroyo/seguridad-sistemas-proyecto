"""Pruebas del control de acceso (Basic para el panel, token para /alertas)."""

import base64

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import acceso


def _client() -> TestClient:
    app = FastAPI()
    app.middleware("http")(acceso.middleware)

    @app.get("/api/investigaciones")
    def lista() -> list:
        return []

    @app.post("/alertas")
    def alerta() -> dict:
        return {"ok": True}

    return TestClient(app)


def _basic(user: str, password: str) -> dict:
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_sin_configurar_no_exige_credenciales(monkeypatch) -> None:
    monkeypatch.delenv("PANEL_PASSWORD", raising=False)
    monkeypatch.delenv("ALERTAS_SA_EMAIL", raising=False)
    client = _client()
    assert client.get("/api/investigaciones").status_code == 200
    assert client.post("/alertas").status_code == 200


def test_panel_exige_usuario_y_clave(monkeypatch) -> None:
    monkeypatch.setenv("PANEL_PASSWORD", "clave")
    monkeypatch.setenv("PANEL_USER", "soc")
    client = _client()
    sin = client.get("/api/investigaciones")
    assert sin.status_code == 401
    assert sin.headers["WWW-Authenticate"].startswith("Basic")
    assert (
        client.get("/api/investigaciones", headers=_basic("soc", "mal")).status_code
        == 401
    )
    assert (
        client.get("/api/investigaciones", headers=_basic("otro", "clave")).status_code
        == 401
    )
    assert (
        client.get(
            "/api/investigaciones", headers={"Authorization": "Basic ###"}
        ).status_code
        == 401
    )
    assert (
        client.get("/api/investigaciones", headers=_basic("soc", "clave")).status_code
        == 200
    )


def test_alertas_exige_token_de_la_cuenta_de_wazuh(monkeypatch) -> None:
    monkeypatch.setenv("PANEL_PASSWORD", "clave")
    monkeypatch.setenv("ALERTAS_SA_EMAIL", "vm@proyecto.iam.gserviceaccount.com")
    monkeypatch.setenv("SERVICE_URL", "https://agente.example")
    seen = {}

    def fake_verify(token, request, audience):
        seen.update(token=token, audience=audience)
        if token != "bueno":
            raise ValueError("token inválido")
        return {"email": seen.get("email"), "email_verified": True}

    monkeypatch.setattr("google.oauth2.id_token.verify_oauth2_token", fake_verify)
    client = _client()

    assert client.post("/alertas").status_code == 401
    # La clave del panel no sirve para enviar alertas.
    assert client.post("/alertas", headers=_basic("soc", "clave")).status_code == 401
    assert (
        client.post("/alertas", headers={"Authorization": "Bearer malo"}).status_code
        == 401
    )
    seen["email"] = "otra@cuenta.com"
    assert (
        client.post("/alertas", headers={"Authorization": "Bearer bueno"}).status_code
        == 401
    )
    seen["email"] = "vm@proyecto.iam.gserviceaccount.com"
    assert (
        client.post("/alertas", headers={"Authorization": "Bearer bueno"}).status_code
        == 200
    )
    assert seen["audience"] == "https://agente.example"
