# Verificación en SLS

Leer primero scripts, configuración y `backend/test/integration/README.md` vigentes. Las rutas y comandos siguientes reflejan la estructura inspeccionada al crear el skill y deben verificarse al usarlo.

## Discovery y ubicación

| Suite | Runner/configuración actual | Ubicación compatible |
| --- | --- | --- |
| Backend unitario, adapters con mocks y arquitectura | Jest de `backend/package.json`, `rootDir: src`, `*.spec.ts` | `backend/src/modules/<módulo>/test/`; infraestructura/starter pueden permanecer colocados junto al código |
| HTTP e integración backend | `backend/test/jest-e2e.json`, `*.e2e-spec.ts` | `backend/test/` |
| Frontend | Vitest desde `frontend/package.json` | tests junto a la feature o helper probado |
| Persistencia real | scripts `test:gdb-01`, `test:gdb-05`, `test:gdb-06`, `test:geocode-01` | runners en `backend/test/integration/` y suites en `backend/test/` |
| SQL | ejecución SQL documentada para cada escenario | `backend/test/sql/` |

Conservar las ubicaciones existentes durante la normalización. Para tests nuevos seguir la convención de su módulo/feature y comprobar que el runner los descubre. Si el usuario pide moverlos, actualizar imports, referencias de runners y discovery dentro de ese alcance, sin mezclarlo con cambios de producto.

## Comprobaciones proporcionales

Desde la raíz, comprobar servicios con `docker compose ps`. Usar `exec` con servicios activos, o `docker compose run --rm <servicio> <comando>` para una ejecución puntual. No usar herramientas de proyecto en el host.

Backend afectado (ejemplo de módulo):

```bash
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/geocoding/test/address-normalizer.spec.ts
docker compose exec backend npm run build
```

Backend completo cuando se normaliza todo su alcance:

```bash
docker compose exec backend npm test -- --runInBand
docker compose exec backend npm run build
```

Frontend afectado:

```bash
docker compose exec frontend npm test -- src/features/packages/validation.spec.ts
docker compose exec frontend npm run build
```

Frontend completo cuando se normaliza todo su alcance:

```bash
docker compose exec frontend npm test
docker compose exec frontend npm run build
```

Para discovery backend se puede añadir `--listTests` al script Jest correspondiente dentro de Compose. La ejecución real debe confirmar también casos de `it.each`, omitidos y pendientes. No usar solo el conteo de archivos como prueba de que la cobertura se conservó.

Si corresponde comprobar formato, hacerlo sobre los archivos editados dentro de Compose y con el formatter configurado actualmente. El backend usa Prettier con overrides de sangría; frontend usa oxfmt. Evitar scripts de formato globales que añadan cambios ajenos. El `lint` backend incorpora `--fix`: en revisiones usar una invocación acotada de ESLint sin `--fix`. No exigir instalar ni modificar herramientas para esta tarea.

## Persistencia real y servidor dedicado

Muchas suites `*.e2e-spec.ts` actuales son integración Prisma/PostGIS, requieren bases con prefijos distintos y no son HTTP. No lanzar `npm run test:e2e` global con las variables normales del servicio para verificarlas. `tenant-isolation.e2e-spec.ts`, por ejemplo, crea/elimina fixtures y debe ejecutarse solo sobre una base de pruebas comprobada.

El flujo existente crea bases aleatorias en un servidor temporal dedicado y ejecuta herramientas mediante Docker Compose:

```bash
make integration-test TEST=gdb-01
make integration-test TEST=gdb-05
make integration-test TEST=gdb-06
make integration-test TEST=geocode-01
make integration-db-down
```

Seleccionar solo runners relevantes, o los cuatro si se modificó todo ese alcance. Ejecutarlos **secuencialmente**: las migraciones administran el rol `sls_app` a nivel de servidor. Los runners crean y eliminan sus propias bases en `finally`; no sustituirlos por reseteos del servidor compartido. El `Makefile` conserva la ejecución de tooling en Compose, por lo que no constituye ejecución de Node/Prisma en el host.

Con un servidor externo, seguir la guía vigente y pasar `GDB_TEST_ADMIN_URL` al servicio backend sin mostrar credenciales. Debe ser un servidor PostgreSQL/PostGIS dedicado a pruebas, separado del servidor SLS. No activar opciones `KEEP_*_TEST_DB` salvo diagnóstico solicitado.

Un test HTTP sin recursos reales puede ejecutarse acotado, por ejemplo `docker compose exec backend npm run test:e2e -- --runInBand --runTestsByPath test/app.e2e-spec.ts`, después de comprobar sus dependencias. No aplicar ese comando a suites de persistencia que requieren sus runners.

Las pruebas SQL deben conservar sus requisitos y ejecutarse en el contexto de pruebas descrito para ellas; no presumir que pasar los runners anteriores ejecuta todos los archivos SQL. Si un artefacto no tiene ejecución segura documentada, conservar sus protecciones, revisar su diff y reportar la verificación que queda pendiente.

## Evidencia de cierre

- Comparar suites descubiertas y casos antes/después, contando filas parametrizadas y skips/todos existentes.
- Revisar que las aserciones críticas, sus valores y los efectos negativos sigan presentes; un resultado verde no demuestra por sí solo equivalencia.
- Registrar comandos realmente ejecutados y resultados, sin copiar conteos antiguos de documentación.
- Distinguir fallos previos, regresiones introducidas y checks impedidos por infraestructura. Corregir regresiones estructurales; no ocultar otros fallos cambiando expectativas o saltando casos.
- Una vez que pasan los checks pertinentes, repetirlos solo si hay nuevas ediciones o una duda concreta. Reportar los tests normalizados y cuáles quedaron sin verificar.
