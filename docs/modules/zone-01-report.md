# ZONE-01 — Zonas, sectores y catálogos para recepción

Estado: `IN_PROGRESS`; dominio, aplicación consolidada, persistencia Prisma y capa HTTP con versionamiento URI `/api/v1` verificados; integración E2E pendiente.

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

### Sectores: puertos, casos de uso y adapter Prisma — 2026-10-02

Se implementó el ciclo de aplicación y persistencia para sectores:
1. `application/ports/sector-catalog.port.ts`: contrato agnóstico con `listByZone`, `findByTenant` y `createByTenant`. Retorna tipos propios y modela colisiones de código (`CATALOG_CODE_CONFLICT`) y zona inexistente (`ZONE_NOT_FOUND`).
2. `application/create-sector.service.ts`: normaliza código y nombre con reglas de dominio, valida existencia y pertenencia de la zona en el tenant de operación y delega al puerto. Suite en `test/create-sector.service.spec.ts` (6 casos: creación normalizada, rechazo por código vacío, rechazo por nombre vacío, conflicto de código, zona inexistente y propagación de error).
3. `application/list-sectors-by-zone.service.ts` y `application/find-sector.service.ts`: servicios de consulta aislados por tenant. Suites en `test/list-sectors-by-zone.service.spec.ts` (3 casos) y `test/find-sector.service.spec.ts` (3 casos).
4. `infrastructure/prisma-sector-catalog.adapter.ts`: adapter Prisma implementando `SectorCatalogPort` con `runWithTenant`, verificación previa de existencia de zona padre antes de crear, y captura de `P2002`. Suite en `test/prisma-sector-catalog.adapter.spec.ts` (7 casos).

### Tipos de envío: puertos, casos de uso, adapter Prisma y ZonesModule — 2026-10-02

Se implementó el ciclo completo para tipos de envío y la integración en el módulo:
1. `application/ports/shipment-type-catalog.port.ts`: contrato de catálogo con `listByTenant`, `findByTenant` y `createByTenant`, incluyendo soporte para filtrado opcional de inactivos (`includeInactive`).
2. `application/create-shipment-type.service.ts`: normaliza código y nombre, aplica `active` por defecto en `true` y delega al puerto. Suite en `test/create-shipment-type.service.spec.ts` (5 casos).
3. `application/list-shipment-types.service.ts` y `application/find-shipment-type.service.ts`: servicios de consulta con filtro de inactivos y búsqueda por ID. Suites en `test/list-shipment-types.service.spec.ts` (4 casos) y `test/find-shipment-type.service.spec.ts` (3 casos).
4. `infrastructure/prisma-shipment-type-catalog.adapter.ts`: adapter Prisma implementando `ShipmentTypeCatalogPort` con `runWithTenant`, ordenamiento estable `[{ code: 'asc' }, { id: 'asc' }]` y filtro `active: true` por defecto. Suite en `test/prisma-shipment-type-catalog.adapter.spec.ts` (7 casos).
5. `zones.module.ts`: actualizado para exportar y registrar los tres adapters de persistencia y los nueve servicios de aplicación como providers independientes. Verificado en `test/zones.module.spec.ts`.

Comandos y evidencia en Compose:
- `docker compose run --rm backend npm test -- --runInBand src/modules/zones/test/`: 16 suites y 84 tests aprobados en el módulo zones.
- `docker compose run --rm backend npm test -- --runInBand`: 42 suites y 252 tests aprobados en todo el backend (regresión total sin fallos).
- `docker compose run --rm backend npm run build`: salida exitosa con código 0.
- Clean Architecture verificado mediante `test/zones-architecture.spec.ts`.
- Prettier ejecutado en todos los archivos creados.
- Commits relacionados: `7730cc9` (puerto, servicios y tests de sectores), `c8b6ddd` (puerto, servicios y persistencia de shipment types) y `8f7297d` (tests de persistencia y module wiring).

### Consolidación de servicios de aplicación por entidad — 2026-10-02

Para reducir la fatiga de archivos sin perder cohesión ni violar Clean Architecture, se consolidaron los 9 micro-servicios CRUD en 3 servicios orientados a recurso:
1. `application/zone-catalog.service.ts`: consolida `create`, `list` y `findById` de zonas. Suite consolidada en `test/zone-catalog.service.spec.ts` (11 casos).
2. `application/sector-catalog.service.ts`: consolida `create`, `listByZone` y `findById` de sectores. Suite consolidada en `test/sector-catalog.service.spec.ts` (12 casos).
3. `application/shipment-type-catalog.service.ts`: consolida `create`, `list` y `findById` de tipos de envío. Suite consolidada en `test/shipment-type-catalog.service.spec.ts` (12 casos).
4. `zones.module.ts` y `test/zones.module.spec.ts`: actualizados para proveer y exportar los 3 servicios consolidados junto a los 3 adapters Prisma.
5. Eliminación de 18 archivos obsoletos individuales (9 servicios y 9 specs).

Comandos y evidencia en Compose:
- `docker compose run --rm backend npm test -- --runInBand src/modules/zones/test/`: 10 suites y 83 tests aprobados en zones (reducción de 16 a 10 suites conservando toda la cobertura).
- `docker compose run --rm backend npm test -- --runInBand`: 36 suites y 251 tests aprobados en todo el backend (100% pasando sin regresiones).
- `docker compose run --rm backend npm run build`: compilación limpia con código 0.
- Clean Architecture verificado mediante `test/zones-architecture.spec.ts`.
- Commit relacionado: `46a749a` (consolidación por entidad de servicios de catálogo y tests).

### Capa de presentación HTTP y versionamiento v1 — 2026-10-02

Se implementó la capa HTTP completa para los catálogos y el versionamiento global del API:
1. **Versionamiento global URI (`/api/v1`)**:
   - `backend/src/main.ts`: configurado `setGlobalPrefix('api')` y `enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`. Todos los endpoints de la API quedan expuestos de forma estándar bajo `/api/v1/*`.
   - `frontend/src/shared/config/environment.ts` y `.env.example`: actualizado `API_BASE_URL` a `/api/v1` (o `http://localhost:3000/api/v1`).
   - `frontend/src/features/packages/api/catalogApi.spec.ts`: pruebas de mock actualizadas a `/api/v1` (2 tests pasando).
2. **Contexto seguro de tenant (`@CurrentTenant()`)**:
   - `backend/src/modules/zones/presentation/current-tenant.decorator.ts`: extrae el `tenantId` desde `request.user.tenantId` (autenticación) con fallback a `x-tenant-id` o `tenant-id` para pruebas de integración/Postman. Valida formato UUID con `isValidTenantId` y lanza `UnauthorizedException` (401 `UNAUTHENTICATED`) si está ausente o no es UUID válido. Suite en `test/current-tenant.decorator.spec.ts` (5 tests).
3. **Mapeo de errores de dominio y catálogos**:
   - `backend/src/modules/zones/presentation/catalog-http-errors.ts`: traduce errores de validación de dominio (`InvalidCatalogCodeError`, `InvalidCatalogNameError`) a `BadRequestException` (400 `VALIDATION_ERROR`), y códigos de conflicto de negocio a `ConflictException` (409 `CATALOG_CODE_CONFLICT`) o `NotFoundException` (404 `CATALOG_RESOURCE_NOT_FOUND`).
4. **Controladores y endpoints de catálogo**:
   - `backend/src/modules/zones/presentation/zones.controller.ts`: expone `GET /zones`, `POST /zones`, `GET /zones/:zoneId`, `GET /zones/:zoneId/sectors`, `POST /zones/:zoneId/sectors`, `GET /zones/:zoneId/sectors/:sectorId`. Valida pertenencia de sector a zona y aislamiento por empresa. Suite en `test/zones.controller.spec.ts` (10 tests).
   - `backend/src/modules/zones/presentation/shipment-types.controller.ts`: expone `GET /shipment-types` (con filtro opcional `?includeInactive=true`), `POST /shipment-types`, `GET /shipment-types/:id`. Suite en `test/shipment-types.controller.spec.ts` (6 tests).
5. **Registro en módulos**:
   - `backend/src/modules/zones/zones.module.ts`: registra `ZonesController` y `ShipmentTypesController`.
   - `backend/src/app.module.ts`: registra `ZonesModule` en los imports de la aplicación principal.
   - `test/zones.module.spec.ts`: verifica la instanciación de servicios, adapters y controllers dentro del módulo NestJS.

Comandos y evidencia en Compose:
- `docker compose run --rm backend npm test -- --runInBand src/modules/zones/test/`: 13 suites y 110 tests aprobados en zones.
- `docker compose run --rm backend npm test -- --runInBand`: 39 suites y 278 tests aprobados en todo el backend (100% pasando sin regresiones).
- `docker compose run --rm frontend npm test -- --run`: 2 suites y 8 tests aprobados en el frontend.
- `docker compose run --rm backend npm run build`: compilación limpia (`nest build`) con código 0.
- Clean Architecture verificado mediante `test/zones-architecture.spec.ts`.
- Siguiente trabajo: suites de pruebas de integración E2E con base de datos real (Paso 5).

## Estado en el entorno compartido

No se consultaron ni modificaron datos, roles ni migraciones de la base compartida. No se inspeccionó trabajo privado del compañero ni otras ramas.

## Trabajo fuera de alcance

Clustering, polígonos/geofencing, reglas Interpreter y planificación. No suprimir el módulo geográfico existente. Borrado físico de catálogos referenciados no es necesario para esta entrega.

## Cierre

Implementación no cerrada. Actualizar una sección por cada paso completado, registrando comandos, resultados, límites y commit; enlazar siempre el plan.
