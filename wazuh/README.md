# Conexión de logs: Cloud Run → Wazuh

Esta carpeta implementa el tramo **izquierda-abajo** del diagrama de arquitectura:

```
Rappi Web (Cloud Run) ──stdout JSON──► Cloud Logging ──Log Sink──► Pub/Sub ──pull──► Wazuh SIEM ──► alertas
```

**En palabras:** la web anota cada request (IP, ruta, parámetros, body, código de respuesta) en
formato JSON. Cloud Logging guarda esas líneas; el *Log Sink* filtra solo las de nuestra web y las
deja en una cola de *Pub/Sub*; Wazuh revisa esa cola cada minuto, compara cada registro con
nuestras reglas y, si reconoce un ataque, genera una alerta. Esas alertas son las que después
consulta el agente SOC por la API del indexer.

## Contenido

| Archivo | Dónde se usa | Qué hace |
|---|---|---|
| `gcp/setup_pubsub.sh` | Cloud Shell | Crea topic, suscripción, sink, cuenta de servicio y su llave |
| `manager/ossec-gcp-pubsub.conf` | VM de Wazuh | Bloque que activa el módulo `gcp-pubsub` |
| `manager/local_rules.xml` | VM de Wazuh | Reglas de detección RappiSim (IDs 100100–100141) |
| `manager/instalar_en_wazuh.sh` | VM de Wazuh | Instala llave, config y reglas; valida y reinicia |
| `manager/custom-agente-soc` | VM de Wazuh | Integración que envía la alerta al agente por HTTPS autenticado |
| `manager/instalar_integracion_agente.sh` | VM de Wazuh | Instala la integración y su bloque en `ossec.conf` |
| `pruebas/simular_ataques.sh` | Cualquier PC | Lanza los ataques de laboratorio contra la web |
| `pruebas/eventos_logtest.txt` | VM de Wazuh | Eventos de ejemplo para probar reglas con `wazuh-logtest` |

## Paso 1 – GCP (Cloud Shell)

```bash
git clone -b conectar-logs-wazuh https://github.com/CarlosEscobarArroyo/seguridad-sistemas-proyecto
cd seguridad-sistemas-proyecto/wazuh
bash gcp/setup_pubsub.sh <PROJECT_ID>
```

Si el servicio de Cloud Run no se llama `rappi-web-simulada`:
`SERVICE_NAME=<nombre> bash gcp/setup_pubsub.sh <PROJECT_ID>`

Pasar la llave a la VM de Wazuh:

```bash
gcloud compute scp wazuh-credentials.json <VM_WAZUH>:~/ --zone <ZONA>
```

## Paso 2 – VM de Wazuh

```bash
gcloud compute ssh <VM_WAZUH> --zone <ZONA>
git clone -b conectar-logs-wazuh https://github.com/CarlosEscobarArroyo/seguridad-sistemas-proyecto
cd seguridad-sistemas-proyecto/wazuh
sudo bash manager/instalar_en_wazuh.sh <PROJECT_ID> ~/wazuh-credentials.json
rm ~/wazuh-credentials.json     # ya quedó copiada en /var/ossec/wodles/gcloud/
```

El script hace copia de seguridad (`.bak-<fecha>`) de `ossec.conf` y `local_rules.xml`, valida
con `wazuh-analysisd -t` y, si algo falla, restaura todo solo.

### Si Wazuh corre en Docker (wazuh-docker)

El script no aplica tal cual. Hacer a mano:
1. Pegar el bloque de `manager/ossec-gcp-pubsub.conf` (con el project_id real) en
   `config/wazuh_cluster/wazuh_manager.conf`.
2. Pegar el `<group>` de `manager/local_rules.xml` en el `local_rules.xml` del contenedor
   (`/var/ossec/etc/rules/local_rules.xml`).
3. Montar la llave en `/var/ossec/wodles/gcloud/credentials.json` y reiniciar el contenedor.

## Paso 3 – Probar

**a) Reglas sin tráfico real** (en la VM):

```bash
sudo /var/ossec/bin/wazuh-logtest
# pegar una línea de pruebas/eventos_logtest.txt → debe mostrar la regla esperada
```

**b) Ataques reales** (desde cualquier PC):

```bash
bash pruebas/simular_ataques.sh https://<URL-de-cloud-run>
```

Luego, en el dashboard de Wazuh → *Threat Hunting / Discover* → filtro `rule.groups: rappisim`.

## Paso 4 – Enviar las alertas al agente SOC

Wazuh envía al agente (Cloud Run) cada alerta `rappisim` de nivel 10 o superior. La llamada se
autentica con un token de identidad de la cuenta de servicio de la VM, que necesita
`roles/run.invoker` sobre el servicio del agente:

```bash
# En GCP (una vez)
gcloud run services add-iam-policy-binding agente-soc --region us-central1 \
  --member="serviceAccount:<CUENTA_DE_SERVICIO_DE_LA_VM>" --role=roles/run.invoker
# En la VM de Wazuh
sudo bash manager/instalar_integracion_agente.sh https://<servicio-del-agente>.run.app
```

Cada envío queda registrado en `/var/ossec/logs/integrations.log`.

## Reglas de detección

| ID | Detecta | Nivel | Riesgo del informe |
|---|---|---|---|
| 100100 | Cualquier request a la web (base) | 3 | – |
| 100110 | SQLi en el body (login `' OR '1'='1' --`) | 12 | R01 / R02 |
| 100111 | SQLi en query string (`UNION SELECT`, URL-encoded) | 12 | R02 / R03 |
| 100112 | Error 500 en la API (síntoma de pruebas de SQLi) | 7 | R02 |
| 100120 | XSS almacenado en el body (`<script>`, `onerror=`) | 10 | R02 |
| 100121 | XSS en query string | 10 | R02 |
| 100130 | Consulta de un pedido por ID | 3 | – |
| 100131 | IDOR: misma IP, ≥4 pedidos distintos en 60 s | 10 | R03 |
| 100140 | Login fallido | 5 | – |
| 100141 | Fuerza bruta: ≥6 logins fallidos en 60 s | 10 | R01 |

Las reglas base de GCP de Wazuh (`0690-gcp_rules.xml`) clasifican primero por severidad
(65039–65043); por eso la regla 100100 cuelga de ellas y no de la 65000.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| `ossec.log` muestra 403 / PermissionDenied | La cuenta de servicio no tiene `roles/pubsub.subscriber` en la suscripción |
| 404 / NotFound | `project_id` o `subscription_name` mal escritos |
| No llegan mensajes | El sink no tiene `roles/pubsub.publisher` en el topic, o el filtro no coincide con el nombre del servicio |
| Llegan eventos pero ninguna alerta `rappisim` | Probar con `wazuh-logtest` y revisar los nombres de campo `gcp.jsonPayload.*` |
| No se puede crear la llave | La organización bloquea llaves (`iam.disableServiceAccountKeyCreation`) |

Para ver si hay mensajes esperando en la cola (sin consumirlos, usar en Cloud Console:
Pub/Sub → Suscripciones → `wazuh-cloudrun-sub` → Métricas).

> ⚠️ Nunca subir `wazuh-credentials.json` / `credentials.json` al repo (ya está en `.gitignore`).
