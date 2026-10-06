# Plan de ROUTE-01 — Ciclo de vida operativo de rutas e Iterator de paradas

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `ROUTE-01` |
| Dominio | Rutas y paradas; coordinación con paquetes, asignaciones y flota |
| Estado general | `TODO` |
| Rama de implementación | `feature/route-01` |
| Rama observada en la auditoría | `develop`; no se cambió de rama para redactar el plan |
| Responsable | Humberto con Vivian y Santiago; implementación y decisiones: `USER` |
| Coordinación | Vivian: State, paquetes y flota; Santiago: contrato HTTP para UI; Juanangel: AUTH/TENANT, RLS y eventos |
| Última auditoría | 2026-10-05, America/Bogota |
| Commit auditado | `edbc48ab22e5e4624b069fa912bd652cd486429c` |
| Documento canónico | `docs/plans/route-01.md` |
| Informe | `docs/modules/route-01-report.md`, por crear al registrar la primera implementación verificada |
| ADR propuesto | `docs/adr/006-route-lifecycle-and-stop-iterator.md`, propuesta contenida en este plan |

Este documento sigue la [plantilla de sls-module-workflow](../../.agents/skills/sls-module-workflow/assets/module-plan-template.md). Es un plan de implementación, no evidencia de que ROUTE-01 esté implementado. Todos sus pasos permanecen `TODO`. El agente mantiene documentación; la lógica, contratos y decisiones corresponden a `USER`. No se crea un commit por generar este plan.

## Alcance

### Incluido

- Agregado `Route`, entidad/valor inmutable `RouteStop`, estados propios, invariantes, errores y eventos de dominio sin NestJS, Prisma ni HTTP.
- Preparación e inicio de rutas persistidas por ASSIGN-01; sincronización atómica de ruta, paquetes, historiales, auditoría y outbox mediante State y una unidad de trabajo.
- Cancelación antes de salir e interrupción de una ruta en ejecución, con motivo, actor y correlación auditables; tratamiento distinto de reservas y paquetes.
- GoF Iterator: contrato `RouteStopIterator`, variantes Ordered/Pending/Failed y tres factorías del agregado, con snapshots defensivos y cursores independientes.
- Casos de uso `PrepareRouteUseCase`, `StartRouteUseCase`, `GetRouteDetailUseCase`, `ListRoutesUseCase`, `CancelRouteUseCase` e `InterruptRouteUseCase`. Los dos últimos hacen ejecutables las contingencias solicitadas.
- `PrismaRouteRepository`, puertos transaccionales, `runWithTenant`, RLS con rol runtime y consultas explícitamente filtradas por tenant.
- DTOs en `presentation/dto/`, `RoutesController` HTTP v1, integración del contexto autenticado y permisos, composición en `RoutesModule`.
- Compatibilidad acotada con ASSIGN-01: manifiesto protegido frente a nuevas asignaciones después de preparar y replay de planificación estable tras cambiar estados/cancelar.
- Pruebas unitarias, de arquitectura, integración PostgreSQL/PostGIS y E2E HTTP; migraciones aditivas necesarias y evidencia reproducible en Docker Compose.

### Fuera de alcance

- Intentos, entregas, fallos de entrega, incidentes y evidencias: `DELIVERY-01`. ROUTE-01 no marca paradas `COMPLETED`/`FAILED` ni lleva paquetes a `OUT_FOR_DELIVERY`, `DELIVERED` o `DELIVERY_FAILED`.
- Cálculo del resumen y transición de cierre a `COMPLETED`: `ROUTE-CLOSE-01`. Failed Iterator queda disponible y probado, sin simular un cierre implementado.
- GPS, WebSocket, geolocalización de flota y seguimiento en tiempo real.
- Recalcular clustering, nearest-neighbor o 2-opt; editar el orden calculado, reasignar manualmente o crear otro endpoint de planificación.
- Reanudar una ruta interrumpida, cambiar su vehículo/mensajero o recuperar automáticamente paquetes pendientes. Requieren casos de uso posteriores con las mismas garantías.
- Implementar todo AUTH-01/TENANT-01, workers, envío RabbitMQ, DLQ o notificaciones. La integración de identidad real sí es condición de cierre; outbox durable no acredita publicación ni envío.
- Pantallas de `UI-03`. Se entrega un contrato utilizable por Santiago y se registra la integración visual pendiente.

El tablero histórico menciona revisión/corrección de rutas. Este corte permite revisar el detalle y decidir preparar o cancelar; no incluye edición manual del manifiesto. `DRAFT`/`PLANNING` se reconocen en el modelo, pero la entrada operativa de este módulo es una ruta `PLANNED` producida por ASSIGN-01. No se atribuye al módulo el ciclo completo hasta entrega/cierre.

## Dependencias y fuentes

| Fuente | Uso y condición |
| --- | --- |
| [AGENTS.md](../../AGENTS.md), §§4, 8, 9, 11 y 14 | Flujo operativo, Clean Architecture, tenant, estados e Iterator; complementar con §§10, 15–18, 20–25 y 28 |
| [ASSIGN-01](assign-01.md) e [informe](../modules/assign-01-report.md) | Produce rutas/asignaciones y coordina State/outbox; reutilizar su garantía transaccional, no copiar sus decisiones a infraestructura |
| [ZONE-01](zone-01.md) | Catálogos tenant-aware y semántica de zona; no inventar `Route.zoneId` |
| [GEO-01](geo-01.md), [CLUSTER-01](cluster-01.md), [SEQ-01](seq-01.md) | Coordenadas, capacidad y secuencia ya calculadas; no reimplementarlas |
| [ADR-002](../adr/002-assignment-integrity.md), [ADR-003](../adr/003-deterministic-capacity-clustering.md), [ADR-004](../adr/004-deterministic-stop-ordering.md), [ADR-005](../adr/005-transactional-route-assignment.md) | Historial, cantidades, orden determinista y transacciones; ADR-005 aún dice «Propuesto» aunque hay implementación |
| [AUTH-01](auth-01.md), [TENANT-01](tenant-01.md), [PKG-01](pkg-01.md), [VEH-01](veh-01.md) | Integración de identidad, State y flota; distinguir las primitivas existentes de las APIs completas pendientes |
| [routing.prisma](../../backend/prisma/schema/routing.prisma), [packages.prisma](../../backend/prisma/schema/packages.prisma), [calendar.prisma](../../backend/prisma/schema/calendar.prisma) | Modelos, enums, relaciones compuestas, turnos y ventanas reales |
| [audit.prisma](../../backend/prisma/schema/audit.prisma), [messaging.prisma](../../backend/prisma/schema/messaging.prisma) | Auditoría y outbox existentes, sin tablas duplicadas |
| [prisma7.config.ts](../../backend/prisma7.config.ts) | El esquema vigente es multifichero en `backend/prisma/schema`; no existe el antiguo `schema.prisma` único |
| [request-context.decorator.ts](../../backend/src/shared/presentation/request-context.decorator.ts), [run-with-tenant.ts](../../backend/src/database/run-with-tenant.ts) | Puntos de integración existentes, con las brechas descritas abajo |
| [README de integración](../../backend/test/integration/README.md), [Makefile](../../Makefile), [Compose de integración](../../docker-compose.integration.yml) | Servidor desechable, rol `sls_app`, migraciones y runners aislados |
| Rama histórica `feature/route-stop-iterator`, commit `6b217974a476c765a7e38d5eb95e6ff82c6ccbe5` | Referencia conceptual del prototipo; no es implementación integrada en `develop` |

Las rutas de archivos que siguen son relativas a la raíz del repositorio. Los archivos descritos como nuevos son destinos propuestos, no archivos ya existentes. Las dependencias de AUTH/TENANT impiden cerrar la API operativa hasta su integración; no impiden avanzar en dominio y pruebas con dobles de puertos.

## Diagnóstico actual

Auditoría estática sobre un árbol inicialmente limpio. Se revisaron código, esquemas, migraciones versionadas, documentos, scripts e historial local; no se verificó la aplicación de migraciones a una base concreta.

| Área | Evidencia observada | Implicación para ROUTE-01 |
| --- | --- | --- |
| Planificación | `route-planning/application/plan-and-assign-routes.service.ts` y su UoW persisten rutas `PLANNED`, paradas `PENDING`, asignaciones `ACTIVE` y paquetes `ASSIGNED_TO_ROUTE` | Esta es la precondición operativa, no un nuevo algoritmo |
| HTTP existente | `route-planning/presentation/route-planning.controller.ts` expone `POST /api/v1/routes/planning/plan-and-assign`; `main.ts` agrega prefijo `api` y versión URI `1` | Registrar `@Controller('routes')`; conservar el endpoint existente |
| Módulo rutas | No existe `backend/src/modules/routes/` en este checkout | Agregado, casos de uso, repositorio y controlador son nuevos |
| Estados | `RouteState` contiene también `PLANNING_FAILED`; paradas usan `PENDING`, `COMPLETED`, `FAILED` | Conservar el enum completo; la lista abreviada del encargo no justifica eliminar un valor vigente |
| Orden persistido | `RouteStop.sequence`, único por ruta; no existe `stopNumber` | Usar `stopNumber` en el contrato de dominio/API solicitado y mapear explícitamente `sequence ↔ stopNumber`, sin renombrar la columna ni el contrato de SEQ/ASSIGN |
| State de paquetes | `PackageAggregate.transitionTo()` genera eventos; existen las transiciones asignado → listo → tránsito | Reutilizarlo dentro de una sola transacción para todo el manifiesto |
| Cancelación | Los estados asignado/listo no permiten volver actualmente a `PENDING_ASSIGNMENT` | Ampliación controlada de State con Vivian; no confundir cancelar una ruta con cancelar sus envíos |
| Contexto HTTP | El decorador acepta `x-tenant-id`, `tenant-id`, `x-user-id` y actor por defecto `system-coordinator`; no se encontró autenticación integrada | No es una identidad confiable todavía. RLS no evita suplantación si el cliente elige el tenant de sesión |
| Transacciones | ASSIGN usa `SERIALIZABLE`, contexto local y hasta tres intentos; `runWithTenant` abre su propia transacción sin opción de aislamiento | Extender el helper de forma compatible y usarlo una sola vez en la UoW; no anidar transacciones por repositorio/paquete |
| Flota | Hay estado, capacidad, turnos y depósito de ruta; Vehicle/Courier no tienen ubicación ni vínculo de presencia física con depósito | Revalidar disponibilidad y registrar confirmación humana de presencia; no inferir geolocalización |
| Filtros | Route no tiene `zoneId`; el comando guardado en `RoutePlanningRequest.parameters` sí. ASSIGN no rellena `serviceDate` | Filtrar zona por snapshot de planificación y fecha por `plannedStartAt`; no depender de campos vacíos |
| Replay de ASSIGN | `claimRequest` reconstruye desde asignaciones `ACTIVE`, fuerza `PLANNED` y `completeRequest` ignora `_result` | Tras cancelar produciría vínculos vacíos. Persistir el resultado original antes de habilitar cancelación |
| Manifiesto | La reserva previa bloquea la ruta, pero no condiciona la asignación a su estado operativo | Todos los escritores deben rechazar añadir/quitar asignaciones en rutas preparadas o en ejecución |
| TypeScript | `strictNullChecks=true`, pero `noImplicitAny=false` y no hay `strict` global | Exigir comprobación estricta del alcance nuevo; no anunciar strict global como hecho |
| Evidencia previa | Documentación MVP de 2026-10-05 registra 55 suites/442 tests; existen 55 archivos unitarios | Son resultados históricos, no una ejecución de esta auditoría |

### Prototipo de Iterator disponible

Las referencias locales almacenadas `feature/route-stop-iterator` y `origin/feature/route-stop-iterator` apuntan a `6b21797`; no se hizo fetch ni checkout. Allí existen `domain/route-stop-iterator/core/{route,route-stop,route-stop-iterator}.ts` e `iterators/ordered-route-stop.iterator.ts` dentro de `backend/src/modules/routes/`.

El prototipo demuestra recorrido ordenado, vacío y reset, pero solo tiene Ordered, `hasNext/next/reset`, `Route.createStopIterator()`, estados `PENDING/COMPLETED`, ausencia de tenant y copias superficiales de objetos. Sus cuatro pruebas no acreditan `current`, filtros, independencia ni inmutabilidad profunda. Adaptar la idea al modelo actual; no incorporar toda la rama mediante cherry-pick ni tratarla como módulo terminado.

### Verificación de esta auditoría

- Lecturas de Git y archivos completadas; base y referencias anteriores comprobadas.
- `docker compose ps` no pudo acceder a `/var/run/docker.sock` desde el entorno de auditoría. No se ejecutaron builds, pruebas ni migraciones, ni se modificó el entorno de aplicación.
- El plan registra implementación prevista, evidencia histórica y verificación pendiente por separado. El acceso a Docker se vuelve a comprobar en el paso 1.1; no constituye un resultado fallido de ROUTE-01.

## Criterios de aceptación

| ID | Regla comprobable | Evidencia mínima para cierre |
| --- | --- | --- |
| CA-01 | Todas las lecturas/mutaciones requieren identidad verificada y filtran por tenant; ruta ajena e inexistente son indistinguibles | E2E HTTP con tenants A/B, 401 sin sesión, cabeceras falsificadas rechazadas y RLS real con `sls_app` |
| CA-02 | Dominio y aplicación no importan NestJS, Prisma, HTTP, presentación ni adaptadores; dominio tampoco importa aplicación | Prueba de límites sobre todos los archivos y dependencias locales del núcleo, más construcción de casos de uso sin Nest |
| CA-03 | `Route` protege tenant, relaciones, estados y secuencia íntegra `1..N`; no expone colección mutable | Pruebas de reconstitución, mezcla de tenants, duplicados, huecos y mutación externa |
| CA-04 | Los tres iteradores cumplen hasNext/next/current/reset, orden, filtrado, vacío y snapshots independientes | Suite con fixtures desordenados, estados mixtos, intercalado de cursores y agotamiento |
| CA-05 | Preparar solo acepta `PLANNED`, manifiesto no vacío/coherente, recursos disponibles y presencia confirmada; produce `READY` y todos los paquetes `READY_FOR_DISPATCH` | Unitarias de rechazo y E2E con historial, auditoría y `RoutePrepared` en un commit |
| CA-06 | Iniciar solo acepta `READY`, actor autorizado y recursos revalidados; produce `IN_PROGRESS`, `startedAt` y todos los paquetes `IN_TRANSIT` | Unitarias/E2E; no altera estado de paradas ni simula entrega |
| CA-07 | Una transición inválida o un fallo al guardar cualquier paquete/historial/auditoría/evento revierte el lote entero | Inyección de fallo después del primer paquete y al escribir outbox/auditoría; cero escrituras parciales |
| CA-08 | Cancelar `PLANNED/READY` libera asignaciones, conserva historia y devuelve paquetes a `PENDING_ASSIGNMENT`; después de salir se rechaza | E2E: Assignment `CANCELLED` con `endedAt`, motivo y eventos; sin borrar rutas/paradas ni cancelar paquetes |
| CA-09 | Interrumpir solo acepta `IN_PROGRESS`, exige motivo y conserva asignaciones, estados de paquetes y ocupación de recursos | Prueba del caso de uso y endpoint; planificador sigue considerando esos recursos ocupados |
| CA-10 | Detalle contiene vehículo, mensajero y paradas ordenadas construidas mediante Iterator; listado es paginado y filtrable por fecha/zona/estado/mensajero | Unitarias de colaboración con Iterator y E2E de filtros, página vacía, límites y orden estable |
| CA-11 | Preparación/inicio/cancelación concurrentes no duplican efectos; asignación concurrente no altera manifiesto congelado | Dos conexiones reales, carreras prepare/prepare, start/start, start/cancel y prepare/assign |
| CA-12 | Eventos incluyen envelope completo y actor/motivo auditables; permanecen en outbox `PENDING` hasta integración posterior | Comparación de payload e historiales, tenant/correlación/IDs; ningún envío externo dentro de la transacción |
| CA-13 | Replay de planificación conserva su resultado original tras preparar, iniciar o cancelar, sin estados/vínculos inventados | Regresión de ASSIGN-01 con `resultSnapshot`, mismo requestId, mismos IDs y cero efectos adicionales |
| CA-14 | DTOs validan datos reales en runtime; permisos y pertenencia de mensajero se aplican en backend | HTTP 400/401/403/404/409, UUIDs, fechas, enum, tamaño de página, motivo y cuerpos inesperados |
| CA-15 | Build, comprobación estricta del alcance, suites, migraciones aplicables y documentación son reproducibles | Ejecuciones Docker registradas en informe por paso, sin pruebas omitidas presentadas como aprobadas |

## Plan verificable

Seis fases, divididas en pasos que pueden comprobarse por separado. Todos los responsables son `USER`, como solicita el encargo. «V» remite a los comandos completos de verificación incluidos abajo; ejecutar únicamente cuando existan los archivos y precondiciones correspondientes. El detalle de cada paso fija archivos, instrucciones, lote mecánico posible y pendientes.

| Paso | Fase | Responsable | Estado | Dependencias | Objetivo y razón | Archivos principales; inventario completo debajo | Verificación y criterio de salida | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1 | 1. Preflight y contrato | `USER` | `DONE` | Auditoría inicial | Adoptar alcance/ADR y contrato de identidad para evitar reglas implícitas | `docs/plans/route-01.md`; `docs/adr/006-route-lifecycle-and-stop-iterator.md` | V0; decisiones del ADR y bloqueos externos registrados | ADR-006 formalizado en docs/adr/; decisiones D1–D8 adoptadas por el usuario |
| 1.2 | 1. Preflight y contrato | `USER` | `DONE` | 1.1 | Fijar puertos, resultados y oráculos antes de la lógica | `backend/src/modules/routes/application/route-contracts.ts`; `backend/tsconfig.routes.json` | V1/V7 iniciales; tipos del alcance compilan y fase roja prueba reglas concretas | Contratos, puertos desacoplados, tsconfig.routes.json y suite de arquitectura creados |
| 2.1 | 2. Dominio y patrón | `USER` | `DONE` | 1.2 | Implementar agregado, invariantes, transiciones y eventos | `backend/src/modules/routes/domain/route.ts`; `backend/src/modules/routes/domain/route-stop.ts` | V1; CA-02/03 y transiciones de ruta cubiertas | 23 tests pasando en route.spec.ts y routes-architecture.spec.ts; transiciones y secuencia 1..N verificadas |
| 2.2 | 2. Dominio y patrón | `USER` | `DONE` | 2.1 | Implementar Ordered/Pending/Failed y encapsulamiento | `backend/src/modules/routes/domain/route-stop-iterator/route-stop-iterator.ts`; `backend/src/modules/routes/test/route-stop-iterator.spec.ts` | V1; CA-04 completo, sin recalcular SEQ | 33 tests pasando en route-stop-iterator.spec.ts, route.spec.ts y routes-architecture.spec.ts; CA-04 verificado |
| 3.1 | 3. Aplicación | `USER` | `DONE` | 2.1–2.2 | Orquestar prepare/start y sus paquetes mediante una UoW | `backend/src/modules/routes/application/use-cases/prepare-route.use-case.ts`; `backend/src/modules/routes/application/use-cases/start-route.use-case.ts` | V2; CA-05/06/07/12 con dobles transaccionales | 13 tests aprobados en prepare-route.use-case.spec.ts y start-route.use-case.spec.ts; atomicidad UoW, CA-05, CA-06, CA-07 y CA-12 verificados |
| 3.2 | 3. Aplicación | `USER` | `DONE` | 3.1; acuerdo State con Vivian | Implementar contingencias sin perder envíos ni liberar flota en calle | `backend/src/modules/routes/application/use-cases/cancel-route.use-case.ts`; `backend/src/modules/routes/application/use-cases/interrupt-route.use-case.ts` | V2; CA-08/09, extensión State y manifiesto protegido | 13 tests aprobados en cancel-route.use-case.spec.ts e interrupt-route.use-case.spec.ts; 42 en assignments y 28 en packages; CA-08/09 verificados |
| 3.3 | 3. Aplicación | `USER` | `DONE` | 2.2, 1.2 | Consultar detalles y páginas con contratos deterministas | `backend/src/modules/routes/application/use-cases/get-route-detail.use-case.ts`; `backend/src/modules/routes/application/use-cases/list-routes.use-case.ts` | V2; CA-10 y restricciones de mensajero | 10 tests aprobados en get-route-detail.use-case.spec.ts y list-routes.use-case.spec.ts; Iterator consumido y alcance mensajero verificado |
| 4.1 | 4. Persistencia | `USER` | `DONE` | 3.1–3.3 | Implementar repositorio/UoW y adaptar puertos de otros módulos | `backend/src/modules/routes/infrastructure/persistence/prisma-route.repository.ts`; `backend/src/database/run-with-tenant.ts` | V3; una transacción, tenant en cada operación y contratos infra verificados | Repositorio, UoW serializable con reintentos, adaptadores de Packages/Assignments y runWithTenant extendido verificados (19 tests) |
| 4.2 | 4. Persistencia | `USER` | `DONE` | 4.1 | Añadir migración aditiva y estabilidad del replay ASSIGN | `backend/prisma/schema/routing.prisma`; `backend/src/modules/route-planning/infrastructure/prisma-planning-assignment-unit-of-work.ts` | V4 y V6; migración fresca/legada, CA-11/13 contra PostgreSQL | Columna resultSnapshot, índices Route, migración SQL aditiva, replay idempotente y ocupación IN_PROGRESS/INTERRUPTED verificados (218 tests) |
| 5.1 | 5. API e integración | `USER` | `DONE` | 3.1–4.2, AUTH-01/TENANT-01 | Exponer endpoints protegidos y validación HTTP | `backend/src/modules/routes/presentation/routes.controller.ts`; `backend/src/modules/routes/routes.module.ts`; `backend/src/app.module.ts` | V5; 400/401/403/404/409 y prefijo/versionado correctos | DTOs de validación, RoutesController con 6 endpoints, routes-http-errors, RoutesModule y 41 tests unitarios aprobados |
| 5.2 | 5. API e integración | `USER` | `DONE` | 5.1 | Demostrar flujo planificar → preparar → iniciar y contingencias | `backend/test/route-lifecycle.e2e-spec.ts`; `backend/test/routes-http.e2e-spec.ts`; `backend/test/integration/route-01.cjs` | V6; CA-01/05–14 con RLS, rollback y concurrencia reales | 2 suites, 23 tests E2E aprobados en runner route-01 con PostgreSQL 17 / PostGIS y RLS sls_app |
| 6.1 | 6. Verificación y cierre | `USER` | `DONE` | Todos los anteriores | Reconciliar evidencia, ADR, informe y tablero | `docs/modules/route-01-report.md`; `docs/plans/route-01.md`; `AGENTS.md` | V7; CA-01–15 e ítems de cierre satisfechos | Informe route-01-report.md generado, ADR-006 actualizado, AGENTS.md sincronizado, suites completas y build limpios |

### Paso 1.1 — Preflight y decisiones

**Archivos:** `docs/plans/route-01.md`; crear `docs/adr/006-route-lifecycle-and-stop-iterator.md`. Consultar `AGENTS.md`, `docs/plans/auth-01.md`, `docs/plans/tenant-01.md` y contratos enumerados en fuentes.

**Debe aplicar el usuario:** comprobar cambios locales, crear o continuar `feature/route-01` sin sobrescribir trabajo; revisar el ADR propuesto más abajo con Vivian/Santiago y coordinar AUTH/TENANT con Juanangel. Fijar cancelación, interrupción, presencia en depósito, snapshot del replay y matriz de permisos. Ejecutar V0 y registrar fecha/base/suites reales. No copiar 55/442 como resultado nuevo.

**Salida:** contrato adoptado o divergencias concretas registradas; definir quién entrega la autenticación. El núcleo puede avanzar con dobles; la exposición operativa no puede declararse terminada sin esa dependencia.

**Lote mecánico posible:** actualizar documentos y enlaces. **Pendiente/evidencia:** revisión conceptual y entorno aún pendientes; solo existe auditoría inicial.

### Paso 1.2 — Contratos y pruebas de comportamiento

**Archivos nuevos:**

- `backend/src/modules/routes/domain/route-state.ts`, `route-stop-state.ts`, `route-errors.ts`, `route.repository.ts`.
- `backend/src/modules/routes/application/route-contracts.ts`.
- `backend/src/modules/routes/application/ports/route-lifecycle-unit-of-work.ts`, `route-access.port.ts`, `route-resources.port.ts`.
- `backend/src/modules/routes/test/fixtures/route.fixtures.ts`, `route.spec.ts`, `route-stop-iterator.spec.ts`, `routes-architecture.spec.ts`, `route-state-compatibility.spec.ts`.
- `backend/tsconfig.routes.json`, configuración estricta acotada al nuevo módulo, sus tests y dependencias alcanzables.

**Debe aplicar el usuario:** definir comandos/resultados inmutables y errores discriminados; contexto puro `{tenantId, actorUserId, correlationId}` sin importar `shared/presentation`. Definir puertos de autorización, recursos y UoW sin `PrismaClient`, DTOs ni Nest. Crear fixtures con dos tenants, dos mensajeros, paquetes en estados incompatibles y paradas fuera de orden. Escribir oráculos de CA y pruebas de arquitectura antes de implementar comportamiento.

**Salida:** contratos expresan responsabilidades y suites llegan a aserciones de comportamiento en fase roja; imports inexistentes por sí solos no constituyen evidencia. V1/V7 comprueban tipos/arquitectura cuando existan las implementaciones mínimas.

**Lote mecánico posible:** scaffolding o normalización de fixtures solo si se solicita expresamente y el mapa de cambios está definido. **Pendiente:** todos los contratos son propuestas hasta este paso.

### Paso 2.1 — Agregado y ciclo de vida

**Archivos nuevos/modificados:** `backend/src/modules/routes/domain/route.ts`, `route-stop.ts`, `route-state.ts`, `route-stop-state.ts`, `route-errors.ts`, `events/route-lifecycle.event.ts`; pruebas `test/route.spec.ts`, `test/route-state-compatibility.spec.ts`, `test/routes-architecture.spec.ts` del mismo módulo.

**Debe aplicar el usuario:** implementar reconstitución validada y operaciones controladas `prepare`, `start`, `cancel`, `interrupt`; guardar colección privada de paradas y eventos. Conservar `PLANNING_FAILED` en tipos/lecturas. Aceptar agregados vacíos para lectura de borradores, pero rechazar preparación vacía. Representar recursos y paquetes mediante snapshots/puertos, sin consultas dentro del dominio. La aplicación decide cuándo obtenerlos y comprueba las precondiciones antes de invocar la transición.

**Salida:** matriz de transiciones y estados inválidos cubierta, sin setter público de estado y sin eventos por una operación rechazada. V1 verifica CA-02/03. **Lote mecánico posible:** exports/wiring ya acordados. **Pendiente:** persistencia no demostrada por esta fase.

### Paso 2.2 — Iterator completo

**Archivos nuevos:** `backend/src/modules/routes/domain/route-stop-iterator/route-stop-iterator.ts`, `ordered-route-stop.iterator.ts`, `pending-route-stop.iterator.ts`, `failed-route-stop.iterator.ts`. Modificar `backend/src/modules/routes/domain/route.ts` y `backend/src/modules/routes/test/route-stop-iterator.spec.ts`.

**Debe aplicar el usuario:** implementar exactamente la interfaz y factorías del diseño; copiar defensivamente valores de entrada y salida, mantener cursores independientes y no renumerar filtros. Reutilizar la idea del prototipo, no sus tipos sin tenant ni su copia superficial. Cubrir las variantes con la misma batería contractual y casos propios de filtro.

**Salida:** V1 demuestra orden, vacío, current/reset/agotamiento, aislamiento de cursores y resistencia a mutaciones. **Lote mecánico posible:** replicar fixtures/casos paramétricos ya acordados. **Pendiente:** consumo por detalle en 3.3; una clase sin uso no satisface el patrón.

### Paso 3.1 — Preparación e inicio

**Archivos nuevos:** `backend/src/modules/routes/application/use-cases/prepare-route.use-case.ts`, `start-route.use-case.ts`; `backend/src/modules/routes/test/prepare-route.use-case.spec.ts`, `start-route.use-case.spec.ts`. Completar los puertos del paso 1.2.

**Debe aplicar el usuario:** ejecutar el protocolo transaccional del ADR. Leer paquete por paquete desde el snapshot autorizado, reconstituir `PackageAggregate`, aplicar State y acumular persistencias/eventos; comprobar correspondencia exacta entre paradas, asignaciones y paquetes. Prepare exige confirmación de depósito y start revalida disponibilidad/actor. Usar reloj e IDs inyectables para pruebas. El contrato UoW debe impedir éxito antes del commit.

**Salida:** V2 demuestra estados sincronizados, recursos incompatibles, tenant, permisos, cero escrituras tras rechazo y propagación de fallos. No invocar `TransitionPackageStateService` repetidamente: su repositorio abre commits propios.

**Lote mecánico posible:** registro de providers mediante factories tras fijar contratos. **Pendiente:** probar atomicidad real en 5.2; mocks no la acreditan.

### Paso 3.2 — Contingencias y protección del manifiesto

**Archivos nuevos:** `backend/src/modules/routes/application/use-cases/cancel-route.use-case.ts`, `interrupt-route.use-case.ts`; `backend/src/modules/routes/test/cancel-route.use-case.spec.ts`, `interrupt-route.use-case.spec.ts`.

**Archivos existentes a modificar de forma focalizada:** `backend/src/modules/packages/domain/states/assigned-to-route.state.ts`, `ready-for-dispatch.state.ts`; `backend/src/modules/packages/test/package-state.spec.ts`, `package.aggregate.spec.ts`; `backend/src/modules/assignments/domain/validation.types.ts`, `validation.chain.ts`, `reservation.repository.ts`; `backend/src/modules/assignments/application/assign-package-to-route.service.ts`; `backend/src/modules/assignments/infrastructure/prisma-assignment-reservation.ts`; `backend/src/modules/assignments/test/assignment-validation-chain.spec.ts`, `assign-package-to-route.service.spec.ts`.

**Archivo nuevo de la Chain:** `backend/src/modules/assignments/domain/handlers/route-editability-validation.handler.ts`. Ajustar el contexto que produce `backend/src/modules/route-planning/application/plan-and-assign-routes.service.ts` y sus fixtures en `test/fixtures/assignment-planning.fixtures.ts` cuando el nuevo campo lo requiera.

**Debe aplicar el usuario:** permitir regreso controlado de asignado/listo a pendiente; conservar historia al cancelar; distinguir interrupción sin liberar reservas. Añadir a la política de asignación los estados de ruta origen/destino leídos bajo bloqueo y rechazar escrituras del manifiesto fuera de `PLANNED` en el flujo operativo actual. Canalizar también `AssignmentReservationRepository.reserve()` por el contrato validado o dejarla como primitiva no pública: no debe eludir la Chain. El adaptador aporta los datos, la política/servicio decide; no añadir otra regla de negocio dentro de Prisma. Conservar el orden probado de los handlers y actualizar su prueba de interrupción temprana.

**Salida:** V2 confirma CA-08/09 y ningún escritor público puede añadir paquetes a `READY`, `IN_PROGRESS`, `INTERRUPTED`, `CANCELLED` o `COMPLETED`, ni extraerlos de una ruta congelada hacia otra `PLANNED`. La carrera real y el acceso sin bypass de `reserve()` se demuestran en V6.

**Lote mecánico posible:** propagación del campo ya decidido en fixtures/imports. **Pendiente:** los paquetes devueltos a pendiente quedan para revisión; ASSIGN inicial hoy solo admite `CLASSIFIED`. No prometer recuperación automática sin un caso de uso posterior.

### Paso 3.3 — Consultas con Iterator

**Archivos nuevos:** `backend/src/modules/routes/application/use-cases/get-route-detail.use-case.ts`, `list-routes.use-case.ts`; `backend/src/modules/routes/test/get-route-detail.use-case.spec.ts`, `list-routes.use-case.spec.ts`. Completar `domain/route.repository.ts` y `application/route-contracts.ts`.

**Debe aplicar el usuario:** obtener un snapshot consistente por tenant, aplicar alcance de actor y construir las paradas del detalle recorriendo `route.createIterator()`. Listar mediante proyecciones sin cargar todos los agregados; aplicar filtros/orden/límites del ADR. No exponer instancias Prisma ni la colección privada. Incluir conteos de paradas útiles sin presentarlos como resumen de cierre.

**Salida:** V2 prueba colaboración real con Iterator, permisos, filtros combinados, recursos relacionados del mismo tenant y página vacía. **Lote mecánico posible:** mapeos repetitivos de contratos ya fijados. **Pendiente:** semántica SQL y RLS en fase 4.

### Paso 4.1 — Repositorio y unidad de trabajo

**Archivos nuevos:**

- `backend/src/modules/routes/infrastructure/persistence/prisma-route.repository.ts`, `prisma-route-lifecycle-unit-of-work.ts`, `prisma-route-resources.adapter.ts`, `route-persistence.mapper.ts`.
- `backend/src/modules/routes/test/prisma-route.repository.spec.ts`, `prisma-route-lifecycle-unit-of-work.spec.ts`.
- `backend/src/modules/routes/infrastructure/authorization/auth-route-access.adapter.ts`, implementando el puerto de acceso mediante el contrato público que entregue AUTH/TENANT; integrar en 5.1.
- `backend/src/modules/packages/application/ports/package-state-writer.port.ts`, `backend/src/modules/packages/infrastructure/prisma-package-state-writer.ts`.
- `backend/src/modules/assignments/application/ports/route-assignment.port.ts`, `backend/src/modules/assignments/infrastructure/prisma-route-assignment.adapter.ts`.
- `backend/src/database/run-with-tenant.spec.ts`.

**Archivos a modificar:** `backend/src/database/run-with-tenant.ts`; puertos de ROUTE del paso 1.2 y pruebas de arquitectura para cubrir los nuevos contratos internos.

**Debe aplicar el usuario:** implementar `RouteRepository` con `PrismaRouteRepository`; lecturas públicas mediante `runWithTenant` y escrituras mediante una sesión vinculada a la misma transacción. Ampliar el helper con opciones de aislamiento compatibles con sus llamadores y contexto local parametrizado. La UoW compone adaptadores propiedad de paquetes/asignaciones; solo infraestructura conoce el cliente transaccional. El gateway de recursos ofrece snapshot tenant-aware mientras VEH publique su interfaz; coordinar su propiedad con Vivian.

**Salida:** V3 comprueba filtros tenant en rutas, relaciones, count, escrituras y SQL; mapeo `sequence ↔ stopNumber`; comparación de estado esperado; rollback propagado y retry acotado. No invocar lógica de State/Chain desde los adaptadores.

**Lote mecánico posible:** composición y mapeos cuya política ya esté fijada. **Pendiente:** mocks no prueban RLS, locks ni permisos reales; la fase 5 los verifica.

### Paso 4.2 — Migración y compatibilidad con planificación

**Archivos a modificar:** `backend/prisma/schema/routing.prisma`; `backend/src/modules/route-planning/infrastructure/prisma-planning-assignment-unit-of-work.ts`; `backend/src/modules/route-planning/application/ports/planning-assignment-unit-of-work.ts` y `plan-and-assign-routes.contract.ts` si cambian los contratos; `backend/src/modules/route-planning/presentation/planning-http-errors.ts`; `backend/test/assignment-planning.e2e-spec.ts`; `backend/src/modules/route-planning/test/assign-route-planning.spec.ts` y `route-planning.controller.spec.ts`; `docs/adr/005-transactional-route-assignment.md` solo para documentar el replay original y enlazar ADR-006.

**Migración nueva:** `backend/prisma/migrations/<timestamp>_route_lifecycle/migration.sql`. Es la única ruta cuyo segmento se genera por Prisma; sustituir este marcador en plan/informe por el nombre real al generarla. No editar migraciones aplicadas.

**Debe aplicar el usuario:** añadir `RoutePlanningRequest.resultSnapshot Json?`, persistir el resultado original de `completeRequest` y leerlo al repetir la solicitud. Para registros previos sin snapshot, aplicar la política de legado del ADR; nunca devolver IDs vacíos. Ajustar la selección de disponibilidad para que una ruta todavía `IN_PROGRESS/INTERRUPTED` siga ocupando recursos aunque haya vencido su ventana, como establece D3. Añadir índices tenant/fecha/estado/mensajero justificados por las consultas. Revisar grants/RLS existentes para todas las escrituras, incluidas AuditLog y OutboxEvent; no asumir que una migración de esquema concede permisos.

Mapear `PLANNING_RESULT_UNAVAILABLE` a HTTP 409 y probarlo; el mapper actual no reconoce ese nuevo código. No poblar automáticamente `serviceDate`: existe un índice parcial histórico de vehículo/día que puede impedir rutas sucesivas incluso completadas. El contrato de filtros propuesto no necesita alterar esa semántica.

**Salida:** V4 valida/genera; V6 aplica migraciones en base desechable y prueba ruta histórica, replay postcancelación, ausencia de duplicados y compatibilidad ASSIGN/State. **Lote mecánico posible:** registro del nombre generado, enlaces y propagación determinista de tipos. **Pendiente:** inspeccionar datos y revisar SQL antes de aplicar a un entorno compartido; no usar reset.

### Paso 5.1 — Presentación, permisos y composición

**Archivos nuevos:** `backend/src/modules/routes/presentation/routes.controller.ts`, `routes-http-errors.ts`, `routes-authorization.guard.ts`; DTOs `presentation/dto/route-id.dto.ts`, `list-routes.dto.ts`, `prepare-route.dto.ts`, `start-route.dto.ts`, `cancel-route.dto.ts`, `interrupt-route.dto.ts`, `route-response.dto.ts`; `backend/src/modules/routes/routes.module.ts`; `backend/src/modules/routes/test/routes.controller.spec.ts`, `routes.module.spec.ts`, `routes-dto.spec.ts`.

**Archivos existentes a integrar:** `backend/src/app.module.ts`; `backend/src/shared/presentation/request-context.decorator.ts`; `backend/src/modules/zones/test/current-tenant.decorator.spec.ts`; `backend/src/modules/route-planning/test/route-planning.controller.spec.ts`; `backend/test/zone-catalogs.e2e-spec.ts`, que actualmente depende de cabeceras de tenant y debe pasar a identidad verificada. Agregar `backend/src/shared/presentation/request-context.decorator.spec.ts` para identidad y correlación estrictas si no se ha creado desde TENANT-01. Reutilizar los fixtures de autenticación que entregue AUTH en estas pruebas, sin otra vía de login exclusiva de ROUTE.

**Debe aplicar el usuario:** consumir autenticación y autorización entregadas por AUTH/TENANT; la guarda local es adaptación al contrato real, no otra autenticación. Quitar el fallback de tenant/actor por cabeceras en la ruta compartida acordada; actualizar pruebas dependientes que lo asumían. `@CurrentContext()` entrega contexto ya verificado. Aplicación recibe su tipo puro. DTOs aceptan `unknown`, validan y construyen comandos; una interfaz TypeScript o un decorador sin guardas no valida solicitudes.

Registrar seis endpoints, factories de casos de uso y puertos explícitos. Mantener `main.ts` como configuración de prefijo/versionado; no duplicar `/api/v1`. No añadir dependencias de validación solo por imitar otra arquitectura: usar validadores runtime explícitos o justificar una librería en este paso.

**Salida:** V5 verde y contrato AUTH integrado. Si solo existen dobles de identidad, registrar `TESTING` y la dependencia pendiente; no declarar HTTP operativo seguro. **Lote mecánico posible:** imports/providers/DTOs repetitivos ya acordados. **Pendiente:** aprobación de comportamiento con pruebas HTTP reales en 5.2.

### Paso 5.2 — E2E, concurrencia y aislamiento real

**Archivos nuevos:** `backend/test/route-lifecycle.e2e-spec.ts`, `routes-http.e2e-spec.ts`, `fixtures/route-lifecycle.fixtures.ts`, `integration/route-01.cjs`.

**Archivos a modificar:** `backend/package.json`, `Makefile`, `backend/test/integration/README.md`; `backend/test/assignment-planning.e2e-spec.ts` y `assignment-reservation.e2e-spec.ts` para regresiones del manifiesto y replay.

**Debe aplicar el usuario:** añadir `test:route-01` con `npm run build && node test/integration/route-01.cjs` y `route-01` a `INTEGRATION_TESTS`. El runner crea una base aleatoria `sls_route01_<uuid>` en el servidor dedicado, aplica migraciones, usa `sls_app` para operaciones runtime y elimina la base en `finally`. Verifica que DATABASE_URL/RUNTIME_DATABASE_URL apuntan a esa base; falla si no hay configuración segura. Ejecuta las dos suites nuevas y la regresión `test/zone-catalogs.e2e-spec.ts` adaptada a autenticación real, secuencialmente y sin convertir pruebas omitidas en éxito. El usuario de administración solo prepara fixtures/migraciones, nunca atiende peticiones de prueba.

Cubrir dos tenants, mensajero ajeno del mismo tenant, flota inactiva/en mantenimiento/sin turno/ocupada, ruta vacía, paquetes inconsistentes, fallos inducidos y carreras con dos conexiones. El test HTTP usa Nest real, prefijo/versionado y autenticación real; los dobles son válidos para unitarias, no como prueba final de autenticación. Usar Failed/Pending con fixtures, sin implementar entregas.

**Salida:** V6 verde, con evidencia de rollback, concurrencia, RLS y preservación del endpoint de planificación. **Lote mecánico posible:** runner a partir del patrón existente, una vez fijados destinos y suites. **Pendiente:** ningún conteo esperado se inventa; registrar resultados obtenidos y casos omitidos.

### Paso 6.1 — Verificación final, informe y cierre

**Archivos:** `docs/plans/route-01.md`; crear `docs/modules/route-01-report.md` desde la plantilla del skill, con enlace de vuelta al plan; actualizar `docs/adr/006-route-lifecycle-and-stop-iterator.md`, `docs/modules/mvp-implementation-report.md`, `docs/plans/mvp-implementation.md` y la fila ROUTE-01 de `AGENTS.md` solo tras verificar aceptación. Reconciliar ITER-01 como patrón integrado, sin declarar DELIVERY/CLOSE terminados.

**Debe aplicar el usuario:** ejecutar V7 y consolidar V6; completar matriz CA → test → resultado, resumen por paso, cambios de esquema, datos legado, permisos y pasos operativos. ADR-006 solo pasa a aceptado cuando la decisión se adopta; el plan solo pasa a `DONE` cuando satisface el cierre. Separar implementado, verificado, documentado y confirmado en commit.

**Salida:** todas las casillas de cierre tienen evidencia; sin pendientes de autenticación ocultos. **Lote mecánico posible:** documentación/evidencia y formato acotado cuando se autorice; sin lógica ni commits implícitos. **Pendiente:** cierre completo del módulo.

### Comandos de verificación reproducibles

Ejecutar desde la raíz. Herramientas de aplicación exclusivamente dentro de Compose. Estos comandos son futuros; no son resultados de esta auditoría. Si un servicio está detenido, usar `docker compose run --rm backend <comando>` cuando proceda, conservando el mismo aislamiento de pruebas.

**V0 — Preflight y línea base:**

```bash
git status --short --branch
git log -1 --oneline
docker compose ps
# Si los servicios requeridos no están disponibles:
docker compose up -d --build
docker compose exec backend npm test -- --runInBand
docker compose exec backend npm run build
```

**V1 — Dominio/Iterator/arquitectura:**

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/routes/test/route.spec.ts src/modules/routes/test/route-stop-iterator.spec.ts src/modules/routes/test/route-state-compatibility.spec.ts src/modules/routes/test/routes-architecture.spec.ts
```

**V2 — Aplicación y State/Chain afectados:**

```bash
docker compose exec backend npm test -- --runInBand modules/routes/test modules/packages/test modules/assignments/test modules/route-planning/test/assign-route-planning.spec.ts
```

**V3 — Contratos de persistencia y helper tenant:**

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/database/run-with-tenant.spec.ts src/modules/routes/test/prisma-route.repository.spec.ts src/modules/routes/test/prisma-route-lifecycle-unit-of-work.spec.ts src/modules/routes/test/routes-architecture.spec.ts
```

**V4 — Prisma:**

```bash
docker compose exec backend npx prisma validate --config prisma7.config.ts
docker compose exec backend npx prisma generate --config prisma7.config.ts
```

Generar la migración únicamente contra un entorno **de desarrollo desechable previamente provisionado**, con capacidad de crear su shadow database. Configurar `SLS_ROUTE_DEV_DATABASE_URL` para ese destino; el comando falla antes de ejecutarse si falta la variable:

```bash
docker compose exec -e DATABASE_URL="${SLS_ROUTE_DEV_DATABASE_URL:?Configura la URL de desarrollo desechable}" backend npx prisma migrate dev --create-only --name route_lifecycle --config prisma7.config.ts
```

No usar la base compartida ni aceptar un reset. Registrar las rutas reales y revisar el SQL antes de aplicarlo. El runner V6 aplica las migraciones mediante `migrate deploy` únicamente sobre su base aleatoria; no necesita `migrate dev` ni shadow database para la ejecución habitual de tests.

**V5 — Presentación/composición y regresión HTTP unitaria:**

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/routes/test/routes.controller.spec.ts src/modules/routes/test/routes.module.spec.ts src/modules/routes/test/routes-dto.spec.ts src/shared/presentation/request-context.decorator.spec.ts src/modules/zones/test/current-tenant.decorator.spec.ts src/modules/route-planning/test/route-planning.controller.spec.ts
```

**V6 — Integración real, secuencial:**

```bash
# Disponible después de registrar el runner del paso 5.2.
# Make delega todas las herramientas de aplicación a Docker Compose.
make integration-test TEST=route-01
make integration-test TEST=assign-01
make integration-test TEST=gdb-01
make integration-test TEST=gdb-06
make integration-db-down
```

No ejecutar estos runners en paralelo: las migraciones administran roles a nivel de servidor. No usar el servidor compartido SLS. Para un servidor de pruebas externo, el equivalente es `docker compose exec -e GDB_TEST_ADMIN_URL backend npm run test:route-01` después de configurar esa variable sin imprimir credenciales. El README actual omite `assign-01` en su lista aunque Makefile ya lo admite; corregir esa documentación en 5.2.

No usar `npm run test:e2e` indiscriminadamente con variables del entorno compartido: hay suites existentes sin exigencia de base aleatoria. El nuevo runner selecciona las suites y comprueba su destino.

**V7 — Cierre funcional y estilo proporcional:**

```bash
docker compose exec backend npm run build
docker compose exec backend npx tsc --noEmit --incremental false -p tsconfig.routes.json
docker compose exec backend npm test -- --runInBand
docker compose exec backend npx eslint "src/modules/routes/**/*.ts" test/route-lifecycle.e2e-spec.ts test/routes-http.e2e-spec.ts
docker compose exec backend npx prettier --check "src/modules/routes/**/*.ts" test/route-lifecycle.e2e-spec.ts test/routes-http.e2e-spec.ts
git diff --check
git status --short
```

Ampliar la lista de archivos de estilo a los archivos compartidos realmente modificados; no ejecutar el script `npm run lint` con `--fix` durante revisión. Formato acotado satisface AGENTS.md §§21/25, no constituye otra fase. Si strict revela deuda importada, documentarla y resolver el límite de manera focalizada; no ocultarla con `any` o desactivando strict. No repetir todas las suites por cambios exclusivamente documentales/de formato sin un riesgo nuevo.

## Diseño arquitectónico y propuesta de ADR

### ADR-006: Ciclo de vida operativo de rutas y navegación de paradas mediante Iterator

**Título:** Ciclo de vida operativo de rutas y navegación de paradas mediante Iterator.

**Estado:** Propuesto; se adoptará en el paso 1.1, no es una decisión ya implementada.

**Fecha:** 2026-10-05.

**Destino:** `docs/adr/006-route-lifecycle-and-stop-iterator.md`.

**Contexto:** ASSIGN-01 persiste rutas y reservas, pero faltan operaciones para pasar de planificación a ejecución. Preparar o iniciar solo la ruta dejaría paquetes incoherentes. Cancelar puede romper historial/replay y liberar flota indebidamente. El prototipo Iterator no satisface todos los recorridos ni encapsula sus objetos. Las capas HTTP existentes todavía no garantizan identidad confiable.

**Decisión propuesta:** adoptar las reglas D1–D8 siguientes como contrato conjunto de ROUTE, paquetes, asignaciones y presentación.

### D1. Propiedad y dependencias

```text
RoutesController + contexto autenticado/guardas
  -> caso de uso puro
       -> Route + Iterator + políticas de acceso/recursos
       -> PackageAggregate / State (contrato público de packages)
       -> RouteLifecycleUnitOfWork / RouteRepository (puertos)
            <- adaptadores Prisma de rutas/paquetes/asignaciones
                 -> una transacción PostgreSQL con tenant local

RoutesModule compone providers mediante factories.
Presentation -> Application -> Domain
Infrastructure -> Application/Domain
```

`RouteRepository` pertenece al dominio de rutas y define recuperación/persistencia de agregados y proyecciones puras necesarias para consulta. La UoW pertenece a aplicación y proporciona una sesión con ese repositorio y puertos de paquetes/asignaciones/recursos/auditoría/outbox. No expone clientes transaccionales. Los adaptadores propietarios traducen estado persistido; las reglas y el flujo permanecen dentro de aplicación/dominio.

`PrismaRouteRepository` usa `runWithTenant` en lecturas independientes. Dentro de una UoW recibe el cliente ya vinculado a la transacción; sus métodos de sesión no vuelven a abrir `runWithTenant`. Los nuevos puertos de paquetes/asignaciones se diseñan para reutilización, sin invocar los adaptadores previos que hacen commits propios. No se crean módulos globales ni ciclos entre routes y route-planning.

El test de arquitectura recorre capas completas, imports de tipo, reexports y dependencias locales relevantes; rechaza Prisma generado, Nest y HTTP en ambos niveles internos. No basta inspeccionar nombres de archivos o unos pocos imports directos.

### D2. Modelo e Iterator

- `Route`: identidad tenant, planningRequestId, vehicleId, courierId, depotId, ventana planificada, estado, timestamps, colección privada de paradas y eventos pendientes.
- `RouteStop`: id, tenantId, routeId, `stopNumber`, coordenadas y estado; valores inmutables/copiados. Asociaciones históricas con paquetes se obtienen de Assignment, sin asumir una columna `packageId` en RouteStop.
- `stopNumber` es entero positivo; una ruta operativa conserva exactamente `1..N`, sin duplicados ni huecos. Mapeo único en infraestructura desde `sequence`; en el HTTP nuevo se documenta `stopNumber`. El endpoint de planificación conserva `sequence` por compatibilidad.
- Inconsistencias de tenant, pertenencia o secuencia se rechazan explícitamente; no usar un desempate por ID para ocultar duplicados inválidos. Una ruta histórica defectuosa no se puede preparar ni iniciar hasta corregirla mediante un procedimiento auditable.
- `RouteState` conserva `DRAFT`, `PLANNING`, `PLANNED`, `READY`, `IN_PROGRESS`, `COMPLETED`, `PLANNING_FAILED`, `INTERRUPTED`, `CANCELLED`. La prueba de compatibilidad compara tipos puros y Prisma desde tests, nunca mediante import de Prisma en dominio.

```ts
export interface RouteStopIterator {
  hasNext(): boolean;
  next(): RouteStop | null;
  current(): RouteStop | null;
  reset(): void;
}

// Métodos del agregado Route:
createIterator(): RouteStopIterator;
createPendingIterator(): RouteStopIterator;
createFailedIterator(): RouteStopIterator;
```

Ordered recorre `stopNumber` ascendente. Pending selecciona `PENDING`; Failed selecciona `FAILED`. Ambos conservan orden y números originales: una selección `2,5` no se renumera a `1,2`. El Iterator consume el orden calculado por SEQ-01; no calcula rutas ni distancias.

`current()` es la última parada entregada por un `next()` exitoso. Al crear/resetear está en `null`. `hasNext()` no mueve el cursor. Al agotarse, `next()` devuelve `null` y `current()` conserva la última parada entregada; en un recorrido vacío ambos dan `null`. `reset()` vuelve al inicio del mismo snapshot, no consulta la base ni refresca estados. Cada factoría entrega cursor y snapshot independientes. Cambios posteriores requieren crear un Iterator nuevo.

Copiar/congelar la colección y los objetos; `readonly` TypeScript o una copia superficial del array no impiden mutación runtime. Las respuestas no exponen objetos vivos del agregado.

**Fixture contractual:** entrada `[S3(PENDING), S1(COMPLETED), S2(FAILED)]` con números 3,1,2 produce Ordered `[S1,S2,S3]`, Pending `[S3]`, Failed `[S2]`. Probar cero/una/múltiples coincidencias, cursor antes/después/reset, hasNext repetido, dos iteradores intercalados, mutación de array/objetos de entrada y salida y snapshot ante cambios posteriores.

### D3. Transiciones y recursos

| Operación | Ruta origen → destino | Paquetes/asignaciones | Evento y condición |
| --- | --- | --- | --- |
| Preparar | `PLANNED → READY` | Todos los paquetes de asignaciones activas: `ASSIGNED_TO_ROUTE → READY_FOR_DISPATCH`; conservar asignaciones activas | `RoutePrepared`; manifiesto válido, recursos disponibles y confirmación en depósito |
| Iniciar | `READY → IN_PROGRESS` | Todos: `READY_FOR_DISPATCH → IN_TRANSIT`; conservar reservas; escribir `startedAt` con reloj servidor | `RouteStarted`; mensajero asignado, recursos revalidados y ventana vigente |
| Cancelar | `PLANNED/READY → CANCELLED` | Paquetes asignados/listos → `PENDING_ASSIGNMENT`; Assignment `ACTIVE → CANCELLED`, `endedAt`, actor/motivo; conservar relaciones históricas | `RouteCancelled`; antes de salida, motivo obligatorio |
| Interrumpir | `IN_PROGRESS → INTERRUPTED` | Conservar estados actuales de paquetes, paradas y asignaciones activas | `RouteInterrupted`; motivo obligatorio, flota sigue ocupada |

Toda otra transición de estos comandos se rechaza. `IN_PROGRESS → CANCELLED`, reanudación, cierre y mutación directa del estado no se habilitan. Las transiciones posteriores de paquetes quedan bajo State/DELIVERY. No cambiar un paquete ya entregado por una interrupción futura.

Preparar exige al menos una asignación activa, correspondencia exacta con paradas y paquetes del manifiesto, sin paquetes repetidos, peso/volumen coherentes y todas las relaciones del mismo tenant. Validar vehículo y mensajero `ACTIVE`, vehículo fuera de mantenimiento, turnos que cubran la ventana planificada y ausencia de rutas incompatibles. Excluir la propia ruta al comprobar ocupación; su reserva previa no es un conflicto contra sí misma. La validación usa cantidades canónicas exactas ya adoptadas por ASSIGN.

Al iniciar, volver a comprobar estado, membresía, recursos, turnos y disponibilidad: la validación al preparar no garantiza que sigan vigentes. Propuesta de tiempo: `plannedStartAt <= now < plannedEndAt`; desviaciones requieren corrección explícita de planificación, sin extender turnos silenciosamente. Los intervalos de ocupación usan `[inicio, fin)`; una ruta todavía `IN_PROGRESS`/`INTERRUPTED` bloquea el recurso aunque haya vencido su fin previsto. Añadir regresión al selector de recursos de ASSIGN si actualmente solo evalúa solapamiento de ventanas.

«En depósito» se acredita mediante `depotConfirmed: true` en preparación y auditoría `{depotId, confirmedByUserId, confirmedAt}` con actor y hora del servidor. La base valida existencia/tenant de Depot y disponibilidad planificada; no verifica ubicación física. `false` o ausencia rechazan preparación. No introducir GPS para cubrir esta precondición.

Cancelar libera la ocupación derivada de la ruta y sus asignaciones; no cambia `Vehicle.status` de mantenimiento a activo ni elimina turnos. Interrumpir no libera flota ni convierte pendientes en entregas fallidas. Registrar avería como motivo no implementa todavía un módulo de incidentes.

El manifiesto se congela en `READY`. Cualquier operación que cree/cierre/mueva Assignment debe bloquear/revalidar el estado de ruta dentro de su transacción. Si el escritor previo termina una asignación en otra ruta, comprobar tanto origen como destino y bloquear ambas por ID ordenado; no autorizar quitar un paquete de una ruta congelada solo porque el destino sea editable. Si esa ruta de origen se descubre después de bloquear paquetes, abortar/reintentar el protocolo completo en el orden correcto. No basta una comprobación HTTP anterior. La extensión de la Chain del paso 3.2 protege el escritor anterior, y la cancelación modifica el manifiesto por su caso de uso específico y atómico.

### D4. Protocolo de atomicidad, concurrencia y repetición

1. Validar forma del comando y contexto; resolver permisos sin confiar en IDs del cliente como autorización.
2. Abrir una sola transacción `SERIALIZABLE` mediante la UoW y establecer `app.tenant_id` local usando el rol runtime `sls_app`.
3. Bloquear la ruta del tenant; obtener sus asignaciones y bloquear paquetes por ID, vehículo y mensajero en orden determinista. Volver a leer/verificar pertenencia y estados dentro del snapshot transaccional.
4. Mantener un orden común: RoutePlanningRequest cuando aplique → rutas existentes por ID → paquetes por ID → vehículos por ID → mensajeros por ID. ASSIGN crea rutas nuevas, por lo que no bloquea una ruta preexistente; ningún escritor puede tomar esos locks en orden inverso. Revisar el escritor previo y probar carreras, no asumir que SERIALIZABLE elimina deadlocks.
5. Aplicación valida política y ejecuta métodos de Route y `PackageAggregate.transitionTo`; acumula cambios y extrae eventos una vez.
6. Persistir con tenant y estado esperado: ruta, paquetes, Assignment cuando corresponda, PackageStatusHistory, AuditLog y OutboxEvent. Exigir cantidad de filas esperada; cero filas indica conflicto, nunca éxito silencioso.
7. Commit; solo después devolver éxito HTTP. Cualquier fallo aborta todo. No realizar llamadas de red ni publicar RabbitMQ durante el callback.

Los turnos y ocupaciones leídos durante la validación quedan cubiertos por la transacción; sus escritores deben seguir el protocolo de recursos. La prueba concurrente debe cubrir también cambio de turno/estado de flota durante prepare/start, detectando conflictos mediante locks o serialización.

Reintentar únicamente conflictos transitorios `P2034`, `40001` o `40P01`, hasta tres intentos totales con espera acotada; cada intento reconstituye agregados y relee datos. No reintentar errores de dominio, validación o permisos. Tras agotar serialización devolver conflicto estable; una indisponibilidad de base se mapea separadamente a error temporal. No conservar eventos en memoria entre intentos fallidos.

Contrato de repetición de comandos operativos: un segundo prepare/start/cancel/interrupt con la ruta ya fuera de su estado origen devuelve `409 ROUTE_STATE_CONFLICT` sin repetir efectos. No se promete replay idempotente exitoso ni se añade otra tabla de idempotencia por defecto. Dos solicitudes simultáneas deben producir una sola transición, historia y conjunto de eventos.

### D5. Historial, eventos y compatibilidad de ASSIGN

Auditar las cuatro operaciones con tenant, actor, ruta, origen/destino, motivo, hora y correlación; las contingencias exigen motivo no vacío. AuditLog conserva la historia de ruta; no crear RouteStatusHistory solo para duplicarla. Los paquetes conservan PackageStatusHistory y los eventos de State. No reescribir el responsable original de una Assignment al cancelar: guardar actor de cancelación en auditoría junto con los IDs afectados y mantener su procedencia.

Envelope mínimo de cada evento: `eventId`, `tenantId`, `correlationId`, `eventType`, `occurredAt`, `producer`, `version: 1`, `payload`. Ruta usa `producer: routes`; paquete conserva su productor/contrato. Guardar `producer` y envelope donde corresponda dentro del JSON outbox si no existen columnas dedicadas; no omitir campos porque Prisma tenga defaults. Payload de ruta: routeId, estado anterior/nuevo, IDs de recursos y cantidad de paquetes; motivos mediante código, sin direcciones, teléfonos ni texto libre sensible. AuditLog puede guardar una explicación limitada y validada.

Prepare/start producen un evento de ruta y los eventos de cada transición de paquete; cancel además los de regreso a pendiente; interrupt solo su evento de ruta si ningún paquete cambió. Todos comparten tenant/correlación y el commit. No prometer exactly-once ni entrega al broker; aquí se garantiza persistencia atómica local.

`RoutePlanningRequest.resultSnapshot` guarda el resultado original de planificación dentro del mismo commit que `COMPLETED`. Replay compara los parámetros como hoy y devuelve ese snapshot con `replayed: true`, sin reconstruirlo desde recursos mutables. El `PLANNED` del resultado histórico describe el momento de planificación; `GET /routes/:id` es la fuente del estado actual.

Para solicitudes anteriores sin snapshot: reconstruir solo si PlanningPackageResult y Assignment históricos, acotados a tenant/solicitud/ruta/parada, identifican inequívocamente el resultado original. Incluir asignaciones terminadas/canceladas y validar unicidad; no seleccionar cualquier `INITIAL` ni rellenar faltantes con `''`. Si falta evidencia, devolver `409 PLANNING_RESULT_UNAVAILABLE` y registrar la necesidad de conciliación. No recalcular ni reasignar. Cualquier backfill es explícito, revisado y verificable. Probar legado reconstruible y ambiguo.

### D6. Consultas y contrato HTTP v1

| Endpoint | Caso de uso | Entrada y respuesta propuesta | Autorización |
| --- | --- | --- | --- |
| `GET /api/v1/routes` | `ListRoutesUseCase` | `page=1`, `pageSize=20` (máx. 100), `from`, `to`, `zoneId`, `state`, `courierId`; 200 `{items,page,pageSize,total}` | Coordinador/admin: tenant; mensajero: propias |
| `GET /api/v1/routes/:id` | `GetRouteDetailUseCase` | UUID; 200 con ruta, vehículo, mensajero, ventana y paradas ordenadas, asignaciones/paquetes autorizados | Coordinador/admin: tenant; mensajero: propia |
| `POST /api/v1/routes/:id/prepare` | `PrepareRouteUseCase` | `{depotConfirmed:true}`; 200 con routeId, estado, cantidad de paquetes actualizados y correlationId | Coordinador o admin con permiso explícito |
| `POST /api/v1/routes/:id/start` | `StartRouteUseCase` | Cuerpo vacío; 200 con routeId, estado, startedAt, cantidad y correlationId | Mensajero cuyo Courier.userId coincide con actor |
| `POST /api/v1/routes/:id/cancel` | `CancelRouteUseCase` | `{reasonCode, reason?}`; 200 con routeId, estado, cantidad liberada y correlationId | Coordinador o admin con permiso explícito |
| `POST /api/v1/routes/:id/interrupt` | `InterruptRouteUseCase` | `{reasonCode, reason?}`; 200 con routeId, estado y correlationId | Mensajero asignado o coordinador autorizado |

El endpoint interrupt es la extensión mínima propuesta para hacer utilizable la contingencia exigida, además de los cinco endpoints explícitos del encargo. No existe todavía. No añadir start delegado del coordinador ni acceso de superadministrador implícito.

Usar `@CurrentContext()`; nunca aceptar tenantId, actorUserId, estados destino o timestamps autoritativos en body/query. Los UUID de ruta y filtros son referencias, no permisos. El actor se resuelve desde identidad verificada. Una correlación de cabecera puede aceptarse como metadato solo si es UUID válido; si falta, generar UUID. Nunca usarla como identidad. Body con campos prohibidos/desconocidos produce 400.

La autorización coarse-grained se obtiene del contrato AUTH; la pertenencia al tenant/mensajero se verifica también dentro del caso de uso mediante puerto de acceso y snapshot autoritativo. Mensajero no puede ampliar alcance con `courierId`; uno diferente del propio se rechaza. En acceso por ID, fuera del alcance del actor se responde igual que recurso inexistente (404); falta del permiso para una acción produce 403 sin inspeccionar recursos ajenos.

Listar por `plannedStartAt` en `[from,to)`; fechas ISO-8601 con offset, `from < to`. Ambos extremos son opcionales individualmente y se validan cuando estén presentes. Orden fijo `plannedStartAt ASC NULLS LAST, id ASC`. Rutas sin fecha solo aparecen si no hay filtro temporal. No interpretar silenciosamente una fecha sin zona horaria. La UI puede convertir un día local al intervalo adecuado.

Zona significa zona del comando de planificación, a través de `planningRequest.parameters.zoneId` validado y relacionado por tenant; no zona mutable de paquetes ni asignaciones activas. Un legado sin zona no coincide con ese filtro. Paginación/total usan los mismos predicados y una lectura consistente; página válida sin resultados devuelve items vacío y total correcto. Validar page positivo, pageSize 1–100, state del enum y UUIDs. Detalle omite datos personales no necesarios y credenciales del User del mensajero.

Errores públicos estables: `400 VALIDATION_ERROR`; `401 UNAUTHENTICATED`; `403 FORBIDDEN`; `404 ROUTE_NOT_FOUND`; `409 ROUTE_STATE_CONFLICT`, `ROUTE_MANIFEST_INVALID`, `ROUTE_RESOURCE_UNAVAILABLE`, `ROUTE_CONCURRENCY_CONFLICT`; `503 ROUTE_STORAGE_UNAVAILABLE` para indisponibilidad transitoria. Errores inesperados se registran con correlación y se responden sin detalles internos; no se convierten en éxito. Fallos del manifiesto/recursos al preparar no van a DLQ ni despachan parcialmente.

### D7. Persistencia y pruebas de integridad

Conservar las FK compuestas, RLS, índice parcial de asignación activa y datos históricos. No cambiar enums para acomodar nombres del prototipo. La migración propuesta es aditiva: snapshot de resultado e índices de consultas operativas; revisar antes los permisos de UPDATE/INSERT requeridos por runtime. No se necesitan columnas de GPS, estado ocupado de vehículo ni `stopNumber` duplicado.

Probar base fresca y datos anteriores a la migración con snapshot nulo; RLS sin contexto/tenant incorrecto; relaciones cruzadas; rollback al escribir segundo paquete, historia, auditoría y outbox; concurrencia con preparación/cancelación/asignación y cambios de recursos; replay sin nueva planificación; consulta de canceladas con asociaciones históricas intactas. Las conexiones runtime nunca usan superusuario/BYPASSRLS.

### D8. Alternativas y consecuencias

| Alternativa evaluada | Motivo de la decisión |
| --- | --- |
| Actualizar ruta y ejecutar después una transición independiente por paquete | Rechazada: admite commits parciales |
| Hacer transición y reglas dentro de Prisma para mantener atomicidad | Rechazada: aplicación decide; la UoW preserva el commit conjunto |
| Retornar el array mutable de paradas o usar solo `Array.filter` desde controlador | Rechazada: rompe encapsulamiento y no demuestra Iterator consumido por aplicación |
| Renombrar `sequence` a `stopNumber` en base y API existente | Rechazada: se adopta mapeo explícito sin romper SEQ/ASSIGN |
| Cancelar envíos al cancelar ruta, o liberar flota al interrumpir | Rechazada: pierde semántica logística y puede sobreasignar recursos en calle |
| Reconstruir todos los replays desde asignaciones activas | Rechazada: estado mutable; usar snapshot original y legado comprobable |
| Duplicar motor de autenticación o aceptar cabeceras como identidad | Rechazada: integrar AUTH/TENANT y fallar sin identidad verificada |

Consecuencias: consistencia transaccional y navegación académicamente demostrable; costo de locks/reintentos, copia de snapshots e integración con State/ASSIGN. La preparación sigue una ventana planificada y presencia declarada por operador; no garantiza tiempos viales ni ubicación física. La API requiere la entrega de identidad real. El cambio de State afecta contratos compartidos y debe coordinarse antes de implementarlo. Las lecturas de estado actual y resultado histórico de planificación quedan diferenciadas explícitamente.

## Paso actual

### Paso 6.1 — Verificación final, informe y cierre completados

**Estado:** `DONE` para el alcance operativo de ROUTE-01 y GoF Stop Iterator. Todos los pasos del plan han sido completados, verificados con 68 suites unitarias (572 tests), 2 suites de integración E2E (23 tests) en PostgreSQL 17 + PostGIS con RLS, suites de regresión aprobadas, build limpio y documentación consolidada en [docs/modules/route-01-report.md](../modules/route-01-report.md).

## Decisiones

Son decisiones adoptadas por el usuario formalizadas en ADR-006:

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-10-05 | Conservar todos los estados Prisma y mapear sequence a stopNumber | Compatibilidad con el repositorio y contrato solicitado | Sin renombrar schema/SEQ |
| 2026-10-05 | Iterator con snapshot defensivo y current como último entregado | Semántica verificable y encapsulamiento | Tres recorridos independientes, no algoritmos de planificación |
| 2026-10-05 | UoW SERIALIZABLE y runWithTenant compatible | Ruta/paquetes/historia/outbox deben confirmar juntos | Extensión focalizada del helper y adaptadores transaccionales |
| 2026-10-05 | Cancelación pre-salida a pendiente; interrupción conserva reservas | Evitar pérdida de envíos y doble uso de flota | Extensión State, protección de escritores y endpoint interrupt |
| 2026-10-05 | Presencia declarada por operador y auditada | No hay ubicación física de recursos | No anunciar GPS ni presencia verificada automáticamente |
| 2026-10-05 | Snapshot durable del resultado de planificación | Replay actual depende de asignaciones activas | Migración aditiva y tratamiento explícito del legado |
| 2026-10-05 | Identidad real como condición de cierre HTTP | Decorador actual admite cabeceras/fallback | Coordinación AUTH/TENANT; no cerrar con mocks de autenticación |
| 2026-10-05 | Filtros por plannedStartAt y zona del snapshot | serviceDate no se rellena y Route no tiene zoneId | Contrato temporal/legado explícito, sin nueva regla de vehículo/día |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-10-05 | Auditoría inicial | Árbol limpio en develop; ASSIGN y API presentes; ROUTE ausente; prototipo Iterator histórico localizado | Lectura de AGENTS completo, skill/plantilla, código, esquemas, migraciones, docs, scripts y refs locales; 55/442 solo como evidencia histórica | Base `edbc48ab22e5e4624b069fa912bd652cd486429c`; prototipo `6b217974a476c765a7e38d5eb95e6ff82c6ccbe5` |
| 2026-10-05 | Entorno de auditoría | Docker no accesible desde el contexto de inspección | `docker compose ps`: permiso denegado sobre socket; no se ejecutaron pruebas/build/migraciones | Sin cambios de aplicación |
| 2026-10-05 | Planificación | Creado plan canónico con seis fases, CA-01–15, contratos, ADR propuesto y pasos USER | Revisión cruzada de arquitectura/API; 27 enlaces locales, secciones de plantilla y bloques Markdown comprobados; ejecución funcional pendiente | Sin commit nuevo |
| 2026-10-05 | Paso 1.1 | Aprobación del plan y formalización de ADR-006 en `docs/adr/006-route-lifecycle-and-stop-iterator.md` | Decisiones D1–D8 adoptadas; paso 1.1 cerrado | Sin commit nuevo |
| 2026-10-05 | Paso 1.2 | Scaffolding de contratos, puertos desacoplados, tsconfig.routes.json y test de arquitectura | Creación de archivos en domain, application y test; paso 1.2 cerrado | Sin commit nuevo |
| 2026-10-05 | Paso 2.1 | Implementación del agregado Route, invariantes 1..N, ciclo de vida y eventos de dominio | 2 suites, 23 tests aprobados (`route.spec.ts`, `routes-architecture.spec.ts`) | Sin commit nuevo |
| 2026-10-05 | Paso 2.2 | Implementación del patrón GoF RouteStopIterator (Ordered, Pending, Failed) y factorías en Route | 3 suites, 33 tests aprobados (`route-stop-iterator.spec.ts`); CA-04 verificado | Sin commit nuevo |
| 2026-10-06 | Paso 3.1 | Implementación de PrepareRouteUseCase y StartRouteUseCase con dobles transaccionales | 2 suites, 13 tests aprobados (`prepare-route.use-case.spec.ts`, `start-route.use-case.spec.ts`); CA-05/06/07/12 verificados | Sin commit nuevo |
| 2026-10-06 | Paso 3.2 | Implementación de CancelRouteUseCase, InterruptRouteUseCase, extensión de PackageState y RouteEditabilityValidationHandler | 4 suites, 57 tests aprobados (`cancel-route.use-case.spec.ts`, `interrupt-route.use-case.spec.ts`, `package-state.spec.ts`, `assignment-validation-chain.spec.ts`); CA-08/09 y manifiesto protegido | Sin commit nuevo |
| 2026-10-06 | Paso 3.3 | Implementación de GetRouteDetailUseCase (consumiendo Iterator) y ListRoutesUseCase (paginado y filtros de actor) | 2 suites, 10 tests aprobados (`get-route-detail.use-case.spec.ts`, `list-routes.use-case.spec.ts`); CA-10 verificado | Sin commit nuevo |
| 2026-10-06 | Paso 4.1 | Repositorio Prisma, UoW Serializable con reintentos anti-deadlock, adaptadores de Packages/Assignments y extensión de runWithTenant | 4 suites, 19 tests aprobados en V3 (`run-with-tenant.spec.ts`, `prisma-route.repository.spec.ts`, `prisma-route-lifecycle-unit-of-work.spec.ts`, `routes-architecture.spec.ts`); CA-07/11/12 verificados | Sin commit nuevo |
| 2026-10-06 | Paso 4.2 | Columna resultSnapshot en RoutePlanningRequest, índices operativos en Route, migración aditiva, preservación de snapshot en replay y ocupación de flota activa | V4 (validate & generate), 24 suites / 218 tests aprobados en route-planning, 66 suites / 530 tests aprobados en todo el backend (100% green); CA-11/13 verificados | Sin commit nuevo |
| 2026-10-06 | Paso 5.1 | DTOs de validación, RoutesController, routes-http-errors, RoutesModule integrado en AppModule y tests normalizados con sls-test-normalization | V5, 13 suites / 120 tests aprobados en routes, 68 suites / 572 tests aprobados en todo el backend (100% green); build limpio | Sin commit nuevo |
| 2026-10-06 | Paso 5.2 | Suites E2E reales (route-lifecycle, routes-http), fixtures y runner route-01.cjs en PostgreSQL 17 / PostGIS | V6 verde (make integration-test TEST=route-01: 2 suites, 23 tests aprobados), 5 suites de regresión aprobadas (assign-01, gdb-01, gdb-05, gdb-06, geocode-01) | Sin commit nuevo |
| 2026-10-06 | Paso 6.1 | Verificación final V7, informe route-01-report.md, ADR-006 a Aceptado e implementado, AGENTS.md sincronizado | V7 verde (68 suites / 572 tests unitarios, 2 suites / 23 tests e2e, build limpio, eslint/prettier limpios); CA-01–15 satisfechos | Sin commit nuevo |

Registrar cada avance con archivos, comando exacto, entorno/base, resultado, conteos reales, decisiones adoptadas y trabajo restante. No sustituir notas del usuario ni marcar `DONE` por el mero hecho de crear documentos.

## Cierre

- [x] Criterios CA-01–15 satisfechos con evidencia vinculada.
- [x] Route y los tres Iterator implementados/probados; Ordered consumido por GetRouteDetail y Pending/Failed disponibles para los flujos posteriores.
- [x] Preparar/iniciar/cancelar/interrumpir consistentes con paquetes y reservas.
- [x] Manifiesto protegido en todos los escritores y carreras verificadas.
- [x] Autenticación real, permisos, pertenencia de mensajero y aislamiento de tenant demostrados.
- [x] Persistencia única, rollback, outbox, auditoría y reintentos verificados con PostgreSQL real.
- [x] Migración revisada, aplicada a base de pruebas fresca/legada y plan de despliegue registrado.
- [x] Replay ASSIGN estable después de las transiciones y cancelación.
- [x] Build, strict del alcance, pruebas relevantes/regresión y formato aplicable aprobados mediante Compose.
- [x] ADR-006 actualizado con decisiones adoptadas; informe por puntos creado y enlazado en ambos sentidos.
- [x] Documentación HTTP, limitaciones, errores/vacíos y contrato para UI actualizados.
- [x] Tablero reconciliado solo con estado verificado; DELIVERY/CLOSE/recuperación/UI pendientes claramente separados.
- [x] Ningún cambio ajeno sobrescrito; commits registrados solo si efectivamente existen.

El cierre acredita ROUTE-01 para este alcance operativo. El flujo completo de entrega, recuperación de pendientes y cierre de ruta requiere los módulos posteriores indicados.
