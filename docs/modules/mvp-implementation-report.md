# MVP — auditoría y hoja de ruta

Plan canónico: [implementación del MVP](../plans/mvp-implementation.md).

Estado: `IN_PROGRESS` para el MVP completo. Actualizado al 2026-10-05 en rama `feature/route-planning-api`. Se ejecutaron suites completas de pruebas unitarias y de arquitectura dentro del contenedor Docker (`backend`), alcanzando 55 suites y 442 tests pasando al 100%, junto con compilación TypeScript exitosa (`nest build`), capa de Presentación HTTP con `RoutePlanningController` (`POST /api/v1/routes/planning/plan-and-assign`) y pruebas de integración PostgreSQL 17 + PostGIS en base de datos desechable (5/5 tests E2E aprobados en `make integration-test TEST=assign-01`).

## Alcance observado y estado de componentes

1. **Entorno y datos**: Docker Compose funcional con backend, frontend, PostgreSQL/PostGIS 17 y RabbitMQ. Prisma multiarchivo con RLS y aislamiento tenant en base de datos.
2. **Paquetes y Estado**: Agregado `Package` con máquina de estados finita (patrón GoF State), historial de transiciones y eventos outbox.
3. **Validación y Asignación**: Cadena de responsabilidad (GoF Chain of Responsibility) adaptada a unidades enteras exactas (gramos y cm³) y prevalidación pura sin I/O, integrada transaccionalmente en `ASSIGN-01`.
4. **Planificación de rutas (Etapa 4 - Backend completo)**:
   - **`GEO-01`**: Validación rigurosa de coordenadas geográficas y cálculo de distancia Haversine implementado manualmente con oráculos trigonométricos independientes.
   - **`CLUSTER-01`**: Agrupamiento determinista de destinos por radio con partición por capacidad (`maxWeightKg`, `maxVolumeM3`), oráculo centroidal k-means y servicio de aplicación `ClusterPackagesService` ([ADR-003](../adr/003-deterministic-radius-clustering.md), [reporte](cluster-01-report.md)).
   - **`SEQ-01`**: Ordenamiento de paradas mediante estrategia GoF (`StopOrderingAlgorithm`), implementando `NearestNeighborOrdering` como tour base cerrado y `TwoOptOrdering` como optimización local bounded *first-improvement*. Desempate determinista por `packageId` ordinal UTF-16, inmutabilidad profunda y servicio de aplicación `OrderRouteStopsService` ([ADR-004](../adr/004-deterministic-stop-ordering.md), [reporte](seq-01-report.md)).
    - **`ASSIGN-01`**: Orquestación transaccional atómica mediante `PlanAndAssignRoutesService` y `PrismaPlanningAssignmentUnitOfWork` (nivel de aislamiento `SERIALIZABLE` con reintentos y locks pesimistas). Persistencia integral de rutas `PLANNED`, paradas `1..n`, asignaciones históricas, transiciones de State (`CLASSIFIED -> ASSIGNED_TO_ROUTE` o `PENDING_ASSIGNMENT`), eventos outbox, migración de seguridad RLS `20261005183000_calendar_planning_grants_and_rls` y comparador canónico de idempotencia ([ADR-005](../adr/005-transactional-route-assignment.md), [reporte](assign-01-report.md)).
    - **`ROUTE-01` / `ITER-01`**: Ciclo de vida operativo completo (`PLANNED -> READY -> IN_PROGRESS`, cancelaciones `CANCELLED` e interrupciones `INTERRUPTED`), patrón GoF RouteStopIterator con 3 variantes independientes (Ordered, Pending, Failed), sincronización State de paquetes, UoW con nivel de aislamiento `SERIALIZABLE`, reintentos anti-deadlock, `RoutesController` con 6 endpoints HTTP v1 (`/api/v1/routes`), migración aditiva `20261005234500_route_lifecycle_and_planning_snapshot` y 23 tests de integración E2E en PostgreSQL 17 / PostGIS ([ADR-006](../adr/006-route-lifecycle-and-stop-iterator.md), [reporte](route-01-report.md)).
    - **Capa de Presentación API**: `RoutePlanningController` y `RoutesController` exponiendo endpoints operativos con validación de entrada estructurada, extracción confiable de contexto multi-tenant (`RequestContext` en `shared/presentation/`) y mapeo semántico de códigos de estado HTTP.
    - **Fronteras Clean Architecture**: Verificadas mediante tests automatizados (`clustering-architecture.spec.ts`, `stop-ordering-architecture.spec.ts`, `assignment-planning-architecture.spec.ts`, `routes-architecture.spec.ts`) garantizando que `domain/` y `application/` no importen NestJS, Prisma ni frameworks externos.
5. **Caminos viales**: Grafo vial dirigido y algoritmo de Dijkstra implementados ([GDB-05](../plans/gdb-05.md)).
6. **Frontend**: Interfaz React + Vite con registro de paquetes y visor de códigos QR; configuración de mocks lista para desconexión progresiva hacia endpoints reales.
7. **Mensajería y Workers**: RabbitMQ aprovisionado; modelos OutboxEvent, ProcessedEvent y DeadLetterMessage disponibles; outbox generado atómicamente en transiciones; pendiente worker de consumo idempotente y DLQ en `EVT-01` / `RMQ-01`.

## Resumen de etapas del MVP

| Etapa | Módulos | Estado | Avance reciente |
| --- | --- | --- | --- |
| 0 | Contratos y fronteras | `IN_PROGRESS` | Contratos de clustering (`CLUSTER-01`), ordenamiento (`SEQ-01`), asignación transaccional (`ASSIGN-01`), ciclo operativo/Iterator (`ROUTE-01`) y entregas/evidencias (`DELIVERY-01`) cerrados con ADR-003, ADR-004, ADR-005, ADR-006 y ADR-007. |
| 1 | AUTH-01 / TENANT-01 / UI-01 | `TODO` | Pendiente sesión y aislamiento HTTP interactivo. |
| 2 | ZONE-01 / PKG-01 / VEH-01 / UI-02 | `TODO` | Pendiente integración de casos de uso y endpoints de catálogos/recursos. |
| 3 | EVT-01 / RMQ-01 / IDEMP-01 / DLQ-01 | `TODO` | Infraestructura lista; outbox events generados; pendiente worker y pipeline de reintentos/DLQ. |
| 4 | GEO-01 / CLUSTER-01 / SEQ-01 / ASSIGN-01 / UI-03 | `IN_PROGRESS` | **Backend completo al 100%: algoritmos, persistencia transaccional y RoutePlanningController con 55 suites unitarias y pruebas E2E en PostgreSQL/PostGIS**. Resta `UI-03` (pantallas de planificación). |
| 5 | ROUTE-01 / DELIVERY-01 / ROUTE-CLOSE-01 | `IN_PROGRESS` | **ROUTE-01, ITER-01 y DELIVERY-01 completados al 100% (ciclo operativo de rutas, GoF Stop Iterator, UoW SERIALIZABLE de rutas y entregas, captura de evidencias con hash SHA-256, políticas de resolución multipaquete y endpoints HTTP con 75 suites unitarias y 29 tests E2E en PostgreSQL/PostGIS)**. Resta `ROUTE-CLOSE-01`. |
| 6 | NOTIF-01 / NOTIF-02 / UI-04 | `TODO` | Modelos listos; pendiente consumers y adapter de email. |
| 7 | SEC-01 / QA-01 / EVID-01 / DOC-01/02 | `IN_PROGRESS` | Documentación viva actualizada; suites de tests unitarios, de arquitectura y de integración PostgreSQL/PostGIS en crecimiento continuo. |

## Verificación y entorno

- **Entorno de ejecución**: Contenedores Docker Compose (`sls-backend`, `sls-postgres`, `sls-rabbitmq`, `sls-frontend`).
- **Compilación backend**:
  ```bash
  docker compose exec backend npm run build
  # nest build -> 0 errores de compilación
  ```
- **Typecheck estricto**:
  ```bash
  docker compose exec backend npx tsc --noEmit
  # 0 errores de TypeScript
  ```
- **Pruebas automatizadas backend**:
  ```bash
  docker compose exec backend npm test -- --runInBand
  # Test Suites: 75 passed, 75 total
  # Tests:       692 passed, 692 total
  # Snapshots:   0 total
  ```
- **Pruebas de integración E2E (PostgreSQL 17 + PostGIS en base desechable)**:
  ```bash
  make integration-test TEST=delivery-01
  # Test Suites: 2 passed, 2 total
  # Tests:       29 passed, 29 total (CA-01 a CA-15)
  ```
- **Auditoría arquitectónica**: Cumplimiento estricto de Clean Architecture en `modules/deliveries`, `modules/routes`, `modules/route-planning` y `modules/assignments` (aislamiento total de NestJS/Prisma en dominio y aplicación).

## Cierre

El núcleo backend de planificación, asignación y ejecución operativa de rutas y entregas del MVP (`GEO-01`, `CLUSTER-01`, `SEQ-01`, `ASSIGN-01`, `ROUTE-01` y `DELIVERY-01`) se encuentra completamente implementado, documentado con siete ADRs ([ADR-001](../adr/001-shared-schema-multitenancy.md) a [ADR-007](../adr/007-delivery-attempts-evidence-and-final-lifecycle.md)) y verificado con 75 suites unitarias (692 tests) y suites de integración E2E con PostgreSQL 17 + PostGIS bajo aislamiento multi-tenant RLS. Los siguientes pasos recomendados son avanzar hacia el cierre de rutas (`ROUTE-CLOSE-01`), el worker asíncrono RabbitMQ (`EVT-01`), o las pantallas del frontend (`UI-01` a `UI-04`).
