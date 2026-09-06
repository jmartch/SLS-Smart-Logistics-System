# SLS — Diseño del esquema de base de datos

- Fecha: 2026-09-06
- Rama: `feature/database`
- Autor: Juanangel Martinez (con asistencia de Claude Code)
- Fuentes: `database.mmd` (ER diagram del equipo), `SLS_v2.pdf` (arquitectura y patrones), código existente en `origin/feature/patterns-showcase`

## 1. Contexto

SLS es una plataforma SaaS multi-tenant de mensajería. Cada empresa (tenant) administra sus
propios usuarios, paquetes, vehículos, repartidores, rutas y notificaciones sobre un **esquema
de PostgreSQL compartido**. El PDF de arquitectura fija dos restricciones no negociables:

- Todas las consultas y eventos deben incluir `tenantId`.
- El estilo arquitectónico es orientado a eventos (outbox + RabbitMQ), con Idempotent
  Consumer y Dead Letter Queue como patrones de mensajería.

Esta rama (`feature/database`) entrega el modelo de datos completo (Prisma + PostgreSQL 17)
sobre el que se construirán `feature/backend-api` y `feature/business-logic`. El repositorio
actualmente solo tiene un `schema.prisma` vacío (generator + datasource); no existen modelos.

## 2. Objetivos

- Traducir `database.mmd` (28 entidades) a un esquema de Prisma 7 completo, tipado y
  versionado.
- Reforzar el aislamiento multi-tenant con **Row-Level Security (RLS) real** en PostgreSQL,
  no solo con la convención de filtrar por `tenantId` en el código de aplicación.
- Modelar los campos de estado/status como enums de Prisma (Postgres enum), alineados con
  las máquinas de estado ya codificadas en `patterns-showcase` (p. ej. `PackageStatus`).
- Dejar una migración inicial única, reproducible vía Docker Compose, y una pieza reutilizable
  (`PrismaService` + `runWithTenant`) que las ramas de backend puedan consumir sin tener que
  reinventar el mecanismo de sesión de tenant.

## 3. No objetivos (fuera de alcance de esta rama)

- Middleware/interceptor de NestJS que resuelva el `tenantId` real desde el JWT/sesión HTTP
  (pertenece a `feature/backend-api`).
- Seed de datos de negocio (tenants demo, paquetes de prueba). Se deja para cuando exista
  autenticación real, para no fabricar datos que backend-api tendría que descartar.
- Publicación real a RabbitMQ / worker de notificaciones (solo se modelan las tablas
  `OUTBOX_EVENT`, `PROCESSED_EVENT`, `DEAD_LETTER_MESSAGE` que soportan esos patrones).
- Lógica de negocio (clustering, cálculo de distancias, máquina de estados en código): ya
  existe como prototipo en `patterns-showcase` y se integrará en `feature/business-logic`.

## 4. Aislamiento multi-tenant (Row-Level Security)

### 4.1 Problema con la configuración actual

`docker-compose.yml` define `POSTGRES_USER: postgres` y el backend se conecta con ese mismo
rol. Postgres **ignora RLS para superusuarios**, sin importar cuántas políticas se creen. Si no
se cambia el rol de conexión en runtime, RLS sería cosmético.

### 4.2 Diseño

Dos roles de PostgreSQL:

| Rol | Uso | Atributos |
|---|---|---|
| `postgres` | Migraciones (`prisma migrate`) | Superusuario (como ya está en Docker) |
| `sls_app` | Conexión de la app en runtime | Sin `BYPASSRLS`, no es dueño de las tablas |

Dos variables de entorno (`backend/.env.docker` / `.env.example`):

- `DATABASE_URL` — usada por Prisma CLI (`migrate dev`, `migrate deploy`, `generate`), conecta
  como `postgres`.
- `RUNTIME_DATABASE_URL` — usada por `PrismaService` en la app NestJS, conecta como `sls_app`.

Cada tabla que tiene `tenantId` (todas excepto `Permission`, que es catálogo global) recibe,
como SQL crudo dentro de la migración inicial (Prisma no expresa RLS de forma nativa):

```sql
ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Package" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Package"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
```

`FORCE ROW LEVEL SECURITY` es necesario porque, aunque `sls_app` no es dueño, cubre el caso
en que alguien ejecute migraciones futuras que cambien el dueño de la tabla.

### 4.3 Cómo se setea el tenant por request

Se añade `backend/src/database/prisma.service.ts` (PrismaClient con `RUNTIME_DATABASE_URL`) y
`backend/src/database/run-with-tenant.ts`:

```ts
export async function runWithTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx);
  });
}
```

> Nota: `tenantId` debe validarse como UUID antes de interpolarse (no viene de input crudo del
> usuario, sino del contexto de autenticación ya resuelto por `backend-api`), evitando
> inyección SQL. `SET LOCAL` no admite bind parameters de Postgres, por eso se documenta esta
> restricción explícitamente para quien conecte esta pieza con el middleware de auth.

Sin llamar `runWithTenant`, cualquier query sobre una tabla con RLS devuelve 0 filas — esto es
intencional (fail-closed) y se documentará en el README.

## 5. Convenciones de mapeo `.mmd` → Prisma

| `.mmd` | Prisma |
|---|---|
| `uuid id PK` | `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` |
| `uuid xxxId FK` | `String @db.Uuid` + relación `@relation(fields: [xxxId], references: [id])` |
| `decimal latitude/longitude` | `Decimal @db.Decimal(10, 6)` |
| `decimal weightKg/volumeM3/maxWeightKg/maxVolumeM3` | `Decimal @db.Decimal(10, 3)` |
| `json` | `Json` |
| `datetime` | `DateTime` (`@default(now())` en columnas `createdAt`) |
| `boolean` | `Boolean` |
| `string UK` | `String @unique` |
| PK compuesta (`uuid x PK,FK`) | `@@id([...])` en el modelo |
| Relación opcional (`o|--o{`) | FK nullable (`String? @db.Uuid`) |

Cada modelo con `tenantId` añade `@@index([tenantId])` (complementa, no reemplaza, a RLS).

## 6. Enums

Los campos `state`/`status`/`priority`/`channel`/`outcome`/`assignmentType` se modelan como
enums de Prisma en vez de `String` libre (el `.mmd` los tipa genéricamente porque es un
diagrama, no la fuente de verdad de vocabularios cerrados):

| Campo | Enum |
|---|---|
| `Tenant.status` | `TenantStatus { ACTIVE, SUSPENDED }` |
| `User.status` | `UserStatus { ACTIVE, INACTIVE, SUSPENDED }` |
| `Package.state` | `PackageState { REGISTERED, CLASSIFIED, PENDING_ASSIGNMENT, ASSIGNED, READY_FOR_DISPATCH, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, DELIVERY_FAILED, RESCHEDULED, RETURNED }` |
| `Package.priority` | `PackagePriority { LOW, NORMAL, HIGH, URGENT }` |
| `Vehicle.status` | `VehicleStatus { ACTIVE, INACTIVE, MAINTENANCE }` |
| `Courier.status` | `CourierStatus { ACTIVE, INACTIVE }` |
| `RoutePlanningRequest.status` | `RoutePlanningRequestStatus { PENDING, IN_PROGRESS, COMPLETED, FAILED }` |
| `Route.state` | `RouteState { PLANNED, IN_PROGRESS, COMPLETED, CANCELLED }` |
| `RouteStop.state` | `RouteStopState { PENDING, COMPLETED, FAILED }` |
| `Assignment.assignmentType` | `AssignmentType { INITIAL, REASSIGNMENT }` |
| `Assignment.status` | `AssignmentStatus { ACTIVE, ENDED, CANCELLED }` |
| `DeliveryAttempt.outcome` | `DeliveryOutcome { DELIVERED, FAILED, RESCHEDULED }` |
| `Incident.status` | `IncidentStatus { OPEN, RESOLVED, CLOSED }` |
| `Notification.channel` | `NotificationChannel { EMAIL, IN_APP }` |
| `Notification.status` | `NotificationStatus { PENDING, SENT, FAILED }` |
| `OutboxEvent.status` | `OutboxEventStatus { PENDING, PUBLISHED, FAILED }` |

`PackageStatusHistory.fromState`/`toState` reutilizan `PackageState` (`fromState` nullable
para el evento de registro inicial). Campos como `Incident.type`, `Zone/Sector.code`,
`ShipmentType.code`, `RoutingRule.expression`, `*.reasonCode`, `OutboxEvent.eventType`
permanecen `String` por ser vocabularios abiertos o configurables por tenant.

**Riesgo conocido:** varios valores de estos enums (especialmente `PackageState` completo,
`AssignmentType`, `RoutePlanningRequestStatus`) son inferencia razonada a partir del PDF y del
código de `patterns-showcase`, no una lista explícita acordada por el equipo. Si algún
compañero ya fijó nombres distintos en otro documento, hay que ajustarlos antes de que
`backend-api`/`business-logic` empiecen a depender de ellos.

## 7. Organización de archivos

Prisma 7 soporta *schema folders* de forma estable. En vez de un único `schema.prisma` de 28
modelos, se divide por dominio (mismo agrupamiento que la Fig. 1 del PDF):

```
backend/prisma/
├── schema/
│   ├── generator.prisma        # generator + datasource
│   ├── identity.prisma         # Tenant, User, Role, Permission, UserRole, RolePermission
│   ├── catalog.prisma          # Zone, Sector, RoutingRule, ShipmentType
│   ├── packages.prisma         # Package, PackageStatusHistory
│   ├── routing.prisma          # Vehicle, Courier, RoutePlanningRequest, Route, RouteStop, Assignment
│   ├── delivery.prisma         # DeliveryAttempt, DeliveryEvidence, Incident
│   ├── messaging.prisma        # NotificationTemplate, Notification, OutboxEvent, ProcessedEvent, DeadLetterMessage
│   └── audit.prisma            # AuditLog
└── migrations/
    └── <timestamp>_init_schema/
        └── migration.sql       # generado por Prisma + bloque RLS añadido a mano al final
```

`backend/prisma7.config.ts` cambia `schema: "prisma/schema.prisma"` →
`schema: "prisma/schema"`.

## 8. Migración

Una sola migración inicial:

1. `docker compose exec backend npx prisma migrate dev --name init_schema --create-only`
2. Editar el `migration.sql` generado para añadir el bloque de RLS (sección 4.2) al final.
3. `docker compose exec backend npx prisma migrate dev` para aplicarla.

No se plantean migraciones incrementales por dominio: es el primer esquema, no hay datos que
preservar y las 28 entidades están fuertemente relacionadas entre sí.

## 9. Cambios en Docker Compose / entorno

- `docker-compose.yml`: se añade un servicio de inicialización (o un script `init.sql` montado
  en `/docker-entrypoint-initdb.d/`) que crea el rol `sls_app` con `LOGIN` y sin `BYPASSRLS`,
  y otorga `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sls_app`
  (ejecutado después de la migración, no en el init de Postgres, porque las tablas aún no
  existen en el primer arranque).
- `backend/.env.docker` / `.env.example`: añade `RUNTIME_DATABASE_URL` junto a `DATABASE_URL`.
- `README.md`: documenta el nuevo rol, las dos URLs y el comportamiento fail-closed de RLS.

## 10. Verificación

- `npx prisma validate` y `npx prisma format` sobre el schema folder.
- `docker compose exec backend npx prisma migrate dev` aplica limpio sobre una base nueva.
- Prueba manual: conectar con `sls_app` sin `SET LOCAL app.tenant_id` y confirmar 0 filas;
  con `runWithTenant`, confirmar que solo se ven filas del tenant correcto (verificar con dos
  tenants de prueba insertados directamente vía `postgres`).
- `npx prisma generate` produce el cliente sin errores de tipos.

## 11. Riesgos y límites conocidos

- El listado de enums (sección 6) es inferencia, no un contrato ya validado por todo el
  equipo — marcado explícitamente como riesgo a revisar.
- `RUNTIME_DATABASE_URL`/`sls_app` no tiene todavía quién los use de forma realista (no hay
  JWT/tenant resuelto en HTTP hasta `backend-api`); mientras tanto, cualquier prueba manual
  deberá pasar el `tenantId` a mano a `runWithTenant`.
- RLS con `current_setting('app.tenant_id', true)::uuid` falla si el valor no es un UUID
  válido — se documenta pero no se añade manejo especial de errores en esta rama.
