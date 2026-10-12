# Diagramas C4 — SLS y módulos de registro (PKG-01 / VEH-01)

Estado: borrador verificado contra el código de `develop` (HEAD `5930e33`) el 2026-10-11.

Alcance y límites de este documento:

- Los niveles 1 y 2 describen lo que existe en `docker-compose.yml` y en `backend/src/` (`main.ts`,
  `worker.ts`). No se dibujan sistemas externos porque no se verificó ninguno.
- El nivel 3 detalla solo los módulos `packages` (registro), `vehicles` y `couriers`. Los demás módulos
  (asignaciones, rutas, entregas, zonas, geocodificación, auditoría) deben ser completados por quienes
  los implementaron; no se dibujan aquí para no afirmar relaciones que no se inspeccionaron.
- Los diagramas usan la sintaxis C4 de Mermaid, que GitHub renderiza.

## Nivel 1 — Contexto

```mermaid
C4Context
  title Contexto del sistema SLS

  Person(user, "Usuario de una empresa (tenant)", "Registra paquetes, vehículos y repartidores")
  System(sls, "SLS - Smart Logistics System", "Gestiona paquetes, vehículos, repartidores, rutas y entregas con aislamiento por tenant")

  Rel(user, sls, "Usa", "HTTP")
```

## Nivel 2 — Contenedores

```mermaid
C4Container
  title Contenedores de SLS (Docker Compose)

  Person(user, "Usuario de una empresa (tenant)")

  System_Boundary(sls, "SLS") {
    Container(frontend, "Frontend", "React + Vite", "Interfaz web. Por defecto usa datos simulados (VITE_USE_MOCK_DATA=true)")
    Container(api, "API", "NestJS (main.ts)", "REST en /api/v1. El tenant llega por el header x-tenant-id (provisional, sin autenticación real)")
    Container(worker, "Worker", "NestJS (worker.ts)", "Consulta el outbox y publica eventos; ejecuta consumidores de RabbitMQ")
    ContainerDb(db, "Base de datos", "PostgreSQL 17 + PostGIS", "Row-Level Security por tenant. Rol postgres para migraciones y sls_app en runtime")
    ContainerQueue(mq, "Broker de mensajes", "RabbitMQ 4", "Intercambio de eventos entre procesos")
  }

  Rel(user, frontend, "Usa", "HTTP :5173")
  Rel(frontend, api, "Llama", "JSON/HTTP :3000")
  Rel(api, db, "Lee y escribe; fija el tenant con SET LOCAL", "Prisma, sls_app")
  Rel(worker, db, "Lee eventos pendientes del outbox", "Prisma")
  Rel(worker, mq, "Publica y consume", "AMQP")
```

La API no publica en RabbitMQ directamente en los flujos inspeccionados: escribe los eventos en la tabla
de outbox dentro de la misma transacción que el cambio de estado, y el worker los publica.

## Nivel 3 — Componentes de los módulos de registro (dentro de la API)

```mermaid
C4Component
  title Componentes de los módulos de registro (API NestJS)

  Container_Boundary(api, "API NestJS") {
    Component(pc, "PackagesController", "Presentación", "POST /packages")
    Component(rps, "RegisterPackageService", "Aplicación", "Caso de uso de registro")
    Component(prp, "PackageRegistrationPort + PublicTrackingTokenGenerator", "Aplicación (puertos)", "Contratos que usa el caso de uso")
    Component(pdom, "package-registration, package-measures, package-reference.policy", "Dominio", "Validación, volumen exacto y política de referencias")
    Component(pad, "PrismaPackageRegistrationAdapter + CryptoPublicTrackingTokenGenerator", "Infraestructura", "Persistencia atómica y token de 256 bits")

    Component(vc, "VehiclesController", "Presentación", "POST /vehicles")
    Component(rvs, "RegisterVehicleService", "Aplicación", "Caso de uso de registro de vehículo")
    Component(vad, "PrismaVehicleAdapter", "Infraestructura", "Implementa VehicleRepositoryPort")

    Component(cc, "CouriersController", "Presentación", "POST /couriers")
    Component(rcs, "RegisterCourierService", "Aplicación", "Verifica elegibilidad y vincula al usuario")
    Component(cad, "PrismaCourierAdapter", "Infraestructura", "Implementa CourierRepositoryPort; lee solo id y status del usuario")

    Component(ctx, "CurrentTenant", "Compartido", "Extrae el tenant de la solicitud")
    Component(rwt, "runWithTenant + PrismaService", "Compartido", "Transacción con SET LOCAL del tenant")
  }

  ContainerDb(db, "PostgreSQL + PostGIS", "RLS por tenant")

  Rel(pc, ctx, "Obtiene tenant")
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

- Componentes de asignaciones, rutas, entregas, zonas, geocodificación y auditoría.
- Relación entre el frontend y los endpoints de registro, hoy no verificada porque el frontend usa datos simulados.
- Autenticación (AUTH-01): reemplazará el header `x-tenant-id` y cambiará la relación entre frontend y API.
