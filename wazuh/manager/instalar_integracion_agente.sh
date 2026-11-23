#!/usr/bin/env bash
# =============================================================================
# PASO 4 - Enviar las alertas de Wazuh al agente SOC (Cloud Run)
# Se ejecuta DENTRO de la VM de Wazuh, con sudo.
#
# Uso (desde la carpeta wazuh/ del repo):
#   sudo bash manager/instalar_integracion_agente.sh <URL_DEL_AGENTE>
#
# Requisito en GCP: la cuenta de servicio de la VM debe tener roles/run.invoker
# sobre el servicio del agente.
# =============================================================================
set -euo pipefail

AGENTE_URL="${1:-}"
AGENTE_URL="${AGENTE_URL%/}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OSSEC=/var/ossec
CONF=$OSSEC/etc/ossec.conf
SCRIPT=$OSSEC/integrations/custom-agente-soc
TS=$(date +%Y%m%d-%H%M%S)

[[ $EUID -eq 0 ]] || { echo "ERROR: ejecútalo con sudo"; exit 1; }
[[ "$AGENTE_URL" == https://* ]] || {
  echo "Uso: sudo bash $0 https://<servicio-del-agente>.run.app"; exit 1; }

echo ">> Instalando $SCRIPT"
install -m 750 -o root -g wazuh "$HERE/custom-agente-soc" "$SCRIPT"

echo ">> Copia de seguridad de ossec.conf (.bak-$TS)"
cp "$CONF" "$CONF.bak-$TS"

if grep -q "<name>custom-agente-soc</name>" "$CONF"; then
  echo ">> ossec.conf ya tiene la integración; actualizo la URL"
  sed -i "/<name>custom-agente-soc<\/name>/,/<\/integration>/ s|<hook_url>.*</hook_url>|<hook_url>${AGENTE_URL}/alertas</hook_url>|" "$CONF"
else
  echo ">> Añadiendo bloque <integration> a ossec.conf"
  { echo; sed -n '/^<ossec_config>/,/^<\/ossec_config>/p' "$HERE/ossec-integracion-agente.conf" \
      | sed "s|__AGENTE_URL__|${AGENTE_URL}|"; } >> "$CONF"
fi

echo ">> Validando configuración"
if ! "$OSSEC/bin/wazuh-analysisd" -t; then
  echo "!! Configuración inválida: restaurando"; cp "$CONF.bak-$TS" "$CONF"; exit 1
fi

echo ">> Reiniciando wazuh-manager"
systemctl restart wazuh-manager
echo "Listo. Las llamadas al agente quedan registradas en $OSSEC/logs/integrations.log"
