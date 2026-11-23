"""Pruebas de las herramientas del agente (sin llamar al modelo)."""

import httpx

from app import investigaciones, rag, tools


def test_alertas_de_ejemplo_sin_wazuh_configurado(monkeypatch) -> None:
    monkeypatch.delenv("WAZUH_INDEXER_URL", raising=False)
    result = tools.consultar_alertas_wazuh(nivel_minimo=7)
    assert result["fuente"] == "datos_de_ejemplo"
    assert result["total"] == len(result["alertas"]) > 0
    assert all(a["nivel"] >= 7 for a in result["alertas"])


def test_consulta_al_indexador_de_wazuh(monkeypatch) -> None:
    captured = {}

    def fake_post(url, **kwargs):
        captured.update(url=url, **kwargs)
        hit = {"_source": {"timestamp": "t", "rule": {"id": "1", "level": 9}}}
        return httpx.Response(
            200, json={"hits": {"hits": [hit]}}, request=httpx.Request("POST", url)
        )

    monkeypatch.setenv("WAZUH_INDEXER_URL", "https://wazuh:9200/")
    monkeypatch.setattr(httpx, "post", fake_post)
    result = tools.consultar_alertas_wazuh(nivel_minimo=8, ultimas_horas=2, limite=5)

    assert captured["url"] == "https://wazuh:9200/wazuh-alerts-*/_search"
    filters = captured["json"]["query"]["bool"]["filter"]
    assert {"range": {"rule.level": {"gte": 8}}} in filters
    assert {"range": {"timestamp": {"gte": "now-2h"}}} in filters
    assert result == {
        "fuente": "wazuh",
        "total": 1,
        "alertas": [
            {
                "timestamp": "t",
                "regla_id": "1",
                "nivel": 9,
                "descripcion": None,
                "grupos": [],
                "mitre": {},
                "veces_disparada": None,
                "agente": None,
                "solicitud": {},
            }
        ],
    }


def test_error_de_wazuh_se_informa(monkeypatch) -> None:
    def fake_post(url, **kwargs):
        raise httpx.ConnectError("sin conexión")

    monkeypatch.setenv("WAZUH_INDEXER_URL", "https://wazuh:9200")
    monkeypatch.setattr(httpx, "post", fake_post)
    assert "error" in tools.consultar_alertas_wazuh()


def test_filtro_por_ip_en_alertas_de_ejemplo(monkeypatch) -> None:
    monkeypatch.delenv("WAZUH_INDEXER_URL", raising=False)
    result = tools.consultar_alertas_wazuh(ip_origen="203.0.113.45")
    assert {a["solicitud"]["src_ip"] for a in result["alertas"]} == {"203.0.113.45"}


class FakeToolContext:
    def __init__(self, state=None) -> None:
        self.state = state or {}


def _registrar(ctx) -> dict:
    return tools.registrar_investigacion(
        titulo="SQLi en /api/login",
        tipo_ataque="sql_injection",
        severidad="critica",
        ip_origen="203.0.113.45",
        conclusion="Explotación exitosa.",
        reporte_markdown="# Reporte",
        acciones_ejecutadas=["bloquear_ip 203.0.113.45"],
        tool_context=ctx,
    )


def test_registrar_investigacion_desde_el_chat(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("INVESTIGACIONES_STORE", "archivo")
    monkeypatch.setattr(investigaciones, "LOCAL_DIR", tmp_path)
    doc_id = _registrar(FakeToolContext())["investigacion_id"]
    doc = investigaciones.obtener(doc_id)
    assert doc["estado"] == "concluida"
    assert doc["origen"] == "chat"
    assert doc["acciones_ejecutadas"] == ["bloquear_ip 203.0.113.45"]
    [listada] = tools.listar_investigaciones()["investigaciones"]
    assert listada["id"] == doc_id
    assert "reporte_markdown" not in listada


def test_registrar_investigacion_completa_la_abierta_por_la_alerta(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.setenv("INVESTIGACIONES_STORE", "archivo")
    monkeypatch.setattr(investigaciones, "LOCAL_DIR", tmp_path)
    assert (
        investigaciones.crear({"estado": "en_curso", "origen": "wazuh"}, "abc") == "abc"
    )
    assert investigaciones.crear({"estado": "en_curso"}, "abc") is None  # duplicada
    ctx = FakeToolContext({"investigacion_id": "abc"})
    assert _registrar(ctx)["investigacion_id"] == "abc"
    doc = investigaciones.obtener("abc")
    assert doc["estado"] == "concluida"
    assert doc["origen"] == "wazuh"
    # Un segundo incidente en la misma sesión crea otro registro.
    assert _registrar(ctx)["investigacion_id"] != "abc"


def test_acciones_de_respuesta_llaman_a_rappisim_con_token(monkeypatch) -> None:
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs.get("headers"), kwargs.get("json")))
        return httpx.Response(
            200, json={"ok": True}, request=httpx.Request(method, url)
        )

    monkeypatch.setenv("RAPPISIM_URL", "https://web.example/")
    monkeypatch.setenv("RAPPISIM_ADMIN_TOKEN", "secreto")
    monkeypatch.setattr(httpx, "request", fake_request)

    assert tools.bloquear_ip("203.0.113.45", "SQLi") == {"resultado": {"ok": True}}
    assert tools.eliminar_resena(7) == {"resultado": {"ok": True}}
    assert tools.listar_resenas() == {"resultado": {"ok": True}}
    assert calls == [
        (
            "POST",
            "https://web.example/api/admin/bloqueos",
            {"X-Admin-Token": "secreto"},
            {"ip": "203.0.113.45", "motivo": "SQLi"},
        ),
        (
            "DELETE",
            "https://web.example/api/admin/resenas/7",
            {"X-Admin-Token": "secreto"},
            None,
        ),
        ("GET", "https://web.example/api/resenas", {}, None),
    ]


def test_accion_de_respuesta_sin_configurar_devuelve_error(monkeypatch) -> None:
    monkeypatch.delenv("RAPPISIM_URL", raising=False)
    assert "error" in tools.bloquear_ip("203.0.113.45", "SQLi")


def test_base_de_conocimiento_se_divide_en_fragmentos() -> None:
    chunks = rag.load_chunks()
    assert {c["fuente"] for c in chunks} >= {"inyeccion-sql.md", "formato-reporte.md"}
    assert all(c["texto"] for c in chunks)


def test_resumen_extrae_la_solicitud_del_log_de_cloud_run() -> None:
    alerta = tools._summarize(tools._SAMPLE_ALERTS[0])
    assert alerta["regla_id"] == "100110"
    assert alerta["solicitud"]["src_ip"] == "203.0.113.45"
    assert alerta["solicitud"]["path"] == "/api/login"
    assert "query" not in alerta["solicitud"]
