# GDB-01 — Integridad logística y permisos

Estado: implementación histórica aplicada a la base local `sls` y runner actual verificado sobre la cadena completa de migraciones. Los cambios del runner todavía no están confirmados en un commit; véase el [plan vigente](../plans/gdb-01.md).

Este informe reemplaza el estado parcial de los informes de relaciones y de asignación activa. La migración inicial permanece intacta y el cambio previo del usuario en `backend/tsconfig.json` no fue modificado.

## Entregables

- `20260914120000_unique_active_assignment`: índice único parcial para una asignación ACTIVE por tenant/paquete.
- `20260914130000_logistics_integrity`: relaciones compuestas, CHECK, permisos y RLS. Se ejecuta en una transacción; no elimina ni repara datos inconsistentes automáticamente.
- Esquema Prisma actualizado con claves y relaciones que se pueden expresar en Prisma. Índice parcial, CHECK y políticas se mantienen explícitamente en SQL.
- `PrismaAssignmentReservation`: adaptador de persistencia vigente que reserva capacidad mediante transacción SERIALIZABLE y bloqueos de ruta, paquete y vehículos. Reintenta hasta cinco veces errores de serialización/deadlock, sin ocultar los demás errores.
- Prueba reproducible `npm run test:gdb-01`, con bases de nombre aleatorio creadas y eliminadas por el propio script después de aplicar todas las migraciones.

## Reglas comprobadas

| Regla | Implementación / evidencia |
| --- | --- |
| Relaciones entre empresas | 32 FK tenant-owned convertidas; prueba de rechazo con zona de otra empresa y comprobación de catálogo sin FK simples a padres tenant-owned. |
| Sector pertenece a la zona | FK `(tenantId, sectorId, zoneId)`; rechazo de otra zona del mismo tenant. |
| Parada pertenece a la ruta | FK compuesta; reasignación con parada de otra ruta falla y revierte el cierre previo. |
| Vehículo/conductor coinciden con la ruta | FK compuesta y CHECK de contexto completo; vehículo distinto del mismo tenant rechazado. |
| Contexto opcional coherente | Ruta, vehículo y conductor deben estar juntos; una asignación ACTIVE requiere ruta. Parada puede omitirse. |
| Historial | Asignaciones anteriores se conservan como ENDED; actualizaciones de contexto del padre se restringen para no reescribir el historial por cascada. |
| Unicidad activa | Segundo INSERT activo rechazado por PostgreSQL. |
| Valores válidos | CHECK de peso/volumen/capacidades positivos y finitos, coordenadas en rango, secuencia e intento positivos. Incluye prueba de NaN. |
| RLS | Lectura y actualización de datos ajenos no devuelven filas; cambio de tenant rechazado. Contexto ausente o vacío no expone datos. |
| Permisos globales | Runtime no escribe Tenant/Permission ni accede a `_prisma_migrations`. Tenant se limita por RLS a su propio ID; Permission sigue siendo catálogo compartido de lectura. |
| Capacidad concurrente | Dos solicitudes de 6 kg para 10 kg: una confirmada y una NO_CAPACITY. Caso separado de dos pedidos de 6 m³ para 10 m³: mismo resultado. |
| Reasignación | Cierre y creación atómicos; fallo de FK conserva la asignación original; reemplazo válido conserva el historial. |

## Semántica de reserva y límites de la entrega

El adaptador es una operación de infraestructura, no un endpoint ni el planificador. Recibe tenantId de una identidad confiable; usa el rol runtime sujeto a RLS. El resultado `PENDING_ASSIGNMENT / NO_CAPACITY` no escribe una asignación ficticia ni cierra una reserva anterior.

El cálculo agrega todas las asignaciones ACTIVE del vehículo (todavía no hay calendario diario). Peso y volumen se comparan como NUMERIC exactos en PostgreSQL. No calcula rutas, clustering ni ventanas y no introduce librerías de algoritmos.

La garantía de capacidad concurrente aplica a las reservas realizadas por este adaptador. No se afirma que un CHECK pueda proteger sumas entre tablas: SQL administrativo directo puede exceder capacidad. Los futuros casos de uso deben utilizar este protocolo, y los futuros cambios de dimensiones/capacidad de recursos con carga activa deben implementar bloqueo y recálculo compatibles. No existen actualmente otros servicios de escritura de asignaciones en el backend inspeccionado.

La actualización del estado Package y la publicación de eventos se integrarán en el caso de uso de asignación con las reglas State/outbox de SLS; esta entrega de persistencia no declara completado ese flujo funcional.

Tenant/Permission se administran con un rol de plataforma separado, no mediante el runtime logístico. Revocar grants por defecto exige que cada nueva migración declare permisos y RLS expresamente.

## Verificaciones ejecutadas

### Verificación vigente — 2026-09-27

El runner fue alineado con su objetivo funcional: probar la implementación actual de GDB-01 sobre el esquema actual. Crea una base desechable, aplica las 10 migraciones mediante `prisma migrate deploy`, crea fixtures compatibles con dirección y dimensiones y ejecuta `PrismaAssignmentReservation` bajo el rol `sls_app`.

Resultados observados mediante Docker contra el servidor PostgreSQL/PostGIS de pruebas indicado explícitamente por el usuario:

- Build Nest/TypeScript: correcto.
- Una suite Jest correcta con 14/14 pruebas: siete comportamientos ejecutados para `fresh` y `history`.
- Migraciones completas, restricciones, RLS/permisos, capacidad concurrente por peso y volumen y reasignación atómica.
- `history` conserva una asignación `ENDED` previa creada sobre el esquema completo.
- La parada perteneciente a otra ruta devuelve `NOT_FOUND` y no modifica el historial.
- La base aleatoria fue eliminada después de la suite.

Node emitió una advertencia no bloqueante de deprecación de `pg` por consultas superpuestas sobre el mismo cliente. No afectó los resultados; debe corregirse antes de migrar a `pg@9`.

### Evidencia histórica

- Prisma validate: correcto.
- Prisma generate: correcto; cliente generado fuera de Git.
- Build Nest/TypeScript: correcto.
- Pruebas unitarias existentes: 2 suites, 4 pruebas correctas.
- ESLint del nuevo adaptador: correcto.
- Pruebas PostgreSQL: PASS empty y PASS upgrade, sobre PostgreSQL 17.
- git diff --check: correcto.

`empty` reproduce las migraciones desde cero. `upgrade` inserta tenants, recursos, paquetes y una asignación histórica válida sobre el esquema inicial antes de aplicar las nuevas migraciones. El runner reproduce SQL de migraciones, no invoca Prisma migrate deploy; simula la tabla de metadatos de Prisma para verificar sus permisos.

## Reproducción

Desde la raíz del repositorio, con una URL administrativa de un servidor de pruebas:

```bash
docker compose exec \
  -e GDB_TEST_ADMIN_URL=postgresql://usuario:clave@host:5432/postgres \
  backend npm run test:gdb-01
```

La URL debe permitir crear bases. El script solo elimina las bases aleatorias que creó, no la base indicada por la URL ni `sls`. Para probar en Docker, pasar esa variable al servicio backend y ejecutar el mismo script. Se recomienda un servidor de pruebas dedicado si no existe ya el rol `sls_app`, porque la migración inicial contiene creación de rol de alcance servidor.

## Aplicación a SLS confirmada

El usuario ejecutó `prisma migrate deploy --config prisma7.config.ts` sobre `sls` en `postgres:5432`. La salida confirma la aplicación satisfactoria de `20260914120000_unique_active_assignment` y `20260914130000_logistics_integrity`.

Después ejecutó `prisma generate`, `npm run build` y `prisma migrate status`, todos correctamente. Prisma informó tres migraciones y `Database schema is up to date!`. Esta actualización registra evidencia aportada por el usuario; no constituye una nueva inspección directa de PostgreSQL. No se aportó confirmación de reinicio del backend ni de pruebas funcionales posteriores al despliegue.

Las FK contextuales usan RESTRICT en actualización: para cambiar recursos de una ruta con historial se debe crear una nueva ruta y reasignar, preservando la anterior. No se eliminó ninguna columna ni entidad.
