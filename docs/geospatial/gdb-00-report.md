# GDB-00 — Auditoría previa a migraciones

Fecha: 2026-09-14. Rama: `feature/geospatial`.

Estado: completado para la base local `sls`. No se aplicaron migraciones ni se modificaron datos.

## Resultado

Las 27 tablas de aplicación están vacías, verificadas con `count(*)` como administrador para no ocultar registros mediante RLS. No hay datos operativos que corregir o transformar en esta instantánea. Esto permite preparar GDB-01 sin limpieza previa; no demuestra que el esquema impida futuras inconsistencias.

| Comprobación | Resultado |
| --- | --- |
| PostgreSQL | 17.11; contenedor postgres:17 |
| Zona de la sesión administrativa | Etc/UTC |
| Transacción de auditoría | REPEATABLE READ, READ ONLY |
| Extensiones | Solo plpgsql 1.0; PostGIS ausente |
| Migración inicial | Aplicada, finalizada y sin rollback |
| Checksum del archivo frente al registrado | Coinciden: `1540af573d3a5165961fb904d4886ea2840639c1e027b175d89e27f59076b50c` |
| Tablas operativas | 27 tablas, cero registros en todas |
| Relaciones entre tenants | 32 FK simples entre tablas tenant-owned revisadas; cero filas incompatibles |
| Duplicados activos por paquete | Cero grupos |
| Incoherencias asignación/parada/ruta/vehículo/conductor | Cero filas |
| Incoherencias paquete/sector/zona | Cero filas |
| Peso, volumen, coordenadas y secuencia inválidos | Cero filas |
| Estados y deadlines almacenados | Ninguno |
| RLS | ENABLE y FORCE en las 25 tablas con tenantId |
| Rol sls_app | Login permitido; no superusuario y sin BYPASSRLS |
| Lectura Package sin tenant con SET ROLE sls_app | Cero filas; resultado no concluyente por tabla vacía |

## Hallazgos estructurales para GDB-01

1. Las FK existentes relacionan IDs sin incluir tenantId. Mantener RLS y añadir integridad compuesta: son controles diferentes.
2. Assignment no tiene índice único parcial que limite una asignación ACTIVE por paquete. El índice por tenant no proporciona esa garantía.
3. No hay CHECK de dominio para los valores auditados. Añadirlos después de probar casos positivos y negativos en una base dedicada.
4. Los grants de sls_app incluyen SELECT/INSERT/UPDATE/DELETE en Tenant y Permission, tablas sin RLS, y en `_prisma_migrations`. Revisar mínimo privilegio: retirar acceso a metadatos de migración del runtime, definir operaciones de plataforma sobre Tenant y hacer explícita la administración de Permission. No confundir estas tablas globales con tablas operativas tenant-owned.
5. RLS está presente con políticas tenant_isolation. La auditoría no ejecutó escrituras ni pruebas de escape de tenant. Las pruebas existentes crean y borran fixtures; deben ejecutarse en una base de pruebas independiente.
6. Los índices y constraints activos se capturaron para revisión. La coincidencia de checksum verifica el historial de migración, pero no es una prueba completa de ausencia de modificaciones manuales del esquema.

## Decisiones de compatibilidad

- Fechas: las columnas existentes son timestamp sin zona. La sesión actual está en UTC, pero eso no prueba la convención histórica de todos los clientes. No hay filas que transformar hoy. Para GDB-04 definir instantes con offset obligatorio y persistencia timestamptz; repetir el conteo antes de aplicar. Si aparecen datos, determinar su origen antes de convertir.
- Unidades: mantener kg/m³; ampliar volumen y capacidad volumétrica a Decimal(12,6) en GDB-03. No hay valores históricos que redondear o recalcular.
- Estados: no hay filas ni eventos pendientes que requieran backfill actualmente. El código, contratos y pruebas deben adaptarse igualmente antes de cambiar los enums.
- Coordenadas: no hay ubicaciones heredadas que importar. Mantener estrategia aditiva y no inventar direcciones en futuras ejecuciones.
- No modificar la migración inicial aplicada. Crear migraciones nuevas.

## Evidencia y reproducción

- [Script de solo lectura](sql/gdb-00.sql).
- [Salida completa de metadatos y conteos](gdb-00-evidence.txt).

Desde la raíz del repositorio, con PostgreSQL levantado:

```bash
docker compose exec -T postgres psql -U postgres -d sls -X < docs/geospatial/sql/gdb-00.sql
sha256sum backend/prisma/migrations/20260906213751_init_schema/migration.sql
```

El script usa psql, ON_ERROR_STOP, un límite de 30 segundos por sentencia y una instantánea consistente. Las consultas dinámicas se generan desde metadatos e identificadores escapados; no imprimen nombres de personas, direcciones, tokens ni filas de negocio. SET ROLE es local a la transacción y no modifica roles persistidos.

Límite: el script está dirigido al esquema inicial actual. Requiere revisión después de modificar tablas o relaciones; la exploración dinámica de tenant solo cubre FK simples declaradas. No se ejecutaron tests de integración mutantes ni una comparación completa Prisma contra catálogo.

## Siguiente entrega

GDB-01: restricciones entre tenants, unicidad de asignación activa, coherencia de relaciones y valores válidos. Incluir revisión de grants y pruebas reales con dos tenants en una base efímera. La auditoría está completa; esas protecciones aún no están implementadas.
