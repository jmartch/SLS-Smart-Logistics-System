# SLS — Smart Logistics System

Sistema de gestión de operaciones logísticas, compuesto por un frontend en React/Vite, una API en NestJS, PostgreSQL y RabbitMQ.

## Stack

- Frontend: React, TypeScript y Vite.
- Backend: NestJS, TypeScript y Prisma ORM.
- Base de datos: PostgreSQL 17.
- Mensajería asíncrona: RabbitMQ 4.
- Entorno de desarrollo: Docker Compose.

## Estructura

```text
├── frontend/       # Aplicación React
├── backend/        # API NestJS y esquema Prisma
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

Crea `backend/.env.docker` con las dos conexiones que usa el backend (una para migraciones,
otra para runtime — ver la sección de Row-Level Security más abajo):

```env
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/sls?schema=public"
RUNTIME_DATABASE_URL="postgresql://sls_app:sls_app_dev_password@postgres:5432/sls?schema=public"
RABBITMQ_URL="amqp://sls:sls@rabbitmq:5672/sls"
```

Después, inicia el entorno:

```bash
docker compose up --build
```

| Servicio | URL / puerto |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000 |
| PostgreSQL | localhost:5432 |
| RabbitMQ (AMQP) | localhost:5672 |
| RabbitMQ Management | http://localhost:15672 |

La interfaz de administración de RabbitMQ usa las credenciales locales `sls` / `sls`. El backend se conecta mediante `RABBITMQ_URL`; dentro de Docker debe usar el hostname `rabbitmq`, mientras que los procesos ejecutados directamente en la máquina usan `localhost`.

Para ver el estado y los registros:

```bash
docker compose ps
docker compose logs -f
```

Detén los servicios con `docker compose down`. Para eliminar también los datos locales de PostgreSQL, usa `docker compose down -v`.

## Prisma

El esquema está dividido por dominio en `backend/prisma/schema/` y la configuración en
`backend/prisma7.config.ts`.

Tras cambiar el esquema, genera el cliente y crea una migración desde el contenedor:

```bash
docker compose exec backend npx prisma generate
docker compose exec backend npx prisma migrate dev --name <nombre-migracion>
```

Las migraciones de `backend/prisma/migrations/` se versionan en Git; el cliente generado no.

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

El rol `sls_app` y sus políticas se crean como parte de la migración `init_schema`
(`backend/prisma/migrations/*_init_schema/migration.sql`), no en
`docker-entrypoint-initdb.d`, porque las tablas todavía no existen en el primer arranque
del contenedor de Postgres.

## Primer arranque (comprobado en Docker Desktop)

Después de `docker compose up --build`, la carpeta `backend/generated/` no existe porque el cliente
de Prisma no se versiona, y el backend no compila (error `TS2307` sobre `generated/prisma/client`).
Genera el cliente y aplica las migraciones una vez:

```bash
docker compose exec backend npx prisma generate --config prisma7.config.ts
docker compose exec backend npx prisma migrate deploy --config prisma7.config.ts
```

`migrate deploy` solo aplica las migraciones ya versionadas; no crea ni modifica nada nuevo.
Verifica con `docker compose ps` y `curl http://localhost:3000/api/v1`, que responde `Hello World!`.

Problema observado en Docker Desktop para Windows: si `sls-rabbitmq` termina con `Exited (1)` y el
registro dice `.erlang.cookie: eacces`, la cookie del volumen quedó con dueño `root`. Se corrige solo
en ese archivo, con el servicio detenido:

```bash
docker run --rm --entrypoint chown -v sls-smart-logistics-system_rabbitmq_data:/var/lib/rabbitmq \
  rabbitmq:4-management rabbitmq:rabbitmq /var/lib/rabbitmq/.erlang.cookie
docker compose up -d rabbitmq
```

## Pruebas

Pruebas unitarias (no necesitan base de datos ni RabbitMQ):

```bash
docker compose exec backend npm test -- --runInBand
```

Pruebas de integración contra una base PostgreSQL desechable (vive en memoria y se descarta). Con
`make`: `make integration-test TEST=<nombre>`. Sin `make`, los pasos equivalentes son:

```bash
docker compose -f docker-compose.yml -f docker-compose.integration.yml --profile integration up -d --wait integration-postgres
docker compose exec -e "GDB_TEST_ADMIN_URL=postgresql://integration_admin:integration_test_password@integration-postgres:5432/postgres" backend npm run test:<nombre>
docker compose -f docker-compose.yml -f docker-compose.integration.yml --profile integration rm -sf integration-postgres
```

Pruebas disponibles: las de `INTEGRATION_TESTS` en el `Makefile` y `registration-01`, que cubre los tres
endpoints de registro (aislamiento entre tenants, rechazo sin datos parciales y concurrencia).

## Endpoints de registro (PKG-01 y VEH-01)

Prefijo `/api/v1`. Todos requieren el header `x-tenant-id` con un UUID de tenant existente; sin él
responden `401 UNAUTHENTICATED`. Los errores usan la forma `{ code, message, fields? }`.

| Endpoint | Cuerpo | Respuestas |
|---|---|---|
| `POST /vehicles` | `plate`, `maxWeightKg`, `maxVolumeM3` | `201`; `400 VALIDATION_ERROR`; `409 VEHICLE_PLATE_CONFLICT` |
| `POST /couriers` | `userId` (usuario activo del mismo tenant) | `201`; `400`; `404 COURIER_USER_NOT_FOUND`; `409 COURIER_USER_NOT_ELIGIBLE`, `COURIER_USER_ALREADY_LINKED` |
| `POST /packages` | `trackingCode`, `address {text, municipalityCode}`, `shipmentTypeId`, `zoneId?`, `sectorId?`, `weightKg`, `lengthCm`, `widthCm`, `heightCm`, `priority?`, `deadline?`, `serviceDurationSeconds?` | `201` (estado `REGISTERED`, volumen calculado y token público); `400`; `404 PACKAGE_*_NOT_FOUND`; `409 PACKAGE_TRACKING_CODE_CONFLICT`, `PACKAGE_SHIPMENT_TYPE_INACTIVE`, `PACKAGE_SECTOR_ZONE_MISMATCH` |

Para probarlos hace falta un tenant en la base local (no hay seed ni endpoint de tenants):

```sql
INSERT INTO "Tenant" ("id","name") VALUES ('10000000-0000-4000-8000-0000000000a1','Empresa A (prueba local)');
```

La colección `bruno/SLS API` incluye las carpetas `Vehicles`, `Couriers` y `Packages`. Ajusta
`tenantId` en `environments/local.yml`. Un repartidor necesita un `User` activo del mismo tenant,
y un paquete necesita un tipo de envío, que se crean con `POST /shipment-types`, `POST /zones` y
`POST /zones/:zoneId/sectors`.

## Arquitectura de los módulos de registro

Cada módulo (`packages`, `vehicles`, `couriers`) separa cuatro capas bajo `backend/src/modules/<modulo>/`:

| Capa | Contenido | Puede importar |
|---|---|---|
| `domain/` | Reglas y validación (placa, medidas, volumen, políticas) | Nada de NestJS ni Prisma |
| `application/` | Casos de uso y puertos (`ports/`) | Dominio |
| `infrastructure/` | Adaptadores Prisma, generador de token | Aplicación y dominio |
| `presentation/` | Controlador, DTO y traducción de errores a HTTP | Aplicación y dominio |

La regla se comprueba automáticamente en `*-architecture.spec.ts` de cada módulo: falla si el
dominio o la aplicación importan NestJS, Prisma o capas externas. Los módulos se cablean con
`useFactory`, de modo que el caso de uso recibe el puerto y no el adaptador concreto.

Patrones con evidencia en el código inspeccionado:

- **State** (`packages/domain/package-states.ts`): un estado por clase con sus transiciones permitidas.
  El registro nace en `REGISTERED` y las transiciones siguen pasando por el servicio existente.
- **Chain of Responsibility** (`assignments/domain/handlers/`): validaciones de capacidad y disponibilidad.
- **Repository / Ports and Adapters** (los tres módulos de registro): el puerto vive en `application/ports/`
  y el adaptador Prisma lo implementa.
- **Unit of Work por transacción** (`runWithTenant`): cada escritura fija el tenant en la sesión
  (`SET LOCAL`), por lo que PostgreSQL aplica RLS, y agrupa las escrituras relacionadas en una transacción.

Decisiones de los módulos de registro:

- Las medidas se validan con la escala exacta de las columnas y el volumen se calcula en el dominio
  con enteros; coincide con la restricción `volumeM3 = round(l·a·h / 1e6, 6)` de la base.
- El registro de paquete guarda dirección, paquete e historial inicial en una sola transacción y no
  publica evento de outbox, porque el catálogo de eventos no define uno de registro.
- Un usuario de otro tenant devuelve `404` en `POST /couriers`, igual que uno inexistente.
- Las reglas numéricas se duplican entre módulos a propósito, para no acoplarlos entre sí.

Diagramas C4 de contexto, contenedores y componentes: `docs/architecture/c4-registration.md`.

## Desarrollo

Los directorios `frontend` y `backend` se montan en los contenedores, por lo que Vite y NestJS recargan los cambios automáticamente. Si cambian dependencias o los Dockerfiles, vuelve a iniciar con `docker compose up --build`.

## Convenciones

Trabaja en ramas `feature/<nombre>` y abre un Pull Request hacia `main`. Para los commits se recomienda Conventional Commits, por ejemplo:

```text
feat: add route management
fix: correct route validation
docs: update readme
```

## Estado

Infraestructura (Docker Compose, PostgreSQL con PostGIS, RabbitMQ), modelo de datos con aislamiento
multi-tenant por Row-Level Security y el backend NestJS con sus módulos de dominio están operativos.
El proceso worker (`backend/src/worker.ts`) publica los eventos del outbox y ejecuta los consumidores
de RabbitMQ. Los módulos de PKG-01 y VEH-01 exponen hoy `POST /packages`, `POST /vehicles` y
`POST /couriers` (ver la sección siguiente).

Pendiente o provisional: la autenticación real (el contexto de tenant llega por el header
`x-tenant-id`, que no es un control de seguridad), y el consumo de estos endpoints desde el frontend,
que por defecto usa datos simulados (`VITE_USE_MOCK_DATA=true` en `docker-compose.yml`).
