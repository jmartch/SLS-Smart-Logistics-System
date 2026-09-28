# Plan de GDB-05 — Runner integrado de caminos y geometría

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `GDB-05` |
| Dominio | Grafo vial, geometría PostGIS y persistencia de caminos |
| Estado general | `DONE` |
| Rama observada | `develop` |
| Última auditoría | 2026-09-27 |
| Commit auditado | `2b8e574` |
| Informe | `docs/geospatial/gdb-05-report.md` |

## Alcance

### Incluido

- Ejecutar `path-geometry.e2e-spec.ts` y `route-road-path.e2e-spec.ts` desde `test:gdb-05`.
- Compartir la misma base PostGIS aleatoria creada por `gdb-05.cjs`, con todas las migraciones aplicadas mediante `prisma migrate deploy`.
- Mantener ejecución secuencial, aislamiento de fixtures y eliminación de la base incluso ante fallos.
- Alinear las protecciones de ambas suites con el nombre aleatorio que genera el runner.

### Fuera de alcance

- Crear o exigir un contenedor Docker llamado `sls_gdb05_test`; las suites reciben una URL de base de datos, no administran contenedores.
- Cambiar Dijkstra, geometrías, repositorios productivos, migraciones o contratos de dominio.
- Ejecutar pruebas contra la base compartida `sls`.

## Dependencias y fuentes

- `AGENTS.md`: secciones 12, 18, 20, 22 y 27.
- `backend/test/integration/gdb-05.cjs`.
- `backend/test/path-geometry.e2e-spec.ts`.
- `backend/test/route-road-path.e2e-spec.ts`.
- `docs/geospatial/gdb-05-report.md` y `docs/geospatial/migration-plan.md`.
- GDB-05 funcional permanece cerrado; este plan amplía únicamente su orquestación reproducible.

## Diagnóstico actual

`gdb-05.cjs` ya crea una base aleatoria `sls_gdb05_<uuid>`, ejecuta todas las migraciones mediante Prisma, lanza Jest con `--runInBand` y elimina la base en `finally`. Sin embargo, solo ejecuta `route-road-path.e2e-spec.ts`.

`path-geometry.e2e-spec.ts` es compatible en datos y limpieza con esa misma base, pero su guard exige el nombre literal `/sls_gdb05_test`. No exige realmente un contenedor con ese nombre. Esa condición impide incorporarla al runner aleatorio actual. La otra suite acepta cualquier nombre con prefijo `/sls_gdb05_`, por lo que hoy ambas protecciones expresan contratos distintos.

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Auditoría | `CODEX_MECHANICAL` | `DONE` | Comparar runner, suites, limpieza y documentación. | Se identifica el único bloqueo previo a unir las suites. | Guard literal en `path-geometry`; runner aleatorio ya operativo. |
| 2 | Contrato de seguridad | `USER` | `DONE` | Unificar el guard de ambas suites con el nombre aleatorio generado por el runner. | Ambas rechazan cualquier URL que no termine en `sls_gdb05_<32 hex>`. | Patrón idéntico `^/sls_gdb05_[0-9a-f]{32}$` en ambas suites. |
| 3 | Orquestación | `USER` | `DONE` | Hacer que una invocación de `gdb-05.cjs` ejecute las dos suites sobre la misma base. | Jest recibe ambas rutas, corre en banda y cualquier fallo hace fallar el runner. | Una invocación con `--runInBand --runTestsByPath` y ambas rutas. |
| 4 | Verificación | `USER` | `DONE` | Ejecutar build y `test:gdb-05` en Docker con un servidor PostGIS dedicado. | Dos suites y cuatro pruebas pasan; la base aleatoria se elimina. | 10 migraciones; 2 suites; 4 pruebas; base y contenedor eliminados. |
| 5 | Documentación | `CODEX_MECHANICAL` | `DONE` | Sincronizar README, informe y plan con resultados observados. | Comandos, cobertura y conteos coinciden con la ejecución real. | README, informe y plan de migración actualizados. |

## Paso actual

### Cierre — Runner integrado verificado

Las dos suites comparten una única base aleatoria, aplican la cadena completa de migraciones, aprueban cuatro pruebas y permiten que el runner elimine la base en `finally`.

**Archivos completados:**

- `backend/test/integration/gdb-05.cjs`
- `backend/test/path-geometry.e2e-spec.ts`
- `backend/test/route-road-path.e2e-spec.ts`
- `backend/test/integration/README.md`
- `docs/geospatial/gdb-05-report.md`

**Verificación:**

```text
docker compose exec \
  -e GDB_TEST_ADMIN_URL=postgresql://<usuario>:<clave>@<host-pruebas>:5432/postgres \
  backend npm run test:gdb-05
```

**Criterio de salida:** build correcto, dos suites y cuatro pruebas aprobadas, mensaje final de GDB-05 y base temporal eliminada.

**Nota de formato:** Prettier continúa detectando el formato manual histórico del runner y del E2E de rutas. No bloquea este cierre funcional ni justifica una reformateada masiva; el informe conserva esta limitación explícita.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-09-27 | Compartir una base aleatoria por ejecución, no un contenedor o nombre fijo. | El runner ya crea, migra y elimina una base segura; ambas suites usan fixtures UUID y limpieza propia. | Una invocación cubre ambos niveles sin infraestructura manual adicional. |
| 2026-09-27 | Ejecutar las suites en banda dentro de una sola invocación Jest. | Evita interferencia entre migración, conexiones y limpieza, y conserva un único resultado del módulo. | El paso 3 añadirá ambas rutas con `--runTestsByPath`. |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-27 | Auditoría inicial | El runner aleatorio ejecuta solo `route-road-path`; `path-geometry` conserva un guard de base fija. | Inspección de runner, suites, scripts, historial e informe. | `2b8e574` |
| 2026-09-27 | Paso 2 | El usuario alineó ambas suites con el patrón aleatorio estricto y el mensaje de seguridad común. | Inspección del diff; patrón idéntico en ambos `beforeAll`. | sin commit |
| 2026-09-27 | Paso 3 | El runner incluye ambas rutas en una sola invocación Jest en banda y actualiza el mensaje final. | Inspección del diff; no se duplican base, migración ni proceso Jest. | sin commit |
| 2026-09-27 | Paso 4 | Ejecución integral sobre PostGIS temporal dedicado. | 10 migraciones; 2 suites; 4 pruebas; base y contenedor eliminados. | sin commit |
| 2026-09-27 | Paso 5 | Documentación sincronizada con la ejecución vigente. | README, informe y plan de migración revisados. | sin commit |

## Cierre

- [x] Aceptación funcional satisfecha.
- [x] Pruebas relevantes aprobadas.
- [x] Aislamiento por tenant comprobado cuando aplica.
- [x] Migración o infraestructura verificada cuando aplica.
- [x] Informe actualizado por cada punto.
- [x] Trabajo fuera de alcance documentado.
- [x] Estado del plan contrastado con el repositorio.
