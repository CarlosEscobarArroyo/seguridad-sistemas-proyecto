#!/usr/bin/env bash
# =============================================================================
# PASO 2 - Configurar el Wazuh manager para leer Pub/Sub y detectar ataques
# Se ejecuta DENTRO de la VM de Wazuh (Compute Engine), con sudo.
#
# Uso (desde la carpeta wazuh/ del repo, clonado en la VM):
#   sudo bash manager/instalar_en_wazuh.sh <PROJECT_ID> <ruta/a/wazuh-credentials.json>
#
# Qué hace:
#   1. Copia la llave a /var/ossec/wodles/gcloud/credentials.json
#   2. Añade el bloque <gcp-pubsub> a ossec.conf (si no estaba)
#   3. Añade / actualiza las reglas RappiSim en local_rules.xml
#   4. Valida la configuración; si falla, restaura las copias de seguridad
#   5. Reinicia wazuh-manager y muestra el log del módulo GCP
# =============================================================================
set -euo pipefail

PROJECT_ID="${1:-}"
KEY_SRC="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OSSEC=/var/ossec
CONF=$OSSEC/etc/ossec.conf
RULES=$OSSEC/etc/rules/local_rules.xml
KEY_DST=$OSSEC/wodles/gcloud/credentials.json
TS=$(date +%Y%m%d-%H%M%S)
MARK_INI='<!-- RAPPISIM-INICIO -->'
MARK_FIN='<!-- RAPPISIM-FIN -->'

[[ $EUID -eq 0 ]] || { echo "ERROR: ejecútalo con sudo"; exit 1; }
[[ -n "$PROJECT_ID" && -n "$KEY_SRC" ]] || {
  echo "Uso: sudo bash $0 <PROJECT_ID> <ruta/wazuh-credentials.json>"; exit 1; }
[[ -f "$KEY_SRC" ]] || { echo "ERROR: no existe la llave $KEY_SRC"; exit 1; }
[[ -d "$OSSEC" ]] || {
  echo "ERROR: no existe $OSSEC. ¿Wazuh corre en Docker? Mira la sección Docker del README."; exit 1; }
python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$KEY_SRC" \
  || { echo "ERROR: la llave no es un JSON válido"; exit 1; }

echo ">> Copias de seguridad (.bak-$TS)"
cp "$CONF"  "$CONF.bak-$TS"
cp "$RULES" "$RULES.bak-$TS"

restaurar() {
  echo "!! Algo falló: restaurando configuración anterior"
  cp "$CONF.bak-$TS" "$CONF"; cp "$RULES.bak-$TS" "$RULES"
}

# --- 1. Llave ------------------------------------------------------------------
echo ">> Instalando llave en $KEY_DST"
mkdir -p "$(dirname "$KEY_DST")"
install -m 640 -o root -g wazuh "$KEY_SRC" "$KEY_DST"

# --- 2. Bloque gcp-pubsub ---------------------------------------------------------
if grep -q "<gcp-pubsub>" "$CONF"; then
  echo ">> ossec.conf ya tiene un bloque <gcp-pubsub>; lo actualizo con este proyecto"
  sed -i "s|<project_id>.*</project_id>|<project_id>${PROJECT_ID}</project_id>|" "$CONF"
else
  echo ">> Añadiendo bloque <gcp-pubsub> a ossec.conf"
  # se copia el bloque sin el comentario de cabecera
  { echo; sed -n '/^<ossec_config>/,/^<\/ossec_config>/p' "$HERE/ossec-gcp-pubsub.conf" \
      | sed "s|__PROJECT_ID__|${PROJECT_ID}|"; } >> "$CONF"
fi

# --- 3. Reglas -------------------------------------------------------------------------
echo ">> Instalando reglas RappiSim (IDs 100100-100141) en local_rules.xml"
if grep -qF "$MARK_INI" "$RULES"; then
  # quita la versión anterior para reemplazarla
  sed -i "/$MARK_INI/,/$MARK_FIN/d" "$RULES"
fi
if grep -q 'rule id="1001[0-4][0-9]"' "$RULES"; then
  echo "!! local_rules.xml ya usa IDs entre 100100 y 100149 fuera del bloque RappiSim."
  echo "   Cambia esos IDs o los de wazuh/manager/local_rules.xml y vuelve a ejecutar."
  restaurar; exit 1
fi
{ echo; echo "$MARK_INI"; sed -n '/^<group/,/^<\/group>/p' "$HERE/local_rules.xml"; echo "$MARK_FIN"; } >> "$RULES"
chown wazuh:wazuh "$RULES" 2>/dev/null || true
chmod 660 "$RULES"

# --- 4. Validación -------------------------------------------------------------------
echo ">> Validando configuración (wazuh-analysisd -t)"
if ! "$OSSEC/bin/wazuh-analysisd" -t; then restaurar; exit 1; fi

# --- 5. Reinicio --------------------------------------------------------------------
echo ">> Reiniciando wazuh-manager"
if command -v systemctl >/dev/null; then systemctl restart wazuh-manager
else "$OSSEC/bin/wazuh-control" restart; fi

echo ">> Esperando 70 s al primer pull de Pub/Sub..."
sleep 70
echo "------------------- log del módulo GCP -------------------"
grep -i -E "gcp|pubsub" "$OSSEC/logs/ossec.log" | tail -n 15 || true
echo "-----------------------------------------------------------"
cat <<'EOF'
Si ves "Received and acknowledged N messages" o no hay errores: funciona.
Errores frecuentes:
  - "403 / PermissionDenied"  -> la cuenta de servicio no tiene roles/pubsub.subscriber
  - "404 / NotFound"          -> project_id o subscription_name mal escritos
  - "credentials"             -> revisa la ruta/permisos de la llave

Siguiente: lanza los ataques (pruebas/simular_ataques.sh) y revisa el dashboard
filtrando por  rule.groups: rappisim
EOF
