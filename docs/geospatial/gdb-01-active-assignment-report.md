# GDB-01 — Una asignación activa por paquete

Actualización: este es un registro del bloque parcial; el estado vigente se encuentra en [GDB-01 completo](gdb-01-report.md).
Estado: implementado en una migración SQL nueva, probado aisladamente y todavía no aplicado a SLS.

## Implementación

La migración `20260914120000_unique_active_assignment` crea el índice único parcial `Assignment_one_active_per_package_key` sobre `(tenantId, packageId)` para filas con `status = ACTIVE`.

Las filas ENDED y CANCELLED pueden repetirse. Se añadió una nota en el esquema Prisma para evitar reemplazarlo por una unicidad completa que rompa el historial. Si existen duplicados activos cuando se aplique, PostgreSQL rechazará la migración: no elimina ni corrige filas automáticamente.

## Prueba ejecutada

`backend/test/sql/active-assignment-uniqueness.sql` ejecuta el SQL real de la migración sobre una tabla temporal que oculta la tabla pública. La ejecución se hizo en PostgreSQL 17 y terminó con ROLLBACK y PASS.

Casos comprobados:

- Segundo INSERT activo para la misma identidad: rechazado.
- Reactivación mediante UPDATE que produce conflicto: rechazada.
- Varias asignaciones terminadas y canceladas: permitidas.
- Identidades distintas por tenant o paquete: permitidas por el índice.
- Cerrar la asignación y crear su reemplazo: permitido, conservando historial.

La tabla temporal solo modela las columnas del índice. No valida FK, enums, RLS, servicios ni transacciones concurrentes de capacidad. La prueba de identidad entre tenants es del índice, no autoriza referencias cruzadas a paquetes en el modelo real.

Para repetir desde una máquina con psql y conexión de prueba configurada, ejecutar `psql -X -f backend/test/sql/active-assignment-uniqueness.sql`. El include relativo resuelve el archivo real de migración.

## Pendientes

No se aplicó esta migración ni se ejecutó migrate dev/deploy. Las relaciones compuestas del bloque previo aún requieren su propia migración; este archivo incorpora únicamente el índice parcial. Antes de desplegar, reconciliar todas las diferencias de esquema y probar las migraciones juntas en una base dedicada.

No se han completado CHECK, permisos, coherencia parada/ruta ni control transaccional de capacidad. GDB-01 continúa en progreso.
