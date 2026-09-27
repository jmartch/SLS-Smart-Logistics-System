# Pruebas de integración reproducibles

Los runners de esta carpeta crean bases de datos con nombres aleatorios, aplican
las migraciones requeridas, ejecutan las suites correspondientes y eliminan las
bases al terminar. `GDB_TEST_ADMIN_URL` debe apuntar a un servidor PostgreSQL
17/PostGIS dedicado a pruebas. La cuenta necesita crear bases y roles e instalar
las extensiones utilizadas por las migraciones.

No usar el servidor compartido de SLS: aunque los runners no aplican migraciones
ni fixtures sobre la base administrativa indicada en la URL, la migración
inicial configura el rol `sls_app` a nivel del servidor.

## GDB-01 — Integración de reservas

Desde la raíz del repositorio, ejecutar la prueba mediante el servicio `backend`
de Docker Compose y pasar `GDB_TEST_ADMIN_URL` al contenedor:

```bash
docker compose exec \
  -e GDB_TEST_ADMIN_URL=postgresql://<usuario>:<clave>@<host-pruebas>:5432/postgres \
  backend npm run test:gdb-01
```

El script crea una base con UUID por escenario y la elimina al terminar. Nunca aplica migraciones sobre la base indicada en la URL; esta se usa como conexión administrativa. No depende de `DATABASE_URL` ni de `RUNTIME_DATABASE_URL`.

Escenarios:

- `empty`: primeras tres migraciones, desde base vacía.
- `upgrade`: datos e historial creados antes de aplicar las restricciones GDB-01.
- `current`: todas las migraciones del repositorio, con dirección y dimensiones en los paquetes. GDB-03 exige paquetes vacíos al migrar, por lo que los fixtures se crean después.

Los tres ejecutan `PrismaAssignmentReservation` con el cliente generado y el adaptador PostgreSQL bajo `sls_app`. Se comprueban aislamiento RLS, permisos, claves compuestas, reservas concurrentes por peso y volumen, rechazo de duplicados y rollback/historial de reasignación. Los checks SQL esperan SQLSTATE; las operaciones Prisma esperan sus códigos correspondientes (por ejemplo, `P2003` para una FK inválida).

La cobertura corresponde a la primitiva de persistencia; no demuestra el flujo completo de Chain, estados, eventos ni planificación.

## GDB-06 — Ciclo de vida de paquetes

Desde la raíz del repositorio:

```bash
docker compose exec \
  -e GDB_TEST_ADMIN_URL=postgresql://<usuario>:<clave>@<host-pruebas>:5432/postgres \
  backend npm run test:gdb-06
```

El runner crea una base `sls_gdb06_<uuid>`, aplica todas las migraciones del
repositorio desde cero, ejecuta `test/package-lifecycle.e2e-spec.ts` y elimina la
base incluso cuando el proceso termina con error. La URL administrativa se usa
para crear y eliminar la base desechable; no se usa como destino de los fixtures.

La suite comprueba cuatro escenarios:

1. Una transición válida actualiza el paquete y escribe historial y outbox en la
   misma transacción.
2. Una transición inválida no produce escrituras.
3. Un fallo al persistir el historial revierte también el cambio de estado y el
   evento.
4. Un tenant diferente no puede consultar ni modificar el paquete.

Esta prueba demuestra el patrón State, el aislamiento por tenant y la atomicidad
local en PostgreSQL. No publica mensajes en RabbitMQ ni demuestra idempotencia,
reintentos o DLQ; esas responsabilidades corresponden a RMQ-01, IDEMP-01 y
DLQ-01.
