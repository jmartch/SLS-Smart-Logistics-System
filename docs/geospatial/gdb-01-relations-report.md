# GDB-01 — Bloque de relaciones entre tenants

Actualización: este es un registro del bloque parcial; el estado vigente se encuentra en [GDB-01 completo](gdb-01-report.md).
Estado: esquema actualizado y validado; pendiente de migración y pruebas de base de datos.

## Cambios

- Las 32 relaciones entre modelos tenant-owned ahora referencian `(tenantId, id)` mediante claves compuestas.
- Se añadieron claves únicas `(tenantId, id)` a los 14 modelos padre referenciados. Se conservó la clave que el usuario había añadido en AuditLog.
- Se conservaron las relaciones con Tenant y Permission sin tenant compuesto, porque esos modelos son globales.
- Las relaciones opcionales mantienen el identificador nullable y usan `onDelete: Restrict`, evitando intentar anular tenantId. Eliminar un padre referenciado requerirá desvinculación explícita o conservarlo como inactivo.
- Courier conserva la unicidad de userId y añade `(tenantId, userId)` para expresar la relación uno a uno compuesta con User.
- Se corrigió la edición preliminar `AuditLog @@unique([tenantId, actorUserId])`: esa restricción limitaría a una entrada de auditoría por actor y empresa. Su eliminación permite conservar múltiples acciones.

Archivos: audit.prisma, catalog.prisma, delivery.prisma, identity.prisma, messaging.prisma, packages.prisma y routing.prisma, dentro de backend/prisma/schema.

## Validación realizada

`docker compose exec -T backend npx prisma validate --config prisma7.config.ts`: correcto, Prisma reconoce el esquema como válido.

`docker compose exec -T backend npx prisma format --config prisma7.config.ts`: correcto.

`git diff --check`: correcto.

No se generó cliente ni migración y no se modificó la base de datos. No se ejecutaron pruebas mutantes sobre la base compartida. La validación del esquema no demuestra todavía rechazo efectivo de relaciones cruzadas: se comprobará al aplicar la migración en una base de pruebas dedicada.

## Pendiente de GDB-01

Unicidad parcial de asignaciones activas, coherencia sector/zona y parada/ruta, controles de valores, revisión de permisos y concurrencia siguen pendientes. GDB-01 completo no debe marcarse DONE aún.

El cambio previo del usuario en backend/tsconfig.json no fue modificado.
