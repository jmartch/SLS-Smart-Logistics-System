# Runbook de Demostración MVP (`DEMO-01`)

Este documento describe la preparación, el orden exacto de ejecución, los resultados esperados, las consultas de evidencia en PostgreSQL/RabbitMQ y el plan de contingencia para la demostración reproducible del MVP de **Smart Logistics System (SLS)** en el contexto de **Barranquilla, Colombia**.

---

## 1. Preparación del Entorno (Docker Compose)

Toda la infraestructura y los servicios de la demo corren sobre Docker Compose:

- `sls-postgres` (`postgis/postgis:17-3.6-alpine` en `localhost:5432`)
- `sls-rabbitmq` (`sls-rabbitmq:4-management` en `localhost:5672` y consola/API HTTP en `localhost:15672`)
- `sls-backend` (API HTTP NestJS en `http://localhost:3000/api/v1`)
- `sls-worker` (Proceso NestJS separado con entry point `src/worker.ts` que inicializa topología AMQP, publica eventos desde `OutboxEvent` / `DeadLetterRedrive` y consume de forma idempotente en `sls.audit.integration-events.v1`)
- `sls-frontend` (Aplicación React + Vite en `http://localhost:5173`)

### 1.1 Levantar los contenedores

```bash
docker compose up -d --build postgres rabbitmq backend worker frontend
```

Verificar que los servicios estén arriba y saludables:

```bash
docker compose ps
```

### 1.2 Aplicar migraciones y cargar la semilla determinista (`demo:seed`)

```bash
docker compose exec backend npx prisma migrate deploy --config prisma7.config.ts
docker compose exec backend npm run demo:seed
```

> **Nota de repetibilidad:** `npm run demo:seed` limpia previamente los registros del tenant de demostración (`10000000-0000-4000-8000-000000000001`) y vuelve a crear el estado inicial exacto para que la demo pueda repetirse cualquier número de veces sin colisiones residuales.

---

## 2. Datos Deterministas Sembrados (`prisma/seed-demo.ts`)

| Recurso | Identificador / Valor | Detalle |
|---|---|---|
| **Tenant** | `10000000-0000-4000-8000-000000000001` | `Mensajería Barranquilla Demo S.A.S.` (`slug`: `demo-barranquilla`) |
| **Usuario Admin / Coordinador** | `20000000-0000-4000-8000-000000000001` | `admin@demo-baq.co` / `DemoPassword123!` (`MANAGE_TENANT`, `REGISTER_PACKAGES`, `COORDINATE_ROUTES`, etc.) |
| **Usuario Recepción** | `20000000-0000-4000-8000-000000000002` | `recepcion@demo-baq.co` / `DemoPassword123!` (solo `REGISTER_PACKAGES`) |
| **Usuario Candidato Mensajero** | `30000000-0000-4000-8000-0000000000a1` | `mensajero.candidato@demo-baq.co` (`ACTIVE`, listo para registrar en `POST /couriers`) |
| **Zona** | `08d92a06-4921-4989-92ff-f1917240779c` | `NORTH` — Zona Norte Barranquilla |
| **Sector** | `2ef99933-082e-4d24-b1a1-b5c574ca6aa5` | `N-PRADO` — El Prado - Alto Prado |
| **Tipo de Envío** | `b268c5c7-b2b5-411d-b734-07746ae7e6e6` | `STANDARD` — Envío Urbano Estándar 24h |
| **Depósito (Depot)** | `60000000-0000-4000-8000-000000000001` | Centro de Distribución Vía 40 (`10.9878, -74.7889`) |
| **Vehículo en Ruta** | `80000000-0000-4000-8000-000000000001` | Placa `BAQ101` (`850 kg`, `6.5 m³`, `ACTIVE`) |
| **Mensajero en Ruta** | `70000000-0000-4000-8000-000000000001` | Vinculado a `mensajero.ruta@demo-baq.co` (`ACTIVE`) |
| **Ruta Planificada** | `30000000-0000-4000-8000-000000000001` | Estado `PLANNED` con 3 paradas ordenadas en Barranquilla: Parada 1 (`10.9961, -74.8060` El Prado), Parada 2 (`11.0041, -74.8152` Alto Prado), Parada 3 (`11.0112, -74.8265` Riomar) |
| **Paquetes en Ruta** | `50000000-0000-4000-8000-000000000001..003` | `PKG-BAQ-0001`, `PKG-BAQ-0002`, `PKG-BAQ-0003` (`ASSIGNED_TO_ROUTE`) |
| **Mensaje DLQ Sembrado** | `d1000000-0000-4000-8000-000000000001` | Evento `e1000000-0000-4000-8000-000000000001` listo para demostrar redrive auditable |

---

## 3. Orden de Ejecución en Bruno (`bruno/SLS API/00 Demo MVP`)

Abrir la colección `bruno/SLS API` en Bruno y seleccionar el entorno **`local`**.

### Paso 01 — `01 Login Admin` (`POST /api/v1/auth/login`)
- **Entrada:** `slug: "demo-barranquilla"`, `email: "admin@demo-baq.co"`, `password: "DemoPassword123!"`.
- **Resultado esperado:** `200 OK` con cookie HttpOnly `sls_session` almacenada automáticamente en la sesión de Bruno y payload del actor autenticado (`tenantId: "10000000-0000-4000-8000-000000000001"`, permisos `MANAGE_TENANT`, `REGISTER_PACKAGES`, etc.).

### Paso 02 — `02 Register Vehicle` (`POST /api/v1/vehicles`)
- **Entrada:** `plate: "ABC-123"`, `maxWeightKg: 1200.5`, `maxVolumeM3: 8.25`.
- **Resultado esperado:** `201 Created` con placa normalizada `"ABC123"`, `status: "ACTIVE"`, y `tenantId` tomado exclusivamente de la sesión autenticada.

### Paso 03 — `03 Register Courier` (`POST /api/v1/couriers`)
- **Entrada:** `userId: "30000000-0000-4000-8000-0000000000a1"`.
- **Resultado esperado:** `201 Created` vinculando el usuario activo del tenant como mensajero (`status: "ACTIVE"`).

### Paso 04 — `04 Register Package` (`POST /api/v1/packages`)
- **Entrada:** `trackingCode: "PKG-DEMO-0001"`, dirección en Barranquilla (`"Calle 72 # 45-10, El Prado, Barranquilla"`, `municipalityCode: "08001"`), `shipmentTypeId`, `zoneId`, `sectorId`, dimensiones `30x20x10 cm` y peso `2.5 kg`.
- **Resultado esperado:** `201 Created` con:
  - `state: "REGISTERED"` (estado inicial canónico del ciclo de vida del paquete al momento de su recepción).
  - `volumeM3: "0.006"` (calculado y normalizado en el dominio).
  - Creación atómica en la misma transacción de `Address`, `Package`, `PackageStatusHistory` (`changedByUserId = 20000000-0000-4000-8000-000000000001`) y `OutboxEvent` (`eventType = "PackageRegistered"`).

### Paso 05 — `05 Evidence - Route and Package History` (`GET /api/v1/routes/{{routeId}}`)
- **Resultado esperado:** `200 OK` devolviendo la ruta `30000000-0000-4000-8000-000000000001` en Barranquilla con sus 3 paradas ordenadas recorridas mediante el patrón **GoF Iterator** (`RouteStopIterator`):
  1. `stopNumber: 1` (`10.9961, -74.806`)
  2. `stopNumber: 2` (`11.0041, -74.8152`)
  3. `stopNumber: 3` (`11.0112, -74.8265`)

### Paso 06 y 07 — Errores Controlados (`409 Conflict` y `400 Bad Request`)
- **`06 Controlled Error - Duplicate Tracking Code` (`POST /api/v1/packages`):** Intenta registrar `PKG-BAQ-0001` (ya existente en el tenant). Devuelve `409 Conflict` con código estable `PACKAGE_TRACKING_CODE_CONFLICT` sin dejar registros huérfanos en `Address`, `PackageStatusHistory` ni `OutboxEvent`.
- **`07 Controlled Error - Invalid Vehicle Data` (`POST /api/v1/vehicles`):** Envía placa inválida y capacidades no positivas (`maxWeightKg: -50`, `maxVolumeM3: 0`). Devuelve `400 Bad Request` con código de validación de dominio.
- **Control de acceso (`401` / `403`):** Si se invoca `POST /api/v1/vehicles` sin cookie (`401 SESSION_EXPIRED`) o autenticado con `recepcion@demo-baq.co` (`403 INSUFFICIENT_PERMISSIONS`), el backend rechaza la operación.

### Paso 08 — `08 Evidence - Worker and RabbitMQ Queue Status`
- Consulta la API HTTP de RabbitMQ Management (`GET http://localhost:15672/api/queues/sls/sls.audit.integration-events.v1` con Basic Auth `sls:sls`).
- **Resultado esperado:** `200 OK` mostrando `consumers: 1` (el servicio `sls-worker` conectado), `state: "running"` y las métricas de mensajes publicados y confirmados (`ack`).

---

## 4. Comandos de Evidencia en Base de Datos y Worker / RabbitMQ

### 4.1 Evidencia de `PackageStatusHistory` y `OutboxEvent` (`PackageRegistered`)

Ejecutar tras el Paso 04 para demostrar que `PackageStatusHistory` registró el usuario autenticado y que `sls-worker` publicó el `OutboxEvent` hacia RabbitMQ (`status = 'PUBLISHED'`, `publishedAt IS NOT NULL`):

```bash
docker compose exec postgres psql -U postgres -d sls -c "
SELECT p.\"trackingCode\", p.state, h.\"fromState\", h.\"toState\", h.\"reasonCode\", h.\"changedByUserId\"
FROM \"Package\" p
JOIN \"PackageStatusHistory\" h ON h.\"packageId\" = p.id
WHERE p.\"tenantId\" = '10000000-0000-4000-8000-000000000001'
  AND p.\"trackingCode\" = 'PKG-DEMO-0001';
"
```

```bash
docker compose exec postgres psql -U postgres -d sls -c "
SELECT \"eventId\", \"eventType\", producer, status, attempts, \"occurredAt\", \"publishedAt\"
FROM \"OutboxEvent\"
WHERE \"tenantId\" = '10000000-0000-4000-8000-000000000001'
ORDER BY \"occurredAt\" DESC;
"
```

### 4.2 Evidencia de Consumo Idempotente en `sls-worker` (`ProcessedEvent` y `AuditLog`)

Cuando `sls-worker` consume `PackageRegistered` desde la cola `sls.audit.integration-events.v1`, registra atómicamente la llave de idempotencia `(tenantId, eventId, consumerName)` en `ProcessedEvent` y el efecto de negocio en `AuditLog` (`action = 'INTEGRATION_EVENT_RECEIVED'`):

```bash
docker compose exec postgres psql -U postgres -d sls -c "
SELECT \"eventId\", \"consumerName\", \"processedAt\"
FROM \"ProcessedEvent\"
WHERE \"tenantId\" = '10000000-0000-4000-8000-000000000001'
ORDER BY \"processedAt\" DESC;
"
```

```bash
docker compose exec postgres psql -U postgres -d sls -c "
SELECT action, \"entityType\", \"entityId\", metadata->>'eventType' AS event_type, \"createdAt\"
FROM \"AuditLog\"
WHERE \"tenantId\" = '10000000-0000-4000-8000-000000000001'
  AND action = 'INTEGRATION_EVENT_RECEIVED'
ORDER BY \"createdAt\" DESC;
"
```

### 4.3 Evidencia de Dead Letter Queue (DLQ) y Redrive Deliberado (`messaging:ops`)

1. Consultar el mensaje en DLQ sembrado (`d1000000-0000-4000-8000-000000000001`):

```bash
docker compose exec backend npm run build
docker compose exec backend npm run messaging:ops -- status \
  --tenantId 10000000-0000-4000-8000-000000000001 \
  --deadLetterId d1000000-0000-4000-8000-000000000001
```

2. Solicitar el redrive auditable hacia el exchange de retorno `sls.return.v1`:

```bash
docker compose exec backend npm run messaging:ops -- redrive \
  --tenantId 10000000-0000-4000-8000-000000000001 \
  --deadLetterId d1000000-0000-4000-8000-000000000001 \
  --requestId f1000000-0000-4000-8000-000000000001 \
  --reason "Demo recovery after transient failure"
```

3. Verificar que `sls-worker` publicó el redrive (`DeadLetterRedrive.status = 'PUBLISHED'`) y consumió el evento `e1000000-0000-4000-8000-000000000001` en `ProcessedEvent` y `AuditLog`:

```bash
docker compose exec postgres psql -U postgres -d sls -c "
SELECT id, status, attempts, \"requestedBy\", reason, \"publishedAt\"
FROM \"DeadLetterRedrive\"
WHERE \"tenantId\" = '10000000-0000-4000-8000-000000000001';
"
```

4. Si se intenta ejecutar un segundo redrive con otro `requestId` para el mismo evento ya procesado, el caso de uso previene el reprocesamiento devolviendo `outcome: "ALREADY_PROCESSED"`:

```bash
docker compose exec backend npm run messaging:ops -- redrive \
  --tenantId 10000000-0000-4000-8000-000000000001 \
  --deadLetterId d1000000-0000-4000-8000-000000000001 \
  --requestId f1000000-0000-4000-8000-000000000002 \
  --reason "Verify idempotency guard on already processed DLQ event"
```

---

## 5. Visualización de Ruta con OpenStreetMap (`RouteMap`)

En el frontend (`http://localhost:5173/app/rutas/30000000-0000-4000-8000-000000000001`), el detalle de ruta integra el componente aislado `RouteMap` (`frontend/src/features/routes/RouteMap.tsx`) junto a la lista existente de paradas:

- **Consumo preferente del backend:** Para rutas con identificador UUID (`30000000-0000-4000-8000-000000000001`), `RouteDetailPage` consulta `GET /api/v1/routes/:id` y proyecta las paradas ordenadas (`stopNumber`, `latitude`, `longitude`, `state`). Si el consumo HTTP no está disponible o se consulta una ruta de demostración local (`rt-001`, `rt-002`, `rt-003`), utiliza el fixture determinista de Barranquilla indicando explícitamente que se trata de datos preparados para demo y no de rastreo GPS en vivo.
- **Elementos del mapa:**
  - Tiles de `https://tile.openstreetmap.org/{z}/{x}/{y}.png` con atribución visible `© OpenStreetMap contributors`.
  - Marcadores `CircleMarker` numerados (`#1`, `#2`, `#3`) según `stopNumber` y coloreados por `state` (`PENDING`, `COMPLETED`, `FAILED`).
  - `Polyline` conectando las coordenadas en el orden calculado por el backend (con nota explícita de que representa la secuencia de paradas calculada y no navegación vial giro a giro).
  - Ajuste automático de límites (`fitBounds`) y estado vacío explícito (`Sin coordenadas válidas para mostrar en el mapa`, verificable en `/app/rutas/rt-003`).

---

## 6. Alternativa si Falla un Componente Externo (Plan de Contingencia)

1. **Si los tiles externos de OpenStreetMap (`tile.openstreetmap.org`) no cargan por falta de internet en el salón de sustentación:**
   - La vista de detalle de ruta mantiene siempre visible la **tabla/lista ordenada de paradas** con su secuencia (`stopNumber`), coordenadas (`latitude`, `longitude`), dirección y estado, de modo que la evidencia del ordenamiento de paradas no depende de la carga visual de tiles externos.
2. **Si el cliente GUI de Bruno presenta algún inconveniente local:**
   - Todos los pasos del flujo numerado pueden ejecutarse directamente por terminal con `curl` contra `http://localhost:3000/api/v1` o mediante la suite automatizada de integración:
     - `docker compose exec backend npm run test:registration-01` (flujo E2E autenticado de vehículos, mensajeros, paquetes y `OutboxEvent` `PackageRegistered`).
     - `docker compose exec backend npm run test:rmq-01` (flujo completo de RabbitMQ, Outbox, Idempotent Consumer, Retry 5s/10s/20s, DLQ y Redrive).
     - `docker compose exec backend npm run test:route-01` y `docker compose exec backend npm run test:route-close-01` (ciclo de vida y cierre de rutas).
3. **Si la base de datos queda con datos modificados tras una prueba previa:**
   - Ejecutar `docker compose exec backend npm run demo:seed` restaura en menos de 2 segundos el estado determinista inicial del tenant `demo-barranquilla`.
