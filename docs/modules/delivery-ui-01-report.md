# UI-DELIVERY-01 — Ejecución de entregas y cierre operativo desde frontend

Estado: **IN_PROGRESS para el alcance definido**.

Plan de trabajo: [UI-DELIVERY-01](../plans/ui-delivery-01.md).

## Alcance verificado

Auditoría estática inicial del commit `de6ce27`, realizada el 2026-11-08. Se verificó la existencia de los contratos backend y la simulación de StopPage; no se acredita todavía el flujo frontend conectado.

## Implementación por puntos

### Punto 0 — Auditoría y plan

- Objetivo: convertir el pedido adjunto en seis pasos contrastados con el repositorio.
- Decisión: conservar arquitectura/políticas backend y ampliar únicamente la lectura necesaria del manifiesto.
- Archivos: [plan](../plans/ui-delivery-01.md), controladores/DTOs de Deliveries y Routes, clientes/pantallas frontend y ADR-006/007/008.
- Resultado: plan creado y rama `codex/ui-delivery-01` desde `develop`; árbol inicialmente limpio.
- Evidencia: lectura de código e historial; `docker compose ps --status running --services` confirma backend, frontend, integration-postgres, postgres, rabbitmq y worker activos.
- Pendiente: implementar pasos 1–5 y verificar paso 6; no se han ejecutado suites actuales.

## Decisiones técnicas

- `routeId` por query, archivos mediante FormData y claves UUID estables por operación/reintento.
- Recepción de carga mediante IDs reales de asignación y confirmación humana explícita.
- `getRouteSummary` ya existe; debe reutilizarse.
- Vitest no sustituye la verificación de navegador/API/persistencia.

## Verificación reproducible

Los comandos de cada paso están en el plan. Los resultados se añadirán después de ejecutarlos; no se trasladan conteos históricos.

## Estado en el entorno compartido

Solo se inspeccionó disponibilidad de servicios. No se modificaron datos, migraciones, colas ni configuración compartida.

## Trabajo fuera de alcance

- Rediseño visual global, GPS, offline, canvas de firma, pantallas completas de reprogramación/devolución y notificaciones.
- Reset de datos compartidos, publicación y commits.

## Cierre

Planificación documentada; implementación y verificación en curso. No se declara el módulo DONE.
