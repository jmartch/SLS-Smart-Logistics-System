# AGENTS.md - Smart Logistics System (SLS)

## 1. Purpose and authority

This file is the repository-level source of truth for developers and AI agents working on SLS. Read it before making significant changes.

Instruction precedence for project decisions:

1. The user's current explicit request.
2. This `AGENTS.md`.
3. Accepted ADRs and current technical documentation.
4. Existing implementation and tests.
5. Historical project notes.

Historical documents describe an earlier single-company, pre-dispatch MVP. The following newer decisions supersede that scope:

- Multi-tenancy is required now, not a future feature.
- The route lifecycle continues through delivery, failed attempts, rescheduling, return, and route closure.
- Internal and email notifications are required.
- Route planning includes manual implementation of coordinate validation, distance calculation, clustering, capacity-aware assignment, and stop ordering.
- The assigned architecture and patterns must be implemented and demonstrated, not only documented.

When a new request conflicts with these decisions, explain the impact before changing the scope.

## 2. Current repository state

The repository currently contains infrastructure and framework starters only:

- `frontend/`: React, TypeScript, and Vite starter.
- `backend/`: NestJS, TypeScript, Prisma, and Jest starter.
- `docker-compose.yml`: frontend, backend, and PostgreSQL 17.
- `backend/prisma/schema.prisma`: datasource and generator only; no domain models.

The following are **not implemented yet** unless the repository changes after this file is read:

- Domain model and migrations.
- Authentication, authorization, and tenant isolation.
- Logistics modules and API.
- RabbitMQ, workers, retry queues, and DLQs.
- Route-planning algorithms.
- GoF pattern prototypes.
- Notifications and delivery evidence.
- Functional frontend screens.

Do not describe target architecture as existing implementation. Inspect the repository before reporting status.

## 3. Product definition

SLS is a web-based SaaS B2B platform for urban messaging and distribution companies. It centralizes the package lifecycle from reception to delivery, rescheduling, or return.

Primary value:

- Reduce manual registration and classification errors.
- Group destinations and plan routes.
- Respect vehicle weight and volume capacity.
- Track package and route status.
- Record delivery attempts, incidents, and basic evidence.
- Notify internal users, senders, and recipients.
- Keep each company's data isolated.

Initial market context is Barranquilla, Colombia, but the model must support other companies and cities without redesigning the core.

## 4. Required end-to-end flow

The system must support this complete flow:

1. Receive a package with a guide, barcode, or QR code.
2. Register package, sender, recipient, address, contact, dimensions, weight, priority, and deadline.
3. Obtain or receive coordinates and validate them.
4. Classify the package by tenant, zone, sector, priority, and constraints.
5. Select packages pending route planning.
6. Calculate distances and group destinations into clusters.
7. Validate vehicle, courier, weight, volume, and availability.
8. Create routes and order their stops.
9. Allow coordinator review and manual correction.
10. Prepare and start the route.
11. Record stops, delivery attempts, incidents, and evidence.
12. Mark delivery, failure, rescheduling, return, or cancellation.
13. Close the route and calculate its result summary.
14. Publish events and send internal/email notifications.

If automatic planning cannot assign a package, mark it `PENDING_ASSIGNMENT` and expose it for manual review. This is a normal business result, not a technical failure.

## 5. MVP boundaries

### Required

- Multi-company tenants using a shared schema and `tenantId`.
- Authentication, roles, and permissions.
- Package registration and status history.
- Zones, vehicles, couriers, routes, stops, and assignments.
- Coordinate validation and distance calculation.
- A realizable clustering algorithm implemented by the team.
- Capacity-aware assignment by weight and volume.
- Basic stop ordering implemented by the team.
- Manual review and reassignment.
- Route preparation, execution, and closure.
- Delivery attempts, incidents, and basic evidence.
- Internal notifications and email.
- RabbitMQ event processing.
- Idempotent Consumer and Dead Letter Queue.
- Functional Chain of Responsibility and a modeled/tested State implementation.
- Tests for critical domain and tenant-isolation rules.

### Optional if time permits

- Dashboard and operational reports.
- Basic 2-opt improvement after nearest-neighbor ordering.
- Tenant-configurable notification templates.
- Interpreter prototype for configurable rules.
- Additional iterator variants.

### Post-MVP

- Real-time GPS tracking.
- Native mobile application.
- Global or exact route optimization.
- Machine learning or AI optimization.
- Advanced digital signatures or biometric validation.
- WhatsApp, SMS, or push channels.
- Automated SaaS billing.
- Kubernetes and independent microservices per module.
- Separate database per tenant.

Prefer a simple solution that satisfies required behavior over an ambitious solution that threatens the academic schedule.

## 6. Technology and deployment

### Existing

- Frontend: React, TypeScript, Vite.
- Backend: NestJS 11, TypeScript, Jest.
- Persistence: PostgreSQL 17, Prisma 7.
- Local infrastructure: Docker Compose.

### Target additions

- RabbitMQ for asynchronous events and work queues.
- A NestJS worker process for consumers and notifications.
- Email provider adapter.
- Local/object storage adapter for evidence if evidence files are implemented.

Do not add Kafka in addition to RabbitMQ for the MVP. RabbitMQ is selected because the current problem is reliable jobs, retries, routing, acknowledgements, and DLQs rather than long-retention event streaming.

## 7. Architectural style

The assigned style is **event-driven architecture**.

Use a **modular monolith** for business capabilities and separate processes only where asynchronous execution provides a clear benefit:

```text
React frontend
    -> HTTP API (NestJS modular monolith)
        -> PostgreSQL
        -> RabbitMQ
            -> planning/notification/event workers
            -> retry queues
            -> dead-letter queues
```

Event-driven does not imply one microservice per module. Keep one codebase and one backend image initially. The API and worker may use different entry points, for example `src/main.ts` and `src/worker.ts`.

## 8. Backend organization

Organize by business capability first, then by responsibility inside each module.

Target structure:

```text
backend/src/
├── main.ts
├── worker.ts
├── app.module.ts
├── worker.module.ts
├── config/
├── modules/
│   ├── tenants/
│   ├── auth/
│   ├── users/
│   ├── packages/
│   ├── zones/
│   ├── vehicles/
│   ├── couriers/
│   ├── route-planning/
│   ├── assignments/
│   ├── routes/
│   ├── deliveries/
│   ├── incidents/
│   ├── notifications/
│   └── audit/
└── shared/
    ├── domain/
    ├── application/
    └── infrastructure/
        ├── database/
        ├── messaging/
        ├── email/
        └── storage/
```

Recommended internal module structure when complexity justifies it:

```text
module/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── events/
│   └── repositories/
├── application/
│   ├── use-cases/
│   └── dto/
├── infrastructure/
│   ├── persistence/
│   └── messaging/
├── presentation/
│   └── *.controller.ts
└── *.module.ts
```

Do not create empty layers or files solely to imitate an architecture. Use them when they protect real domain behavior or infrastructure boundaries.

Dependency direction:

```text
Controller -> use case/application service -> domain -> repository port
                                             infrastructure implements ports
```

Rules:

- Controllers receive requests, use DTOs, call application services, and map responses.
- Do not place algorithms, Prisma queries, tenant decisions, or business rules in controllers.
- Domain code must not depend on HTTP, RabbitMQ, Prisma, or email providers.
- Do not query another module's tables directly when its public service or repository contract should own the behavior.
- Export only the providers that form a module's intentional public interface.
- Avoid circular dependencies and global modules except for truly cross-cutting infrastructure.

## 9. Multi-tenancy

Every company is a `Tenant`. All tenant-owned entities must include `tenantId` directly or through an enforceable parent relation.

Mandatory rules:

- Derive `tenantId` from the authenticated identity or trusted message metadata.
- Never trust a freely supplied frontend `tenantId` for authorization.
- Every tenant-owned read, update, and delete must filter by tenant.
- Every event must include `tenantId`.
- Composite unique constraints must include `tenantId` when identifiers are tenant-scoped.
- Verify ownership across relationships, for example route, vehicle, courier, package, and evidence must belong to the same tenant.
- Add automated tests proving that Tenant A cannot read or mutate Tenant B data.
- Superadmin access must be explicit and audited; do not bypass tenant checks silently.

MVP storage strategy: one PostgreSQL database, one shared schema, and tenant columns. Do not create a database per tenant.

## 10. Core domain model

Expected entities include:

- `Tenant`, `User`, `Role`, `Permission`.
- `Package`, `PackageStatusHistory`, `ShipmentType`.
- `Zone`, optionally `Sector` if it adds real classification value.
- `Vehicle`, `Courier`.
- `Route`, `RouteStop`, `RoutePackage` or `Assignment`.
- `RoutePlanningRequest`.
- `DeliveryAttempt`, `DeliveryEvidence`, `Incident`.
- `Notification`, `NotificationTemplate`.
- `ProcessedEvent`, `DeadLetterMessage`, `AuditLog`.

### Assignment history

Do not model only `package.routeId` if that erases reassignment history. Prefer an `Assignment` or equivalent history entity with:

- tenant, package, route, vehicle/courier when applicable;
- automatic or manual type;
- status and reason;
- responsible user;
- timestamps and observations.

### Capacity

Vehicle capacity includes maximum weight and volume. Available capacity is derived from active assigned packages unless a carefully maintained snapshot is justified.

```text
availableWeight = vehicle.maxWeight - sum(activePackage.weight)
availableVolume = vehicle.maxVolume - sum(activePackage.volume)
```

Normalize units before comparison. Define one canonical unit in the schema and API. Package volume is `length * width * height` after normalization.

## 11. States

Use enums or domain types; do not distribute arbitrary strings across the codebase.

### Package states

- `REGISTERED`
- `CLASSIFIED`
- `PENDING_ASSIGNMENT`
- `ASSIGNED_TO_ROUTE`
- `READY_FOR_DISPATCH`
- `IN_TRANSIT`
- `OUT_FOR_DELIVERY`
- `DELIVERED`
- `DELIVERY_FAILED`
- `RESCHEDULED`
- `RETURN_PENDING`
- `RETURNED`
- `CANCELLED`

Representative transitions:

```text
REGISTERED -> CLASSIFIED
CLASSIFIED -> ASSIGNED_TO_ROUTE | PENDING_ASSIGNMENT
PENDING_ASSIGNMENT -> ASSIGNED_TO_ROUTE
ASSIGNED_TO_ROUTE -> READY_FOR_DISPATCH
READY_FOR_DISPATCH -> IN_TRANSIT
IN_TRANSIT -> OUT_FOR_DELIVERY
OUT_FOR_DELIVERY -> DELIVERED | DELIVERY_FAILED
DELIVERY_FAILED -> RESCHEDULED | RETURN_PENDING
RESCHEDULED -> ASSIGNED_TO_ROUTE
RETURN_PENDING -> RETURNED
```

### Route states

- `DRAFT`
- `PLANNING`
- `PLANNED`
- `READY`
- `IN_PROGRESS`
- `COMPLETED`
- `PLANNING_FAILED`
- `INTERRUPTED`
- `CANCELLED`

Keep state names consistent across Prisma, backend, API, frontend, events, tests, and documentation.

## 12. Route-planning algorithms

Keep these stages separate:

```text
address -> geocoding or supplied coordinates -> validation
coordinates -> distance calculation -> clustering
clusters -> capacity-aware assignment -> routes
routes -> stop ordering -> coordinator review
```

### Geocoding boundary

Converting a real address into latitude/longitude requires geographic data or an external provider. Do not claim to implement a complete geocoder from scratch. Place geocoding behind an adapter and allow coordinates to be supplied for deterministic tests.

### Manual algorithms for the academic requirement

- Parse and validate numeric latitude/longitude.
- Implement Haversine distance manually.
- Implement one understandable clustering approach manually, such as K-means or radius-based grouping.
- Validate cluster weight and volume against available vehicles.
- Implement nearest-neighbor stop ordering manually.
- Add 2-opt only if time permits.

State algorithm assumptions and limitations. Haversine measures geographic distance, not actual road travel time. Heuristics produce reasonable routes but do not guarantee a global optimum.

Keep algorithms deterministic when possible by accepting a seed, fixed initial centroids, or an explicit deterministic initialization strategy. Tests must use small known datasets.

## 13. Required architectural patterns

### Idempotent Consumer

Use `tenantId + eventId + consumerName` as the default processing identity. Add an appropriate unique constraint to `ProcessedEvent`.

Within one local transaction:

1. Register the event as processing/processed.
2. Apply the business effect.
3. Commit.
4. ACK only after commit.

If the unique key already exists, ACK without repeating the effect. Do not mark an event processed if the business effect rolls back.

### Dead Letter Queue

Classify outcomes:

- Success: commit and ACK.
- Duplicate: ACK without repeating.
- Transient infrastructure failure: limited retry with backoff.
- Invalid contract or exhausted attempts: DLQ.
- Expected business outcome: persist the domain state and ACK.

Missing capacity, route, or courier is normally `PENDING_ASSIGNMENT`, not a DLQ message.

DLQ records must preserve the original event, tenant, source queue, consumer, attempts, timestamps, and failure reason. Redrive must be deliberate and audited.

### RabbitMQ expectations

- Durable exchanges/queues for required workflows.
- Persistent messages where loss is unacceptable.
- Publisher confirms.
- Manual consumer acknowledgements.
- Explicit retry and dead-letter topology.
- Prefetch appropriate to consumer workload.
- No infinite requeue loops.

## 14. Required GoF patterns

Patterns must solve real code problems. A class name alone is not evidence.

### Chain of Responsibility - primary implementation

Location: assignment/planning validation.

Suggested chain:

```text
TenantValidation
-> DuplicateAssignmentValidation
-> CompleteDataValidation
-> CoordinateValidation
-> ZoneValidation
-> VehicleAvailability
-> WeightCapacity
-> VolumeCapacity
-> CourierAvailability
-> AssignmentCreation
```

Each handler has one responsibility, either rejects with a domain reason or delegates to the next handler. Tests must prove success, early interruption, reason reporting, order sensitivity, and extensibility.

The clustering algorithm itself is not a handler chain. Keep route calculation in a dedicated planning service and use the chain for validation/assignment policy.

### State - second pattern

Location: package lifecycle, and optionally route lifecycle.

The `Package` context delegates behavior to `PackageState` implementations. Tests must prove valid and invalid transitions and event generation. Prevent direct status mutation outside controlled domain operations.

### Interpreter - complementary

Use only for a small tenant-configurable grammar, for example:

```text
zone = NORTH AND weight <= 20
```

Limit fields and operators, validate expressions before activation, and do not build a general-purpose language.

### Iterator - complementary

Use to traverse ordered, pending, or failed route stops without exposing the route's internal collection. Iterator consumes an already calculated route; it does not calculate clustering or stop order.

## 15. Events and notifications

Representative domain/integration events:

- `PackageRegistered`
- `PackageClassified`
- `RoutePlanningRequested`
- `RoutePlanningCompleted`
- `RoutePlanningFailed`
- `PackageAssigned`
- `RoutePrepared`
- `RouteStarted`
- `DeliveryAttempted`
- `PackageDelivered`
- `DeliveryFailed`
- `PackageRescheduled`
- `RouteCompleted`
- `NotificationRequested`
- `NotificationSent`
- `NotificationFailed`

Event envelope fields:

- `eventId`
- `tenantId`
- `correlationId`
- `eventType`
- `occurredAt`
- `producer`
- `version`
- minimal payload

Do not publish unnecessary personal data. Prefer entity identifiers and let authorized consumers retrieve what they need.

Required MVP notification channels:

- Internal application notification.
- Email.

A notification failure must not revert a package delivery. Notification idempotency should include tenant, source event, recipient, and channel.

## 16. Roles

### SaaS superadministrator

Manages tenant activation and platform health. Does not normally operate tenant logistics.

### Tenant administrator

Manages users, roles, zones, vehicles, couriers, configuration, notification templates, and reports for one tenant.

### Reception employee

Scans/registers packages and corrects permitted fields.

### Classification employee

Reviews automatic classification and unresolved packages.

### Route coordinator

Requests/reviews planning, manages capacity and assignments, resolves pending packages, prepares routes, and closes routes.

### Courier

Consults and starts assigned routes, records attempts, deliveries, evidence, and incidents.

### Public tracking user

Consults a limited package status using a safe public identifier. Must not see internal or sensitive tenant data.

Authorization remains a backend responsibility. Do not duplicate authoritative business or permission rules only in the frontend.

## 17. Error handling

Distinguish:

1. Domain result: expected outcome such as no capacity; persist an explicit state.
2. Validation error: reject client input with a stable code and useful message.
3. Authorization error: deny access without exposing whether another tenant's resource exists.
4. Transient infrastructure error: retry only where safe and bounded.
5. Permanent processing error: record context and route to DLQ when asynchronous.

Use typed domain errors or stable error codes. Do not hide failures in generic `catch` blocks or return success after an uncommitted operation.

## 18. Database and Prisma rules

`backend/prisma/schema.prisma` is the schema source of truth.

- Modify schema through Prisma and commit migrations.
- Do not make permanent schema changes manually in PostgreSQL.
- Inspect existing data and migration impact before destructive changes.
- Never reset or delete shared data without explicit authorization.
- Add indexes for tenant filters and frequent operational queries.
- Use transactions for capacity reservation, idempotent effects, and other race-sensitive operations.
- Model histories explicitly when business auditability matters.
- Keep generated Prisma client output out of version control unless repository policy changes.

## 19. Frontend rules

- Organize screens by feature, not only by generic component type.
- Treat API validation and authorization as authoritative.
- Display asynchronous states explicitly: pending, processing, sent, failed.
- Include loading, empty, error, and permission-denied states.
- Do not expose tenant selectors that allow arbitrary cross-tenant access.
- Keep route and package status labels synchronized with backend enums.
- Use a responsive web interface; a native mobile app is out of scope.

## 20. Testing strategy

### Unit tests

- Haversine calculation and coordinate validation.
- Clustering on small deterministic datasets.
- Nearest-neighbor ordering.
- Weight/volume normalization and capacity.
- Every Chain handler and the full chain.
- State transitions and invalid transitions.
- Interpreter parsing/evaluation if implemented.
- Iterator behavior if implemented.

### Integration tests

- Prisma repositories and tenant filters.
- Assignment transaction and reassignment history.
- Idempotent consumer duplicate delivery.
- Retry and DLQ routing.
- Notification deduplication.
- Worker handling with mocked external email/storage adapters.

### End-to-end tests

- Tenant authentication and isolation.
- Register -> classify -> plan -> assign.
- Prepare -> start route -> attempt -> deliver/fail -> close.
- Pending assignment and manual recovery.
- Public tracking without sensitive data exposure.

Tests must demonstrate behavior, not merely execute lines. Use factories/fixtures with explicit tenants and avoid nondeterministic datasets.

## 21. Coding conventions

- Keep TypeScript strict and avoid unnecessary `any`.
- Use DTOs and validation for external inputs.
- Prefer domain names over framework or database terminology.
- Keep functions small enough to express one purpose.
- Avoid duplicate business rules across backend and frontend.
- Do not catch errors only to discard context.
- Do not log secrets, credentials, full tokens, or unnecessary personal data.
- Add dependencies only when they solve a demonstrated need.
- Follow the existing formatter and ESLint configuration.
- Comments should explain non-obvious decisions or constraints, not restate code.

## 22. Development commands

From the repository root:

```bash
docker compose up --build
docker compose ps
docker compose logs -f
```

Backend checks from `backend/`:

```bash
npm run build
npm test
npm run test:e2e
```

Frontend checks from `frontend/`:

```bash
npm run build
npm run lint
```

Prisma through Docker after schema changes:

```bash
docker compose exec backend npx prisma generate
docker compose exec backend npx prisma migrate dev --name <migration_name>
```

Note that the current backend `lint` script includes `--fix` and modifies files. Do not run it during read-only review.

## 23. Git workflow

- Do not perform normal development directly on `main`.
- Use focused branches such as `feature/tenants`, `feature/package-state`, or `feature/assignment-chain` unless the team adopts another documented convention.
- Prefer small Pull Requests with one coherent change.
- Use Conventional Commits where practical, for example `feat: add tenant package isolation`.
- Do not mix unrelated formatting or generated files into feature changes.
- Never discard another contributor's uncommitted work.

## 24. Team ownership

Ownership indicates coordination responsibility, not exclusive knowledge.

| Area                                           | Primary  | Secondary |
| ---------------------------------------------- | -------- | --------- |
| Backend architecture, Prisma, auth, tenants    | P1       | P3        |
| Packages, states, classification               | P2       | P4        |
| Planning, zones, routes, vehicles, assignments | P3       | P2/P1     |
| Frontend and UX                                | P4       | P2        |
| RabbitMQ, idempotency, DLQ                     | P1       | P3        |
| Notifications                                  | P4/P1    | P2        |
| Delivery flow and evidence                     | P3/P4    | P2        |
| Testing and documentation                      | Everyone | Everyone  |

Replace P1-P4 with actual names when the team confirms ownership.

## 25. Task format and Definition of Done

Task format:

```text
ID: ASSIGN-01
Title: Implement assignment validation chain
Owner: P3
Priority: P0
Status: TODO
Dependencies: DATA-01, PKG-01, VEH-01
Acceptance: valid request assigns once; invalid capacity stops with a reason
```

Allowed status values:

- `BACKLOG`
- `TODO`
- `IN_PROGRESS`
- `REVIEW`
- `TESTING`
- `DONE`
- `BLOCKED`

A task is `DONE` only when:

- Required code is implemented and formatted.
- Build/type-check passes.
- Relevant tests pass.
- Tenant and authorization rules are respected.
- Database changes include reviewed migrations.
- API/frontend integration is updated when applicable.
- Error and empty states are handled.
- Documentation or ADRs are updated when behavior or architecture changes.
- No unrelated user changes are overwritten.

## 26. Current task board

This board reflects the repository state when this file was created. Update statuses only after verifying the implementation.

### P0 - immediate academic deliverable

| ID           | Task                                                                  | Owner    | Status      | Dependencies                                 | Acceptance                                                                      |
| ------------ | --------------------------------------------------------------------- | -------- | ----------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| DOC-01       | Keep technical document aligned with implementation                   | Everyone | IN_PROGRESS | None                                         | 6-10 page PDF matches real code and evidence.                                   |
| PAT-CHAIN-01 | Implement Chain interfaces, context, and concrete validation handlers | P3       | TODO        | FOUND-01                                     | Valid and invalid requests demonstrate delegation and interruption.             |
| PAT-CHAIN-02 | Add unit/integration tests for the complete chain                     | P3/P2    | TODO        | PAT-CHAIN-01                                 | Success, coordinate failure, capacity failure, order, and extension tests pass. |
| PAT-STATE-01 | Implement package State model and controlled transitions              | P2       | TODO        | FOUND-01                                     | Valid/invalid transitions and emitted events are tested.                        |
| EVT-01       | Define versioned event envelope and core contracts                    | P1       | TODO        | FOUND-01                                     | Events include IDs, tenant, correlation, type, time, producer, and version.     |
| RMQ-01       | Add RabbitMQ to Docker Compose and NestJS worker entry point          | P1       | TODO        | EVT-01                                       | API publishes and worker consumes a durable test event with manual ACK.         |
| IDEMP-01     | Implement `ProcessedEvent` and idempotent consumer wrapper            | P1/P3    | TODO        | DATA-01, RMQ-01                              | Duplicate delivery produces one business effect.                                |
| DLQ-01       | Configure bounded retry and DLQ demonstration                         | P1/P3    | TODO        | RMQ-01                                       | Poison event reaches DLQ with failure context after limited attempts.           |
| EVID-01      | Capture test commands and output for the workshop                     | Everyone | TODO        | PAT-CHAIN-02, PAT-STATE-01, IDEMP-01, DLQ-01 | Repository/anex documents reproducible evidence.                                |

### P0 - foundation

| ID        | Task                                                                 | Owner | Status | Dependencies     | Acceptance                                                                 |
| --------- | -------------------------------------------------------------------- | ----- | ------ | ---------------- | -------------------------------------------------------------------------- |
| FOUND-01  | Create modular backend skeleton and shared infrastructure boundaries | P1    | TODO   | None             | Modules compile without circular dependencies.                             |
| DATA-01   | Design Prisma core schema and initial migration                      | P1/P3 | TODO   | FOUND-01         | Tenant-aware entities, enums, indexes, and histories validate and migrate. |
| TENANT-01 | Implement tenant context and isolation helpers                       | P1    | TODO   | DATA-01          | All tenant-owned repository operations require trusted tenant context.     |
| AUTH-01   | Implement authentication, roles, and guards                          | P1    | TODO   | TENANT-01        | Protected routes enforce role and tenant membership.                       |
| PKG-01    | Implement package registration, dimensions, status, and history      | P2    | TODO   | DATA-01, AUTH-01 | Unique package per tenant can be registered and audited.                   |
| ZONE-01   | Implement zones and optional sectors                                 | P3/P2 | TODO   | DATA-01          | Tenant zones classify known destinations.                                  |
| VEH-01    | Implement vehicles, couriers, availability, and capacity             | P3    | TODO   | DATA-01          | Weight/volume availability is computed in canonical units.                 |

### P1 - planning and route execution

| ID             | Task                                                             | Owner | Status  | Dependencies                             | Acceptance                                                               |
| -------------- | ---------------------------------------------------------------- | ----- | ------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| GEO-01         | Implement coordinate parsing, validation, and Haversine          | P3    | TODO    | FOUND-01                                 | Known distances and invalid coordinates are covered by tests.            |
| CLUSTER-01     | Implement deterministic clustering prototype                     | P3    | TODO    | GEO-01                                   | Small dataset produces reproducible clusters.                            |
| SEQ-01         | Implement nearest-neighbor stop ordering                         | P3    | TODO    | GEO-01                                   | Every stop is visited once in deterministic order.                       |
| ASSIGN-01      | Integrate clustering, capacity, and Chain into planning use case | P3/P2 | TODO    | CLUSTER-01, SEQ-01, PAT-CHAIN-01, VEH-01 | Valid plans create routes; unresolved packages remain pending.           |
| ROUTE-01       | Implement route/stop lifecycle and coordinator review            | P3    | TODO    | DATA-01, ASSIGN-01                       | Route can move from draft through ready and start.                       |
| ITER-01        | Implement route-stop Iterator prototype                          | P3    | BACKLOG | ROUTE-01                                 | Ordered and pending iterators pass tests.                                |
| DELIVERY-01    | Implement attempts, delivery, failure, reschedule, and return    | P2/P3 | TODO    | ROUTE-01, PAT-STATE-01                   | Complete route flow records history and valid transitions.               |
| ROUTE-CLOSE-01 | Implement route closure summary                                  | P3    | TODO    | DELIVERY-01                              | Assigned, delivered, failed, rescheduled, and returned counts reconcile. |

### P1 - notifications and frontend

| ID       | Task                                                          | Owner | Status | Dependencies          | Acceptance                                                        |
| -------- | ------------------------------------------------------------- | ----- | ------ | --------------------- | ----------------------------------------------------------------- |
| NOTIF-01 | Implement internal notification persistence                   | P4/P1 | TODO   | DATA-01, EVT-01       | Tenant users can view event-derived notifications.                |
| NOTIF-02 | Implement email adapter and worker consumer                   | P1/P4 | TODO   | RMQ-01, NOTIF-01      | Email failures do not roll back logistics and are retried safely. |
| UI-01    | Replace Vite starter with authenticated application shell     | P4    | TODO   | AUTH-01               | Login and role-aware navigation work.                             |
| UI-02    | Implement package registration and pending assignment screens | P4/P2 | TODO   | PKG-01, ASSIGN-01     | Users can register and review package outcomes.                   |
| UI-03    | Implement planning, route, and courier execution screens      | P4/P3 | TODO   | ROUTE-01, DELIVERY-01 | Coordinator and courier complete the core workflow.               |
| UI-04    | Implement notification inbox and public status view           | P4    | TODO   | NOTIF-01, PKG-01      | Tenant and public views expose only permitted information.        |

### P2 - hardening and optional patterns

| ID        | Task                                                  | Owner    | Status  | Dependencies        | Acceptance                                                 |
| --------- | ----------------------------------------------------- | -------- | ------- | ------------------- | ---------------------------------------------------------- |
| INTERP-01 | Implement limited Interpreter prototype               | P2/P3    | BACKLOG | ASSIGN-01           | Valid expressions evaluate; invalid grammar is rejected.   |
| AUDIT-01  | Implement audit log for sensitive actions and redrive | P1       | BACKLOG | DATA-01, DLQ-01     | Actor, tenant, action, target, and result are recorded.    |
| OBS-01    | Add structured logging and correlation IDs            | P1       | TODO    | EVT-01              | One operation can be traced across API and worker logs.    |
| SEC-01    | Add tenant-isolation and authorization test suite     | P1/P4    | TODO    | AUTH-01, core APIs  | Cross-tenant access is denied without resource disclosure. |
| QA-01     | Add end-to-end critical-flow fixtures and tests       | Everyone | TODO    | Core P0/P1 tasks    | Registration-to-delivery scenarios are reproducible.       |
| DOC-02    | Update README, execution guide, diagrams, and ADRs    | Everyone | TODO    | Core implementation | A new contributor can run and understand the project.      |

### Recommended execution sequence

The board is ordered by priority, but dependencies determine the actual implementation order. Work in short vertical slices and keep the main branch runnable.

| Wave | Main objective                                                 | Tasks that can advance together                      | Exit criterion                                                                                 |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 0    | Align the academic deliverable and prove the assigned patterns | DOC-01, FOUND-01, PAT-CHAIN-01, PAT-STATE-01, EVT-01 | The documented design has compilable prototypes and testable contracts.                        |
| 1    | Establish the tenant-aware domain foundation                   | DATA-01, TENANT-01, AUTH-01                          | A user operates only inside an authenticated tenant.                                           |
| 2    | Register operational data                                      | PKG-01, ZONE-01, VEH-01                              | Packages and logistics resources exist with validated units and histories.                     |
| 3    | Plan routes                                                    | GEO-01, CLUSTER-01, SEQ-01, PAT-CHAIN-02, ASSIGN-01  | A reproducible dataset generates capacity-valid routes and explicit pending outcomes.          |
| 4    | Execute the complete route lifecycle                           | ROUTE-01, DELIVERY-01, ROUTE-CLOSE-01                | A route can be prepared, started, completed, failed/rescheduled/returned, and closed.          |
| 5    | Process events and notify users                                | RMQ-01, IDEMP-01, DLQ-01, NOTIF-01, NOTIF-02         | Duplicate events are harmless, poison events are isolated, and notifications are observable.   |
| 6    | Complete the product experience and evidence                   | UI-01 through UI-04, SEC-01, QA-01, EVID-01, DOC-02  | The critical flow is demonstrable from UI to worker with reproducible tests and documentation. |

Parallel-work rules:

- P1 should publish tenant, persistence, and event contracts early so other areas do not guess them.
- P2 and P3 should agree on package states and assignment inputs before implementing their modules independently.
- P4 may build against typed mock contracts initially, but must replace them with real API integration before marking a UI task done.
- A task that changes a shared contract must notify all dependent owners and update tests or fixtures in the same change.
- If an academic deadline arrives before a whole wave is complete, prioritize the smallest end-to-end demonstrable slice over disconnected module scaffolding.

## 27. Rules for AI agents

Before changing code:

1. Inspect relevant files, tests, and git status.
2. Read `schema.prisma` for data changes.
3. Identify tenant, event, and state implications.
4. Preserve user changes and avoid unrelated rewrites.
5. Confirm whether a described feature exists or is only target design.

During implementation:

- Keep changes scoped to the requested task.
- Use existing patterns and dependencies unless change is justified.
- Apply migrations deliberately.
- Add tests proportional to the behavior and risk.
- Never bypass tenant isolation for convenience.
- Do not claim exactly-once delivery; implement idempotent effects.
- Do not send expected business failures to DLQ.

After implementation:

1. Run the relevant build and tests.
2. Report files changed and commands run.
3. Report migrations, new environment variables, and operational steps.
4. Update this task board only when status is verified.
5. Update documentation when behavior diverges from the current technical document.

## 28. Decision records

Create an ADR for significant changes such as broker replacement, multi-tenant storage strategy, geocoding provider, clustering algorithm, route-vehicle relationship, authentication strategy, or deployment split.

Minimal ADR format:

```text
Title:
Status:
Context:
Decision:
Alternatives:
Consequences:
Date:
```

## 29. Guiding principle

Build a functional, coherent, maintainable, demonstrable system that four students can explain and test. Architecture and patterns must be visible in behavior and tests, not only in diagrams. When sophistication conflicts with reliable completion, choose the smallest solution that still satisfies the current requirements.
