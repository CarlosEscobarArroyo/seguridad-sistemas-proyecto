# Playbook: Cross-Site Scripting almacenado (Stored XSS)

## Descripción y clasificación
El XSS almacenado ocurre cuando la aplicación guarda contenido del usuario y lo muestra a otros sin escapar, ejecutando JavaScript en el navegador de las víctimas. Clasificación: OWASP Top 10 A03 (Injection), CWE-79, MITRE ATT&CK T1059.007 (JavaScript). En RappiSim afecta a `POST /api/resenas`: el comentario se renderiza como HTML.

## Indicadores de detección
- Reglas Wazuh del grupo `xss` (100120 en el body, 100121 en el query string).
- Cuerpos de petición con `<script>`, `onerror=`, `onload=`, `javascript:`, `<img src=x`, `document.cookie`.
- Peticiones salientes inusuales del navegador hacia dominios externos tras cargar las reseñas.

## Severidad
- Alta si el payload quedó almacenado (respuesta 200/201): afecta a todos los usuarios que vean la sección, incluidos administradores.
- Crítica si el payload roba sesiones o tokens (`document.cookie`, `fetch` a dominio externo).

## Contención inmediata
1. Eliminar u ocultar las reseñas maliciosas de la base de datos.
2. Bloquear la IP de origen y la cuenta que publicó el contenido.
3. Invalidar las sesiones de los usuarios que cargaron la página afectada.

## Remediación
- Escapar la salida: en React no usar `dangerouslySetInnerHTML` con contenido de usuarios.
- Sanitizar la entrada en el backend (por ejemplo con `bleach`).
- Definir Content-Security-Policy que prohíba scripts en línea.
- Marcar las cookies de sesión como `HttpOnly` y `Secure`.
