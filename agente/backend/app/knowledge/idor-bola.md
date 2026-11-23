# Playbook: IDOR / BOLA (control de acceso roto a nivel de objeto)

## Descripción y clasificación
IDOR/BOLA ocurre cuando un endpoint entrega un objeto por su identificador sin verificar que pertenece al usuario autenticado. Clasificación: OWASP Top 10 A01 (Broken Access Control), OWASP API Security API1 (BOLA), CWE-639, MITRE ATT&CK T1213 (Data from Information Repositories). En RappiSim afecta a `GET /api/pedidos/{id}`, que expone direcciones y últimos 4 dígitos de tarjeta de otros clientes.

## Indicadores de detección
- Una misma IP o usuario consulta identificadores secuenciales (`/api/pedidos/1`, `/2`, `/3`...) en poco tiempo.
- Muchas respuestas 200 a identificadores que no pertenecen al usuario autenticado.
- Regla Wazuh 100131: una misma IP consulta 4 o más pedidos distintos en 60 segundos.

## Severidad
- Alta o crítica: cada respuesta 200 es una fuga de datos personales y financieros. Considerar obligaciones de notificación según la ley de protección de datos personales aplicable.

## Contención inmediata
1. Bloquear la IP de origen y suspender la cuenta usada para la enumeración.
2. Determinar el rango de identificadores consultados para dimensionar los clientes afectados.
3. Aplicar limitación de tasa temporal al endpoint.

## Remediación
- Verificar en el backend que el pedido pertenece al usuario autenticado antes de responder.
- Usar identificadores no predecibles (UUID) como defensa adicional, no como control principal.
- Agregar pruebas automatizadas de autorización por objeto.
