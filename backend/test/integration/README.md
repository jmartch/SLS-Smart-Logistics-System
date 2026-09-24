# Integración de reservas GDB-01

Desde la raíz del repositorio, ejecutar la prueba mediante el servicio `backend`
de Docker Compose y pasar `GDB_TEST_ADMIN_URL` al contenedor. La URL debe apuntar
a un servidor PostgreSQL 17/PostGIS dedicado a pruebas. La cuenta necesita crear
bases y roles e instalar las extensiones de las migraciones. No usar el servidor
compartido de SLS: la migración inicial configura el rol `sls_app` a nivel del
servidor.

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
