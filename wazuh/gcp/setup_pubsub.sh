#!/usr/bin/env bash
# =============================================================================
# PASO 1 - Crear en GCP el tramo: Cloud Logging -> Log Sink -> Pub/Sub
# Se ejecuta en Cloud Shell (console.cloud.google.com -> icono ">_").
#
# Uso:
#   bash setup_pubsub.sh <PROJECT_ID>
#
# Se puede ejecutar más de una vez: si algo ya existe, lo reutiliza.
# Al final deja el archivo wazuh-credentials.json que se copia a la VM de Wazuh.
# =============================================================================
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE_NAME="${SERVICE_NAME:-rappi-web-simulada}"   # servicio de Cloud Run
TOPIC="wazuh-cloudrun-logs"
SUBSCRIPTION="wazuh-cloudrun-sub"
SINK="wazuh-cloudrun-sink"
SA_NAME="wazuh-pubsub-reader"
KEY_FILE="wazuh-credentials.json"

if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: indica el proyecto: bash setup_pubsub.sh <PROJECT_ID>"; exit 1
fi
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo ">> Proyecto: $PROJECT_ID | Servicio Cloud Run: $SERVICE_NAME"
gcloud config set project "$PROJECT_ID" >/dev/null

echo ">> Habilitando APIs (Pub/Sub, Logging, IAM)..."
gcloud services enable pubsub.googleapis.com logging.googleapis.com iam.googleapis.com

# --- Comprobación: el servicio de Cloud Run existe ---------------------------
if ! gcloud run services list --format='value(metadata.name)' | grep -qx "$SERVICE_NAME"; then
  echo "AVISO: no encontré el servicio '$SERVICE_NAME' en Cloud Run."
  echo "       Servicios que existen:"; gcloud run services list --format='value(metadata.name)' | sed 's/^/         - /'
  echo "       Si el nombre es otro: SERVICE_NAME=<nombre> bash setup_pubsub.sh $PROJECT_ID"
  exit 1
fi

# --- 1. Topic -----------------------------------------------------------------
if gcloud pubsub topics describe "$TOPIC" >/dev/null 2>&1; then
  echo ">> Topic $TOPIC ya existe"
else
  echo ">> Creando topic $TOPIC"
  gcloud pubsub topics create "$TOPIC"
fi

# --- 2. Suscripción (Wazuh hace pull de aquí) --------------------------------
if gcloud pubsub subscriptions describe "$SUBSCRIPTION" >/dev/null 2>&1; then
  echo ">> Suscripción $SUBSCRIPTION ya existe"
else
  echo ">> Creando suscripción $SUBSCRIPTION"
  gcloud pubsub subscriptions create "$SUBSCRIPTION" \
    --topic="$TOPIC" --ack-deadline=60 --message-retention-duration=1d
fi

# --- 3. Log Sink: solo el JSON que imprime la app por stdout ------------------
FILTER="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE_NAME}\" AND log_id(\"run.googleapis.com/stdout\")"
DEST="pubsub.googleapis.com/projects/${PROJECT_ID}/topics/${TOPIC}"

if gcloud logging sinks describe "$SINK" >/dev/null 2>&1; then
  echo ">> Sink $SINK ya existe, actualizando filtro"
  gcloud logging sinks update "$SINK" "$DEST" --log-filter="$FILTER"
else
  echo ">> Creando sink $SINK"
  gcloud logging sinks create "$SINK" "$DEST" --log-filter="$FILTER"
fi

# El sink publica con su propia identidad: hay que darle permiso sobre el topic
WRITER=$(gcloud logging sinks describe "$SINK" --format='value(writerIdentity)')
echo ">> Dando roles/pubsub.publisher a $WRITER"
gcloud pubsub topics add-iam-policy-binding "$TOPIC" \
  --member="$WRITER" --role="roles/pubsub.publisher" >/dev/null

# --- 4. Cuenta de servicio para Wazuh -----------------------------------------
if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  echo ">> Cuenta de servicio $SA_EMAIL ya existe"
else
  echo ">> Creando cuenta de servicio $SA_EMAIL"
  gcloud iam service-accounts create "$SA_NAME" --display-name="Wazuh Pub/Sub reader"
  sleep 5   # IAM tarda unos segundos en propagar
fi
echo ">> Dando roles/pubsub.subscriber sobre la suscripción"
gcloud pubsub subscriptions add-iam-policy-binding "$SUBSCRIPTION" \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/pubsub.subscriber" >/dev/null

# --- 5. Llave JSON --------------------------------------------------------------
if [[ -f "$KEY_FILE" ]]; then
  echo ">> $KEY_FILE ya existe aquí, no creo otra llave"
else
  echo ">> Creando llave $KEY_FILE"
  gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$SA_EMAIL"
fi

cat <<EOF

=============================================================================
 LISTO (paso 1). Datos para el paso 2:
   project_id        = $PROJECT_ID
   subscription_name = $SUBSCRIPTION
   llave             = $(pwd)/$KEY_FILE

 Siguiente: subir la llave a la VM de Wazuh, por ejemplo:
   gcloud compute scp $KEY_FILE <NOMBRE_VM_WAZUH>:~/ --zone <ZONA>
 (NO subas esta llave a GitHub)
=============================================================================
EOF
