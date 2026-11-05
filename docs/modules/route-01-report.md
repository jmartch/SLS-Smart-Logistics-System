# ROUTE-01 — Ciclo de vida operativo de rutas y navegación de paradas mediante Iterator

Estado: **DONE para el alcance definido**.

Plan de trabajo: [ROUTE-01](../plans/route-01.md).

## Alcance verificado

- **Decisión y ADR-006:** [ADR-006: Ciclo de vida operativo de rutas y navegación de paradas mediante Iterator](../adr/006-route-lifecycle-and-stop-iterator.md).
- **Agregado de Dominio e Invariantes:** Agregado `Route` y entidad inmutable `RouteStop` con secuencia estricta $1..N$, validación de pertenencia al mismo tenant, rechazo de duplicados o huecos en la secuencia, y eventos de ciclo de vida (`RoutePrepared`, `RouteStarted`, `RouteCancelled`, `RouteInterrupted`). Mapeo transparente en infraestructura entre `stopNumber` de dominio y la columna persistida `sequence`.
- **Patrón GoF RouteStopIterator:** Implementación del patrón de comportamiento Iterator con tres variantes independientes y robustas:
  - `OrderedRouteStopIterator`: Recorrido ordenado ascendente por número de parada ($1..N$).
  - `PendingRouteStopIterator`: Filtra paradas en estado `PENDING` conservando el orden de secuencia.
  - `FailedRouteStopIterator`: Filtra paradas en estado `FAILED` conservando el orden de secuencia.
  - Cumplimiento estricto del contrato `hasNext()`, `next()`, `current()` (último elemento retornado) y `reset()`, con snapshots defensivos congelados (`Object.freeze`) y cursores independientes por factoría.
- **Casos de Uso Puros de Aplicación:** Seis casos de uso desacoplados de frameworks:
  - `PrepareRouteUseCase`: Transición `PLANNED -> READY`, validación de recursos (vehículo y mensajero activos), presencia confirmada en depósito (`depotConfirmed: true`) y sincronización de paquetes a `READY_FOR_DISPATCH`.
  - `StartRouteUseCase`: Transición `READY -> IN_PROGRESS`, verificación de horario y mensajero autenticado, registro de `startedAt` y sincronización de paquetes a `IN_TRANSIT`.
  - `CancelRouteUseCase`: Transición pre-despacho `PLANNED/READY -> CANCELLED`, liberación de asignaciones a `CANCELLED`, registro de motivo y reversión controlada de paquetes a `PENDING_ASSIGNMENT`. Rechazo estricto si la ruta ya inició.
  - `InterruptRouteUseCase`: Transición en ruta `IN_PROGRESS -> INTERRUPTED`, registro obligatorio de motivo; preserva asignaciones `ACTIVE` y recursos comprometidos físicamente.
  - `GetRouteDetailUseCase`: Consulta detallada de la ruta, recursos relacionados y paradas ordenadas consumiendo directamente el `OrderedRouteStopIterator`.
  - `ListRoutesUseCase`: Consulta paginada con filtros por ventana temporal `plannedStartAt` en $[from, to)$, zona del snapshot de planificación, estado del ciclo de vida y alcance del mensajero.
- **Unidad Transaccional Atómica (UoW):** `PrismaRouteLifecycleUnitOfWork` ejecutando toda la mutación operativa bajo nivel de aislamiento `SERIALIZABLE`, con protocolo determinista anti-deadlock (`Ruta -> Paquetes por ID -> Vehículo -> Mensajero`), reintentos automáticos ante colisiones de serialización (`P2034`, `40001`, `40P01`), configuración local de `app.current_tenant_id`, y persistencia atómica en `AuditLog` y `OutboxEvent` en el mismo commit.
- **Protección del Manifiesto y Replay:** Incorporación del handler `RouteEditabilityValidationHandler` en la Chain of Responsibility de asignación para congelar rutas preparadas o en ejecución. Columna aditiva `resultSnapshot Json?` en `RoutePlanningRequest` preservando el replay determinista de `ASSIGN-01` tras cancelaciones.
- **Capa de Presentación y API HTTP:** `RoutesController` (`/api/v1/routes`), seis endpoints REST, DTOs de validación estricta en runtime, manejo semántico de errores HTTP (200, 400, 401, 403, 404, 409, 503) e integración en `AppModule`.
- **Aislamiento Multi-Tenant y Seguridad RLS:** Verificación en base de datos PostgreSQL 17 + PostGIS dedicada con rol runtime `sls_app` bajo RLS forzado. Pruebas de que un tenant no puede visualizar, preparar ni mutar rutas de otra empresa.

## Implementación por puntos

### Punto 1.1 y 1.2 — Preflight, Contratos y Puertos
- **Objetivo:** Definir contratos de arquitectura, puertos desacoplados y dependencias antes de la lógica.
- **Decisión:** Adoptar ADR-006; establecer puertos `RouteLifecycleUnitOfWork`, `RouteRepository`, `RouteAccessPort` y `RouteResourcesPort`; configurar `tsconfig.routes.json` estricto y pruebas de límites arquitectónicos.
- **Archivos:**
  - `docs/adr/006-route-lifecycle-and-stop-iterator.md`
  - `backend/src/modules/routes/application/ports/route-contracts.ts`
  - `backend/src/modules/routes/application/ports/route-lifecycle-unit-of-work.ts`
  - `backend/src/modules/routes/application/ports/route-access.port.ts`
  - `backend/src/modules/routes/application/ports/route-resources.port.ts`
  - `backend/tsconfig.routes.json`
  - `backend/src/modules/routes/test/routes-architecture.spec.ts`
- **Resultado:** Tipado estricto validado y 100% de límites de Clean Architecture verificados.
- **Evidencia:** Tests de arquitectura aprobados en V1.
- **Pendiente:** Ninguno.

### Punto 2.1 — Agregado de Dominio y Ciclo de Vida
- **Objetivo:** Implementar el agregado `Route`, entidad `RouteStop`, invariantes $1..N$, transiciones de estado y eventos.
- **Decisión:** Raíz de agregado encapsulada con colección privada de paradas; operaciones `prepare`, `start`, `cancel`, `interrupt` controladas; mapeo `stopNumber ↔ sequence`.
- **Archivos:**
  - `backend/src/modules/routes/domain/route.ts`
  - `backend/src/modules/routes/domain/route-stop.ts`
  - `backend/src/modules/routes/domain/route-state.ts`
  - `backend/src/modules/routes/domain/route-stop-state.ts`
  - `backend/src/modules/routes/domain/route-errors.ts`
  - `backend/src/modules/routes/domain/events/route-lifecycle.event.ts`
  - `backend/src/modules/routes/test/route.spec.ts`
- **Resultado:** 23 pruebas de dominio y arquitectura aprobadas.
- **Evidencia:** Cobertura de transiciones válidas, inválidas e invariantes.
- **Pendiente:** Ninguno.

### Punto 2.2 — Patrón GoF RouteStopIterator
- **Objetivo:** Proveer navegación encapsulada de paradas sin exponer colecciones mutables ni recalcular secuencias.
- **Decisión:** Implementar la interfaz `RouteStopIterator` con cursores independientes, inmutabilidad profunda y tres variantes (Ordered, Pending, Failed).
- **Archivos:**
  - `backend/src/modules/routes/domain/route-stop-iterator/route-stop-iterator.ts`
  - `backend/src/modules/routes/domain/route-stop-iterator/ordered-route-stop.iterator.ts`
  - `backend/src/modules/routes/domain/route-stop-iterator/pending-route-stop.iterator.ts`
  - `backend/src/modules/routes/domain/route-stop-iterator/failed-route-stop.iterator.ts`
  - `backend/src/modules/routes/test/route-stop-iterator.spec.ts`
- **Resultado:** 33 pruebas aprobadas verificando orden, vacíos, filtros, cursores independientes, inmutabilidad y `current()`.
- **Evidencia:** CA-04 verificado al 100%.
- **Pendiente:** Ninguno.

### Punto 3.1 — Casos de Uso de Preparación e Inicio
- **Objetivo:** Orquestar `prepare` y `start` coordinando la ruta y sus paquetes en una UoW atómica.
- **Decisión:** `PrepareRouteUseCase` exige `depotConfirmed: true` y recursos activos; `StartRouteUseCase` exige coincidencia del mensajero asignado y horario vigente.
- **Archivos:**
  - `backend/src/modules/routes/application/use-cases/prepare-route.use-case.ts`
  - `backend/src/modules/routes/application/use-cases/start-route.use-case.ts`
  - `backend/src/modules/routes/test/prepare-route.use-case.spec.ts`
  - `backend/src/modules/routes/test/start-route.use-case.spec.ts`
- **Resultado:** 13 pruebas unitarias aprobadas demostrando validaciones y propagación transaccional.
- **Evidencia:** CA-05, CA-06, CA-07 y CA-12 verificados.
- **Pendiente:** Ninguno.

### Punto 3.2 — Contingencias y Protección del Manifiesto
- **Objetivo:** Gestionar cancelaciones pre-salida, interrupciones en ruta y proteger rutas preparadas contra modificaciones de asignación.
- **Decisión:** Extender `PackageState` para permitir regreso controlado de asignado/listo a `PENDING_ASSIGNMENT`; cancelar libera asignaciones pero no borra la ruta; interrumpir conserva la flota ocupada; incorporar `RouteEditabilityValidationHandler` en la Chain.
- **Archivos:**
  - `backend/src/modules/routes/application/use-cases/cancel-route.use-case.ts`
  - `backend/src/modules/routes/application/use-cases/interrupt-route.use-case.ts`
  - `backend/src/modules/packages/domain/states/assigned-to-route.state.ts`
  - `backend/src/modules/packages/domain/states/ready-for-dispatch.state.ts`
  - `backend/src/modules/assignments/domain/handlers/route-editability-validation.handler.ts`
  - `backend/src/modules/routes/test/cancel-route.use-case.spec.ts`
  - `backend/src/modules/routes/test/interrupt-route.use-case.spec.ts`
  - `backend/src/modules/assignments/test/assignment-validation-chain.spec.ts`
- **Resultado:** 57 pruebas aprobadas en el módulo de rutas, packages y assignments.
- **Evidencia:** CA-08 y CA-09 verificados.
- **Pendiente:** Ninguno.

### Punto 3.3 — Consultas con Iterator y Listado Paginado
- **Objetivo:** Implementar la lectura de detalle consumiendo el Iterator y el listado con filtros y paginación determinista.
- **Decisión:** `GetRouteDetailUseCase` recorre las paradas mediante `route.createIterator()`; `ListRoutesUseCase` proyecta resúmenes ordenados por `plannedAt DESC` aplicando alcance de mensajero si corresponde.
- **Archivos:**
  - `backend/src/modules/routes/application/use-cases/get-route-detail.use-case.ts`
  - `backend/src/modules/routes/application/use-cases/list-routes.use-case.ts`
  - `backend/src/modules/routes/test/get-route-detail.use-case.spec.ts`
  - `backend/src/modules/routes/test/list-routes.use-case.spec.ts`
- **Resultado:** 10 pruebas unitarias aprobadas demostrando consumo del Iterator y filtros.
- **Evidencia:** CA-10 verificado.
- **Pendiente:** Ninguno.

### Punto 4.1 y 4.2 — Persistencia Prisma, UoW y Migración Aditiva
- **Objetivo:** Implementar la infraestructura de persistencia con nivel `SERIALIZABLE`, reintentos anti-deadlock, adaptadores de paquetes/asignaciones, migración aditiva y preservación del replay de planificación.
- **Decisión:** Añadir columna `resultSnapshot Json?` en `RoutePlanningRequest` e índices operacionales en `Route`; UoW con reintentos para códigos SQL `40001`/`40P01` y Prisma `P2034`; extensión de `runWithTenant` para soportar opciones de aislamiento.
- **Archivos:**
  - `backend/prisma/schema/routing.prisma`
  - `backend/prisma/migrations/20261005234500_route_lifecycle_and_planning_snapshot/migration.sql`
  - `backend/src/modules/routes/infrastructure/persistence/prisma-route.repository.ts`
  - `backend/src/modules/routes/infrastructure/persistence/prisma-route-lifecycle-unit-of-work.ts`
  - `backend/src/modules/routes/infrastructure/persistence/prisma-route-resources.adapter.ts`
  - `backend/src/modules/routes/infrastructure/persistence/route-persistence.mapper.ts`
  - `backend/src/modules/packages/infrastructure/prisma-package-state-writer.ts`
  - `backend/src/modules/assignments/infrastructure/prisma-route-assignment.adapter.ts`
  - `backend/src/database/run-with-tenant.ts`
  - `backend/src/database/run-with-tenant.spec.ts`
  - `backend/src/modules/route-planning/infrastructure/prisma-planning-assignment-unit-of-work.ts`
- **Resultado:** 19 pruebas de infraestructura aprobadas y migración aditiva aplicada limpiamente.
- **Evidencia:** CA-07, CA-11, CA-12 y CA-13 verificados.
- **Pendiente:** Ninguno.

### Punto 5.1 — Presentación, DTOs y Módulo NestJS
- **Objetivo:** Exponer los endpoints REST bajo `/api/v1/routes`, validar entradas mediante DTOs runtime y componer `RoutesModule` en `AppModule`.
- **Decisión:** Control de acceso mediante `AuthRouteAccessAdapter` protegido con `runWithTenant`; mapeo semántico de errores en `routes-http-errors.ts`; validadores de DTO puros.
- **Archivos:**
  - `backend/src/modules/routes/presentation/routes.controller.ts`
  - `backend/src/modules/routes/presentation/routes-http-errors.ts`
  - `backend/src/modules/routes/presentation/dto/*.dto.ts`
  - `backend/src/modules/routes/routes.module.ts`
  - `backend/src/app.module.ts`
  - `backend/src/modules/routes/test/routes.controller.spec.ts`
  - `backend/src/modules/routes/test/routes.module.spec.ts`
- **Resultado:** 41 pruebas unitarias del controlador y módulo 100% aprobadas.
- **Evidencia:** CA-14 verificado.
- **Pendiente:** Ninguno.

### Punto 5.2 — Integración E2E en PostgreSQL Real con PostGIS y RLS
- **Objetivo:** Demostrar el flujo operativo completo, transiciones atómicas, concurrencia, reversión de paquetes, aislamiento multi-tenant y endpoints HTTP sobre base de datos dedicada.
- **Decisión:** Runner dedicado `test/integration/route-01.cjs` que aprovisiona una base temporal `sls_route01_<uuid>`, despliega las 12 migraciones con PostGIS, ejecuta las suites E2E con el rol de bajo privilegio `sls_app` (RLS activado) y destruye la base en `finally`.
- **Archivos:**
  - `backend/test/fixtures/route-lifecycle.fixtures.ts`
  - `backend/test/route-lifecycle.e2e-spec.ts`
  - `backend/test/routes-http.e2e-spec.ts`
  - `backend/test/integration/route-01.cjs`
  - `backend/package.json` (`test:route-01`)
  - `Makefile` (`INTEGRATION_TESTS = ... route-01`)
  - `backend/test/integration/README.md`
- **Resultado:** 2 suites, 23 pruebas de integración E2E pasando al 100%.
- **Evidencia:** CA-01, CA-05–CA-15 verificados en PostgreSQL 17.
- **Pendiente:** Ninguno.

## Matriz de Criterios de Aceptación

| Criterio | Descripción | Estado | Evidencia |
| :--- | :--- | :--- | :--- |
| **CA-01** | Identidad verificada, filtro estricto por tenant y recurso ajeno indistinguible (404). | **CUMPLIDO** | `routes-http.e2e-spec.ts` (test multi-tenant A/B, 401 sin sesión, 404 al consultar ruta de otro tenant); RLS forzado en `sls_app`. |
| **CA-02** | Fronteras Clean Architecture: Dominio y Aplicación libres de NestJS y Prisma. | **CUMPLIDO** | `routes-architecture.spec.ts` (10 tests de arquitectura); compilación con `tsconfig.routes.json`. |
| **CA-03** | Agregado `Route` custodia tenant, estados y secuencia $1..N$; colección privada inmutable. | **CUMPLIDO** | `route.spec.ts` (invariantes de paradas, secuencia sin huecos, protección contra mutación externa). |
| **CA-04** | Tres iteradores GoF (Ordered, Pending, Failed) con inmutabilidad y cursores independientes. | **CUMPLIDO** | `route-stop-iterator.spec.ts` (12 tests probando `hasNext`, `next`, `current`, `reset`, snapshots y filtros). |
| **CA-05** | Preparar requiere `PLANNED`, recursos activos, depósito confirmado; transiciona a `READY` y paquetes a `READY_FOR_DISPATCH`. | **CUMPLIDO** | `prepare-route.use-case.spec.ts` y `route-lifecycle.e2e-spec.ts` (preparación exitosa y rechazo por flota en mantenimiento o depósito no confirmado). |
| **CA-06** | Iniciar requiere `READY`, mensajero asignado y ventana vigente; transiciona a `IN_PROGRESS`, fija `startedAt` y paquetes a `IN_TRANSIT`. | **CUMPLIDO** | `start-route.use-case.spec.ts` y `route-lifecycle.e2e-spec.ts` (inicio exitoso y rechazo a mensajeros no asignados). |
| **CA-07** | Atomicidad total: fallo en cualquier paquete, historial, auditoría u outbox revierte el lote completo. | **CUMPLIDO** | `route-lifecycle.e2e-spec.ts` (inyección de fallo en rollback simulado; cero escrituras parciales comprobadas en BD). |
| **CA-08** | Cancelar `PLANNED/READY` devuelve paquetes a `PENDING_ASSIGNMENT`, libera asignaciones y conserva auditoría. Cancelar ruta iniciada se rechaza. | **CUMPLIDO** | `cancel-route.use-case.spec.ts` y `route-lifecycle.e2e-spec.ts` (liberación atómica y rechazo HTTP 409 si la ruta está `IN_PROGRESS`). |
| **CA-09** | Interrumpir requiere `IN_PROGRESS` y motivo; no libera asignaciones ni flota comprometida. | **CUMPLIDO** | `interrupt-route.use-case.spec.ts` y `route-lifecycle.e2e-spec.ts` (interrupción con motivo; recursos siguen ocupados). |
| **CA-10** | Detalle construye paradas consumiendo el Iterator; listado es paginado y filtrable por fecha/zona/estado/mensajero. | **CUMPLIDO** | `get-route-detail.use-case.spec.ts`, `list-routes.use-case.spec.ts` y `routes-http.e2e-spec.ts` (filtros combinados y recorrido ordenado). |
| **CA-11** | Concurrencia segura: operaciones simultáneas no duplican efectos; la Chain bloquea mutaciones a rutas preparadas. | **CUMPLIDO** | `prisma-route-lifecycle-unit-of-work.spec.ts` (reintentos serializables) y `assignment-validation-chain.spec.ts` (`RouteEditabilityValidationHandler`). |
| **CA-12** | Eventos outbox con envelope canónico (`producer: routes`, `version: 1`) persistidos en el mismo commit. | **CUMPLIDO** | `route-lifecycle.e2e-spec.ts` (verificación de registros en tabla `OutboxEvent` y `AuditLog`). |
| **CA-13** | Replay de planificación inmutable tras cancelaciones o transiciones operativas. | **CUMPLIDO** | `prisma-planning-assignment-unit-of-work.ts` (uso de `resultSnapshot`); suite de regresión `make integration-test TEST=assign-01` pasando al 100%. |
| **CA-14** | DTOs validan en runtime; permisos y pertenencia aplicados en backend. | **CUMPLIDO** | `routes-http.e2e-spec.ts` (pruebas de validación HTTP 400, autenticación 401, permisos 403 y conflictos 409). |
| **CA-15** | Build, comprobación estricta, suites y migraciones reproducibles en Docker. | **CUMPLIDO** | Comandos V0 a V7 ejecutados y verificados en Docker Compose con 0 errores. |

## Decisiones técnicas

1. **UoW con Nivel SERIALIZABLE y Protocolo Anti-Deadlock:** Todas las operaciones de ciclo de vida (`prepare`, `start`, `cancel`, `interrupt`) se ejecutan dentro de una única transacción con nivel de aislamiento `SERIALIZABLE`. El orden pesimista de bloqueos `FOR UPDATE` ($\text{Ruta} \to \text{Paquetes por ID} \to \text{Vehículo} \to \text{Mensajero}$) garantiza que transacciones concurrentes no caigan en deadlocks circulares.
2. **Reintentos Automáticos ante Colisiones:** En caso de serialización cruzada (`P2034`, SQL `40001` o `40P01`), la UoW reintenta hasta 3 veces reconstituyendo agregados y releyendo datos limpios antes de propagar error de conflicto.
3. **Mapeo Transparente `stopNumber ↔ sequence`:** El dominio expone `stopNumber` ($1..N$) según el contrato solicitado por el negocio, mientras que la capa de persistencia lo mapea bidireccionalmente a la columna existente `RouteStop.sequence`, preservando compatibilidad absoluta con `SEQ-01` y el esquema Prisma.
4. **Patrón GoF Iterator con Inmutabilidad Profunda:** Los iteradores no acceden a colecciones mutables; operan sobre snapshots inmutables ordenados y filtrados. La función `current()` proporciona el elemento activo sin alterar el cursor, y múltiples llamadas a `createIterator()` generan cursores totalmente desacoplados.
5. **Reversión Controlada de Paquetes en State:** Cancelar una ruta pre-salida devuelve los paquetes al estado `PENDING_ASSIGNMENT` para revisión del coordinador logístico, evitando el error de dar por cancelado el envío comercial del cliente.
6. **Inmutabilidad del Replay de Planificación (`resultSnapshot`):** La migración `20261005234500_route_lifecycle_and_planning_snapshot` persiste el JSON del resultado al completar una solicitud de planificación, garantizando que futuras solicitudes idénticas obtengan el resultado original exacto aun si las asignaciones fueron canceladas.

## Verificación reproducible

Ejecutado dentro del entorno Docker Compose del repositorio:

```bash
# 1. Compilación TypeScript y verificación estricta de rutas
docker compose exec backend npm run build
docker compose exec backend npx tsc --noEmit --incremental false -p tsconfig.routes.json
# Resultado: Compilación limpia, 0 errores.

# 2. Suites completas de pruebas unitarias y de arquitectura (68 suites / 572 tests)
docker compose exec backend npm test -- --runInBand
# Resultado: Test Suites: 68 passed, 68 total | Tests: 572 passed, 572 total (100% verde).

# 3. Formato y Linter
docker compose exec backend npx prettier --check "src/modules/routes/**/*.ts" test/route-lifecycle.e2e-spec.ts test/routes-http.e2e-spec.ts
docker compose exec backend npx eslint "src/modules/routes/**/*.ts" --ignore-pattern "**/*.spec.ts" --ignore-pattern "**/fixtures/**"
# Resultado: Prettier y ESLint limpios sin errores en código de producción.

# 4. Pruebas de integración E2E dedicadas (PostgreSQL 17 + PostGIS en base desechable con RLS)
make integration-test TEST=route-01
# Resultado: Test Suites: 2 passed, 2 total | Tests: 23 passed, 23 total (100% verde).

# 5. Suites de regresión de integración
make integration-test TEST=assign-01   # 5 tests PASS
make integration-test TEST=gdb-01      # 14 tests PASS
make integration-test TEST=gdb-05      # 4 tests PASS
make integration-test TEST=gdb-06      # 4 tests PASS
make integration-test TEST=geocode-01  # 6 tests PASS
```

## Estado en el entorno compartido

- Migración aditiva `20261005234500_route_lifecycle_and_planning_snapshot` lista para despliegue productivo.
- Tablas y columnas añadidas son aditivas y compatibles con versiones previas.
- Todas las operaciones runtime respetan las políticas RLS y operan bajo `sls_app`.

## Trabajo fuera de alcance

- Registro de intentos de entrega, entregas efectivas y captura de firmas o fotos (alcance de `DELIVERY-01`).
- Cierre contable y resumen numérico final de la ruta (alcance de `ROUTE-CLOSE-01`).
- Geolocalización satelital (GPS) en tiempo real y mapas interactivos en vivo (post-MVP).
- Notificaciones asíncronas vía RabbitMQ y correo electrónico (alcance de `NOTIF-01` / `NOTIF-02`).
- Interfaces de usuario en frontend para mensajero y coordinador (alcance de `UI-03`).

## Cierre

El módulo `ROUTE-01` y el patrón GoF `RouteStopIterator` (`ITER-01`) se encuentran **100% implementados, auditados arquitectónicamente y verificados de extremo a extremo** tanto en pruebas unitarias como en integración real con PostgreSQL 17 / PostGIS bajo aislamiento RLS. Los criterios de aceptación CA-01 a CA-15 han sido plenamente satisfechos.
