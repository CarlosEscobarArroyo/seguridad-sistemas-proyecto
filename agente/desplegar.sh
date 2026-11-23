#!/usr/bin/env bash
# Compila el frontend, lo copia dentro del backend y despliega el agente en Cloud Run.
# Conserva las variables, secretos, red y cuenta de servicio ya configurados en el servicio.
#
# Uso:  bash agente/desplegar.sh [PROJECT_ID]
set -euo pipefail

PROJECT_ID="${1:-seguridad-sistemas-proyecto}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo ">> Compilando el frontend"
(cd "$HERE/frontend" && npm install --silent && npm run build)

echo ">> Copiando el frontend a backend/app/static"
rm -rf "$HERE/backend/app/static"
cp -r "$HERE/frontend/dist" "$HERE/backend/app/static"

echo ">> Desplegando agente-soc en $PROJECT_ID"
(cd "$HERE/backend" && gcloud run deploy agente-soc --source . \
  --region us-central1 --project "$PROJECT_ID" --quiet)
