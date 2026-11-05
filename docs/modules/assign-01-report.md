# ASSIGN-01 — Planificación y asignación transaccional de rutas

Estado: **DONE para el alcance definido**.

Plan de trabajo: [ASSIGN-01](../plans/assign-01.md).

## Alcance verificado

- **Decisión y ADR-005:** [ADR-005: Planificación y asignación transaccional de rutas](../adr/005-transactional-route-planning-and-assignment.md).
- **Contrato Puro de Aplicación:** `PlanAndAssignRoutesUseCase`, comandos inmutables `PlanAndAssignRoutesCommand` y resultados estructurados `PlanAndAssignRoutesResult` en `application/ports/plan-and-assign-routes.contract.ts`.
- **Servicio Orquestador de Aplicación:** `PlanAndAssignRoutesService` en `application/plan-and-assign-routes.service.ts` integrando `ClusterPackagesService`, `OrderRouteStopsService`, prevalidación pura con Chain of Responsibility y transiciones State de paquetes, sin dependencias de NestJS ni de Prisma.
- **Unidad Transaccional Atómica (UoW):** `PrismaPlanningAssignmentUnitOfWork` y `PrismaPlanningAssignmentSession` en `infrastructure/prisma-planning-assignment-unit-of-work.ts` ejecutando toda la planificación y asignación en una única transacción con nivel de aislamiento `SERIALIZABLE`, reintentos en fallos de concurrencia (`P2034`, `40001`, `40P01`), bloqueo pesimista ordenado de filas (`FOR UPDATE`) y configuración obligatoria de sesión `SET LOCAL app.tenant_id`.
- **Idempotencia y Detección de Conflictos:** Registro atómico en `RoutePlanningRequest`, comparación canónica determinista de parámetros mediante `isCommandEqual` (resistente al orden interno de claves `JSONB`) para distinguir repeticiones idénticas (`replayed: true`) de colisiones (`REQUEST_ID_CONFLICT`).
- **Ciclo de Vida y Estados de Dominio:** Transición `CLASSIFIED -> ASSIGNED_TO_ROUTE` para paquetes asignados y `CLASSIFIED -> PENDING_ASSIGNMENT` para resultados logísticos no resueltos, registrando historial en `PackageStatusHistory` y persistiendo eventos outbox `PackageAssigned` / `PackagePendingAssignment` dentro del mismo commit.
- **Aislamiento Multi-Tenant y Seguridad RLS:** Migración aditiva `20261005183000_calendar_planning_grants_and_rls` aplicando `ENABLE/FORCE ROW LEVEL SECURITY`, políticas `tenant_isolation` y permisos a `sls_app` en las tablas `Depot`, `DeliveryWindow`, `VehicleShift`, `CourierShift` y `PlanningPackageResult`. Verificación E2E de que un tenant no puede visualizar ni asignar paquetes de otra empresa (`toBeNull()`).
- **Fronteras Arquitectónicas:** Pruebas automatizadas en `test/assignment-planning-architecture.spec.ts` validando la dirección estricta de dependencias (Dominio y Aplicación libres de frameworks e infraestructura).

## Implementación por puntos

### Punto 0 — Contratos y ADR-005
- **Objetivo:** Definir la semántica de la transacción única, los comandos y resultados del caso de uso y el aislamiento de responsabilidades.
- **Decisión:** Mantener clustering y ordenamiento como servicios puros de aplicación; una única transacción `SERIALIZABLE` para el lote completo; pendientes como resultados válidos de negocio persistidos vía State.
- **Archivos:**
  - `docs/adr/005-transactional-route-planning-and-assignment.md`
  - `backend/src/modules/route-planning/application/ports/plan-and-assign-routes.contract.ts`
  - `backend/src/modules/route-planning/application/ports/planning-assignment-unit-of-work.ts`
- **Resultado:** Contratos e interfaces inmutables definidas y validadas contra Clean Architecture.
- **Evidencia:** ADR-005 incorporado en commit `10aa285`.
- **Pendiente:** Ninguno.

### Punto 1 — Adaptación de Prevalidación y Chain of Responsibility
- **Objetivo:** Adecuar la cadena de asignación a unidades enteras exactas (gramos y cm³) y exponer prevalidación sin I/O.
- **Decisión:** Incorporar `createPrevalidationChain` para evaluar zona, coordenadas, adjuntos de red y estado de paquete antes del agrupamiento.
- **Archivos:**
  - `backend/src/modules/assignments/domain/validation.types.ts`
  - `backend/src/modules/assignments/domain/validation.chain.ts`
  - `backend/src/modules/assignments/domain/handlers/complete-data-validation.handler.ts`
  - `backend/src/modules/assignments/domain/handlers/weight-capacity.handler.ts`
  - `backend/src/modules/assignments/domain/handlers/volume-capacity.handler.ts`
  - `backend/src/modules/assignments/test/assign-package-to-route.service.spec.ts`
- **Resultado:** Chain adaptada y 431 tests unitarios aprobados.
- **Evidencia:** Commit `fb1b228`.
- **Pendiente:** Ninguno.

### Punto 2 — Servicio de Aplicación `PlanAndAssignRoutesService`
- **Objetivo:** Coordinar la prevalidación, clustering de capacidad, ordenamiento de paradas, asignación y persistencia de resultados.
- **Decisión:** Implementación desacoplada de NestJS y Prisma; clasificación de motivos pendientes (`GEOCODING_NOT_READY`, `NETWORK_ATTACHMENT_NOT_READY`, `ZONE_MISMATCH`, `NO_CAPACITY`, etc.); generación de paradas ordenadas `1..n` y eventos outbox.
- **Archivos:**
  - `backend/src/modules/route-planning/application/plan-and-assign-routes.service.ts`
  - `backend/src/modules/route-planning/domain/ports/plan-and-assign-routes.use-case.ts`
- **Resultado:** Orquestación funcional pura y determinista.
- **Evidencia:** Commit `0760064`.
- **Pendiente:** Ninguno.

### Punto 3 — Pruebas Unitarias de Orquestación y Arquitectura
- **Objetivo:** Probar en memoria todas las ramas de decisión (éxito, exclusión de capacidad, fallos de prevalidación, repeticiones) y comprobar límites de capas.
- **Decisión:** Mocks en memoria del Unit of Work que simulan comportamiento transaccional; verificación estricta de imports de `application/` y `domain/`.
- **Archivos:**
  - `backend/src/modules/route-planning/test/plan-and-assign-routes.service.spec.ts`
  - `backend/src/modules/route-planning/test/assignment-planning-architecture.spec.ts`
- **Resultado:** 11 pruebas unitarias del servicio y 4 pruebas de arquitectura 100% aprobadas.
- **Evidencia:** Commit `3c562ad`.
- **Pendiente:** Ninguno.

### Punto 4 — Infraestructura Prisma y Verificación PostgreSQL Real
- **Objetivo:** Implementar la sesión y Unit of Work transaccional sobre PostgreSQL 17 + PostGIS, configurar RLS y ejecutar tests E2E en base de datos desechable.
- **Decisión:** Transacción `SERIALIZABLE` con reintento ante `P2034` / `40001`; locks `FOR UPDATE` ordenados por clave primaria; RLS en tablas de calendario; script runner desechable con PostGIS.
- **Archivos:**
  - `backend/prisma/migrations/20261005183000_calendar_planning_grants_and_rls/migration.sql`
  - `backend/src/modules/route-planning/infrastructure/prisma-planning-assignment-unit-of-work.ts`
  - `backend/src/modules/route-planning/route-planning.module.ts`
  - `backend/src/modules/route-planning/test/route-planning.module.spec.ts`
  - `backend/test/integration/assign-01.cjs`
  - `backend/test/assignment-planning.e2e-spec.ts`
  - `Makefile`
  - `backend/package.json`
- **Resultado:** 5/5 tests de integración E2E pasando exitosamente en PostgreSQL real.
- **Evidencia:** Commits `508a117` y `80e1966`.
- **Pendiente:** Ninguno.

## Decisiones técnicas

1. **Transacción SERIALIZABLE Unificada:** Toda la creación de rutas, paradas, asignaciones, actualización de estados de paquetes, historial, resultados de planificación y eventos outbox ocurre dentro de una única transacción. No existen commits parciales ni estados inconsistentes ante fallos.
2. **Protocolo de Reintentos:** En caso de serialización cruzada o deadlocks concurrentes (`P2034`, código SQL `40001` o `40P01`), la UoW reintenta la transacción hasta 3 veces con retroceso exponencial pseudoaleatorio antes de propagar el error.
3. **Bloqueo Pesimista Ordenado:** Los paquetes, vehículos y mensajeros se bloquean mediante `SELECT ... FOR UPDATE` ordenando lexicográficamente por `id`, previniendo deadlocks circulares entre coordinadores concurrentes.
4. **Idempotencia Canónica:** `isCommandEqual` analiza los campos de la solicitud y las colecciones ordenadas sin depender del orden de serialización de PostgreSQL JSONB, garantizando reejecución segura sin duplicar rutas.
5. **Aislamiento de Información:** Las entidades de otros tenants no son visibles para el tenant en curso; consultas de paquetes ajenos bajo RLS retornan `null` y el orquestador rechaza la solicitud sin filtrar metadatos.

## Verificación reproducible

Ejecutado en el entorno oficial Docker Compose del repositorio:

```bash
# 1. Compilación TypeScript sin errores
docker compose exec backend npx tsc --noEmit

# 2. Build completo NestJS
docker compose exec backend npm run build

# 3. Suites de pruebas unitarias y de arquitectura (54 suites / 431 tests)
docker compose exec backend npm test

# 4. Prueba de integración E2E en base de datos PostgreSQL 17 + PostGIS desechable
make integration-test TEST=assign-01
```

### Resumen de resultados de pruebas

- **Suites unitarias ejecutadas:** 54 de 54 pasadas (100%).
- **Tests unitarios ejecutados:** 431 de 431 aprobados (0 fallos).
- **Test de integración E2E:** 5 de 5 tests aprobados en `test/assignment-planning.e2e-spec.ts`:
  - `CA-01`: Aislamiento multi-tenant y rechazo de recursos ajenos.
  - `CA-02, CA-03, CA-04`: Planificación, clustering, ordenamiento y asignación atómica.
  - `CA-05`: Rechazos parciales persistidos como `PENDING_ASSIGNMENT` vía State e historial.
  - `CA-08 (replay)`: Reejecución idempotente sin duplicación de entidades.
  - `CA-08 (conflicto)`: Rechazo de colisiones de `requestId` con parámetros distintos.

## Limitaciones conocidas

- **Modelo de distancia y tiempos:** Las distancias entre paradas se calculan mediante Haversine esférico; tiempos estimados de viaje y ventanas dinámicas de tráfico en ruta corresponden a módulos posteriores.
- **Despacho y ejecución:** La asignación finaliza con rutas en estado `PLANNED`; el cambio a `READY`, `IN_PROGRESS`, inicio de ruta, entregas y evidencia física corresponden a `ROUTE-01` y `DELIVERY-01`.
- **Publicación asíncrona:** Los eventos se persisten de forma duradera en `OutboxEvent`; el relay o worker RabbitMQ que publica los mensajes en los exchanges de mensajería opera de forma desacoplada.
