# Playbook: Fuerza bruta y relleno de credenciales

## Descripción y clasificación
Intentos masivos de inicio de sesión para adivinar contraseñas o reutilizar credenciales filtradas. Clasificación: OWASP Top 10 A07 (Identification and Authentication Failures), CWE-307, MITRE ATT&CK T1110 (Brute Force).

## Indicadores de detección
- Múltiples respuestas 401 a `POST /api/login` desde una misma IP en poco tiempo.
- Reglas Wazuh del grupo `authentication_failures` (100140 por cada login fallido; 100141 por 6 o más fallos en 60 segundos).
- Un inicio de sesión exitoso inmediatamente después de muchos fallos indica compromiso de la cuenta.

## Severidad
- Media si solo hay fallos; alta si hay un acceso exitoso tras los intentos; crítica si la cuenta comprometida es administrativa.

## Contención inmediata
1. Bloquear la IP de origen.
2. Bloquear temporalmente la cuenta atacada y forzar cambio de contraseña si hubo acceso exitoso.

## Remediación
- Limitación de tasa y bloqueo progresivo por IP y por cuenta.
- Autenticación multifactor para cuentas privilegiadas.
- Respuestas active response de Wazuh para bloqueo automático.
