# ROUTE-CLOSE-01 — Cierre operativo de rutas, reconciliación del manifiesto e integridad multi-tenant

Estado: **DONE para el alcance definido**.

- **Plan canónico:** [ROUTE-CLOSE-01](../plans/route-close-01.md)
- **Decisión Arquitectónica (ADR):** [ADR-008: Cierre operativo de rutas y reconciliación del manifiesto](../adr/008-route-closure-and-manifest-reconciliation.md) (Estado: **Aceptado**)

---

## 1. Alcance verificado

El módulo `ROUTE-CLOSE-01` implementa de extremo a extremo el ciclo de terminación operativa de rutas de distribución urbana y la reconciliación exhaustiva de su manifiesto de carga en el Smart Logistics System (SLS), bajo Clean Architecture estricta y aislamiento multi-tenant en PostgreSQL 17 + PostGIS.

### 1.1 Dominio Puro (Núcleo y Reglas de Negocio)
- **Entidad `Route`:** Incorporación del método `complete(summary, metadata)`, permitiendo el cierre únicamente desde estados operacionales activos (`IN_PROGRESS` o `INTERRUPTED`), sellando `completedAt` con reloj de servidor y generando un evento de dominio `RouteCompletedEvent` inmutable con `producer: 'routes'` y `version: 1`.
- **Value Object `RouteClosureSummary`:**
  - Estructura inmutable y deep-frozen (`Object.freeze`) con `schemaVersion: 1`.
  - Validación de la invariante fundamental de conservación de manifiesto:
    $$\text{totalAssigned} = \text{deliveredCount} + \text{failedCount} + \text{rescheduledCount} + \text{returnedCount} + \text{pendingCount}$$
  - Cálculo determinista del ratio de efectividad de entrega (`deliveryEffectivenessRatio = deliveredCount / totalAssigned`), previniendo división por cero o valores indeterminados (`NaN`).
  - Serialización canónica a snapshot JSON (`toSnapshot()`) para archivo histórico inmutable.
- **Políticas de Dominio:**
  - `RouteClosurePolicy`: Evalúa la elegibilidad del cierre:
    - Modo `REGULAR`: Exige que todas las paradas hayan sido visitadas (`COMPLETED` o `FAILED`), balance cerrado y cero paquetes con custodia pendiente.
    - Modo `FORCED`: Admite paradas no visitadas (`PENDING`), exigiendo motivo tipificado (`reasonCode`), observaciones obligatorias (`notes`, 1–1000 caracteres tras trim) y comprobación de custodia física recibida en depósito.
  - `RouteManifestReconciliationPolicy`: Partición matemática disjunta y exhaustiva de los miembros del manifiesto de despacho (`DELIVERED`, `FAILED`, `RESCHEDULED`, `RETURNED`, `PENDING`), garantizando cardinalidad exacta sin duplicaciones ni omisiones.
- **Ciclo de Vida de Paquetes (`PackageAggregate` & State Pattern):**
  - Incorporación del método `recoverToPendingAssignment(...)` que transiciona paquetes no atendidos desde `IN_TRANSIT` u `OUT_FOR_DELIVERY` de vuelta a `PENDING_ASSIGNMENT` únicamente bajo contexto auditado de cierre forzado con custodia confirmada en depósito, registrando entrada en `PackageStatusHistory`.

### 1.2 Capa de Aplicación (Casos de Uso y Puertos)
- `CloseRouteUseCase`:
  - Validación de autorización mediante `RouteAccessPort` (restringido a coordinadores y administradores de tenant).
  - Idempotencia determinista basada en hash SHA-256 canónico del comando (`computeCloseRouteHash`), retornando el resultado persistido en llamadas repetidas (`replayed: true`) y rechazando reutilizaciones incompatibles de `Idempotency-Key` con error de conflicto (`409`).
  - Verificación de custodia física restante: si existen asignaciones activas sin recibo de depósito previo ni lote `depotReceipt` en la invocación, revierte con `RouteCustodyUnresolvedError` (`409`).
  - Reconciliación del manifiesto y recuperación de paquetes desatendidos a `PENDING_ASSIGNMENT`.
  - Finalización atómica de asignaciones y persistencia mediante `RouteCloseUnitOfWork`.
- `GetRouteSummaryUseCase`:
  - Consulta y proyección autorizada del resumen de cierre mediante `RouteSummaryReaderPort`.
  - Proyección diferenciada por rol: los coordinadores/administradores reciben el resumen completo; los conductores/couriers asignados a la ruta reciben una vista proyectada que redacta notas internas y motivos de contingencia.
  - Rechazo de consultas sobre rutas aún no completadas con `RouteNotCompletedError` (`409`).

### 1.3 Capa de Infraestructura y Persistencia
- **Unidad de Trabajo Transaccional (`PrismaRouteCloseUnitOfWork`):**
  - Aislamiento transaccional `SERIALIZABLE`.
  - Bloqueos pesimistas `SELECT ... FOR UPDATE` ordenados (`Route` y `Package`), evitando carreras entre cierres concurrentes, entregas tardías y reasignaciones.
  - Mecanismo de reintento automático con backoff exponencial y jitter ante conflictos de serialización o deadlocks de PostgreSQL (`P2034`, SQLSTATE `40001`, `40P01`) hasta 3 intentos.
  - Garantía de liberación de flota: al completarse la ruta, todas las asignaciones activas remanentes pasan atómicamente a `ENDED` (`reasonCode: ROUTE_COMPLETED`).
- **Lector de Resúmenes (`PrismaRouteSummaryReader`):**
  - Ejecución encapsulada con `runWithTenant` configurando `SET LOCAL app.tenant_id`, asegurando cumplimiento estricto con las políticas de Row-Level Security (`FORCE ROW LEVEL SECURITY`) bajo el rol runtime `sls_app`.
- **Esquema Prisma 7 y Migraciones PostgreSQL 17 / PostGIS:**
  - Migración `20261007010000_route_closure_and_reconciliation`.
  - Nueva tabla `RouteClosure` con constraints `CHECK` de integridad para la ecuación de balance y validación de campos obligatorios en modo forzado.
  - Actualización de `Assignment` con campos de resultado de manifiesto (`routeOutcome`, `routeOutcomeAt`, `receivedAtDepotId`, `receivedAtDepotAt`, `receivedByUserId`).
  - Activación de Row-Level Security (`FORCE ROW LEVEL SECURITY`) y concesión de privilegios CRUD acotados al rol runtime `sls_app`.

### 1.4 Capa de Presentación (Controlador HTTP REST)
- `RoutesController`:
  - `POST /api/v1/routes/:id/close`: Cierre operativo con validación de cabeceras seguras (`x-tenant-id`, `x-user-id`, `Idempotency-Key` UUID).
  - `GET /api/v1/routes/:id/summary`: Consulta de resumen con proyección según rol del actor.
- DTOs tipados `CloseRouteDto` y `RouteSummaryDto` con validación exhaustiva mediante `class-validator`.
- Mapeo consistente de excepciones de dominio a códigos de respuesta HTTP (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`).

---

## 2. Matriz de Criterios de Aceptación (CA-01 a CA-12)

| Criterio | Descripción | Estado | Casos de Prueba Verificadores |
|---|---|---|---|
| **CA-01** | Identidad autenticada y tenant confiable; autorización por roles (`COORDINATOR`, `ADMIN` vs `COURIER`) | **PASSED** | `route-close-http.e2e-spec.ts` (401 sin tenant, 403 courier, 404 cross-tenant) |
| **CA-02** | `Route.complete()` solo desde `IN_PROGRESS` o `INTERRUPTED`; rechazo de otros estados e inmutabilidad | **PASSED** | `route-closure.domain.spec.ts` & `route-close-lifecycle.e2e-spec.ts` |
| **CA-03** | Distinción REGULAR (paradas completas, cero pendientes) vs FORCED (admite pendientes con motivo y custodia resuelta) | **PASSED** | `route-closure.domain.spec.ts` & `route-close-lifecycle.e2e-spec.ts` |
| **CA-04** | Invariante de balance de masa: $\text{totalAssigned} = \text{delivered} + \text{failed} + \text{rescheduled} + \text{returned} + \text{pending}$ | **PASSED** | `route-closure.domain.spec.ts` & `route-close-lifecycle.e2e-spec.ts` (caso 7 paquetes) |
| **CA-05** | `completedAt` fijado en servidor; métricas deterministas; proyecciones por rol | **PASSED** | `get-route-summary.use-case.spec.ts` & `route-close-lifecycle.e2e-spec.ts` |
| **CA-06** | Liberación de recursos: cero asignaciones `ACTIVE` al cerrar la ruta; custodia obligatoria | **PASSED** | `route-close-lifecycle.e2e-spec.ts` (aserciones `activeAssignments.length === 0`) |
| **CA-07** | Transacción `SERIALIZABLE`, contexto RLS local, locks `FOR UPDATE` y reintentos ante error 40001/P2034 | **PASSED** | `prisma-route-close-unit-of-work.spec.ts` (reintento verificado) |
| **CA-08** | Atomicidad: ruta, resumen, recuperaciones, Outbox (`RouteCompleted`, producer: `routes`) y AuditLog | **PASSED** | `route-close-lifecycle.e2e-spec.ts` (Outbox y AuditLog verificados en DB) |
| **CA-09** | Idempotencia SHA-256 (`Idempotency-Key`): replay determinista y 409 ante payload modificado | **PASSED** | `route-close-http.e2e-spec.ts` & `route-close-lifecycle.e2e-spec.ts` |
| **CA-10** | Endpoints REST v1 con DTOs validados y errores HTTP tipados (400, 401, 403, 404, 409) | **PASSED** | `route-close-http.e2e-spec.ts` (10 pruebas supertest) |
| **CA-11** | Clean Architecture estricta: dominio y aplicación sin dependencias de NestJS ni Prisma | **PASSED** | `routes-architecture.spec.ts` (cero violaciones de imports o límites) |
| **CA-12** | Validación E2E en PostgreSQL 17 + PostGIS con rol `sls_app` bajo RLS forzado | **PASSED** | `test/integration/route-close-01.cjs` (20/20 tests pasando en base descartable) |

---

## 3. Resumen de Ejecución y Pruebas

### 3.1 Pruebas Unitarias y de Arquitectura
- **Comando:** `npm run test -- src/modules/routes`
- **Resultado:** **17 suites pasadas, 17 totales. 187 tests pasados, 187 totales (100% GREEN).**
- **Duración:** ~2.1 s.
- **Suites relevantes del módulo:**
  - `route-closure.domain.spec.ts`: 27 tests (Value Object, políticas, invariantes de balance y agregado Route).
  - `close-route.use-case.spec.ts`: 10 tests (UoW, idempotencia SHA-256, autorizaciones y resolución de custodia).
  - `get-route-summary.use-case.spec.ts`: 7 tests (proyecciones por rol y rutas no completadas).
  - `prisma-route-close-unit-of-work.spec.ts`: 11 tests (transacciones SERIALIZABLE, reintentos jitter y mapper).
  - `routes.controller.spec.ts`: 52 tests (controlador, DTOs y mapeos de códigos HTTP).
  - `routes-architecture.spec.ts`: 3 tests (límites estrictos de Clean Architecture).

### 3.2 Pruebas E2E / Integración en Base Descartable
- **Comando:** `make integration-test TEST=route-close-01`
- **Infraestructura:** Contenedor `sls-integration-postgres` (PostgreSQL 17.0 + PostGIS 3.6) y contenedor `backend`.
- **Base de datos:** `sls_routeclose01_*` creada al vuelo, migraciones aplicadas (`migrate deploy`) y destruida al finalizar.
- **Usuario runtime:** `sls_app` sin privilegios administrativos, ejecutando bajo `FORCE ROW LEVEL SECURITY`.
- **Suites ejecutadas:**
  1. `test/route-close-lifecycle.e2e-spec.ts`: 10/10 tests pasados.
  2. `test/route-close-http.e2e-spec.ts`: 10/10 tests pasados.
- **Resultado:** **2 suites pasadas, 20/20 tests pasados (100% GREEN).**

### 3.3 Calidad de Código y Compilación
- **Compilación:** `npm run build` (`nest build`) finalizado con **exit code 0 (cero errores)**.
- **Tipado:** TypeScript estricto, sin tipos `any` injustificados ni `// @ts-ignore`.

---

## 4. Archivos Modificados e Implementados

### 4.1 Dominio
- `backend/src/modules/routes/domain/route-closure.types.ts` (modos, estados de manifiesto, disposiciones y contratos de miembros)
- `backend/src/modules/routes/domain/route-closure-summary.ts` (Value Object inmutable, invariante de balance y snapshot)
- `backend/src/modules/routes/domain/route-closure.policy.ts` (política de elegibilidad para REGULAR y FORCED)
- `backend/src/modules/routes/domain/route-manifest-reconciliation.policy.ts` (reconciliación matemática disjunta del manifiesto)
- `backend/src/modules/routes/domain/route.ts` (método `complete()` e integración del evento de cierre)
- `backend/src/modules/routes/domain/events/route-lifecycle.event.ts` (`RouteCompletedEvent`)
- `backend/src/modules/routes/domain/route-errors.ts` (excepciones de dominio tipadas: `RouteNotCompletedError`, `RouteCustodyUnresolvedError`, `IdempotencyKeyReusedError`, etc.)
- `backend/src/modules/packages/domain/package.aggregate.ts` (método `recoverToPendingAssignment()`)
- `backend/src/modules/packages/domain/package-state.machine.ts` (soporte de transición de recuperación controlada)

### 4.2 Aplicación
- `backend/src/modules/routes/application/ports/route-close-contracts.ts` (comandos, DTOs internos, resultados y función hash SHA-256)
- `backend/src/modules/routes/application/ports/route-close-unit-of-work.port.ts` (contratos `RouteCloseSession` y `RouteCloseUnitOfWork`)
- `backend/src/modules/routes/application/ports/route-summary-reader.port.ts` (puerto de lectura de resumen)
- `backend/src/modules/routes/application/use-cases/close-route.use-case.ts` (caso de uso de cierre operativo)
- `backend/src/modules/routes/application/use-cases/get-route-summary.use-case.ts` (caso de uso de consulta de resumen)

### 4.3 Infraestructura y Persistencia
- `backend/prisma/schema/routing.prisma` (modelo `RouteClosure`, campos de auditoría de manifiesto en `Assignment`)
- `backend/prisma/schema/messaging.prisma` (campo `producer` persistido en `OutboxEvent`)
- `backend/prisma/migrations/20261007010000_route_closure_and_reconciliation/migration.sql` (migración SQL con CHECKs, RLS y grants)
- `backend/src/modules/routes/infrastructure/persistence/prisma-route-close-unit-of-work.ts` (UoW `SERIALIZABLE`, locks pesimistas, reintentos jitter)
- `backend/src/modules/routes/infrastructure/persistence/prisma-route-summary-reader.ts` (lector tenant-aware con `runWithTenant`)

### 4.4 Presentación
- `backend/src/modules/routes/presentation/dto/close-route.dto.ts` (validación de payload de cierre y lote de depósito)
- `backend/src/modules/routes/presentation/dto/route-summary.dto.ts` (validación de parámetros de resumen)
- `backend/src/modules/routes/presentation/routes.controller.ts` (endpoints `POST :id/close` y `GET :id/summary`)
- `backend/src/modules/routes/routes.module.ts` (inyección de dependencias y composición)

### 4.5 Pruebas y Herramientas de Integración
- `backend/src/modules/routes/test/fixtures/route-closure.fixtures.ts` (fixtures canónicos de dominio)
- `backend/src/modules/routes/test/route-closure.domain.spec.ts` (pruebas de dominio)
- `backend/src/modules/routes/test/close-route.use-case.spec.ts` (pruebas de caso de uso de cierre)
- `backend/src/modules/routes/test/get-route-summary.use-case.spec.ts` (pruebas de caso de uso de resumen)
- `backend/src/modules/routes/test/prisma-route-close-unit-of-work.spec.ts` (pruebas de persistencia transaccional y lector)
- `backend/test/integration/route-close-01.cjs` (runner de integración en base descartable)
- `backend/test/fixtures/route-close-lifecycle.fixtures.ts` (entorno e2e y fixtures canónicos de 7 paquetes)
- `backend/test/route-close-lifecycle.e2e-spec.ts` (pruebas e2e de ciclo de vida completo en DB real)
- `backend/test/route-close-http.e2e-spec.ts` (pruebas e2e de API HTTP supertest)
- `backend/package.json` & `Makefile` (registro del target `test:route-close-01` e `integration-test TEST=route-close-01`)
- `backend/test/integration/README.md` (documentación del runner de integración)
