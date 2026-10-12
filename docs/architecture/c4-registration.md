# Diagramas C4 — SLS y módulos de registro (PKG-01 / VEH-01)

Estado: verificado contra la rama `feature/package-vehicle-management` (commits `649f34d..6994cb0` y merge `0e95e61`) el 2026-10-11.

Alcance y límites de este documento:

- `PKG-01` y `VEH-01` están en estado `EN PROGRESO` (`IN_PROGRESS`): únicamente están terminados los
  endpoints de registro (`POST /packages`, `POST /vehicles` y `POST /couriers`).
- Los niveles 1 y 2 describen lo que existe en `docker-compose.yml` y en `backend/src/` (`main.ts`,
  `worker.ts`). No se dibujan sistemas externos porque no se verificó ninguno.
- El nivel 3 detalla los módulos `packages` (registro), `vehicles` y `couriers` junto con su integración
  con `auth` (`AuthGuard`, `PermissionsGuard`). Los demás módulos (asignaciones, rutas, entregas, zonas,
  geocodificación, auditoría) deben ser completados por quienes los implementaron; no se dibujan aquí para
  no afirmar relaciones que no se inspeccionaron.
- Los diagramas usan la sintaxis C4 de Mermaid, que GitHub renderiza.

## Nivel 1 — Contexto

```mermaid
C4Context
  title Contexto del sistema SLS

  Person(user, "Usuario autenticado de una empresa (tenant)", "Registra paquetes (REGISTER_PACKAGES), vehículos y repartidores (MANAGE_TENANT)")
  System(sls, "SLS - Smart Logistics System", "Gestiona paquetes, vehículos, repartidores, rutas y entregas con aislamiento por tenant")

  Rel(user, sls, "Usa", "HTTP")
```

## Nivel 2 — Contenedores

```mermaid
C4Container
  title Contenedores de SLS (Docker Compose)

  Person(user, "Usuario autenticado de una empresa (tenant)")

  System_Boundary(sls, "SLS") {
    Container(frontend, "Frontend", "React + Vite", "Interfaz web. Por defecto usa datos simulados (VITE_USE_MOCK_DATA=true)")
    Container(api, "API", "NestJS (main.ts)", "REST en /api/v1. Autenticación por cookie de sesión sls_session (AuthGuard) y control de permisos (PermissionsGuard)")
    Container(worker, "Worker", "NestJS (worker.ts)", "Consulta el outbox y publica eventos (incluyendo PackageRegistered); ejecuta consumidores de RabbitMQ")
    ContainerDb(db, "Base de datos", "PostgreSQL 17 + PostGIS", "Row-Level Security por tenant. Rol postgres para migraciones y sls_app en runtime")
    ContainerQueue(mq, "Broker de mensajes", "RabbitMQ 4", "Intercambio de eventos entre procesos")
  }

  Rel(user, frontend, "Usa", "HTTP :5173")
  Rel(frontend, api, "Llama", "JSON/HTTP :3000")
  Rel(api, db, "Valida sesión, lee y escribe; fija el tenant con SET LOCAL", "Prisma, sls_app")
  Rel(worker, db, "Lee eventos pendientes del outbox", "Prisma")
  Rel(worker, mq, "Publica y consume", "AMQP")
```

La API no publica en RabbitMQ directamente en los flujos inspeccionados: escribe los eventos (como
`PackageRegistered` al registrar un paquete) en la tabla `OutboxEvent` dentro de la misma transacción que
la escritura de dominio e historial, y el worker los publica.

## Nivel 3 — Componentes de los módulos de registro (dentro de la API)

```mermaid
C4Component
  title Componentes de los módulos de registro (API NestJS)

  Container_Boundary(api, "API NestJS") {
    Component(ag, "AuthGuard + PermissionsGuard", "Autenticación y Autorización (auth)", "Valida sesión sls_session y permisos REGISTER_PACKAGES / MANAGE_TENANT")
    Component(ctx, "CurrentContext", "Compartido", "Extrae tenantId, actorUserId y correlationId de la sesión autenticada")

    Component(pc, "PackagesController", "Presentación", "POST /packages (REGISTER_PACKAGES)")
    Component(rps, "RegisterPackageService", "Aplicación", "Caso de uso de registro")
    Component(prp, "PackageRegistrationPort + PublicTrackingTokenGenerator", "Aplicación (puertos)", "Contratos que usa el caso de uso")
    Component(pdom, "package-registration, package-measures, package-reference.policy", "Dominio", "Validación, volumen exacto y política de referencias")
    Component(pad, "PrismaPackageRegistrationAdapter + CryptoPublicTrackingTokenGenerator", "Infraestructura", "Persistencia atómica (dirección, paquete, historial con changedByUserId y OutboxEvent PackageRegistered) y token de 256 bits")

    Component(vc, "VehiclesController", "Presentación", "POST /vehicles (MANAGE_TENANT)")
    Component(rvs, "RegisterVehicleService", "Aplicación", "Caso de uso de registro de vehículo")
    Component(vad, "PrismaVehicleAdapter", "Infraestructura", "Implementa VehicleRepositoryPort")

    Component(cc, "CouriersController", "Presentación", "POST /couriers (MANAGE_TENANT)")
    Component(rcs, "RegisterCourierService", "Aplicación", "Verifica elegibilidad y vincula al usuario")
    Component(cad, "PrismaCourierAdapter", "Infraestructura", "Implementa CourierRepositoryPort; lee solo id y status del usuario")

    Component(rwt, "runWithTenant + PrismaService", "Compartido", "Transacción con SET LOCAL del tenant")
  }

  ContainerDb(db, "PostgreSQL + PostGIS", "RLS por tenant")

  Rel(pc, ag, "Protegido por")
  Rel(vc, ag, "Protegido por")
  Rel(cc, ag, "Protegido por")
  Rel(pc, ctx, "Obtiene tenantId, actorUserId y correlationId")
  Rel(vc, ctx, "Obtiene tenantId")
  Rel(cc, ctx, "Obtiene tenantId")
  Rel(pc, rps, "Invoca")
  Rel(rps, pdom, "Valida con")
  Rel(rps, prp, "Depende de")
  Rel(pad, prp, "Implementa")
  Rel(pad, rwt, "Usa")

  Rel(vc, rvs, "Invoca")
  Rel(vad, rvs, "Implementa el puerto de")
  Rel(vad, rwt, "Usa")

  Rel(cc, rcs, "Invoca")
  Rel(cad, rcs, "Implementa el puerto de")
  Rel(cad, rwt, "Usa")

  Rel(rwt, db, "SQL con tenant fijado", "Prisma")
```

Regla de dependencias, comprobada automáticamente por `packages-architecture.spec.ts`,
`vehicles-architecture.spec.ts` y `couriers-architecture.spec.ts`: el dominio y la aplicación no
importan NestJS, Prisma ni capas externas. Los adaptadores implementan los puertos definidos en
`application/ports/`.

## Pendiente de completar por el grupo

- Resto de `PKG-01` (consulta, clasificación, historial HTTP y paso 0) y resto de `VEH-01` (listados,
  capacidad, estados y turnos).
- Componentes de asignaciones, rutas, entregas, zonas, geocodificación y auditoría.
- Relación entre el frontend y los endpoints de registro, hoy no verificada porque el frontend usa datos simulados.
