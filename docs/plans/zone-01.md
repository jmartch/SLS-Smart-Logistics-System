# Plan de ZONE-01 — Zonas, sectores y catálogos para recepción

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `ZONE-01` |
| Dominio | Zonas, sectores y catálogos para recepción |
| Estado general | `IN_PROGRESS`: dominio, casos de uso de zonas, adapter Prisma y fronteras verificados; sectores, tipos de envío y HTTP pendientes |
| Asignación | Humberto; confirmado el 2026-09-30 |
| Rama observada | `feature/zone-01` |
| Última auditoría | 2026-10-02; 8 suites y 44 tests de zones, build y regresión completa (34 suites/212 tests) verificados en Compose |
| Commit auditado | `82da30d` |
| Informe | [ZONE-01](../modules/zone-01-report.md) |
| Coordinación | [Puntos 1 y 2](mvp-puntos-1-2.md) |

## Responsables confirmados — 2026-09-30

Humberto es responsable de este módulo. Juanangel mantiene AUTH/TENANT, Vivian PKG/VEH, Humberto ZONE y Santiago frontend. Las tareas de pantallas e integración web de este plan se coordinan con Santiago; el responsable backend publica contratos y participa en la verificación conjunta. Las etiquetas `USER`/`CODEX_MECHANICAL` conservan su significado y no son nombres de personas. Esta confirmación sustituye propuestas de asignación anteriores sin acreditar implementación.

## Alcance

Humberto implementará ZONE-01 para coordinar sus decisiones con clasificación y clustering. Vivian conserva PKG-01/VEH-01 y consume el contrato público de zonas. Los pasos con responsable `USER` en este plan corresponden a Humberto. La implementación del algoritmo de clustering sigue en CLUSTER-01/route-planning; las zonas operativas y los grupos calculados no se consideran equivalentes automáticamente.

La entrega a PKG-01 debe fijar consultas de zonas/sectores, IDs, pertenencia tenant, relación sector-zona y resultado cuando no existe clasificación. Publicar también el catálogo ShipmentType, que permanece en el alcance de este plan. Coordinar ese contrato antes de integrar el formulario; Vivian puede usar dobles en pruebas mientras se completa la API real.

### Incluido

Crear/listar/consultar/editar zonas y sectores; catálogo ShipmentType necesario para PKG-01 y el formulario; validar relaciones tenant/sector/zona y ofrecer contrato de consulta a clasificación. Clasificación manual explícita como primer corte; automatización geográfica debe definirse aparte.

### Fuera de alcance

Clustering, polígonos/geofencing, reglas Interpreter y planificación. No suprimir el módulo geográfico existente. Borrado físico de catálogos referenciados no es necesario para esta entrega.

## Dependencias y fuentes

DATA-01; contrato TENANT-01 para dominio/puertos y AUTH-01 para endpoints protegidos. PKG-01 consume estos catálogos.

- `AGENTS.md`: arquitectura y aislamiento (§8–9), reglas de dominio (§10–12), errores/persistencia (§17–18), pruebas/comandos (§20–22) y tablero (§26).
- [backend/prisma/schema/catalog.prisma](../../backend/prisma/schema/catalog.prisma)
- [frontend/src/features/packages/api/catalogApi.ts](../../frontend/src/features/packages/api/catalogApi.ts)
- [frontend/src/features/packages/types.ts](../../frontend/src/features/packages/types.ts)
- [backend/prisma/schema/packages.prisma](../../backend/prisma/schema/packages.prisma)

## Diagnóstico actual

Existen Zone, Sector y ShipmentType, unicidades por tenant y relación compuesta sector/zona. CreateZoneService ya está implementado; no existen adapters ni controladores del catálogo. El frontend simula GET /zones, /zones/:id/sectors y /shipment-types. Zone/Sector no tienen active; ShipmentType sí. No asumir desactivación disponible sin decidir su modelo/migración.

Actualización 2026-10-02: `catalog-code.ts` y `catalog-name.ts` implementan normalización y errores tipados de valores individuales. `catalog-values.spec.ts` está normalizado con el skill sls-test-normalization: títulos en inglés, jerarquía sujeto/operación/caso y fases AAA. Conserva 18 casos (10 de código, 8 de nombre) y sus aserciones; suite, build y formato del test aprobados. No demuestra todavía unicidad persistida ni aislamiento del catálogo.

Incremento de referencias verificado: el usuario implementó assertCatalogReferences e InvalidCatalogReferenceError; Codex creó su suite a petición expresa con sls-test-normalization. Seis casos cubren relación válida, sector undefined/null, zona ajena sin sector, tenant del sector prioritario a su zoneId y sector de otra zona. Las dos suites del módulo aprueban 24 pruebas; build aprobado. Estos tests comparan referencias de dominio y no prueban consultas reales ni aislamiento HTTP/RLS.

La asignación no equivale a implementación. La auditoría inicial de `8cdb2c4` fue estática; la verificación actual de valores está descrita arriba y en la bitácora. Los nuevos contratos/runners/rutas son propuestas pendientes, no herramientas o endpoints disponibles. No se modificó la base compartida.

## Criterios de aceptación

1. Administrador crea y edita zonas/sectores; recepción obtiene listas válidas del tenant autenticado.
2. Código de zona y tipo de envío no se duplica dentro de tenant; código de sector respeta su unicidad por zona.
3. Un sector siempre pertenece a la zona y empresa indicadas; IDs externos producen respuesta indistinguible de ausencia.
4. Los tipos de envío requeridos por PKG-01 tienen dueño, datos reales y política de activos; cambios no rompen referencias históricas.
5. Contrato de clasificación establece selección manual permitida y resultado cuando no hay zona; no afirmar clasificación automática por disponer de un CRUD.

## Plan verificable

| Paso | Fase | Responsable | Estado | Dependencias | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contrato de catálogos | `USER` | `REVIEW` | Contrato AUTH/TENANT | Ejemplos de request/response, duplicado, sector ajeno y lista vacía acordados; prefijo API único. | [Propuesta](../modules/zone-01-contract.md), pendiente de revisión de Humberto y coordinación |
| 2 | Dominio y pruebas | `USER` | `IN_PROGRESS` | 1 para alcance completo; código/nombre pueden avanzar con reglas confirmadas | Pruebas cubren duplicados normalizados, asociación incorrecta y dominio independiente. | Valores/referencias (24 tests), arquitectura Clean (2 tests); puerto Zone implementado; puertos/casos Sector y ShipmentType pendientes |
| 3 | Casos de uso y persistencia | `USER` | `IN_PROGRESS` | 2; contexto TENANT | Listas, detalle y edición aislados; conflicto concurrente de código controlado; no se borran referencias. | CreateZoneService (5 tests), ListZonesService (3 tests), FindZoneService (3 tests), PrismaZoneCatalogAdapter (6 tests) y ZonesModule (1 test) verificados en Compose; sectores y shipment-types pendientes |
| 4 | HTTP e integración real | `USER` | `TODO` | 3; AUTH protegido | Administrador escribe, recepción lee; 401/403/404/409 controlados, carga/vacío/error visibles. | Pendiente |
| 5 | Pruebas y evidencia | `USER` | `TODO` | 4 | Build y pruebas del módulo pasan; formulario consume catálogo persistido; informe distingue ejecutado/pendiente. | Pendiente |

## Paso actual

Arquitectura, casos de uso de zonas y adapter Prisma verificados (2026-10-02):
1. `test/zones-architecture.spec.ts`: verifica que `domain` y `application` no importen `@nestjs`, `@prisma` ni capas externas (2 tests).
2. `application/list-zones.service.ts` y `application/find-zone.service.ts`: implementados con suites normalizadas de 3 tests cada uno.
3. `infrastructure/prisma-zone-catalog.adapter.ts`: implementa `ZoneCatalogPort` mediante `runWithTenant`, ordenamiento estable y traducción de `P2002` a `CATALOG_CODE_CONFLICT` (6 tests).
4. `zones.module.ts`: composition root NestJS con factories puras desacopladas (1 test).
Total del módulo zones: 8 suites y 44 tests aprobados. Build y regresión completa del backend (34 suites, 212 tests) pasando en Compose con código 0.

Siguiente incremento: puertos y casos de uso para Sector y ShipmentType, o controllers/DTOs HTTP para los endpoints de zonas según el contrato. El contrato completo permanece en REVIEW.

Actualización del puerto Zone: usuario implementó `application/ports/zone-catalog.port.ts` con las tres operaciones propuestas; inspección y build de Compose aprobados el 2026-10-02. Siguiente incremento acotado: `application/create-zone.service.ts`, clase pura que recibe ZoneCatalogPort, normaliza código/nombre y llama una vez a createByTenant usando tenantId interno separado de CreateZoneCommand. Debe conservar el resultado de conflicto y propagar fallos de infraestructura; validación fallida no escribe. Propuesta entregada en chat, aún no implementada. Pruebas con doble del puerto y arquitectura pendientes; paso 2 no cerrado ni persistencia/HTTP implementados.

Actualización posterior: CreateZoneService implementado por usuario; `test/create-zone.service.spec.ts` creado con sls-test-normalization. Cinco casos verifican creación única con valores normalizados y tenant, código/nombre inválidos sin escritura, resultado de conflicto y propagación de error original. Mock nuevo y tipado por caso. Compose: tres suites/29 pruebas y build aprobados. Conflicto probado como respuesta del doble, no como concurrencia de base. Paso 3 IN_PROGRESS; arquitectura, adapters y acceso autenticado pendientes.

Primer puerto propuesto: `application/ports/zone-catalog.port.ts`, con resultados propios de aplicación que reutilizan ZoneReference, consultas listByTenant/findByTenant y escritura createByTenant. Todas requieren tenant explícito desde contexto confiable; no importan runWithTenant ni tipos Prisma/NestJS. El caso de uso normalizará código/nombre antes de escribir; el adapter traducirá únicamente la colisión de tenant/code a CATALOG_CODE_CONFLICT, preservando otros fallos. La restricción única de la base resolverá también conflictos concurrentes. Contrato de AUTH/TENANT aún no implementado en esta rama; el tenantId interno no equivale a autenticación. Responsable USER, firmas propuestas en chat; archivo aún por crear. Sectores/ShipmentType se detallarán después del primer puerto, sin introducir capas vacías.

Incremento propuesto: `domain/catalog-reference.policy.ts`, `domain/invalid-catalog-reference.error.ts` y `test/catalog-reference.policy.spec.ts` bajo modules/zones. Política pura para comprobar zona del tenant de la operación y, cuando exista sector, su tenant y zoneId. Probar relación válida, sector de otra zona, zona/sector de otro tenant y sector opcional con zona válida. Entradas desde contexto confiable y referencias cargadas por aplicación; la política no consulta Prisma ni obtiene identidad. La verificación de aislamiento de consultas y el mapeo indistinguible de recurso ajeno/ausente pertenecen a aplicación/persistencia/HTTP. Responsable USER; implementación y pruebas pendientes.

Auditoría de continuación 2026-10-02: los tres archivos de referencias ya están creados por el usuario y vacíos. Se propone `assertCatalogReferences(tenantId, zone, sector?)`, referencias mínimas readonly y errores internos diferenciados para tenant de zona, tenant de sector y zona del sector. Sector null/undefined es opcional; la zona es obligatoria para esta operación de validación. Esta firma no decide si PKG permite registrar paquetes sin zona. Ejemplo entregado en chat; implementación y ejecución del incremento pendientes.

Propuesta preparada el 2026-10-01: [contrato de catálogos](../modules/zone-01-contract.md). Revisar normalización/límites, activos, destino sin zona y contratos compartidos de identidad, permisos y prefijo. El paso 1 está en REVIEW; no se ha aprobado ni implementado.

## Fichas de implementación

### Paso 1 — Contrato de catálogos

**Objetivo y razón:** Definir DTOs, permisos, normalización de códigos, activos y consumo por PKG. Confirmar rutas propuestas GET/POST /zones, GET/PATCH /zones/:id, GET/POST /zones/:id/sectors, PATCH de sector y GET/POST/PATCH /shipment-types.

**Dependencias:** Contrato AUTH/TENANT. **Estado:** `REVIEW`. **Responsable:** `USER`.

**Archivos esperados:** docs/modules/zone-01-contract.md (nuevo); frontend/src/features/packages/api/catalogApi.ts como referencia. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Humberto:** Definir DTOs, permisos, normalización de códigos, activos y consumo por PKG. Confirmar rutas propuestas GET/POST /zones, GET/PATCH /zones/:id, GET/POST /zones/:id/sectors, PATCH de sector y GET/POST/PATCH /shipment-types.

**Verificación y aceptación:** Ejemplos de request/response, duplicado, sector ajeno y lista vacía acordados; prefijo API único.

**Decisiones y pendiente:** La firma del frontend es provisional; no dejar ShipmentType sin dueño.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 2 — Dominio y pruebas

**Objetivo y razón:** Expresar reglas de códigos/nombres y relación sector/zona con tests; definir puertos de consulta y escritura propios, sin Prisma.

**Dependencias:** 1 para alcance completo; valores individuales pueden avanzar. **Estado:** `IN_PROGRESS`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/zones/domain/; application/ports/; test/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Humberto:** Expresar reglas de códigos/nombres y relación sector/zona con tests; definir puertos de consulta y escritura propios, sin Prisma.

**Verificación y aceptación:** Pruebas cubren duplicados normalizados, asociación incorrecta y dominio independiente.

**Decisiones y pendiente:** Acordar si se requieren sectores para cada zona; el registro debe admitir el caso sin sector.

Preparación del 2026-10-01: [guía del primer incremento](../modules/zone-01-domain-guide.md). Humberto confirmó código 1–30 con A–Z, dígitos, guion y guion bajo; nombre 1–100 tras trim. Código y nombre implementados bajo `backend/src/modules/zones/`; nombre cuenta puntos de código Unicode. Verificación 2026-10-02: 18 tests y build aprobados; test normalizado y formato comprobado. Paso 2 IN_PROGRESS: relaciones, conflictos, puertos y prueba de arquitectura pendientes.

Actualización del incremento siguiente: política de referencias implementada por usuario y test creado por Codex con autorización explícita. Seis casos nuevos aprobados; valores y referencias suman 24 pruebas. Relación sector/zona/tenant de dominio verificada. Permanecen pendientes conflictos, puertos y arquitectura; también aislamiento de consultas y acceso HTTP en fases posteriores.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 3 — Casos de uso y persistencia

**Objetivo y razón:** Implementar administración/consulta de catálogos con adapters Prisma, conflictos estables y filtros tenant. Reutilizar índices compuestos; documentar migración solo si falta una capacidad acordada.

**Dependencias:** 2; contexto TENANT. **Estado:** `IN_PROGRESS`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/zones/application/; infrastructure/; zones.module.ts; backend/prisma/schema/catalog.prisma si procede. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Humberto:** Implementar administración/consulta de catálogos con adapters Prisma, conflictos estables y filtros tenant. Reutilizar índices compuestos; documentar migración solo si falta una capacidad acordada.

**Verificación y aceptación:** Listas, detalle y edición aislados; conflicto concurrente de código controlado; no se borran referencias.

**Decisiones y pendiente:** Exponer consultas públicas del módulo para PKG, sin Prisma compartido entre módulos.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 4 — HTTP e integración real

**Objetivo y razón:** Añadir DTOs/controller, permisos y filtro de errores acordado. Integrar los tres catálogos web con IDs UUID y credenciales reales.

**Dependencias:** 3; AUTH protegido. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/zones/presentation/; backend/src/app.module.ts; frontend/src/features/packages/api/catalogApi.ts. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Humberto:** Añadir DTOs/controller, permisos y filtro de errores acordado. Integrar los tres catálogos web con IDs UUID y credenciales reales.

**Verificación y aceptación:** Administrador escribe, recepción lee; 401/403/404/409 controlados, carga/vacío/error visibles.

**Decisiones y pendiente:** Coordinar configuración de mocks con PKG: no desactivar globalmente mientras falte POST /packages.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 5 — Pruebas y evidencia

**Objetivo y razón:** Crear E2E A/B y runner desechable; probar conflictos, sector/zona, tipo inactivo y rollback si aplica. Registrar contrato y resultado real.

**Dependencias:** 4. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/test/zone-catalogs.e2e-spec.ts (nuevo); backend/test/integration/; docs/modules/zone-01-report.md. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Humberto:** Crear E2E A/B y runner desechable; probar conflictos, sector/zona, tipo inactivo y rollback si aplica. Registrar contrato y resultado real.

**Verificación y aceptación:** Build y pruebas del módulo pasan; formulario consume catálogo persistido; informe distingue ejecutado/pendiente.

**Decisiones y pendiente:** Cerrar este catálogo; clasificación del paquete se verifica en PKG.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

## Verificación reproducible

Ejecutar desde la raíz, con servicios iniciados. Estos comandos ya existen:

```bash
docker compose exec backend npm run build
docker compose exec backend npm test -- --runInBand
```

Durante el desarrollo acotar Jest a las rutas del módulo que ya existan; para cerrar, incluir regresiones de los componentes reutilizados. Si se modifica frontend:

```bash
docker compose exec frontend npm run build
docker compose exec frontend npm run lint
```

La integración requiere un runner nuevo que prepare una base aleatoria en el servidor PostGIS dedicado, aplique migraciones, ejecute suites y limpie en `finally`, siguiendo [la guía](../../backend/test/integration/README.md). Incorporar script y allowlist de Makefile cuando corresponda. No anunciar `test:zone-01` ni `make integration-test TEST=zone-01` como disponibles antes de implementarlos. No ejecutar fixtures/migraciones de pruebas sobre SLS compartido. No correr el lint backend con `--fix` durante revisiones de solo lectura.

Conservar salida real, base/servidor de prueba, casos cubiertos y fallos pendientes en el informe. El formato no constituye una fase independiente: respetar convención/Definition of Done y corregirlo de forma acotada cuando aplique.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-09-29 | Reutilizar modelos y código auditados | Evitar duplicar capacidades existentes | Implementar brechas del encargo y probar regresiones |
| 2026-09-30 | Contratos/endpoints nuevos son propuestas para el paso 1 | Todavía no hay implementación funcional de esta entrega | Humberto concreta decisiones antes de lógica/migraciones |
| 2026-09-30 | Agrupar este módulo en el encargo inicial de Vivian | Coordinación solicitada por Humberto | Nombres y TENANT pendientes en ese momento; confirmados posteriormente |
| 2026-09-30 | Sustituir la asignación anterior: ZONE-01 queda a cargo de Humberto | Petición expresa para coordinar lógica de zonas y clustering | Vivian conserva PKG/VEH; ZONE publica contrato y mantiene ShipmentType en su alcance |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-29 | Auditoría inicial | Existen Zone, Sector y ShipmentType, unicidades por tenant y relación compuesta sector/zona. | Lectura estática de fuentes; no ejecución | Base `8cdb2c4` |
| 2026-09-30 | Planificación | Plan y reporte creados; responsabilidades y aceptación explícitas | Revisión documental y enlaces | Sin commit |
| 2026-09-30 | Reasignación | Humberto asume ZONE-01; documentada frontera con PKG y clustering | Instrucción de Humberto; sin cambio funcional | Sin commit |
| 2026-10-01 | Auditoría de siguiente paso | Árbol limpio antes de esta actualización; modelos de catálogos presentes, módulo zones aún ausente. ZONE-01 sigue TODO; iniciar contrato del paso 1 y coordinar identidad/permisos con AUTH/TENANT. | Lectura estática de esquema, módulos y hoja de ruta; sin builds/tests ni comprobación de base | Base `4d80fb1` |
| 2026-10-01 | Paso 1 en REVIEW | Propuesta de contrato con rutas, formas, ejemplos y rechazos; decisiones conceptuales pendientes de Humberto y contratos compartidos por coordinar | Comparación estática con frontend/esquema; sin cambios de lógica ni ejecución | Sin commit |
| 2026-10-01 | Preparación de paso 2 | Guía acotada a código/nombre, matriz de pruebas y comandos futuros; límites consultados al usuario | Referencia a pruebas de arquitectura y configuración Jest existentes; implementación/pruebas nuevas pendientes | Sin commit |
| 2026-10-01 | Límites confirmados | Humberto acepta códigos de 1–30 con A–Z, números, guion y guion bajo; nombres de 1–100 tras trim | Respuesta expresa del usuario; sin implementación todavía | Sin commit |
| 2026-10-01 | Código verificado | Archivos del usuario presentes en modules/zone (singular); ENOENT original causado por buscar modules/zones | Compose: prueba específica con ruta singular, 1 suite y 10 tests aprobados; npm run build aprobado | Archivos nuevos sin commit |
| 2026-10-01 | Ruta corregida | Directorio actual modules/zones; siguiente incremento: nombre | Compose: ruta plural verificada por el agente, 10 tests aprobados; salida posterior del usuario confirma 10 tests aprobados | Sin commit |
| 2026-10-02 | Valores y normalización de test | Nombre implementado por usuario; catalog-values.spec.ts normalizado a petición expresa usando sls-test-normalization, conservando entradas, expectativas, filas y número de ejecuciones | Discovery encuentra el archivo; antes/después: 1 suite y 18 tests aprobados (10 código/8 nombre), sin skip/todo; build y Prettier del archivo aprobados en Compose | `39d12ad`, `82da30d` |
| 2026-10-02 | Títulos de rechazos | Etiquetas descriptivas para las diez filas parametrizadas; evita imprimir cadenas largas en la salida sin cambiar entradas ni expectativas | 18 tests, build y Prettier del archivo aprobados en Compose | `82da30d` |
| 2026-10-02 | Política de referencias | Usuario implementó política/error; Codex creó catalog-reference.policy.spec.ts con fixtures tipados, títulos en inglés y AAA siguiendo sls-test-normalization | Discovery del archivo; 6 casos de referencias y 18 de valores aprobados (2 suites/24 tests); formato aplicado al nuevo test y build aprobado, todo en Compose | `39d12ad`, `82da30d` |
| 2026-10-02 | Puerto Zone | Usuario reporta compilación correcta; ZoneCatalogPort presente, sin frameworks, con resultados tipados y tenant requerido | Inspección y build de Compose posterior con código 0; tests no repetidos para este contrato de tipos | `39d12ad` |
| 2026-10-02 | Creación de zona en aplicación | Usuario implementó CreateZoneService; suite con cinco casos y mocks tipados nuevos siguiendo sls-test-normalization | Compose: 3 suites/29 tests aprobados, formato aplicado solo al nuevo test y build aprobado | `39d12ad`, `82da30d` |
| 2026-10-02 | Fronteras, servicios de lectura y adapter Prisma | Implementados zones-architecture.spec.ts, ListZonesService, FindZoneService, PrismaZoneCatalogAdapter y ZonesModule | 8 suites y 44 tests de zones aprobados; build y suite completa (34 suites/212 tests) aprobados en Compose | `39d12ad`, `82da30d` |
| 2026-10-02 | Sectores: puerto, servicios y adapter | Implementados SectorCatalogPort, CreateSectorService, ListSectorsByZoneService, FindSectorService y PrismaSectorCatalogAdapter con suites normalizadas | 12 suites y 63 tests de zones aprobados; build de backend aprobado en Compose | `7730cc9`, `8f7297d` |
| 2026-10-02 | Tipos de envío y cableado completo | Implementados ShipmentTypeCatalogPort, CreateShipmentTypeService, ListShipmentTypesService, FindShipmentTypeService, PrismaShipmentTypeCatalogAdapter y ZonesModule actualizado con tests | 16 suites y 84 tests de zones aprobados; build y suite completa (42 suites/252 tests) aprobados en Compose | `c8b6ddd`, `8f7297d` |
| 2026-10-02 | Consolidación por entidad | Consolidación de 9 servicios individuales en ZoneCatalogService, SectorCatalogService y ShipmentTypeCatalogService; reducción de 12 archivos | 10 suites y 83 tests de zones aprobados; suite completa de 36 suites y 251 tests aprobada en Compose | `46a749a` |

## Cierre

- [ ] Criterios funcionales y errores controlados demostrados.
- [ ] Build y pruebas relevantes aprobados mediante Compose.
- [ ] Lecturas, mutaciones y relaciones entre tenants verificadas.
- [ ] Fronteras Clean Architecture verificadas automáticamente.
- [ ] Migraciones revisadas/aplicadas en entorno de prueba si fueron necesarias.
- [ ] API/consumidores integrados para este alcance.
- [ ] Informe actualizado por paso con evidencia real y commits identificados.
- [ ] Fuera de alcance e integración posterior explícitos.
