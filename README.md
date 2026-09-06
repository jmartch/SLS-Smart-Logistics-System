# SLS — Smart Logistics System

Sistema de gestión de operaciones logísticas, compuesto por un frontend en React/Vite, una API en NestJS y PostgreSQL.

## Stack

- Frontend: React, TypeScript y Vite.
- Backend: NestJS, TypeScript y Prisma ORM.
- Base de datos: PostgreSQL 17.
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

Para ver el estado y los registros:

```bash
docker compose ps
docker compose logs -f
```

Detén los servicios con `docker compose down`. Para eliminar también los datos locales de PostgreSQL, usa `docker compose down -v`.

## Prisma

El esquema está en `backend/prisma/schema.prisma` y la configuración en `backend/prisma7.config.ts`.

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

La infraestructura Docker, los proyectos base de frontend/backend, PostgreSQL y Prisma están
configurados. El modelo de datos completo (27 entidades) está implementado con aislamiento
multi-tenant por Row-Level Security — ver la sección "Aislamiento multi-tenant" arriba. Aún
están pendientes la API, autenticación, interfaz y módulos logísticos.
