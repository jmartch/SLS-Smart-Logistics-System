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

Crea `backend/.env.docker` con la conexión utilizada por el contenedor del backend:

```env
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/sls?schema=public"
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

El esquema está en `backend/prisma/schema.prisma` y la configuración en `backend/prisma7.config.ts`.

Tras cambiar el esquema, genera el cliente y crea una migración desde el contenedor:

```bash
docker compose exec backend npx prisma generate
docker compose exec backend npx prisma migrate dev --name <nombre-migracion>
```

Las migraciones de `backend/prisma/migrations/` se versionan en Git; el cliente generado no.

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

La infraestructura Docker, los proyectos base de frontend/backend, PostgreSQL, RabbitMQ y Prisma están configurados. Aún están pendientes el modelo de datos, la API, autenticación, interfaz y módulos logísticos. RabbitMQ está disponible como infraestructura, pero aún falta implementar los publicadores, consumidores y el proceso worker de NestJS.
