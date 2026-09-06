# SLS Database Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Prisma/PostgreSQL schema for SLS (27 entities from `database.mmd`) with real Row-Level Security tenant isolation, and the minimal runtime plumbing (`PrismaService`, `runWithTenant`) other branches need to consume it.

**Architecture:** A Prisma 7 multi-file schema (`backend/prisma/schema/*.prisma`), split by domain, compiled into a single initial migration. The migration's generated DDL is hand-extended with a non-superuser `sls_app` Postgres role and per-table RLS policies keyed on `current_setting('app.tenant_id')`, because Prisma has no native RLS support and superuser connections bypass RLS entirely.

**Tech Stack:** Prisma 7.10 (`prisma-client` generator), PostgreSQL 17, NestJS 11, Jest 30 (`ts-jest`), Docker Compose.

**Spec:** [docs/superpowers/specs/2026-09-06-database-schema-design.md](../specs/2026-09-06-database-schema-design.md)

## Global Constraints

- PostgreSQL 17 (`docker-compose.yml`), Prisma `^7.10.0` — do not add packages outside what's already in `backend/package.json` except where a task explicitly adds one.
- Every model name is PascalCase singular (`RoutePlanningRequest`, not `RoutePlanningRequests`); every field name is camelCase, copied verbatim from `database.mmd` where one exists there.
- Every table except `Tenant` (it has no `tenantId` — it *is* the tenant) and `Permission` (global catalog, no `tenantId`) gets `tenantId String @db.Uuid` + `@@index([tenantId])` + an RLS policy. This corrects the spec's "todas excepto Permission" line, which missed that `Tenant` itself has no `tenantId` column either — 25 of the 27 tables get RLS, not 26.
- IDs: `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`.
- Money/measurement decimals: `Decimal @db.Decimal(10, 3)` for `weightKg`/`volumeM3`; coordinates: `Decimal @db.Decimal(10, 6)` for `latitude`/`longitude`.
- No `onDelete: Cascade` anywhere in this plan — deleting a `Tenant` or any parent row must fail loudly (Postgres default `NO ACTION`) rather than silently wipe related data. This is a deliberate MVP choice, not an oversight.
- Migration workflow runs inside the `backend` container: `docker compose exec backend <command>`. All `npx prisma` commands in this plan assume that prefix; steps show the full command.
- Dev-only credential: the `sls_app` Postgres role password is `sls_app_dev_password`, hardcoded in the migration SQL and `.env.example`. This is a local Docker Compose dev database, not a deployed environment — do not treat this as a real secret.
- **Prisma 7 correction (discovered while executing Task 13):** the `prisma-client` generator produces a driver-adapter-only client. Three things in this plan's original Task 13/14/15 code blocks are wrong and were fixed during implementation:
  1. Import from `../../generated/prisma/client`, not `../../generated/prisma` (no `index.ts` is generated).
  2. `new PrismaClient({ datasourceUrl: ... })` does not exist in Prisma 7 — `PrismaClientOptions` only accepts `adapter` (a driver adapter) or `accelerateUrl`. Use `@prisma/adapter-pg`: `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.RUNTIME_DATABASE_URL }) })`. This required adding `@prisma/adapter-pg`, `pg`, and `@types/pg` to `backend/package.json`.
  3. Jest needs two additions to run anything that imports the generated client: a `moduleNameMapper` (`"^(\\.{1,2}/.*)\\.js$": "$1"`) in both `backend/package.json`'s `jest` block and `backend/test/jest-e2e.json`, because the generated client's relative imports use `.js` extensions (TS `nodenext` style) that Jest's CJS resolver can't follow to sibling `.ts` files; and `NODE_OPTIONS=--experimental-vm-modules` on the `test`/`test:e2e` npm scripts (via `cross-env`, added as a dev dependency), because Prisma 7's WASM query compiler loads itself via dynamic `import()`, which Jest's VM sandbox refuses without that flag.

---

### Task 1: Convert schema.prisma to a schema folder

**Files:**
- Delete: `backend/prisma/schema.prisma`
- Create: `backend/prisma/schema/generator.prisma`
- Modify: `backend/prisma7.config.ts`

**Interfaces:**
- Produces: the `backend/prisma/schema/` directory that every later task adds `.prisma` files into.

- [ ] **Step 1: Create the schema folder with generator + datasource**

```prisma
// backend/prisma/schema/generator.prisma
generator client {
  provider = "prisma-client"
  output   = "../../generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

(Output path gains one `../` because the file now lives one directory deeper, under `schema/`.)

- [ ] **Step 2: Point the Prisma config at the folder**

Edit `backend/prisma7.config.ts`, change:

```ts
schema: "prisma/schema.prisma",
```

to:

```ts
schema: "prisma/schema",
```

- [ ] **Step 3: Delete the old single-file schema**

```bash
rm backend/prisma/schema.prisma
```

- [ ] **Step 4: Verify the empty folder schema still validates**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema/generator.prisma backend/prisma7.config.ts
git rm backend/prisma/schema.prisma
git commit -m "chore(database): switch to Prisma multi-file schema folder"
```

---

### Task 2: Identity domain (Tenant, User, Role, Permission, UserRole, RolePermission)

**Files:**
- Create: `backend/prisma/schema/identity.prisma`

**Interfaces:**
- Produces: `Tenant`, `User`, `Role`, `Permission` models and `TenantStatus`, `UserStatus` enums, which every later domain task adds a back-relation field onto.

- [ ] **Step 1: Write the identity models**

```prisma
// backend/prisma/schema/identity.prisma
enum TenantStatus {
  ACTIVE
  SUSPENDED
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

model Tenant {
  id        String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  status    TenantStatus @default(ACTIVE)
  createdAt DateTime     @default(now())

  users           User[]
  roles           Role[]
  userRoles       UserRole[]
  rolePermissions RolePermission[]
}

model User {
  id           String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String     @db.Uuid
  email        String
  passwordHash String
  status       UserStatus @default(ACTIVE)

  tenant    Tenant     @relation(fields: [tenantId], references: [id])
  userRoles UserRole[]

  @@unique([tenantId, email])
  @@index([tenantId])
}

model Role {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid
  name     String

  tenant          Tenant           @relation(fields: [tenantId], references: [id])
  userRoles       UserRole[]
  rolePermissions RolePermission[]

  @@unique([tenantId, name])
  @@index([tenantId])
}

model Permission {
  id          String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code        String @unique
  description String

  rolePermissions RolePermission[]
}

model UserRole {
  tenantId String @db.Uuid
  userId   String @db.Uuid
  roleId   String @db.Uuid

  tenant Tenant @relation(fields: [tenantId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
  role   Role   @relation(fields: [roleId], references: [id])

  @@id([tenantId, userId, roleId])
  @@index([tenantId])
}

model RolePermission {
  tenantId     String @db.Uuid
  roleId       String @db.Uuid
  permissionId String @db.Uuid

  tenant     Tenant     @relation(fields: [tenantId], references: [id])
  role       Role       @relation(fields: [roleId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])

  @@id([tenantId, roleId, permissionId])
  @@index([tenantId])
}
```

- [ ] **Step 2: Verify**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

Run: `docker compose exec backend npx prisma format`
Expected: exits 0, no diff beyond whitespace normalization.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema/identity.prisma
git commit -m "feat(database): add identity domain models"
```

---

### Task 3: Catalog domain (Zone, Sector, RoutingRule, ShipmentType)

**Files:**
- Create: `backend/prisma/schema/catalog.prisma`
- Modify: `backend/prisma/schema/identity.prisma` (add back-relations on `Tenant`)

**Interfaces:**
- Consumes: `Tenant` from Task 2.
- Produces: `Zone`, `Sector`, `RoutingRule`, `ShipmentType` models, which the Package and Assignment tasks relate to.

- [ ] **Step 1: Write the catalog models**

```prisma
// backend/prisma/schema/catalog.prisma
model Zone {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid
  code     String
  name     String

  tenant  Tenant   @relation(fields: [tenantId], references: [id])
  sectors Sector[]

  @@unique([tenantId, code])
  @@index([tenantId])
}

model Sector {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @db.Uuid
  zoneId   String @db.Uuid
  code     String
  name     String

  tenant Tenant @relation(fields: [tenantId], references: [id])
  zone   Zone   @relation(fields: [zoneId], references: [id])

  @@unique([zoneId, code])
  @@index([tenantId])
}

model RoutingRule {
  id         String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String  @db.Uuid
  name       String
  expression String
  version    Int     @default(1)
  active     Boolean @default(true)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
}

model ShipmentType {
  id       String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String  @db.Uuid
  code     String
  name     String
  active   Boolean @default(true)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, code])
  @@index([tenantId])
}
```

- [ ] **Step 2: Add back-relations on Tenant**

In `backend/prisma/schema/identity.prisma`, inside `model Tenant`, add after `rolePermissions RolePermission[]`:

```prisma
  zones         Zone[]
  sectors       Sector[]
  routingRules  RoutingRule[]
  shipmentTypes ShipmentType[]
```

- [ ] **Step 3: Verify**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema/catalog.prisma backend/prisma/schema/identity.prisma
git commit -m "feat(database): add catalog domain models"
```

---

### Task 4: Package domain (Package, PackageStatusHistory)

**Files:**
- Create: `backend/prisma/schema/packages.prisma`
- Modify: `backend/prisma/schema/identity.prisma` (Tenant + User back-relations)
- Modify: `backend/prisma/schema/catalog.prisma` (Zone + Sector + ShipmentType back-relations)

**Interfaces:**
- Consumes: `Tenant`, `User` (Task 2), `Zone`, `Sector`, `ShipmentType` (Task 3).
- Produces: `Package`, `PackageStatusHistory` models, `PackageState`, `PackagePriority` enums — consumed by the fleet/routing and delivery domain tasks.

- [ ] **Step 1: Write the package models**

```prisma
// backend/prisma/schema/packages.prisma
enum PackageState {
  REGISTERED
  CLASSIFIED
  PENDING_ASSIGNMENT
  ASSIGNED
  READY_FOR_DISPATCH
  IN_TRANSIT
  OUT_FOR_DELIVERY
  DELIVERED
  DELIVERY_FAILED
  RESCHEDULED
  RETURNED
}

enum PackagePriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

model Package {
  id                  String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String          @db.Uuid
  zoneId              String          @db.Uuid
  sectorId            String?         @db.Uuid
  shipmentTypeId      String          @db.Uuid
  trackingCode        String
  publicTrackingToken String          @unique
  state               PackageState    @default(REGISTERED)
  weightKg            Decimal         @db.Decimal(10, 3)
  volumeM3            Decimal         @db.Decimal(10, 3)
  latitude            Decimal         @db.Decimal(10, 6)
  longitude           Decimal         @db.Decimal(10, 6)
  priority            PackagePriority @default(NORMAL)
  deadline            DateTime?

  tenant       Tenant                 @relation(fields: [tenantId], references: [id])
  zone         Zone                   @relation(fields: [zoneId], references: [id])
  sector       Sector?                @relation(fields: [sectorId], references: [id])
  shipmentType ShipmentType           @relation(fields: [shipmentTypeId], references: [id])
  statusHistory PackageStatusHistory[]

  @@unique([tenantId, trackingCode])
  @@index([tenantId])
}

model PackageStatusHistory {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String        @db.Uuid
  packageId       String        @db.Uuid
  fromState       PackageState?
  toState         PackageState
  reasonCode      String?
  changedByUserId String?       @db.Uuid
  createdAt       DateTime      @default(now())

  tenant        Tenant  @relation(fields: [tenantId], references: [id])
  package       Package @relation(fields: [packageId], references: [id])
  changedByUser User?   @relation(fields: [changedByUserId], references: [id])

  @@index([tenantId])
}
```

- [ ] **Step 2: Add back-relations on Tenant and User**

In `identity.prisma`, `model Tenant`, add:

```prisma
  packages              Package[]
  packageStatusHistories PackageStatusHistory[]
```

In `identity.prisma`, `model User`, add after `userRoles UserRole[]`:

```prisma
  changedPackageStatuses PackageStatusHistory[]
```

- [ ] **Step 3: Add back-relations on Zone, Sector, ShipmentType**

In `catalog.prisma`, `model Zone`, add: `packages Package[]`
In `catalog.prisma`, `model Sector`, add: `packages Package[]`
In `catalog.prisma`, `model ShipmentType`, add: `packages Package[]`

- [ ] **Step 4: Verify**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema/packages.prisma backend/prisma/schema/identity.prisma backend/prisma/schema/catalog.prisma
git commit -m "feat(database): add package domain models"
```

---

### Task 5: Fleet & routing domain (Vehicle, Courier, RoutePlanningRequest, Route, RouteStop, Assignment)

**Files:**
- Create: `backend/prisma/schema/routing.prisma`
- Modify: `backend/prisma/schema/identity.prisma` (Tenant + User back-relations)
- Modify: `backend/prisma/schema/packages.prisma` (Package back-relation)
- Modify: `backend/prisma/schema/catalog.prisma` (RoutingRule back-relation)

**Interfaces:**
- Consumes: `Tenant`, `User` (Task 2), `Package` (Task 4), `RoutingRule` (Task 3).
- Produces: `Vehicle`, `Courier`, `RoutePlanningRequest`, `Route`, `RouteStop`, `Assignment` models and their enums — consumed by the delivery domain task.

- [ ] **Step 1: Write the routing models**

```prisma
// backend/prisma/schema/routing.prisma
enum VehicleStatus {
  ACTIVE
  INACTIVE
  MAINTENANCE
}

enum CourierStatus {
  ACTIVE
  INACTIVE
}

enum RoutePlanningRequestStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
}

enum RouteState {
  PLANNED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum RouteStopState {
  PENDING
  COMPLETED
  FAILED
}

enum AssignmentType {
  INITIAL
  REASSIGNMENT
}

enum AssignmentStatus {
  ACTIVE
  ENDED
  CANCELLED
}

model Vehicle {
  id           String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String        @db.Uuid
  plate        String
  maxWeightKg  Decimal       @db.Decimal(10, 3)
  maxVolumeM3  Decimal       @db.Decimal(10, 3)
  status       VehicleStatus @default(ACTIVE)

  tenant      Tenant       @relation(fields: [tenantId], references: [id])
  routes      Route[]
  assignments Assignment[]

  @@unique([tenantId, plate])
  @@index([tenantId])
}

model Courier {
  id       String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String        @db.Uuid
  userId   String        @db.Uuid
  status   CourierStatus @default(ACTIVE)

  tenant           Tenant             @relation(fields: [tenantId], references: [id])
  user             User               @relation(fields: [userId], references: [id])
  routes           Route[]
  assignments      Assignment[]

  @@unique([userId])
  @@index([tenantId])
}

model RoutePlanningRequest {
  id                String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String                      @db.Uuid
  requestedByUserId String                      @db.Uuid
  status            RoutePlanningRequestStatus  @default(PENDING)
  parameters        Json
  failureReason     String?
  createdAt         DateTime                    @default(now())
  completedAt       DateTime?

  tenant         Tenant  @relation(fields: [tenantId], references: [id])
  requestedByUser User   @relation(fields: [requestedByUserId], references: [id])
  routes         Route[]

  @@index([tenantId])
}

model Route {
  id                String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String     @db.Uuid
  planningRequestId String     @db.Uuid
  vehicleId         String     @db.Uuid
  courierId         String     @db.Uuid
  state             RouteState @default(PLANNED)
  plannedAt         DateTime   @default(now())
  startedAt         DateTime?
  completedAt       DateTime?

  tenant           Tenant                @relation(fields: [tenantId], references: [id])
  planningRequest  RoutePlanningRequest  @relation(fields: [planningRequestId], references: [id])
  vehicle          Vehicle               @relation(fields: [vehicleId], references: [id])
  courier          Courier               @relation(fields: [courierId], references: [id])
  stops            RouteStop[]
  assignments      Assignment[]

  @@index([tenantId])
}

model RouteStop {
  id        String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String         @db.Uuid
  routeId   String         @db.Uuid
  sequence  Int
  latitude  Decimal        @db.Decimal(10, 6)
  longitude Decimal        @db.Decimal(10, 6)
  state     RouteStopState @default(PENDING)

  tenant      Tenant       @relation(fields: [tenantId], references: [id])
  route       Route        @relation(fields: [routeId], references: [id])
  assignments Assignment[]

  @@unique([routeId, sequence])
  @@index([tenantId])
}

model Assignment {
  id                     String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId               String           @db.Uuid
  packageId              String           @db.Uuid
  routeId                String?          @db.Uuid
  routeStopId            String?          @db.Uuid
  vehicleId              String?          @db.Uuid
  courierId              String?          @db.Uuid
  routingRuleId          String?          @db.Uuid
  responsibleUserId      String?          @db.Uuid
  assignmentType         AssignmentType
  status                 AssignmentStatus @default(ACTIVE)
  reasonCode             String?
  ruleExpressionSnapshot String?
  createdAt              DateTime         @default(now())
  endedAt                DateTime?

  tenant          Tenant       @relation(fields: [tenantId], references: [id])
  package         Package      @relation(fields: [packageId], references: [id])
  route           Route?       @relation(fields: [routeId], references: [id])
  routeStop       RouteStop?   @relation(fields: [routeStopId], references: [id])
  vehicle         Vehicle?     @relation(fields: [vehicleId], references: [id])
  courier         Courier?     @relation(fields: [courierId], references: [id])
  routingRule     RoutingRule? @relation(fields: [routingRuleId], references: [id])
  responsibleUser User?        @relation(fields: [responsibleUserId], references: [id])

  @@index([tenantId])
}
```

- [ ] **Step 2: Add back-relations on Tenant and User**

In `identity.prisma`, `model Tenant`, add:

```prisma
  vehicles              Vehicle[]
  couriers              Courier[]
  routePlanningRequests RoutePlanningRequest[]
  routes                Route[]
  routeStops            RouteStop[]
  assignments           Assignment[]
```

In `identity.prisma`, `model User`, add after `changedPackageStatuses PackageStatusHistory[]`:

```prisma
  courier               Courier?
  routePlanningRequests RoutePlanningRequest[]
  assignmentsResponsible Assignment[]
```

- [ ] **Step 3: Add back-relation on Package**

In `packages.prisma`, `model Package`, add after `statusHistory PackageStatusHistory[]`: `assignments Assignment[]`

- [ ] **Step 4: Add back-relation on RoutingRule**

In `catalog.prisma`, `model RoutingRule`, add: `assignments Assignment[]`

- [ ] **Step 5: Verify**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema/routing.prisma backend/prisma/schema/identity.prisma backend/prisma/schema/packages.prisma backend/prisma/schema/catalog.prisma
git commit -m "feat(database): add fleet and routing domain models"
```

---

### Task 6: Delivery domain (DeliveryAttempt, DeliveryEvidence, Incident)

**Files:**
- Create: `backend/prisma/schema/delivery.prisma`
- Modify: `backend/prisma/schema/identity.prisma` (Tenant + User back-relations)
- Modify: `backend/prisma/schema/routing.prisma` (RouteStop, Route, Courier back-relations)
- Modify: `backend/prisma/schema/packages.prisma` (Package back-relation)

**Interfaces:**
- Consumes: `Tenant`, `User` (Task 2), `Package` (Task 4), `RouteStop`, `Route`, `Courier` (Task 5).
- Produces: `DeliveryAttempt`, `DeliveryEvidence`, `Incident` models and `DeliveryOutcome`, `IncidentStatus` enums.

- [ ] **Step 1: Write the delivery models**

```prisma
// backend/prisma/schema/delivery.prisma
enum DeliveryOutcome {
  DELIVERED
  FAILED
  RESCHEDULED
}

enum IncidentStatus {
  OPEN
  RESOLVED
  CLOSED
}

model DeliveryAttempt {
  id            String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String          @db.Uuid
  routeStopId   String          @db.Uuid
  packageId     String          @db.Uuid
  courierId     String          @db.Uuid
  attemptNumber Int
  outcome       DeliveryOutcome
  notes         String?
  attemptedAt   DateTime        @default(now())

  tenant    Tenant             @relation(fields: [tenantId], references: [id])
  routeStop RouteStop          @relation(fields: [routeStopId], references: [id])
  package   Package            @relation(fields: [packageId], references: [id])
  courier   Courier            @relation(fields: [courierId], references: [id])
  evidence  DeliveryEvidence[]

  @@unique([routeStopId, attemptNumber])
  @@index([tenantId])
}

model DeliveryEvidence {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String   @db.Uuid
  deliveryAttemptId  String   @db.Uuid
  evidenceType       String
  storageKey         String
  checksum           String
  createdAt          DateTime @default(now())

  tenant           Tenant           @relation(fields: [tenantId], references: [id])
  deliveryAttempt  DeliveryAttempt  @relation(fields: [deliveryAttemptId], references: [id])

  @@index([tenantId])
}

model Incident {
  id               String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String         @db.Uuid
  routeId          String?        @db.Uuid
  routeStopId      String?        @db.Uuid
  packageId        String?        @db.Uuid
  reportedByUserId String         @db.Uuid
  type             String
  description      String
  status           IncidentStatus @default(OPEN)
  reportedAt       DateTime       @default(now())

  tenant         Tenant     @relation(fields: [tenantId], references: [id])
  route          Route?     @relation(fields: [routeId], references: [id])
  routeStop      RouteStop? @relation(fields: [routeStopId], references: [id])
  package        Package?   @relation(fields: [packageId], references: [id])
  reportedByUser User       @relation(fields: [reportedByUserId], references: [id])

  @@index([tenantId])
}
```

- [ ] **Step 2: Add back-relations on Tenant and User**

In `identity.prisma`, `model Tenant`, add:

```prisma
  deliveryAttempts DeliveryAttempt[]
  deliveryEvidence DeliveryEvidence[]
  incidents        Incident[]
```

In `identity.prisma`, `model User`, add after `assignmentsResponsible Assignment[]`:

```prisma
  reportedIncidents Incident[]
```

- [ ] **Step 3: Add back-relations on RouteStop, Route, Courier**

In `routing.prisma`, `model RouteStop`, add after `assignments Assignment[]`:

```prisma
  deliveryAttempts DeliveryAttempt[]
  incidents        Incident[]
```

In `routing.prisma`, `model Route`, add after `assignments Assignment[]`: `incidents Incident[]`
In `routing.prisma`, `model Courier`, add after `assignments Assignment[]`: `deliveryAttempts DeliveryAttempt[]`

- [ ] **Step 4: Add back-relation on Package**

In `packages.prisma`, `model Package`, add after `assignments Assignment[]`:

```prisma
  deliveryAttempts DeliveryAttempt[]
  incidents        Incident[]
```

- [ ] **Step 5: Verify**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema/delivery.prisma backend/prisma/schema/identity.prisma backend/prisma/schema/routing.prisma backend/prisma/schema/packages.prisma
git commit -m "feat(database): add delivery domain models"
```

---

### Task 7: Messaging domain (NotificationTemplate, Notification, OutboxEvent, ProcessedEvent, DeadLetterMessage)

**Files:**
- Create: `backend/prisma/schema/messaging.prisma`
- Modify: `backend/prisma/schema/identity.prisma` (Tenant back-relations only — no User FKs in this domain)

**Interfaces:**
- Consumes: `Tenant` (Task 2).
- Produces: `NotificationTemplate`, `Notification`, `OutboxEvent`, `ProcessedEvent`, `DeadLetterMessage` models and their enums.

- [ ] **Step 1: Write the messaging models**

```prisma
// backend/prisma/schema/messaging.prisma
enum NotificationChannel {
  EMAIL
  IN_APP
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
}

enum OutboxEventStatus {
  PENDING
  PUBLISHED
  FAILED
}

model NotificationTemplate {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String              @db.Uuid
  eventType       String
  channel         NotificationChannel
  subjectTemplate String
  bodyTemplate    String
  active          Boolean             @default(true)

  tenant        Tenant         @relation(fields: [tenantId], references: [id])
  notifications Notification[]

  @@unique([tenantId, eventType, channel])
  @@index([tenantId])
}

model Notification {
  id            String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String              @db.Uuid
  templateId    String?             @db.Uuid
  sourceEventId String?             @db.Uuid
  recipient     String
  channel       NotificationChannel
  status        NotificationStatus  @default(PENDING)
  attempts      Int                 @default(0)
  sentAt        DateTime?

  tenant   Tenant                @relation(fields: [tenantId], references: [id])
  template NotificationTemplate? @relation(fields: [templateId], references: [id])

  @@index([tenantId])
}

model OutboxEvent {
  id            String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String             @db.Uuid
  eventId       String             @unique @db.Uuid
  correlationId String?            @db.Uuid
  eventType     String
  version       Int                @default(1)
  payload       Json
  status        OutboxEventStatus  @default(PENDING)
  attempts      Int                @default(0)
  occurredAt    DateTime           @default(now())
  publishedAt   DateTime?

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
}

model ProcessedEvent {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @db.Uuid
  eventId      String   @db.Uuid
  consumerName String
  processedAt  DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, eventId, consumerName])
  @@index([tenantId])
}

model DeadLetterMessage {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String    @db.Uuid
  eventId       String    @db.Uuid
  correlationId String?   @db.Uuid
  sourceQueue   String
  consumerName  String
  attempts      Int
  originalEvent Json
  failureReason String
  failedAt      DateTime  @default(now())
  redrivenAt    DateTime?

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
}
```

- [ ] **Step 2: Add back-relations on Tenant**

In `identity.prisma`, `model Tenant`, add:

```prisma
  notificationTemplates NotificationTemplate[]
  notifications         Notification[]
  outboxEvents          OutboxEvent[]
  processedEvents       ProcessedEvent[]
  deadLetterMessages    DeadLetterMessage[]
```

- [ ] **Step 3: Verify**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema/messaging.prisma backend/prisma/schema/identity.prisma
git commit -m "feat(database): add messaging domain models"
```

---

### Task 8: Audit domain (AuditLog)

**Files:**
- Create: `backend/prisma/schema/audit.prisma`
- Modify: `backend/prisma/schema/identity.prisma` (Tenant + User back-relations)

**Interfaces:**
- Consumes: `Tenant`, `User` (Task 2).
- Produces: `AuditLog` model. This is the last domain — after this task the full 27-model graph is closed with no dangling references.

- [ ] **Step 1: Write the audit model**

```prisma
// backend/prisma/schema/audit.prisma
model AuditLog {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @db.Uuid
  actorUserId   String?  @db.Uuid
  action        String
  entityType    String
  entityId      String   @db.Uuid
  correlationId String?  @db.Uuid
  metadata      Json
  createdAt     DateTime @default(now())

  tenant    Tenant @relation(fields: [tenantId], references: [id])
  actorUser User?  @relation(fields: [actorUserId], references: [id])

  @@index([tenantId])
}
```

- [ ] **Step 2: Add back-relations on Tenant and User**

In `identity.prisma`, `model Tenant`, add: `auditLogs AuditLog[]`
In `identity.prisma`, `model User`, add after `reportedIncidents Incident[]`: `auditLogs AuditLog[]`

- [ ] **Step 3: Verify**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema/audit.prisma backend/prisma/schema/identity.prisma
git commit -m "feat(database): add audit domain model"
```

---

### Task 9: Full schema format pass

**Files:**
- Modify: all files under `backend/prisma/schema/` (formatting only, via `prisma format`)

**Interfaces:**
- Consumes: the complete schema from Tasks 1–8.
- Produces: nothing new — this is a formatting checkpoint before generating the migration.

- [ ] **Step 1: Run the full validate + format**

Run: `docker compose exec backend npx prisma validate`
Expected: `The schema at prisma/schema is valid 🚀`

Run: `docker compose exec backend npx prisma format`
Expected: exits 0. If it reformats any file, that's expected — Prisma aligns column widths across the whole file.

- [ ] **Step 2: Review the diff and commit if anything changed**

```bash
git diff backend/prisma/schema
```

If there is a diff:

```bash
git add backend/prisma/schema
git commit -m "chore(database): run prisma format over full schema"
```

If there is no diff, skip the commit — nothing to do for this task.

---

### Task 10: Generate the initial migration and add RLS

**Files:**
- Create: `backend/prisma/migrations/<timestamp>_init_schema/migration.sql` (Prisma-generated, then hand-edited)

**Interfaces:**
- Consumes: the full schema from Task 9.
- Produces: the migration file that Task 12 applies. Defines the `sls_app` role and RLS policies that Task 14's `runWithTenant` and Task 15's e2e test depend on.

- [ ] **Step 1: Generate the migration SQL without applying it**

Run: `docker compose exec backend npx prisma migrate dev --name init_schema --create-only`
Expected: creates `backend/prisma/migrations/<timestamp>_init_schema/migration.sql` containing `CREATE TYPE`/`CREATE TABLE`/`ALTER TABLE ... ADD CONSTRAINT` statements for all 27 models. Does not touch the database yet (`--create-only`).

- [ ] **Step 2: Append the `sls_app` role and grants to the end of the generated file**

```sql
-- Runtime application role (non-superuser, subject to RLS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'sls_app') THEN
    CREATE ROLE sls_app WITH LOGIN PASSWORD 'sls_app_dev_password';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO sls_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sls_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sls_app;
```

- [ ] **Step 3: Append RLS enable/force/policy for every tenant-scoped table**

Append this block, one table at a time, for these 25 tables (every model except `Tenant` and `Permission`): `User`, `Role`, `UserRole`, `RolePermission`, `Zone`, `Sector`, `RoutingRule`, `ShipmentType`, `Package`, `PackageStatusHistory`, `Vehicle`, `Courier`, `RoutePlanningRequest`, `Route`, `RouteStop`, `Assignment`, `DeliveryAttempt`, `DeliveryEvidence`, `Incident`, `NotificationTemplate`, `Notification`, `OutboxEvent`, `ProcessedEvent`, `DeadLetterMessage`, `AuditLog`.

```sql
-- Row-Level Security: one block per tenant-scoped table.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserRole"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RolePermission"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Zone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Zone" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Zone"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Sector" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sector" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Sector"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "RoutingRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoutingRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RoutingRule"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "ShipmentType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShipmentType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ShipmentType"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Package" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Package" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Package"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "PackageStatusHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PackageStatusHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PackageStatusHistory"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Vehicle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vehicle" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Vehicle"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Courier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Courier" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Courier"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "RoutePlanningRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RoutePlanningRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RoutePlanningRequest"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Route" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Route" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Route"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "RouteStop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RouteStop" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RouteStop"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Assignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Assignment"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "DeliveryAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeliveryAttempt"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "DeliveryEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryEvidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeliveryEvidence"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Incident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Incident" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Incident"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "NotificationTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationTemplate"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OutboxEvent"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "ProcessedEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProcessedEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProcessedEvent"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "DeadLetterMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeadLetterMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeadLetterMessage"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("tenantId" = current_setting('app.tenant_id', true)::uuid);
```

- [ ] **Step 4: Verify the file is valid SQL by dry-running it against a throwaway database**

Run: `docker compose exec postgres psql -U postgres -c "CREATE DATABASE sls_migration_check;"`
Run: `docker compose exec -T postgres psql -U postgres -d sls_migration_check < backend/prisma/migrations/*/migration.sql`
Expected: every statement reports `CREATE TABLE`/`ALTER TABLE`/`CREATE POLICY`/`DO` with no `ERROR`.

Run: `docker compose exec postgres psql -U postgres -c "DROP DATABASE sls_migration_check;"`

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/migrations
git commit -m "feat(database): generate init_schema migration with RLS and sls_app role"
```

---

### Task 11: Docker Compose and environment variables for the runtime role

**Files:**
- Modify: `docker-compose.yml`
- Create: `backend/.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: the `sls_app` role and password defined in Task 10's migration.
- Produces: `RUNTIME_DATABASE_URL` env var that Task 13's `PrismaService` reads.

- [ ] **Step 1: Document both connection URLs in `backend/.env.example`**

```env
# Used by Prisma CLI (migrate, generate) — connects as the postgres superuser.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sls?schema=public"

# Used by the NestJS app at runtime — connects as sls_app, subject to Row-Level Security.
RUNTIME_DATABASE_URL="postgresql://sls_app:sls_app_dev_password@localhost:5432/sls?schema=public"
```

- [ ] **Step 2: Update the README's env instructions**

In `README.md`, replace the existing "Crea `backend/.env.docker`..." block:

```markdown
Crea `backend/.env.docker` con las dos conexiones que usa el backend (una para migraciones,
otra para runtime — ver la sección de Row-Level Security más abajo):

```env
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/sls?schema=public"
RUNTIME_DATABASE_URL="postgresql://sls_app:sls_app_dev_password@postgres:5432/sls?schema=public"
```
```

- [ ] **Step 3: Add a "Row-Level Security" section to the README**, after the existing "## Prisma" section:

```markdown
## Aislamiento multi-tenant (Row-Level Security)

Todas las tablas con `tenantId` tienen RLS habilitado en PostgreSQL. El rol `postgres`
(usado solo para migraciones) es superusuario y **no** está sujeto a RLS; el backend se
conecta en runtime con el rol `sls_app`, que sí lo está.

Sin fijar el tenant en la sesión, cualquier consulta sobre esas tablas devuelve 0 filas
(fail-closed). El helper `runWithTenant` en `backend/src/database` hace este `SET LOCAL`
por cada transacción:

```ts
await runWithTenant(prisma, tenantId, async (tx) => tx.package.findMany());
```

El rol `sls_app` y sus políticas se crean como parte de la migración
`init_schema` (`backend/prisma/migrations/*_init_schema/migration.sql`), no en
`docker-entrypoint-initdb.d`, porque las tablas todavía no existen en el primer arranque
del contenedor de Postgres.
```

- [ ] **Step 4: Verify Docker Compose config parses**

Run: `docker compose config --quiet`
Expected: exits 0, no output.

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example README.md
git commit -m "docs(database): document RUNTIME_DATABASE_URL and RLS setup"
```

Note: `docker-compose.yml` itself needs no changes for this task — the `sls_app` role lives inside the Postgres data volume once the migration runs, not in the Compose file.

---

### Task 12: Apply the migration against a fresh database and generate the client

**Files:**
- None created/modified by this task — this is a verification checkpoint. (Creates `backend/.env.docker`, which is gitignored, if it doesn't exist yet.)

**Interfaces:**
- Consumes: everything from Tasks 1–11.
- Produces: the generated Prisma client at `backend/generated/prisma`, which Task 13's `PrismaService` imports.

- [ ] **Step 1: Create the local `.env.docker` if it doesn't already exist**

```bash
test -f backend/.env.docker || cp backend/.env.example backend/.env.docker
```

Then edit `backend/.env.docker` so both URLs use host `postgres` (the Docker network hostname), matching the README:

```env
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/sls?schema=public"
RUNTIME_DATABASE_URL="postgresql://sls_app:sls_app_dev_password@postgres:5432/sls?schema=public"
```

- [ ] **Step 2: Reset the dev database volume to guarantee a clean apply**

```bash
docker compose down -v
docker compose up -d postgres
```

- [ ] **Step 3: Apply the migration**

Run: `docker compose exec backend npx prisma migrate deploy`
Expected: `1 migration found... Applying migration \`<timestamp>_init_schema\`... All migrations have been successfully applied.`

- [ ] **Step 4: Generate the Prisma client**

Run: `docker compose exec backend npx prisma generate`
Expected: `Generated Prisma Client... to ./generated/prisma`

- [ ] **Step 5: Spot-check RLS is actually active**

Run: `docker compose exec postgres psql -U postgres -d sls -c "SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Package';"`
Expected: one row, `rowsecurity = t`, `forcerowsecurity = t`.

Run: `docker compose exec postgres psql -U postgres -d sls -c "\du sls_app"`
Expected: `sls_app` listed, with no `Superuser` or `Bypass RLS` attribute.

- [ ] **Step 6: No commit** — this task only verifies infrastructure state; `.env.docker` is gitignored and nothing else changed.

---

### Task 13: PrismaService and PrismaModule

**Files:**
- Create: `backend/src/database/prisma.service.ts`
- Create: `backend/src/database/prisma.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaClient` generated at `backend/generated/prisma` (Task 12), `RUNTIME_DATABASE_URL` env var (Task 11).
- Produces: `PrismaService` (injectable, extends `PrismaClient`), exported by `PrismaModule` — this is what Task 14's `runWithTenant` takes as its first argument, and what `backend-api` will inject into its own services.

- [ ] **Step 1: Write PrismaService**

```ts
// backend/src/database/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.RUNTIME_DATABASE_URL,
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Requires `@prisma/adapter-pg`, `pg`, and `@types/pg` — see the Global Constraints correction note.

- [ ] **Step 2: Write PrismaModule**

```ts
// backend/src/database/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 3: Wire it into AppModule**

Edit `backend/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 4: Add Jest configuration the generated Prisma client needs**

Two changes are required before any test can import anything that pulls in `PrismaService` — without them, Jest fails with "Cannot find module './internal/class.js'" and then "A dynamic import callback was invoked without --experimental-vm-modules". See the Global Constraints correction note for why.

In `backend/package.json`'s `jest` block, add `moduleNameMapper` next to `transform`:

```json
"moduleNameMapper": {
  "^(\\.{1,2}/.*)\\.js$": "$1"
},
```

In `backend/test/jest-e2e.json`, add the same key:

```json
"moduleNameMapper": {
  "^(\\.{1,2}/.*)\\.js$": "$1"
}
```

Add `cross-env` as a dev dependency and prefix the `test`, `test:watch`, `test:cov`, and `test:e2e` scripts in `backend/package.json` with `cross-env NODE_OPTIONS=--experimental-vm-modules`:

```bash
npm install -D cross-env
```

```json
"test": "cross-env NODE_OPTIONS=--experimental-vm-modules jest",
"test:watch": "cross-env NODE_OPTIONS=--experimental-vm-modules jest --watch",
"test:cov": "cross-env NODE_OPTIONS=--experimental-vm-modules jest --coverage",
"test:e2e": "cross-env NODE_OPTIONS=--experimental-vm-modules jest --config ./test/jest-e2e.json"
```

Then sync dependencies in the running container (it has its own `node_modules` volume, separate from the host):

Run: `docker compose exec backend npm install`

- [ ] **Step 5: Verify the app still boots**

Run: `docker compose exec backend npx nest build`
Expected: exits 0, no TypeScript errors.

Run: `docker compose exec backend npm run test:e2e`
Expected: the existing `AppController (e2e)` test still passes — confirms `PrismaModule` (now `@Global`, imported into `AppModule`) doesn't break app bootstrap, and that it can actually `$connect()`/`$disconnect()` as `sls_app` against the real database.

- [ ] **Step 6: Commit**

```bash
git add backend/src/database/prisma.service.ts backend/src/database/prisma.module.ts backend/src/app.module.ts backend/package.json backend/package-lock.json backend/test/jest-e2e.json
git commit -m "feat(database): add PrismaService and PrismaModule"
```

---

### Task 14: runWithTenant helper

**Files:**
- Create: `backend/src/database/run-with-tenant.ts`
- Test: `backend/src/database/run-with-tenant.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 13).
- Produces: `runWithTenant<T>(prisma: PrismaClient, tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>` and `isValidTenantId(value: string): boolean` — the second is exported so the unit test (and later, `backend-api`'s auth middleware) can validate a tenant id before it ever reaches raw SQL.

- [ ] **Step 1: Write the failing test for UUID validation**

```ts
// backend/src/database/run-with-tenant.spec.ts
import { isValidTenantId } from './run-with-tenant';

describe('isValidTenantId', () => {
  it('accepts a well-formed UUID', () => {
    expect(isValidTenantId('123e4567-e89b-12d3-a456-426614174000')).toBe(
      true,
    );
  });

  it('rejects a value that is not a UUID', () => {
    expect(isValidTenantId("'; DROP TABLE \"Package\"; --")).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidTenantId('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `docker compose exec backend npx jest run-with-tenant --runInBand`
Expected: FAIL — `Cannot find module './run-with-tenant'`

- [ ] **Step 3: Implement runWithTenant and isValidTenantId**

```ts
// backend/src/database/run-with-tenant.ts
import { Prisma, PrismaClient } from '../../generated/prisma/client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTenantId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function runWithTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!isValidTenantId(tenantId)) {
    throw new Error(`runWithTenant: "${tenantId}" is not a valid tenant id`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL app.tenant_id = '${tenantId}'`,
    );
    return fn(tx);
  });
}
```

(`isValidTenantId` runs *before* the string ever reaches `$executeRawUnsafe`, so the interpolation is safe — `SET LOCAL` doesn't support bind parameters, which is why validation happens here instead.)

- [ ] **Step 4: Run the test again and confirm it passes**

Run: `docker compose exec backend npx jest run-with-tenant --runInBand`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/run-with-tenant.ts backend/src/database/run-with-tenant.spec.ts
git commit -m "feat(database): add runWithTenant helper with tenant id validation"
```

---

### Task 15: End-to-end proof of tenant isolation

**Files:**
- Test: `backend/test/tenant-isolation.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaClient` (admin, via `DATABASE_URL`), `PrismaService` (Task 13), `runWithTenant` (Task 14), the applied migration (Task 12).
- Produces: nothing consumed elsewhere — this is the proof that RLS actually isolates tenants, not just that the SQL applied without error.

**Precondition:** `docker compose up -d postgres` running with Task 12's migration already applied.

- [ ] **Step 1: Write the failing test**

```ts
// backend/test/tenant-isolation.e2e-spec.ts
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../src/database/prisma.service';
import { runWithTenant } from '../src/database/run-with-tenant';

describe('Tenant isolation (RLS)', () => {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const app = new PrismaService();

  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    await admin.$connect();
    await app.onModuleInit();

    const tenantA = await admin.tenant.create({
      data: { name: 'Tenant A' },
    });
    const tenantB = await admin.tenant.create({
      data: { name: 'Tenant B' },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const zoneA = await admin.zone.create({
      data: { tenantId: tenantAId, code: 'A-Z1', name: 'Zone A1' },
    });
    const shipmentTypeA = await admin.shipmentType.create({
      data: { tenantId: tenantAId, code: 'A-ST1', name: 'Standard' },
    });
    await admin.package.create({
      data: {
        tenantId: tenantAId,
        zoneId: zoneA.id,
        shipmentTypeId: shipmentTypeA.id,
        trackingCode: 'TRACK-A-1',
        publicTrackingToken: 'TOKEN-A-1',
        weightKg: '1.5',
        volumeM3: '0.1',
        latitude: '10.0',
        longitude: '-74.0',
      },
    });

    const zoneB = await admin.zone.create({
      data: { tenantId: tenantBId, code: 'B-Z1', name: 'Zone B1' },
    });
    const shipmentTypeB = await admin.shipmentType.create({
      data: { tenantId: tenantBId, code: 'B-ST1', name: 'Standard' },
    });
    await admin.package.create({
      data: {
        tenantId: tenantBId,
        zoneId: zoneB.id,
        shipmentTypeId: shipmentTypeB.id,
        trackingCode: 'TRACK-B-1',
        publicTrackingToken: 'TOKEN-B-1',
        weightKg: '2.5',
        volumeM3: '0.2',
        latitude: '11.0',
        longitude: '-75.0',
      },
    });
  });

  afterAll(async () => {
    await admin.package.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await admin.shipmentType.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await admin.zone.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await admin.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId] } },
    });
    await admin.$disconnect();
    await app.onModuleDestroy();
  });

  it('returns zero rows on the sls_app connection with no tenant set', async () => {
    const packages = await app.package.findMany();
    expect(packages).toHaveLength(0);
  });

  it('returns only tenant A packages when scoped to tenant A', async () => {
    const packages = await runWithTenant(app, tenantAId, (tx) =>
      tx.package.findMany(),
    );
    expect(packages).toHaveLength(1);
    expect(packages[0].trackingCode).toBe('TRACK-A-1');
  });

  it('returns only tenant B packages when scoped to tenant B', async () => {
    const packages = await runWithTenant(app, tenantBId, (tx) =>
      tx.package.findMany(),
    );
    expect(packages).toHaveLength(1);
    expect(packages[0].trackingCode).toBe('TRACK-B-1');
  });
});
```

- [ ] **Step 2: Run it and confirm it currently fails**

Run: `docker compose exec backend npm run test:e2e -- tenant-isolation`
Expected: FAIL at this point only if Task 12's migration hasn't been applied yet in the running container. If Tasks 1–14 are already done and the migration is applied, this test can pass immediately — in that case, skip straight to Step 3 and note in the commit message that this task validates existing behavior rather than driving new code.

- [ ] **Step 3: Run it and confirm it passes**

Run: `docker compose exec backend npm run test:e2e -- tenant-isolation`
Expected: PASS — 3 tests (`0 rows unscoped`, `tenant A sees only A`, `tenant B sees only B`).

- [ ] **Step 4: Commit**

```bash
git add backend/test/tenant-isolation.e2e-spec.ts
git commit -m "test(database): prove RLS tenant isolation end-to-end"
```

---

### Task 16: Final README pass

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing — documentation only.

- [ ] **Step 1: Update the "Estado" section**

Replace:

```markdown
## Estado

La infraestructura Docker, los proyectos base de frontend/backend, PostgreSQL y Prisma están configurados. Aún están pendientes el modelo de datos, la API, autenticación, interfaz y módulos logísticos.
```

with:

```markdown
## Estado

La infraestructura Docker, los proyectos base de frontend/backend, PostgreSQL y Prisma están
configurados. El modelo de datos completo (27 entidades) está implementado con aislamiento
multi-tenant por Row-Level Security — ver la sección "Aislamiento multi-tenant" arriba. Aún
están pendientes la API, autenticación, interfaz y módulos logísticos.
```

- [ ] **Step 2: Verify the README renders sensibly**

Run: `docker compose exec backend npx prettier --check ../README.md 2>/dev/null; echo done`
(Prettier may not be configured for Markdown — the goal is just a manual read-through, not a tool gate.)

Read the full file back and confirm no broken headings or duplicated sections.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update project status for database schema completion"
```

---

## Post-plan: pull request

Once all 16 tasks are committed on `feature/database`, open a PR against `develop` (per the confirmed git flow `feature/database → develop → main`), not `main` directly — despite what the current README conventions section says, since `develop` already exists as the team's integration branch.
