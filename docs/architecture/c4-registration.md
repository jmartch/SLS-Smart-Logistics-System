# Diagramas C4 del Sistema — Smart Logistics System (SLS)

Estado: verificado sobre la rama `feature/mvp-demo-flow` el 2026-10-11.

Este documento presenta los tres niveles de diagramas C4 (Contexto, Contenedores y Componentes de API/Worker) del sistema **SLS**, reflejando la arquitectura orientada a eventos, las fronteras de **Clean Architecture**, el aislamiento multi-tenant por **Row-Level Security (RLS)**, los patrones **GoF** (`Chain of Responsibility`, `State`, `Iterator`), los patrones de mensajería (`Transactional Outbox`, `Idempotent Consumer`, `Retry 5s/10s/20s`, `Dead Letter Queue` con redrive auditable) y la visualización geográfica de paradas con **OpenStreetMap (`RouteMap`)**.

---

## Nivel 1 — Diagrama de Contexto (C4 Context)

```mermaid
C4Context
  title Nivel 1 — Contexto del Sistema SLS

  Person(admin, "Administrador / Coordinador de Tenant", "Gestiona catálogos, vehículos, mensajeros (MANAGE_TENANT) y coordina rutas (COORDINATE_ROUTES)")
  Person(reception, "Empleado de Recepción", "Registra paquetes entrantes con guía, peso y dimensiones (REGISTER_PACKAGES)")
  Person(courier, "Mensajero (Courier)", "Consulta rutas asignadas y registra intentos, entregas, evidencias e incidentes (OPERATE_DELIVERIES)")

  System(sls, "SLS — Smart Logistics System", "Plataforma SaaS B2B multi-tenant para recepción, clasificación, planificación de rutas, despacho, entregas y auditoría de eventos")

  System_Ext(osm, "OpenStreetMap Tile Server", "Servidor público de teselas cartográficas (tile.openstreetmap.org) consultado por el navegador para visualizar paradas de ruta")

  Rel(admin, sls, "Administra flota, consulta y prepara rutas", "HTTPS / Cookie sls_session")
  Rel(reception, sls, "Registra paquetes y genera eventos de recepción", "HTTPS / Cookie sls_session")
  Rel(courier, sls, "Ejecuta paradas de ruta y reporta entregas/incidentes", "HTTPS / Cookie sls_session")
  Rel(admin, osm, "Carga tiles del mapa en detalle de ruta (RouteMap)", "HTTPS GET /{z}/{x}/{y}.png")
```

---

## Nivel 2 — Diagrama de Contenedores (C4 Container)

```mermaid
C4Container
  title Nivel 2 — Contenedores de SLS en Docker Compose

  Person(actor, "Usuario Autenticado del Tenant", "Admin, Recepción, Coordinador o Mensajero")
  System_Ext(osm, "OpenStreetMap Tiles", "https://tile.openstreetmap.org/{z}/{x}/{y}.png")

  System_Boundary(sls, "Smart Logistics System (Docker Compose)") {
    Container(frontend, "Frontend Web (sls-frontend)", "React 19 + TypeScript + Vite + React Leaflet", "SPA operativa (:5173). Autenticación con API real, mapa RouteMap en detalle de ruta (GET /api/v1/routes/:id con fallback a fixture determinista) y mocks para pantallas aún no integradas")
    Container(api, "API Backend (sls-backend)", "NestJS 11 (src/main.ts)", "Monolito modular HTTP (:3000/api/v1). Aplica AuthGuard/PermissionsGuard, casos de uso de dominio y persistencia transaccional con OutboxEvent")
    Container(worker, "Worker Asíncrono (sls-worker)", "NestJS 11 (src/worker.ts)", "Proceso separado que ejecuta OutboxRelay, DeadLetterRedrivePublisher, consumidores idempotentes y enrutamiento de fallos (Retry 5s/10s/20s y DLQ)")
    ContainerDb(postgres, "Base de Datos (sls-postgres)", "PostgreSQL 17 + PostGIS", "Esquema compartido con Row-Level Security (RLS) por tenantId. Rol postgres para migraciones/semilla y sls_app en runtime (SET LOCAL app.current_tenant_id)")
    ContainerQueue(rabbitmq, "Broker de Mensajes (sls-rabbitmq)", "RabbitMQ 4 (./infra/rabbitmq)", "Imagen preconfigurada con vhost sls, exchanges durables (sls.events.v1, sls.retry.v1, sls.return.v1, sls.dlq.v1) y colas quorum con publisher confirms y ACK manual")
  }

  Rel(actor, frontend, "Opera en el navegador", "HTTP :5173")
  Rel(frontend, api, "Consume endpoints REST autenticados", "JSON/HTTP :3000 (Cookie sls_session)")
  Rel(frontend, osm, "Renderiza tiles y atribuye © OpenStreetMap contributors", "HTTPS")
  Rel(api, postgres, "Ejecuta transacciones por tenant (runWithTenant) y escribe OutboxEvent", "Prisma 7 / TCP :5432 (sls_app)")
  Rel(worker, postgres, "Reclama OutboxEvent/DeadLetterRedrive y persiste ProcessedEvent, AuditLog y DeadLetterMessage", "Prisma 7 / TCP :5432 (sls_app)")
  Rel(worker, rabbitmq, "Publica con publisher confirms y consume con ACK manual", "AMQP :5672 (vhost sls)")
```

---

## Nivel 3 — Diagrama de Componentes: API Backend y Worker Asíncrono (C4 Component)

### 3.1 Componentes de la API HTTP (`sls-backend` — `src/main.ts`)

```mermaid
C4Component
  title Nivel 3A — Componentes Principales de la API HTTP (sls-backend)

  Container_Boundary(api, "sls-backend (NestJS HTTP API)") {
    Component(auth, "AuthModule (AuthGuard + PermissionsGuard)", "Presentación / Aplicación / Infraestructura", "Autentica sesiones (sls_session), resuelve ActorContext/TenantContext y verifica permisos (REGISTER_PACKAGES, MANAGE_TENANT, etc.)")
    Component(reg_pkg, "PackagesModule (Registro PKG-01 parcial)", "Clean Architecture (Presentation -> Application -> Domain <- Infrastructure)", "POST /packages: valida medidas/volumen, persiste Address + Package (REGISTERED) + PackageStatusHistory (changedByUserId) + OutboxEvent (PackageRegistered) y rechaza duplicados con 409 PACKAGE_TRACKING_CODE_CONFLICT")
    Component(reg_fleet, "VehiclesModule & CouriersModule (Registro VEH-01 parcial)", "Clean Architecture", "POST /vehicles (VEHICLE_PLATE_CONFLICT) y POST /couriers (elegibilidad de usuario del mismo tenant)")
    Component(planning, "RoutePlanningModule & AssignmentsModule", "Clean Architecture + GoF Chain of Responsibility", "Distancia Haversine, clustering determinista, ordenamiento nearest-neighbor y cadena de 10 handlers de validación/asignación por capacidad de peso y volumen")
    Component(routes, "RoutesModule", "Clean Architecture + GoF Iterator", "GET /routes/:id (recorrido con RouteStopIterator), preparación (prepare), inicio (start), interrupción, cancelación y cierre idempotente de ruta (close)")
    Component(deliveries, "DeliveriesModule & PackageState", "Clean Architecture + GoF State", "Registro de intentos de entrega, evidencias, incidentes y transiciones de estado del paquete (PackageState) con eventos en OutboxEvent")
    Component(rls, "PrismaService + runWithTenant", "Infraestructura Compartida", "Abre transacción PostgreSQL y ejecuta SET LOCAL app.current_tenant_id para hacer cumplir RLS fail-closed")
  }

  ContainerDb(postgres, "PostgreSQL 17 + PostGIS", "Tablas de dominio, OutboxEvent y políticas RLS")

  Rel(reg_pkg, auth, "Protegido por AuthGuard + PermissionsGuard (REGISTER_PACKAGES)")
  Rel(reg_fleet, auth, "Protegido por AuthGuard + PermissionsGuard (MANAGE_TENANT)")
  Rel(reg_pkg, rls, "Persistencia atómica por tenant")
  Rel(reg_fleet, rls, "Persistencia atómica por tenant")
  Rel(planning, rls, "Reserva de capacidad y creación de asignaciones")
  Rel(routes, rls, "Consulta y transiciones de ruta/paradas")
  Rel(deliveries, rls, "Persistencia de entregas, incidentes y OutboxEvent")
  Rel(rls, postgres, "SQL transaccional con tenant fijado", "Prisma")
```

### 3.2 Componentes del Proceso Worker (`sls-worker` — `src/worker.ts`)

```mermaid
C4Component
  title Nivel 3B — Componentes del Worker Asíncrono y Mensajería (sls-worker)

  Container_Boundary(worker, "sls-worker (NestJS Worker Runtime)") {
    Component(runtime, "WorkerRuntime", "Orquestador de Ciclo de Vida", "Inicializa topología AMQP, levanta consumidores registrados y ejecuta el bucle periódico de publicación Outbox + Redrive por cada tenant configurado")
    Component(outbox_relay, "OutboxRelay + RabbitmqConfirmPublisher", "Publicación Confiable", "Reclama registros PENDING en OutboxEvent, publica en sls.events.v1 con confirmaciones del broker y marca PUBLISHED")
    Component(redrive_pub, "DeadLetterRedrivePublisher + RequestDeadLetterRedriveUseCase", "Recuperación DLQ", "Verifica que el evento no esté en ProcessedEvent, registra solicitud auditable en DeadLetterRedrive y republica hacia sls.return.v1")
    Component(consumer_runner, "RabbitmqConsumerRunner (Idempotent Consumer)", "Ejecución Idempotente", "En una sola transacción por tenant registra (tenantId, eventId, consumerName) en ProcessedEvent, ejecuta el handler de negocio y solo envía ACK tras el commit")
    Component(failure_router, "RabbitmqFailureRouter", "Política de Reintentos y DLQ", "Ante error transitorio publica en sls.retry.v1 (colas 5s -> 10s -> 20s -> sls.return.v1); ante contrato inválido o intentos agotados persiste DeadLetterMessage y publica en sls.dlq.v1")
    Component(audit_consumer, "AuditIntegrationEventsConsumer", "Consumidor de Dominio", "Consume eventos de integración desde sls.audit.integration-events.v1 y registra trazabilidad en AuditLog (INTEGRATION_EVENT_RECEIVED)")
  }

  ContainerDb(postgres, "PostgreSQL 17 + PostGIS", "OutboxEvent, ProcessedEvent, DeadLetterMessage, DeadLetterRedrive, AuditLog")
  ContainerQueue(rabbitmq, "RabbitMQ 4 (vhost sls)", "Exchanges sls.events.v1, sls.retry.v1, sls.return.v1, sls.dlq.v1")

  Rel(runtime, outbox_relay, "Ejecuta ciclo de despacho por tenant")
  Rel(runtime, redrive_pub, "Ejecuta ciclo de redrive por tenant")
  Rel(runtime, consumer_runner, "Registra y supervisa consumidores")
  Rel(outbox_relay, postgres, "Lee/actualiza OutboxEvent")
  Rel(outbox_relay, rabbitmq, "Publica eventos con publisher confirm")
  Rel(redrive_pub, postgres, "Lee DeadLetterMessage y actualiza DeadLetterRedrive")
  Rel(redrive_pub, rabbitmq, "Republica en sls.return.v1")
  Rel(consumer_runner, rabbitmq, "Consume mensajes y envía ACK manual post-commit")
  Rel(consumer_runner, audit_consumer, "Delega efecto de negocio dentro de la transacción")
  Rel(consumer_runner, postgres, "Inserta ProcessedEvent + AuditLog atómicamente")
  Rel(consumer_runner, failure_router, "Enruta fallos transitorios o permanentes")
  Rel(failure_router, rabbitmq, "Publica en sls.retry.v1 (5s/10s/20s) o sls.dlq.v1")
  Rel(failure_router, postgres, "Persiste DeadLetterMessage")
```

---

## Decisiones Arquitectónicas y Límites del Alcance Actual

1. **Clean Architecture verificada por pruebas:**
   - En cada módulo (`packages`, `vehicles`, `couriers`, `zones`, `assignments`, `routes`, `deliveries`), `domain/` y `application/` están aislados de NestJS, Prisma y RabbitMQ (`*-architecture.spec.ts`).
2. **Patrones de Mensajería Confiable (`RMQ-01` + `DEMO-01`):**
   - **Transactional Outbox:** Los casos de uso de escritura (como `RegisterPackageService`) insertan `OutboxEvent` (`PackageRegistered`) en la misma transacción PostgreSQL que las entidades de dominio y el historial (`PackageStatusHistory` con `changedByUserId`).
   - **Idempotent Consumer:** `RabbitmqConsumerRunner` garantiza entrega efectiva única por consumidor mediante la restricción única `(tenantId, eventId, consumerName)` en `ProcessedEvent` dentro de la misma transacción del efecto de negocio, enviando `ACK` únicamente después del `COMMIT`.
   - **Retry con Backoff y Dead Letter Queue:** Los errores transitorios se reintentan hasta 3 veces mediante colas con TTL escalonado (`5s/10s/20s`) que retornan por `sls.return.v1`. Los mensajes con contrato inválido o intentos agotados se almacenan con todo su contexto en `DeadLetterMessage` y cola `sls.dlq.v1`, desde donde pueden reencolarse deliberadamente con auditoría (`DeadLetterRedrive`).
3. **Visualización Geográfica con OpenStreetMap (`RouteMap`):**
   - El componente aislado [`RouteMap`](file:///home/zirox/Documents/GitHub/SLS-Smart-Logistics-System/frontend/src/features/routes/RouteMap.tsx) muestra tiles de `tile.openstreetmap.org`, atribución `© OpenStreetMap contributors`, marcadores numerados por `stopNumber` y una `Polyline` que conecta la secuencia de paradas calculada por el backend.
   - No realiza geocodificación externa (Nominatim), no descarga mapas offline ni representa navegación vial giro a giro o seguimiento GPS en tiempo real. La lista de paradas permanece siempre disponible en la vista de detalle de ruta.
4. **Alcance honesto de `PKG-01` y `VEH-01`:**
   - `PKG-01` y `VEH-01` permanecen en estado `IN_PROGRESS`: están implementados y protegidos con `AuthGuard` + `PermissionsGuard` los endpoints de registro (`POST /packages` con código de duplicado `PACKAGE_TRACKING_CODE_CONFLICT`, `POST /vehicles` y `POST /couriers`). Los listados, edición de capacidad, turnos y clasificación HTTP siguen declarados como trabajo pendiente.
