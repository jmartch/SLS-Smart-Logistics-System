# Plan de ZONE-01 — Zonas, sectores y catálogos para recepción

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `ZONE-01` |
| Dominio | Zonas, sectores y catálogos para recepción |
| Estado general | `TODO` para el encargo funcional |
| Asignación | Humberto; confirmado el 2026-09-30 |
| Rama observada | `develop` |
| Última auditoría | 2026-09-29; plan finalizado 2026-09-30 |
| Commit auditado | `8cdb2c4` |
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

Existen Zone, Sector y ShipmentType, unicidades por tenant y relación compuesta sector/zona. No existen casos de uso ni controladores de catálogos. El frontend simula GET /zones, /zones/:id/sectors y /shipment-types. Zone/Sector no tienen active; ShipmentType sí. No asumir desactivación disponible sin decidir su modelo/migración.

La asignación no equivale a implementación. El código base está confirmado en `8cdb2c4`; las comprobaciones de esta auditoría son estáticas. Los nuevos contratos/runners/rutas son propuestas pendientes, no herramientas o endpoints disponibles. No se ejecutaron builds ni tests ni se modificó la base compartida para elaborar este plan.

## Criterios de aceptación

1. Administrador crea y edita zonas/sectores; recepción obtiene listas válidas del tenant autenticado.
2. Código de zona y tipo de envío no se duplica dentro de tenant; código de sector respeta su unicidad por zona.
3. Un sector siempre pertenece a la zona y empresa indicadas; IDs externos producen respuesta indistinguible de ausencia.
4. Los tipos de envío requeridos por PKG-01 tienen dueño, datos reales y política de activos; cambios no rompen referencias históricas.
5. Contrato de clasificación establece selección manual permitida y resultado cuando no hay zona; no afirmar clasificación automática por disponer de un CRUD.

## Plan verificable

| Paso | Fase | Responsable | Estado | Dependencias | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contrato de catálogos | `USER` | `TODO` | Contrato AUTH/TENANT | Ejemplos de request/response, duplicado, sector ajeno y lista vacía acordados; prefijo API único. | Pendiente |
| 2 | Dominio y pruebas | `USER` | `TODO` | 1 | Pruebas cubren duplicados normalizados, asociación incorrecta y dominio independiente. | Pendiente |
| 3 | Casos de uso y persistencia | `USER` | `TODO` | 2; contexto TENANT | Listas, detalle y edición aislados; conflicto concurrente de código controlado; no se borran referencias. | Pendiente |
| 4 | HTTP e integración real | `USER` | `TODO` | 3; AUTH protegido | Administrador escribe, recepción lee; 401/403/404/409 controlados, carga/vacío/error visibles. | Pendiente |
| 5 | Pruebas y evidencia | `USER` | `TODO` | 4 | Build y pruebas del módulo pasan; formulario consume catálogo persistido; informe distingue ejecutado/pendiente. | Pendiente |

## Paso actual

Empezar únicamente por el paso 1: publicar el contrato mínimo con ejemplos y casos de rechazo. Se puede completar con la evidencia del repositorio antes de disponer de endpoints integrados. No cambiar el estado general a `DONE` por tener tablas o clases base.

## Fichas de implementación

### Paso 1 — Contrato de catálogos

**Objetivo y razón:** Definir DTOs, permisos, normalización de códigos, activos y consumo por PKG. Confirmar rutas propuestas GET/POST /zones, GET/PATCH /zones/:id, GET/POST /zones/:id/sectors, PATCH de sector y GET/POST/PATCH /shipment-types.

**Dependencias:** Contrato AUTH/TENANT. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** docs/modules/zone-01-contract.md (nuevo); frontend/src/features/packages/api/catalogApi.ts como referencia. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Humberto:** Definir DTOs, permisos, normalización de códigos, activos y consumo por PKG. Confirmar rutas propuestas GET/POST /zones, GET/PATCH /zones/:id, GET/POST /zones/:id/sectors, PATCH de sector y GET/POST/PATCH /shipment-types.

**Verificación y aceptación:** Ejemplos de request/response, duplicado, sector ajeno y lista vacía acordados; prefijo API único.

**Decisiones y pendiente:** La firma del frontend es provisional; no dejar ShipmentType sin dueño.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 2 — Dominio y pruebas

**Objetivo y razón:** Expresar reglas de códigos/nombres y relación sector/zona con tests; definir puertos de consulta y escritura propios, sin Prisma.

**Dependencias:** 1. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/zones/domain/; application/ports/; test/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Humberto:** Expresar reglas de códigos/nombres y relación sector/zona con tests; definir puertos de consulta y escritura propios, sin Prisma.

**Verificación y aceptación:** Pruebas cubren duplicados normalizados, asociación incorrecta y dominio independiente.

**Decisiones y pendiente:** Acordar si se requieren sectores para cada zona; el registro debe admitir el caso sin sector.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 3 — Casos de uso y persistencia

**Objetivo y razón:** Implementar administración/consulta de catálogos con adapters Prisma, conflictos estables y filtros tenant. Reutilizar índices compuestos; documentar migración solo si falta una capacidad acordada.

**Dependencias:** 2; contexto TENANT. **Estado:** `TODO`. **Responsable:** `USER`.

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

## Cierre

- [ ] Criterios funcionales y errores controlados demostrados.
- [ ] Build y pruebas relevantes aprobados mediante Compose.
- [ ] Lecturas, mutaciones y relaciones entre tenants verificadas.
- [ ] Fronteras Clean Architecture verificadas automáticamente.
- [ ] Migraciones revisadas/aplicadas en entorno de prueba si fueron necesarias.
- [ ] API/consumidores integrados para este alcance.
- [ ] Informe actualizado por paso con evidencia real y commits identificados.
- [ ] Fuera de alcance e integración posterior explícitos.
