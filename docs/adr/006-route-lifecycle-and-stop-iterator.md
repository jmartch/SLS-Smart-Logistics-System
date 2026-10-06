# ADR-006: Ciclo de vida operativo de rutas y navegación de paradas mediante Iterator

Fecha: 2026-10-05

Estado: Aceptado e implementado

Informe de implementación: [ROUTE-01](../modules/route-01-report.md)

## Contexto

El sistema Smart Logistics System (SLS) cuenta con la etapa de planificación y asignación atómica (`ASSIGN-01`), la cual genera rutas en estado `PLANNED`, paradas asociadas en `PENDING` y asignaciones `ACTIVE` para paquetes en estado `ASSIGNED_TO_ROUTE`.

Para completar el ciclo operativo logístico del MVP (`AGENTS.md` §§4, 8, 9, 11 y 14), se requiere:
1. **Transición a Ejecución:** Permitir la preparación de la ruta (`READY`), despacho e inicio (`IN_PROGRESS`), así como la gestión de contingencias pre-salida (`CANCELLED`) y en ruta (`INTERRUPTED`).
2. **Sincronización Atómica de Paquetes:** La ruta y sus envíos asociados deben transicionar coordinadamente (ej. paquetes a `READY_FOR_DISPATCH` al preparar, e `IN_TRANSIT` al iniciar).
3. **Patrón GoF Iterator:** Proporcionar un mecanismo encapsulado y extensible para recorrer las paradas de una ruta (ordenadas por secuencia planificada, filtradas por pendientes o por fallidas) sin exponer la colección mutable interna del agregado ni recalcular distancias.
4. **Protección del Manifiesto y Replay:** Impedir modificaciones al manifiesto una vez preparada la ruta y garantizar que cancelar una ruta no corrompa el historial o el replay de la solicitud de planificación previa.
5. **Clean Architecture y Aislamiento Multi-Tenant:** Mantener el dominio y aplicación libres de frameworks (NestJS/Prisma) y asegurar el aislamiento estricto por `tenantId` mediante PostgreSQL RLS.

## Decisión

Se adoptan las siguientes decisiones de diseño arquitectónico (D1 a D8):

### D1. Estructura de Capas y Dependencias
Se preserva la dirección estricta de Clean Architecture:
```text
RoutesController (HTTP Presentation) + RequestContext / Guardas
  -> Casos de uso puros (Application)
       -> Agregado Route + RouteStopIterator + Políticas de acceso (Domain)
       -> PackageAggregate / State (Contratos públicos de Packages)
       -> RouteRepository / RouteLifecycleUnitOfWork (Puertos de Dominio y Aplicación)
            <- Adaptadores Prisma (Infrastructure)
                 -> Una sola transacción SERIALIZABLE en PostgreSQL con RLS
```
- `RouteRepository` define el puerto de persistencia y proyecciones en el dominio.
- `RouteLifecycleUnitOfWork` gestiona la sesión transaccional en aplicación sin exponer tipos de Prisma ni clientes de base de datos.
- Ni Dominio ni Aplicación importan NestJS, Prisma, HTTP ni adaptadores concretos.

### D2. Modelo de Dominio y Patrón GoF Iterator
- **Agregado `Route`:** Raíz del agregado que custodia su identidad (`tenantId`, `id`), vehículo, mensajero, depósito, ventanas planificadas, estado del ciclo de vida (`RouteState`), colección privada de paradas y eventos pendientes.
- **Entidad inmutable `RouteStop`:** Posee `id`, `tenantId`, `routeId`, coordenadas, estado (`RouteStopState`) y `stopNumber` (entero positivo `1..N`). Se mapea en infraestructura a la columna `sequence` existente sin alterar el esquema ni romper compatibilidad con `SEQ-01`.
- **Invariantes:** Se rechazan paradas duplicadas, huecos en la secuencia o mezclas de `tenantId`.
- **Interfaz `RouteStopIterator`:**
  ```ts
  export interface RouteStopIterator {
    hasNext(): boolean;
    next(): RouteStop | null;
    current(): RouteStop | null;
    reset(): void;
  }
  ```
- **Tres Factorías en `Route`:**
  - `createIterator()`: Recorrido ascendente por `stopNumber` (`OrderedRouteStopIterator`).
  - `createPendingIterator()`: Filtra paradas en estado `PENDING` conservando su orden original.
  - `createFailedIterator()`: Filtra paradas en estado `FAILED` conservando su orden original.
- **Inmutabilidad de Cursores:** Cada iterador genera un snapshot defensivo inmutable (`Object.freeze`). `current()` retorna el último elemento entregado por `next()`. Cada factoría instancia cursores independientes.

### D3. Ciclo de Vida Operativo y Recursos
Se establecen cuatro operaciones de ciclo de vida con validaciones deterministas:

| Operación | Estado Ruta | Estado Paquetes | Estado Asignaciones | Evento de Dominio | Precondiciones Clave |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Preparar** | `PLANNED -> READY` | `ASSIGNED_TO_ROUTE -> READY_FOR_DISPATCH` | Se conservan `ACTIVE` | `RoutePrepared` | Manifiesto coherente no vacío, vehículo/mensajero activos, presencia confirmada en depósito (`depotConfirmed: true`). |
| **Iniciar** | `READY -> IN_PROGRESS` | `READY_FOR_DISPATCH -> IN_TRANSIT` | Se conservan `ACTIVE` | `RouteStarted` | Ventana horaria vigente, mensajero autenticado coincide con el asignado, recursos disponibles. Registra `startedAt`. |
| **Cancelar** | `PLANNED/READY -> CANCELLED` | Vuelven a `PENDING_ASSIGNMENT` | Transicionan a `CANCELLED` (`endedAt`, motivo) | `RouteCancelled` | Solo ejecutable antes de salida física. Requiere motivo. Libera recursos para replanificación. |
| **Interrumpir** | `IN_PROGRESS -> INTERRUPTED` | Se conservan en estado actual | Se conservan `ACTIVE` | `RouteInterrupted` | Requiere motivo. La flota y mensajero siguen físicamente comprometidos (recursos no liberados). |

- **Congelamiento de Manifiesto:** A partir de `READY`, ninguna operación puede agregar o retirar asignaciones de la ruta. Se extiende la Chain de asignación con un `RouteEditabilityValidationHandler`.

### D4. Transaccionalidad y Concurrencia
- **Aislamiento `SERIALIZABLE`:** Toda mutación de ciclo de vida se ejecuta dentro de una única transacción `SERIALIZABLE` utilizando una versión compatible y extendida de `runWithTenant`.
- **Bloqueo Determinista (Anti-Deadlock):** Los recursos se bloquean mediante `SELECT FOR UPDATE` en orden determinista:
  $$\text{Ruta} \longrightarrow \text{Paquetes ordenados por ID} \longrightarrow \text{Vehículo} \longrightarrow \text{Mensajero}$$
- **Reintentos Acotados:** Hasta 3 reintentos ante colisiones transitorias de concurrencia (`P2034`, `40001`, `40P01`).
- **Idempotencia:** Solicitudes repetidas cuando la ruta ya transicionó responden con `409 ROUTE_STATE_CONFLICT`, evitando efectos duplicados o ejecuciones parciales.

### D5. Auditoría, Outbox y Compatibilidad con Replay
- **Auditoría e Historial:** Registro atómico en `AuditLog` para cambios de ruta y `PackageStatusHistory` para transiciones de paquetes.
- **Eventos Outbox:** Se persiste el envelope canónico (`eventId`, `tenantId`, `correlationId`, `eventType`, `occurredAt`, `producer: routes`, `version: 1`, `payload`) en `OutboxEvent` dentro del mismo commit.
- **Snapshot de Planificación:** Para evitar que la cancelación de una ruta altere el replay de `RoutePlanningRequest`, se añade la columna `resultSnapshot Json?` en `RoutePlanningRequest`. El replay devuelve el snapshot original sin recalcular sobre asignaciones mutadas.

### D6. Contrato HTTP v1 y Seguridad
Se exponen seis endpoints bajo `/api/v1/routes`:
1. `GET /api/v1/routes`: Listado paginado con filtros (`from`, `to`, `zoneId`, `state`, `courierId`).
2. `GET /api/v1/routes/:id`: Detalle completo estructurado consumiendo el Iterator ordenado de paradas.
3. `POST /api/v1/routes/:id/prepare`: Preparación con `{ depotConfirmed: true }`.
4. `POST /api/v1/routes/:id/start`: Inicio de ruta (restringido al mensajero asignado).
5. `POST /api/v1/routes/:id/cancel`: Cancelación con `{ reasonCode, reason? }`.
6. `POST /api/v1/routes/:id/interrupt`: Interrupción con `{ reasonCode, reason? }`.

- **Identidad Confiable:** Uso obligatorio de `@CurrentContext()`. Respuestas semánticas (200, 400, 401, 403, 404, 409, 503). Prohibición de recibir `tenantId` en cuerpos de petición para autorizar.

### D7. Persistencia y Verificación
- Migración aditiva en PostgreSQL (`backend/prisma/schema/routing.prisma`).
- Verificación en runner de integración dedicado (`test/integration/route-01.cjs`) con base de datos temporal PostgreSQL/PostGIS y rol runtime `sls_app` bajo RLS estricto.

### D8. Alternativas Evaluadas
- **Transiciones por separado (Ruta primero, Paquetes después):** Rechazada por admitir commits parciales e inconsistencia ante caídas del servidor.
- **Lógica de negocio en triggers o funciones Prisma:** Rechazada para preservar la independencia de capas de Clean Architecture.
- **Uso directo de arrays mutables:** Rechazada por vulnerar el encapsulamiento del agregado y omitir el patrón GoF Iterator requerido académicamente.

## Consecuencias

### Positivas
- Consistencia transaccional total entre la ruta, sus paradas, sus paquetes y sus asignaciones.
- Demostración rigurosa del patrón GoF Iterator con tres variantes independientes y contratos de inmutabilidad.
- Resiliencia y reproducibilidad operativa ante fallos y contingencias (cancelaciones e interrupciones auditadas).
- Compatibilidad retroactiva garantizada con `ASSIGN-01` y aislamiento multi-tenant protegido por RLS.

### Compensaciones y Limitaciones
- Sobrecarga de reintentos y bloqueos en transacciones `SERIALIZABLE`, justificada por la criticidad de la asignación de flota.
- No incluye geolocalización GPS en tiempo real ni registro de entregas/evidencias (responsabilidad de `DELIVERY-01`).
- La confirmación en depósito (`depotConfirmed: true`) es una declaración de negocio auditada y no una geocerca física automatizada.
