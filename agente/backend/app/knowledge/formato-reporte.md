# Guía: Formato del reporte de incidente del SOC

## Estructura obligatoria
Todo reporte de incidente debe incluir, en este orden: 1) Resumen ejecutivo (2-3 frases, sin jerga), 2) Clasificación (tipo de ataque, severidad, OWASP, CWE, MITRE ATT&CK), 3) Cronología de eventos con hora UTC, 4) Evidencia (alertas de Wazuh: regla, nivel, IP de origen, endpoint y payload), 5) Impacto (datos o sistemas afectados, y si la explotación fue exitosa o solo un intento), 6) Acciones de contención, 7) Recomendaciones de remediación, 8) Fuentes consultadas de la base de conocimiento.

## Criterios de severidad
- Crítica: explotación exitosa con exposición de credenciales, datos financieros o acceso administrativo.
- Alta: explotación exitosa con impacto limitado, o fuga de datos personales.
- Media: intentos repetidos sin evidencia de éxito.
- Baja: evento aislado sin impacto.

## Buenas prácticas de redacción
- Distinguir siempre hechos observados en las alertas de hipótesis.
- No incluir contraseñas ni números de tarjeta completos en el reporte; enmascararlos.
- Agrupar en un mismo incidente las alertas que comparten IP de origen y ventana de tiempo.
