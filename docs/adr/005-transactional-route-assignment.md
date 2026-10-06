# ADR-005: Planificación y asignación atómica de rutas por solicitud

## Estado
Propuesto

## Contexto
SLS requiere planificar rutas integrando clustering geográfico (`CLUSTER-01`), ordenamiento de paradas (`SEQ-01`), validaciones mediante Chain of Responsibility (`PAT-CHAIN-01`) y transiciones de estado de paquetes (`PAT-STATE-01`).
Una falla a mitad de la planificación no debe dejar estados inconsistentes (ej. paquetes asignados sin ruta, o rutas creadas sin paradas ni capacidad reservada). Además, la concurrencia entre coordinadores podría provocar sobreasignación de flota si no se coordinan los bloqueos.

## Decisión
1. **Unidad Transaccional Única (UoW):** Toda la solicitud se ejecuta en una única transacción con nivel de aislamiento `SERIALIZABLE`.
2. **Protocolo de Bloqueos Determinista:** Para evitar deadlocks, los recursos se bloquean con `SELECT FOR UPDATE` en orden estricto: Solicitud -> Paquetes (por ID ordenado) -> Vehículos (por ID ordenado) -> Mensajeros (por ID ordenado).
3. **Manejo de Pendientes como Éxito de Negocio:** Paquetes que no pueden asignarse por falta de capacidad o recursos transicionan a `PENDING_ASSIGNMENT` de forma durable. La solicitud finaliza `COMPLETED`, nunca en DLQ ni con error técnico.
4. **Desacoplamiento Limpio:** La capa de aplicación define el puerto `PlanningAssignmentUnitOfWork`; la infraestructura (Prisma) implementa la sesión sin invocar lógica de dominio.
5. **Idempotencia por `requestId`:** Si se reintenta un `requestId` ya completado con los mismos parámetros, se devuelve el resultado previo sin volver a ejecutar transiciones ni duplicar eventos.

## Consecuencias
- **Positivas:** Consistencia transaccional absoluta, trazabilidad completa, sin reservas fantasma y 100% auditable.
- **Compensaciones:** Transacción `SERIALIZABLE` requiere reintentos acotados ante conflictos de concurrencia (`P2034` / `40001`). El tamaño del lote se limita a 100 paquetes para no mantener bloqueos prolongados.

### Replay y compatibilidad con ciclo de vida (ADR-006)
Con la implementación de `ROUTE-01` ([ADR-006](006-route-lifecycle-and-stop-iterator.md)), las rutas pueden prepararse, iniciarse o cancelarse en ciclos de vida posteriores. Para evitar que la mutación o cancelación de asignaciones altere el replay idempotente de `RoutePlanningRequest`, el resultado original se persiste en `RoutePlanningRequest.resultSnapshot` y se devuelve de forma inmutable en reintentos.