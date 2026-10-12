# SLS — Smart Logistics System

Sistema SaaS B2B multi-tenant de gestión de operaciones logísticas urbanas (contexto inicial en Barranquilla, Colombia), compuesto por un frontend en React/Vite con visualización de rutas en OpenStreetMap, una API HTTP en NestJS, un proceso `worker` asíncrono en NestJS, PostgreSQL 17 con PostGIS (Row-Level Security por tenant) y RabbitMQ 4.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Leaflet y React Leaflet (`OpenStreetMap`).
- **Backend (API y Worker):** NestJS 11, TypeScript y Prisma 7 ORM.
- **Base de datos:** PostgreSQL 17 + PostGIS (`postgis/postgis:17-3.6-alpine`) con Row-Level Security (RLS).
- **Mensajería asíncrona:** RabbitMQ 4 (`sls-rabbitmq:4-management` construido desde `./infra/rabbitmq` con definiciones de topología preconfiguradas).
- **Entorno de ejecución:** Docker Compose.

## Estructura

```text
├── frontend/          # Aplicación React + Vite y componente RouteMap (OpenStreetMap)
├── backend/           # Monolito modular NestJS (API main.ts + Worker worker.ts) y Prisma
├── infra/rabbitmq/    # Imagen propia de RabbitMQ 4 con topología declarativa (definitions.json)
├── bruno/SLS API/     # Colección Bruno (incluye carpeta numerada 00 Demo MVP)
├── docs/              # Arquitectura C4 (docs/architecture/c4-registration.md) y runbook de demo (docs/demo/mvp-demo.md)
├── docker-compose.yml
└── README.md
```

## Requisitos

- Docker y Docker Compose.
- Git (solo para clonar el repositorio).

## Inicio rápido

```bash
git clone <URL_DEL_REPOSITORIO>
cd SLS-Smart-Logistics-System
```

Crea `backend/.env.docker` con las conexiones que usan `sls-backend` y `sls-worker` (una para migraciones y otra para runtime con RLS habilitado):

```env
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/sls?schema=public"
RUNTIME_DATABASE_URL="postgresql://sls_app:sls_app_dev_password@postgres:5432/sls?schema=public"
RABBITMQ_URL="amqp://sls:sls@rabbitmq:5672/sls"
```

Después, inicia todos los servicios del entorno (`postgres`, `rabbitmq`, `backend`, `worker` y `frontend`):

```bash
docker compose up -d --build
```

| Servicio | Contenedor | URL / puerto | Descripción |
|---|---|---|---|
| **Frontend** | `sls-frontend` | http://localhost:5173 | Interfaz web React + Vite y mapa `RouteMap` |
| **API HTTP** | `sls-backend` | http://localhost:3000/api/v1 | API REST NestJS (`src/main.ts`) |
| **Worker AMQP** | `sls-worker` | *(proceso de fondo)* | Worker NestJS (`src/worker.ts`): Outbox relay, consumidor idempotente, retry (`5s/10s/20s`), DLQ y redrive |
| **PostgreSQL** | `sls-postgres` | `localhost:5432` | Base de datos relacional con RLS por `tenantId` |
| **RabbitMQ (AMQP)** | `sls-rabbitmq` | `localhost:5672` | Broker AMQP (imagen `./infra/rabbitmq` con vhost `sls`) |
| **RabbitMQ Management** | `sls-rabbitmq` | http://localhost:15672 | Consola y API HTTP de administración (`sls` / `sls`) |

La imagen de RabbitMQ (`./infra/rabbitmq/Dockerfile`) precarga el usuario `sls` / `sls`, el vhost `sls` y las definiciones de exchanges y colas (`sls.events.v1`, `sls.retry.v1`, `sls.return.v1`, `sls.dlq.v1` y las colas de auditoría/reintento/DLQ). Tanto `sls-backend` como `sls-worker` se conectan mediante `RABBITMQ_URL` usando el hostname `rabbitmq` dentro de la red de Docker Compose.

Para ver el estado y los registros:

```bash
docker compose ps
docker compose logs -f backend worker
```

Detén los servicios con `docker compose down`. Para eliminar también los volúmenes locales, usa `docker compose down -v`.

## Primer arranque y semilla determinista de demostración (`demo:seed`)

Después del primer `docker compose up -d --build`, genera el cliente Prisma, aplica las migraciones versionadas y carga la semilla determinista del MVP para Barranquilla:

```bash
docker compose exec backend npx prisma generate --config prisma7.config.ts
docker compose exec backend npx prisma migrate deploy --config prisma7.config.ts
docker compose exec backend npm run build
docker compose exec backend npm run demo:seed
```

El comando `npm run demo:seed` ([`backend/prisma/seed-demo.ts`](file:///home/zirox/Documents/GitHub/SLS-Smart-Logistics-System/backend/prisma/seed-demo.ts)) es idempotente y repetible: limpia el estado previo del tenant de demostración y aprovisiona:

- **Tenant:** `Mensajería Barranquilla Demo S.A.S.` (`id`: `10000000-0000-4000-8000-000000000001`, `slug`: `demo-barranquilla`).
- **Usuarios y credenciales (`password`: `DemoPassword123!`):**
  - `admin@demo-baq.co` (`ADMIN` con todos los permisos: `MANAGE_TENANT`, `MANAGE_EMPLOYEES`, `REGISTER_PACKAGES`, `CLASSIFY_PACKAGES`, `COORDINATE_ROUTES`, `OPERATE_DELIVERIES`).
  - `recepcion@demo-baq.co` (`RECEPTION` con `REGISTER_PACKAGES`).
  - `mensajero.ruta@demo-baq.co` (`COURIER` con `OPERATE_DELIVERIES`).
  - `mensajero.candidato@demo-baq.co` (usuario activo elegible para `POST /api/v1/couriers`).
- **Catálogos, flota y ruta en Barranquilla:** zona `NORTH` (`Zona Norte Barranquilla`), sector `N-PRADO` (`El Prado - Alto Prado`), tipo de envío `STANDARD`, vehículo `BAQ101`, mensajero activo, 3 paquetes asignados (`PKG-BAQ-0001..0003`), la ruta `30000000-0000-4000-8000-000000000001` con 3 paradas ordenadas en Barranquilla y el registro DLQ `d1000000-0000-4000-8000-000000000001` para demostrar redrive.

## Colección Bruno (`00 Demo MVP`) y Runbook de Demostración

- **Runbook paso a paso:** [docs/demo/mvp-demo.md](file:///home/zirox/Documents/GitHub/SLS-Smart-Logistics-System/docs/demo/mvp-demo.md) documenta la preparación del entorno, el orden de ejecución, los resultados esperados, las consultas SQL de verificación (`PackageStatusHistory`, `OutboxEvent`, `ProcessedEvent`, `AuditLog`, `DeadLetterMessage`, `DeadLetterRedrive`), el redrive desde DLQ (`npm run messaging:ops -- redrive`) y el plan de contingencia.
- **Colección Bruno numerada:** `bruno/SLS API/00 Demo MVP/` (usando el entorno `local`):
  1. `01 Login Admin` (`POST /api/v1/auth/login`)
  2. `02 Register Vehicle` (`POST /api/v1/vehicles`)
  3. `03 Register Courier` (`POST /api/v1/couriers`)
  4. `04 Register Package` (`POST /api/v1/packages`)
  5. `05 Evidence - Route and Package History` (`GET /api/v1/routes/{{routeId}}`)
  6. `06 Controlled Error - Duplicate Tracking Code` (`POST /api/v1/packages` -> `409 PACKAGE_TRACKING_CODE_CONFLICT`)
  7. `07 Controlled Error - Invalid Vehicle Data` (`POST /api/v1/vehicles` -> `400 VALIDATION_ERROR`)
  8. `08 Evidence - Worker and RabbitMQ Queue Status` (`GET http://localhost:15672/api/queues/sls/sls.audit.integration-events.v1`)

## Visualización con OpenStreetMap (`RouteMap`) y Alcance

El detalle de ruta en el frontend (`/app/rutas/30000000-0000-4000-8000-000000000001`) integra el componente aislado [`RouteMap`](file:///home/zirox/Documents/GitHub/SLS-Smart-Logistics-System/frontend/src/features/routes/RouteMap.tsx):

- Renderiza tiles de `https://tile.openstreetmap.org/{z}/{x}/{y}.png` con atribución visible `© OpenStreetMap contributors`.
- Muestra marcadores numerados (`CircleMarker`) según `stopNumber` coloreados por estado (`PENDING`, `COMPLETED`, `FAILED`), `Polyline` conectando las paradas en orden, ajuste automático de límites (`fitBounds`) y estado vacío cuando la ruta no posee coordenadas válidas (verificable en `/app/rutas/rt-003`).
- Para rutas con identificador UUID (`30000000-0000-4000-8000-000000000001`), consume preferentemente `GET /api/v1/routes/:id` del backend; si el consumo HTTP falla o se selecciona una ruta de demostración local (`rt-001`, `rt-002`, `rt-003`), utiliza el fixture determinista de Barranquilla indicando explícitamente su origen.
- **Limitaciones explícitas:** No invoca geocodificación externa (Nominatim), no descarga mapas offline y no realiza seguimiento GPS en tiempo real. La polilínea representa exclusivamente el orden de paradas calculado por el backend, no navegación vial giro a giro. La lista de paradas se mantiene siempre visible debajo del mapa si los tiles externos no cargan.

## Prisma y Aislamiento Multi-Tenant (Row-Level Security)

El esquema está dividido por dominio en `backend/prisma/schema/` y la configuración en `backend/prisma7.config.ts`. Las migraciones de `backend/prisma/migrations/` se versionan en Git; el cliente generado no.

Todas las tablas con `tenantId` tienen RLS habilitado en PostgreSQL. El rol `postgres` (usado para migraciones y semilla administrativa) es superusuario; el backend y el worker se conectan en runtime con el rol `sls_app`, sujeto a RLS. Sin fijar el tenant en la sesión, cualquier consulta devuelve 0 filas (fail-closed). El helper `runWithTenant` en `backend/src/database` aplica `SET LOCAL` por transacción:

```ts
await runWithTenant(prisma, tenantId, async (tx) => tx.package.findMany());
```

## Pruebas

Pruebas unitarias del backend y del frontend mediante Docker Compose:

```bash
docker compose exec backend npm test -- --runInBand
docker compose exec frontend npm test
```

Pruebas de integración contra una base PostgreSQL desechable (`docker-compose.integration.yml`):

```bash
docker compose -f docker-compose.yml -f docker-compose.integration.yml --profile integration up -d --wait integration-postgres
docker compose exec -e "GDB_TEST_ADMIN_URL=postgresql://integration_admin:integration_test_password@integration-postgres:5432/postgres" backend npm run test:<nombre>
docker compose -f docker-compose.yml -f docker-compose.integration.yml --profile integration rm -sf integration-postgres
```

Suites de integración disponibles: `gdb-01`, `gdb-05`, `gdb-06`, `auth-tenant-01`, `registration-01`, `geocode-01`, `assign-01`, `route-01`, `delivery-01`, `route-close-01` y `rmq-01`.

## Endpoints de registro (`PKG-01` y `VEH-01` — solo registro implementado)

`PKG-01` y `VEH-01` se encuentran en estado `EN PROGRESO` (`IN_PROGRESS`): únicamente están terminados los endpoints de registro (`POST /packages`, `POST /vehicles` y `POST /couriers`). Listados, detalle de paquetes/flota, clasificación HTTP, edición de capacidad, cambios de estado y turnos siguen pendientes.

Todos requieren sesión autenticada mediante la cookie `sls_session` (`AuthGuard` + `PermissionsGuard`); el header `x-tenant-id` no se usa como mecanismo de autorización en estos endpoints y se ignora cuando existe sesión autenticada. Sin sesión responden `401` (`SESSION_EXPIRED`) y sin el permiso requerido responden `403` (`PERMISSION_DENIED`).

| Endpoint | Permiso requerido | Cuerpo | Respuestas |
|---|---|---|---|
| `POST /vehicles` | `MANAGE_TENANT` | `plate`, `maxWeightKg`, `maxVolumeM3` | `201`; `400 VALIDATION_ERROR`; `401`; `403`; `409 VEHICLE_PLATE_CONFLICT` |
| `POST /couriers` | `MANAGE_TENANT` | `userId` (usuario activo del mismo tenant) | `201`; `400`; `401`; `403`; `404 COURIER_USER_NOT_FOUND`; `409 COURIER_USER_NOT_ELIGIBLE`, `COURIER_USER_ALREADY_LINKED` |
| `POST /packages` | `REGISTER_PACKAGES` | `trackingCode`, `address {text, municipalityCode}`, `shipmentTypeId`, `zoneId?`, `sectorId?`, `weightKg`, `lengthCm`, `widthCm`, `heightCm`, `priority?`, `deadline?`, `serviceDurationSeconds?` | `201` (estado `REGISTERED`, volumen calculado y token público); `400`; `401`; `403`; `404 PACKAGE_*_NOT_FOUND`; `409 PACKAGE_TRACKING_CODE_CONFLICT`, `PACKAGE_SHIPMENT_TYPE_INACTIVE`, `PACKAGE_SECTOR_ZONE_MISMATCH` |

## Arquitectura y Patrones Implementados

Cada módulo respeta **Clean Architecture** dentro del monolito modular (`presentation -> application -> domain`, con `infrastructure` implementando los puertos de `application/ports/`), verificado por pruebas automáticas `*-architecture.spec.ts`:

- **State** (`packages/domain/package-states.ts`): ciclo de vida del paquete con transiciones controladas y estado inicial `REGISTERED`.
- **Chain of Responsibility** (`assignments/domain/handlers/`): cadena de validación de elegibilidad, zona, vehículo, peso, volumen y mensajero.
- **Iterator** (`routes/domain/iterators/`): `RouteStopIterator` para recorrer paradas ordenadas, pendientes o fallidas sin exponer la colección interna.
- **Transactional Outbox, Idempotent Consumer y DLQ** (`shared/infrastructure/messaging/`): escritura atómica en `OutboxEvent` (ej. `PackageRegistered` con `changedByUserId` en `PackageStatusHistory`), publicación confirmada a RabbitMQ por `sls-worker`, deduplicación atómica en `ProcessedEvent` (`tenantId + eventId + consumerName`), reintentos con backoff `5s/10s/20s` y enrutamiento a `DeadLetterMessage` con redrive auditable (`DeadLetterRedrive`).

## Documentación Técnica y Enlaces

- **Diagramas C4 del sistema (Contexto, Contenedores y Componentes API/Worker):** [docs/architecture/c4-registration.md](file:///home/zirox/Documents/GitHub/SLS-Smart-Logistics-System/docs/architecture/c4-registration.md)
- **Runbook de demostración MVP (`DEMO-01`):** [docs/demo/mvp-demo.md](file:///home/zirox/Documents/GitHub/SLS-Smart-Logistics-System/docs/demo/mvp-demo.md)
