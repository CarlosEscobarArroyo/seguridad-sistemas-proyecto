# Contexto técnico para Claude Code

## Objetivo

Construir un prototipo en Google Cloud que monitoree la actividad de una aplicación web simulada, detecte incidentes mediante Wazuh y utilice un agente de IA para investigar alertas y ejecutar las acciones de respuesta que se implementen.

El aporte del agente es investigar con contexto, consultar evidencia adicional y elegir sus siguientes pasos según los resultados. El monitoreo y la detección por reglas corresponden a Wazuh.

## Arquitectura de trabajo

| Componente | Tecnología | Responsabilidad |
|---|---|---|
| Web simulada y backend | Servicio en Cloud Run | Ejecutar la aplicación de prueba y generar los eventos de seguridad. |
| Registro de eventos | Cloud Logging | Recoger los logs del backend y permitir consultas para las investigaciones. |
| Transporte de logs | Pub/Sub | Recibir los logs enviados por un sink de Cloud Logging y entregarlos a Wazuh mediante una suscripción. |
| Plataforma de seguridad | Wazuh en Compute Engine | Ejecutar Server/Manager, Indexer y Dashboard en una VM para el prototipo. |
| Agente investigador | Python y Google ADK en otro servicio de Cloud Run | Recibir alertas de Wazuh, consultar evidencia y utilizar herramientas de investigación y respuesta. |
| Modelo de IA | Gemini mediante Vertex AI | Interpretar la evidencia y orientar las decisiones del agente. |
| Estado de investigaciones | Firestore | Persistir el estado, las conclusiones y las acciones realizadas por el agente. |
| Contenedores | Docker y Artifact Registry | Empaquetar y almacenar las imágenes de la web y del agente para su despliegue. |
| Identidad y permisos | IAM y cuentas de servicio | Autenticar llamadas y otorgar acceso a los recursos que utiliza cada servicio. |

La arquitectura utiliza dos servicios de Cloud Run y una VM para los componentes centrales de Wazuh.

## Flujo de funcionamiento

1. Las pruebas interactúan con la web simulada.
2. El backend genera logs de solicitudes, accesos, resultados de autenticación y errores relevantes.
3. Cloud Logging recoge los logs.
4. Un sink filtra los registros pertinentes y los publica en un tema de Pub/Sub.
5. El módulo de Google Cloud de Wazuh consume la suscripción de Pub/Sub.
6. Wazuh procesa los eventos y aplica sus reglas para generar alertas.
7. Una integración personalizada de Wazuh envía las alertas seleccionadas al agente mediante HTTPS autenticado.
8. El agente consulta evidencia adicional, utiliza Gemini y elige las herramientas necesarias para investigar.
9. El agente registra su conclusión y las acciones ejecutadas en Firestore.
10. Las herramientas de respuesta invocan las operaciones implementadas sobre la aplicación de prueba.

El monitoreo es continuo mediante la ingesta de eventos. Cada investigación del agente se activa a partir de una alerta.

## Aplicación web simulada

La web y su backend constituyen el entorno de pruebas y se despliegan en un servicio de Cloud Run independiente del agente.

El backend debe producir logs con información suficiente para investigar los incidentes. Los campos considerados incluyen fecha, usuario, ruta solicitada y resultado de la operación. Los eventos de seguridad deben registrarse explícitamente en la lógica del backend.

Las acciones de respuesta necesitan operaciones implementadas en la aplicación. El agente accede a ellas mediante herramientas que llaman al backend.

## Wazuh

Los tres componentes centrales se alojan en Compute Engine.

- **Server/Manager** procesa los eventos y aplica las reglas de detección.
- **Indexer** indexa y almacena los eventos y alertas que se envían para consulta.
- **Dashboard** permite visualizar y gestionar la información de Wazuh.

La implementación incluye la ingesta desde Pub/Sub, los decoders y reglas que requieran los logs de la web, y una integración personalizada que invoque el servicio del agente.

## Pub/Sub

Pub/Sub conecta Cloud Logging con la integración de Google Cloud de Wazuh.

- El sink de Logging selecciona y publica los logs relevantes.
- El tema recibe los mensajes.
- Wazuh consume los mensajes mediante una suscripción.
- Los mensajes pendientes pueden conservarse durante el periodo de retención configurado cuando Wazuh está desconectado.

Pub/Sub forma parte del transporte de logs hacia Wazuh. El envío de alertas desde Wazuh al agente utiliza la integración HTTPS.

## Agente de IA

El agente se implementa en Python con Google ADK y se ejecuta en Cloud Run. Utiliza Gemini mediante Vertex AI.

Sus responsabilidades son recibir la alerta, consultar logs adicionales, relacionar evidencia, seleccionar herramientas, formular una conclusión y registrar su resultado. La capacidad de respuesta depende de las operaciones que exponga el backend y de las herramientas implementadas.

Firestore conserva el estado de las investigaciones, las conclusiones y las acciones ejecutadas. La evaluación del aporte del agente debe considerar la calidad de las conclusiones y el tiempo de investigación frente a un procedimiento basado en reglas.

## Alcance técnico por concretar

La arquitectura anterior es la base de trabajo. Los siguientes detalles siguen abiertos para la implementación.

- Frameworks de frontend y backend, y almacenamiento de los datos propios de la web.
- Incidentes específicos que se simularán y reglas que los detectarán.
- Esquema definitivo de logs, alertas e investigaciones.
- Herramientas concretas de respuesta y nivel de autonomía del agente.
- Forma de presentar los resultados al administrador.
- Proyecto, región, tamaño de la VM y versión de Gemini.
- Configuración de permisos, retención de mensajes y mecanismo de despliegue.

## Referencias técnicas

- Integración de Google Cloud con Wazuh mediante Pub/Sub. [Documentación](https://documentation.wazuh.com/current/cloud-security/gcp/supported-services/pubsub.html)
- Instalación de los componentes de Wazuh en un host. [Quickstart](https://documentation.wazuh.com/current/quickstart.html)
- Integraciones externas de Wazuh. [Integrator](https://documentation.wazuh.com/current/user-manual/reference/ossec-conf/integration.html)
- Recogida de logs de la aplicación en Cloud Run. [Cloud Run Logging](https://docs.cloud.google.com/run/docs/logging)
- Exportación de logs a Pub/Sub. [Cloud Logging](https://docs.cloud.google.com/logging/docs/export/pubsub)

## Estado actual del repositorio (2026-11-22)

Los 10 pasos del flujo están implementados, desplegados y verificados de punta a punta con `wazuh/pruebas/simular_ataques.sh`.

Monorepo:

- `rappi-sim/`: web simulada (React + FastAPI + PostgreSQL) con logs JSON en `stdout`. Vulnerabilidades intencionales: SQLi, XSS almacenado, IDOR. Operaciones de respuesta en `/api/admin/*` (token) y bloqueo de IP en el middleware.
- `wazuh/`: script de GCP para la tubería de logs, reglas RappiSim 100100–100141, instaladores para la VM, integración `custom-agente-soc` y pruebas de ataque.
- `agente/backend/`: agente ADK creado con `agents-cli` (tiene su propio `CLAUDE.md`). Herramientas en `app/tools.py`; recepción de alertas en `app/alertas.py` (`POST /alertas`, deduplica por IP + regla en ventanas de 10 min); Firestore en `app/investigaciones.py`; RAG de playbooks en `app/rag.py` (Vector Search 2.0; fuentes en `app/knowledge/`, se indexan con `uv run python -m app.rag`); puente ChatKit en `app/chatkit_server.py`.
- `agente/frontend/`: panel en React (CSS propio, temas claro y oscuro, rutas en el hash): investigaciones con resumen y detalle (`GET /api/investigaciones`) y chat propio por SSE (`/run_sse`). ChatKit (`ChatKitChat.jsx`, `POST /chatkit`) solo se usa si se compila con `VITE_CHATKIT_DOMAIN_KEY`.

Recursos en el proyecto GCP `seguridad-sistemas-proyecto` (región `us-central1`):

- Cloud Run `rappi-web-simulada` (público). Secreto `rappi-admin-token` como `ADMIN_API_TOKEN`.
- Sink `wazuh-cloudrun-sink` → tema `wazuh-cloudrun-logs` → suscripción `wazuh-cloudrun-sub`; cuenta `wazuh-pubsub-reader`.
- VM `wazuh` (`us-central1-a`, `e2-standard-2`, Wazuh 4.14 nativo) con `gcp-pubsub`, las reglas y la integración hacia el agente (alertas `rappisim` de nivel ≥ 10). Solo tiene abiertos el 22 y el 443 (este a una IP).
- Cloud Run `agente-soc` (público en IAM; el acceso lo controla `app/acceso.py`): el panel, el chat y la API piden HTTP Basic (usuario `soc`, secreto `panel-password`); `POST /alertas` exige el token de identidad de la cuenta de servicio de la VM. Sirve el frontend compilado desde `app/static/` (lo genera `agente/desplegar.sh`; sin él se sirve la interfaz de desarrollo de ADK). Cuenta `agente-soc@`, Direct VPC egress a la red `default`, CPU siempre asignada (las investigaciones corren en segundo plano), máximo 1 instancia (sesiones e hilos de chat en memoria). Secretos `wazuh-indexer-password`, `rappi-admin-token` y `panel-password`.
- Firestore `(default)`, colección `investigaciones`.
- Vector Search 2.0: colección `soc-conocimiento` (`us-central1`) con embeddings automáticos de `gemini-embedding-001`; la cuenta del agente tiene `roles/vectorsearch.viewer`.

Pendientes y limitaciones conocidas:

- ChatKit no se muestra en el dominio público sin registrarlo en OpenAI; por eso el chat por defecto es el propio.
- El indexador de Wazuh escucha solo en `127.0.0.1:9200`, así que el agente desplegado no puede usar `consultar_alertas_wazuh` (recibe la alerta por la integración e investiga con Cloud Logging). Para habilitarlo hay que poner `network.host: "0.0.0.0"` en `/etc/wazuh-indexer/opensearch.yml` (queda accesible solo dentro de la VPC). En local se alcanza por túnel SSH: `gcloud compute ssh wazuh --zone us-central1-a --project seguridad-sistemas-proyecto -- -N -L 9200:localhost:9200`.
- El indexador tarda varios minutos en arrancar (disco lento); se amplió `TimeoutStartSec` a 900 s con un drop-in de systemd. Sus credenciales están en `~/wazuh-install-files.tar` dentro de la VM.
- El agente usa el usuario `admin` del indexador; convendría un usuario de solo lectura.
- La infraestructura se creó con `gcloud`, no con Terraform.
- Falta evaluar el agente (`agents-cli eval`) frente a un procedimiento basado en reglas.

`gcloud` usa por defecto otro proyecto: pasar siempre `--project seguridad-sistemas-proyecto` (o `CLOUDSDK_ACTIVE_CONFIG_NAME=seguridad`).
