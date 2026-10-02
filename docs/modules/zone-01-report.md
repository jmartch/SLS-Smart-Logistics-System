# ZONE-01 — Zonas, sectores y catálogos para recepción

Estado: `IN_PROGRESS`; dominio y creación de zona con doble de puerto verificados, persistencia/HTTP pendientes.

Plan canónico: [ZONE-01](../plans/zone-01.md). Coordinación: [puntos 1 y 2](../plans/mvp-puntos-1-2.md).

## Alcance verificado

Inspección estática de `develop`, commit `8cdb2c4`, el 2026-09-29; documentación preparada hasta el 2026-09-30. Árbol limpio al inicio. Existen Zone, Sector y ShipmentType, unicidades por tenant y relación compuesta sector/zona. No existen casos de uso ni controladores de catálogos. El frontend simula GET /zones, /zones/:id/sectors y /shipment-types. Zone/Sector no tienen active; ShipmentType sí. No asumir desactivación disponible sin decidir su modelo/migración.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: establecer brechas y entrega asignable sin rehacer código existente.
- Decisión inicial: encargo previsto para Vivian, sustituido por asignación confirmada a Humberto. Contratos por concretar en el paso 1.
- Archivos: fuentes enumeradas en el plan; nuevos plan e informe de este módulo.
- Resultado: aceptación, dependencias, rutas esperadas y lotes mecánicos documentados.
- Evidencia: lectura de esquema, código, documentación y estado Git.
- Pendiente: todos los pasos funcionales del plan; no hay pruebas nuevas ejecutadas.

## Decisiones técnicas

### Paso 1 — Propuesta de contrato, 2026-10-01

Se preparó [zone-01-contract.md](zone-01-contract.md), compatible con los arreglos que consume el frontend actual y las relaciones del esquema. Incluye operaciones propuestas, ejemplos de éxito/vacío/duplicado, aislamiento y decisiones pendientes. El paso queda REVIEW: Humberto conserva las decisiones de negocio y debe coordinar prefijo, identidad/permisos y registro sin zona con AUTH/TENANT, PKG y frontend. No se implementaron endpoints ni se ejecutaron builds/tests. No equivale a un contrato aprobado.

Actualización de asignación (2026-09-30): Humberto asume ZONE-01 por petición expresa para coordinar zonas y clustering. Esta decisión sustituye la asignación inicial a Vivian; ella conserva PKG-01 y VEH-01. ShipmentType permanece en este plan a cargo de Humberto. El contrato entregado a PKG especificará catálogos, relaciones tenant/sector/zona y destinos sin clasificación; el algoritmo de clustering conserva su módulo separado. Cambio documental únicamente, sin implementación ni pruebas nuevas.

DATA-01; contrato TENANT-01 para dominio/puertos y AUTH-01 para endpoints protegidos. PKG-01 consume estos catálogos. Las decisiones pendientes de DTOs, políticas y migraciones están enumeradas por paso. No se consideran aprobadas ni implementadas por aparecer en este documento.

## Verificación reproducible

### Normalización del test y valores de nombre — 2026-10-02

Alcance: únicamente `backend/src/modules/zones/test/catalog-values.spec.ts`, suite de dominio puro sin mocks, hooks ni base de datos. Inventario: cuatro casos directos y seis filas de rechazo para código; cuatro casos directos y cuatro filas de rechazo para nombre. Se preservaron entradas, límites, clase/código/campo de errores, aserciones estrictas y cantidad/orden de invocaciones. No hay skips ni todos. No fueron necesarias factories para estos valores inmutables.

Se aplicó sls-test-normalization por petición expresa: jerarquía Catalog values → operación → caso, títulos en inglés, preparación/ejecución/comprobación separadas por líneas en blanco y formato de Prettier vigente (dos espacios para zones). No se modificó producción ni se crearon commits.

Comandos ejecutados dentro de Compose:

- `npm test -- --runInBand --runTestsByPath src/modules/zones/test/catalog-values.spec.ts --listTests`: descubre el archivo esperado.
- `npm test -- --runInBand --runTestsByPath src/modules/zones/test/catalog-values.spec.ts`: antes y después, una suite y 18 pruebas aprobadas.
- `npx --no-install prettier --check src/modules/zones/test/catalog-values.spec.ts`: formato aprobado.
- `npm run build`: código de salida 0 tras normalización.

El usuario ya implementó catalog-name.ts; la suite comprueba trim, preservación de escritura/espacios internos, límites y conteo de puntos de código Unicode. Pendientes: pertenencia sector/zona, unicidad del catálogo, puertos, arquitectura e integración tenant/HTTP. Esta verificación cierra el incremento de valores, no el paso 2 completo.

Actualización de títulos solicitada el 2026-10-02: las diez filas de rechazo incluyen etiquetas descriptivas interpoladas con `$scenario`; los títulos ya no imprimen las entradas completas (31/101 letras o 101 emojis). Se conservan exactamente los valores y errores esperados. Reejecución mediante Compose: 18 pruebas aprobadas, formato del archivo aprobado y build con código 0.

Continuación de referencias (2026-10-02): se observaron catalog-reference.policy.ts, invalid-catalog-reference.error.ts y catalog-reference.policy.spec.ts creados y vacíos. Se entrega propuesta de función pura y pruebas para que Humberto implemente. No se escribió lógica ni se ejecutaron esas pruebas; no se acredita implementación por existir archivos.

### Política de referencias y creación de test — 2026-10-02

En una continuación posterior, el usuario implementó catalog-reference.policy.ts e invalid-catalog-reference.error.ts; el test permanecía vacío. Por petición expresa, Codex creó `backend/src/modules/zones/test/catalog-reference.policy.spec.ts` usando sls-test-normalization. Suite de dominio puro: fixtures ZoneReference/SectorReference nuevos por caso, UUID deterministas, tenants A/B explícitos, títulos en inglés, jerarquía sujeto/operación/caso y fases AAA; no requiere mocks, hooks ni base.

Inventario: un caso de referencias válidas; dos filas para sector undefined/null; tres rechazos que comprueban clase, código y campo del error. Zona ajena sin sector prueba validación antes de aceptar el opcional; sector ajeno con zoneId distinto prueba prioridad del tenant sobre zona. El último rechazo comprueba sector de otra zona dentro del mismo tenant.

Verificación mediante Compose:

- `npx --no-install prettier --write src/modules/zones/test/catalog-reference.policy.spec.ts`: formato aplicado únicamente al nuevo test.
- `npm test -- --runInBand --runTestsByPath src/modules/zones/test/catalog-reference.policy.spec.ts --listTests`: descubre el nuevo archivo.
- `npm test -- --runInBand --runTestsByPath src/modules/zones/test/catalog-reference.policy.spec.ts src/modules/zones/test/catalog-values.spec.ts`: dos suites y 24 tests aprobados, seis nuevos y 18 existentes.
- `npm run build`: código de salida 0.

No se modificó la lógica de producción ni se crearon commits. Incremento de referencias verificado para su alcance de dominio; no acredita lectura aislada de tablas ni autorización HTTP. Siguiente trabajo: puertos, fronteras de arquitectura y casos de uso/persistencia con conflictos de unicidad.

Preparación de paso 2 (2026-10-01): [guía de dominio](zone-01-domain-guide.md) con primer incremento y matriz de comportamiento. Humberto confirmó código de 1–30 caracteres con A–Z, dígitos, guion y guion bajo; nombre de 1–100 después de trim. Después implementó el incremento de código, inicialmente en zone y ahora en `backend/src/modules/zones/`. Paso 2 IN_PROGRESS.

Verificación del incremento de código, 2026-10-01: la primera ejecución con ruta singular aprobó una suite y diez pruebas; `docker compose exec backend npm run build` terminó con código 0 antes del renombre. Tras cambiar la carpeta a zones, `docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/zones/test/catalog-values.spec.ts` aprobó nuevamente una suite y diez pruebas; la salida posterior del usuario confirma el mismo resultado. El ENOENT original correspondía a la diferencia zone/zones, ya resuelta. No se modificó su código ni .gitignore. Archivos aún sin commit. Pendientes: nombre, pertenencia sector/zona, conflictos de catálogo, puertos y verificación de arquitectura.

Seguir los comandos de Compose y preparación de integración indicados en el plan. Los runners de este módulo aún deben implementarse; no se atribuyen resultados históricos como ejecución actual.

Resultados actuales: build aprobado y 44 pruebas aprobadas en ocho suites de zones (18 de valores, seis de referencias, cinco de creación, tres de listado, tres de búsqueda, dos de arquitectura, seis del adapter Prisma y una de ZonesModule). Suite completa del backend: 34 suites y 212 tests aprobados.

### Puerto de zonas — 2026-10-02

El usuario implementó `application/ports/zone-catalog.port.ts` y reportó compilación correcta. Inspección: reutiliza ZoneReference del dominio, declara ZoneCatalogEntry/CreateZoneData/CreateZoneResult y listByTenant/findByTenant/createByTenant con tenant obligatorio, sin dependencias Prisma/NestJS. Codex ejecutó `docker compose exec backend npm run build`, con código 0. No se repitieron tests existentes para este contrato de tipos ni se probó persistencia. Siguiente incremento propuesto: CreateZoneService y pruebas con doble tipado; todavía no implementado.

### Creación de zona en aplicación — 2026-10-02

El usuario implementó CreateZoneService. En la continuación se creó `test/create-zone.service.spec.ts` siguiendo sls-test-normalization: factories tipadas locales, UUID y tenant deterministas, mock nuevo por caso, jerarquía sujeto/execute/caso, títulos descriptivos y AAA. No se modificó producción ni se crearon commits.

Cinco casos: éxito con valores normalizados y tenant de operación, código inválido sin escritura, nombre inválido sin escritura, conflicto retornado por catálogo y error de infraestructura original propagado. Rechazos asíncronos comparten la misma promesa, evitando ejecutar el caso de uso nuevamente para comprobar clase/código/campo. Se comprueba una única escritura en éxito/conflicto/fallo y ninguna con validación inválida.

Comandos dentro de Compose: Prettier aplicado únicamente a create-zone.service.spec.ts; Jest con las tres rutas de módulos zones aprobó tres suites y 29 tests; `npm run build` terminó con código 0. El test nuevo aporta cinco casos. Estas pruebas usan un doble y no demuestran creación en PostgreSQL, conflicto concurrente, autenticación ni aislamiento de consultas. Siguiente incremento: prueba de fronteras; después adapter Prisma y verificación en base desechable.

### Fronteras de arquitectura, servicios de lectura y adapter Prisma — 2026-10-02

Se implementaron y verificaron cuatro incrementos adicionales:
1. `test/zones-architecture.spec.ts`: dos pruebas automatizadas comprobando que `domain` y `application` no importan `@nestjs`, `@prisma` ni capas externas, blindando Clean Architecture.
2. `application/list-zones.service.ts` y `application/find-zone.service.ts`: servicios puros de aplicación con suites normalizadas en `test/list-zones.service.spec.ts` y `test/find-zone.service.spec.ts` (tres casos cada uno, verificando éxito, retorno vacío/null y propagación de errores).
3. `infrastructure/prisma-zone-catalog.adapter.ts`: adapter Prisma implementando `ZoneCatalogPort` mediante `runWithTenant`, ordenamiento estable `[{ code: 'asc' }, { id: 'asc' }]` y traducción de colisión única `P2002` a `CATALOG_CODE_CONFLICT`. Su suite `test/prisma-zone-catalog.adapter.spec.ts` aprueba seis casos.
4. `zones.module.ts`: composition root NestJS que importa `PrismaModule` y provee factories desacopladas para los servicios de aplicación y el adapter. Verificado en `test/zones.module.spec.ts`.

Comandos y evidencia en Compose:
- `docker compose run --rm backend npm test -- --runInBand`: 34 suites y 212 tests aprobados en todo el backend (44 tests en el módulo zones).
- `docker compose run --rm backend npm run build`: código de salida 0.
- Prettier aplicado a todos los archivos nuevos.
- Commits relacionados: `39d12ad` (implementación de dominio, aplicación y adapter) y `82da30d` (pruebas unitarias y de arquitectura).
- Siguiente trabajo: puertos y casos de uso para Sector y ShipmentType, o integración de controladores/DTOs HTTP cuando el contrato sea aprobado.

## Estado en el entorno compartido

No se consultaron ni modificaron datos, roles ni migraciones de la base compartida. No se inspeccionó trabajo privado del compañero ni otras ramas.

## Trabajo fuera de alcance

Clustering, polígonos/geofencing, reglas Interpreter y planificación. No suprimir el módulo geográfico existente. Borrado físico de catálogos referenciados no es necesario para esta entrega.

## Cierre

Implementación no cerrada. Actualizar una sección por cada paso completado, registrando comandos, resultados, límites y commit; enlazar siempre el plan.
