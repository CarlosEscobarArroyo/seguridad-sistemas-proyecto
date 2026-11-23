# Playbook: Inyección SQL (SQLi)

## Descripción y clasificación
La inyección SQL ocurre cuando la aplicación concatena datos del usuario en una consulta SQL sin parametrizar. Clasificación: OWASP Top 10 A03 (Injection), CWE-89, MITRE ATT&CK T1190 (Exploit Public-Facing Application). En RappiSim afecta a `POST /api/login` (bypass de autenticación) y `GET /api/productos?q=` (extracción con UNION SELECT).

## Indicadores de detección
- Reglas Wazuh del grupo `sql_injection` (100110 en el body, 100111 en el query string, 100112 por errores 500).
- Parámetros con comillas simples, `OR '1'='1'`, `UNION SELECT`, `--`, `;`, `information_schema`, `pg_sleep`.
- Respuesta HTTP 200 a una petición con payload: indica posible explotación exitosa, no solo un intento.
- Inicio de sesión exitoso como administrador desde una IP que acaba de enviar payloads.

## Severidad
- Crítica si hubo respuesta 200 con UNION SELECT sobre tablas de usuarios (exfiltración de credenciales) o bypass de login como administrador.
- Alta si hay intentos repetidos sin evidencia de éxito (respuestas 4xx/5xx).

## Contención inmediata
1. Bloquear la IP de origen en el firewall o en Cloud Armor.
2. Invalidar las sesiones activas y rotar las contraseñas de las cuentas expuestas, empezando por las administrativas.
3. Preservar los logs de Cloud Logging y las alertas de Wazuh del periodo del ataque como evidencia.

## Remediación
- Usar consultas parametrizadas o un ORM; nunca concatenar entradas del usuario en SQL.
- Almacenar contraseñas con hash (bcrypt o Argon2), nunca en texto plano.
- Aplicar mínimo privilegio al usuario de base de datos de la aplicación.
- Validar entradas y agregar reglas de WAF contra patrones de SQLi.
