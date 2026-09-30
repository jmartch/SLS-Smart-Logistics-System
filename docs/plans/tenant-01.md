# Plan de TENANT-01 — Contexto confiable y aislamiento entre empresas

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `TENANT-01` |
| Dominio | Contexto confiable y aislamiento entre empresas |
| Estado general | `TODO` para el encargo funcional |
| Asignación | Juanangel; asignación confirmada por Humberto el 2026-09-30 |
| Rama observada | `develop` |
| Última auditoría | 2026-09-29; plan finalizado 2026-09-30 |
| Commit auditado | `8cdb2c4` |
| Informe | [TENANT-01](../modules/tenant-01-report.md) |
| Coordinación | [Puntos 1 y 2](mvp-puntos-1-2.md) |

## Responsables confirmados — 2026-09-30

Juanangel es responsable de este módulo. Juanangel mantiene AUTH/TENANT, Vivian PKG/VEH, Humberto ZONE y Santiago frontend. Las tareas de pantallas e integración web de este plan se coordinan con Santiago; el responsable backend publica contratos y participa en la verificación conjunta. Las etiquetas `USER`/`CODEX_MECHANICAL` conservan su significado y no son nombres de personas. Esta confirmación sustituye propuestas de asignación anteriores sin acreditar implementación.

## Alcance

### Incluido

Contrato puro de contexto tenant, adaptación desde identidad verificada, uso obligatorio en repositorios, RLS y pruebas de aislamiento/concurrencia. Integración con AUTH y puertos reutilizables por módulos operativos.

### Fuera de alcance

Login, hashing, sesión, permisos y alta de empresas se implementan en AUTH-01. Publicador/worker y validación de mensajes futuros quedan para RMQ-01; no aceptar metadata AMQP sin una frontera confiable. No crear una base por empresa ni refactorizar todo el backend.

## Dependencias y fuentes

DATA-01 (esquema/migraciones existentes); contrato conjunto con AUTH-01. La base del contexto se implementa antes de las guardas; el E2E final se completa cuando AUTH funcione.

- `AGENTS.md`: arquitectura y aislamiento (§8–9), reglas de dominio (§10–12), errores/persistencia (§17–18), pruebas/comandos (§20–22) y tablero (§26).
- [backend/src/database/run-with-tenant.ts](../../backend/src/database/run-with-tenant.ts)
- [backend/src/database/run-with-tenant.spec.ts](../../backend/src/database/run-with-tenant.spec.ts)
- [backend/src/database/prisma.service.ts](../../backend/src/database/prisma.service.ts)
- [backend/test/tenant-isolation.e2e-spec.ts](../../backend/test/tenant-isolation.e2e-spec.ts)
- [backend/prisma/schema/identity.prisma](../../backend/prisma/schema/identity.prisma)
- [docs/adr/002-assignment-integrity.md](../../docs/adr/002-assignment-integrity.md)

## Diagnóstico actual

Existe runWithTenant, que valida formato UUID y fija SET LOCAL dentro de una transacción. Eso no verifica identidad ni pertenencia: un UUID válido por sí solo no autoriza. PrismaService usa RUNTIME_DATABASE_URL y hay migraciones de RLS/relaciones compuestas. No hay módulo de contexto autenticado ni guardas; Tenant tiene RLS y el rol runtime no puede aprovisionar empresas. No se comprobó la base compartida ni se ejecutaron las pruebas existentes en esta auditoría.

La asignación no equivale a implementación. El código base está confirmado en `8cdb2c4`; las comprobaciones de esta auditoría son estáticas. Los nuevos contratos/runners/rutas son propuestas pendientes, no herramientas o endpoints disponibles. No se ejecutaron builds ni tests ni se modificó la base compartida para elaborar este plan.

## Criterios de aceptación

1. Un contexto requerido se deriva de identidad verificada, nunca de un tenant arbitrario del cliente; ausencia/inconsistencia deniega antes de consultar datos privados.
2. La petición A no puede consultar, modificar ni asociar recursos de B, incluyendo relaciones y consultas de listas.
3. Dos operaciones concurrentes A/B y la reutilización de conexión no mezclan contexto; rollback y fin de transacción limpian SET LOCAL.
4. Domain/application no importan Prisma, NestJS ni implementaciones; contratos no exponen TransactionClient.
5. El acceso de plataforma sigue un camino explícito y auditado; login inicial tiene resolución acotada acordada con AUTH, sin elevar el runtime.

## Plan verificable

| Paso | Fase | Responsable | Estado | Dependencias | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contrato con AUTH | `USER` | `TODO` | — | Contrato de Juanangel revisado con Vivian y Humberto, con casos de sesión ausente, tenant manipulado y acceso de plataforma. | Pendiente |
| 2 | Pruebas del contexto | `USER` | `TODO` | 1 | Pruebas expresan denegación sin consultas y tipos libres de frameworks. | Pendiente |
| 3 | Contexto y puertos | `USER` | `TODO` | 1–2 | Casos de uso se instancian sin Nest; contexto del body/query/header no sustituye identidad. | Pendiente |
| 4 | Adaptadores y transacción | `USER` | `TODO` | 3 | Tests de rollback, falta de contexto, relaciones cruzadas y migraciones/grants conservados. | Pendiente |
| 5 | Integración real con AUTH | `USER` | `TODO` | 4; sesión AUTH disponible | Lecturas y mutaciones ajenas denegadas, ausencia de contexto cerrada y conexiones sin fuga de tenant; build pasa. | Pendiente |
| 6 | Evidencia y traspaso | `CODEX_MECHANICAL` | `TODO` | 5 | Vivian o Humberto integra el contexto sin consultar directamente tablas de identidad ni adoptar Prisma en aplicación. | Pendiente |

## Paso actual

Empezar únicamente por el paso 1: publicar el contrato mínimo con ejemplos y casos de rechazo. Se puede completar con la evidencia del repositorio antes de disponer de endpoints integrados. No cambiar el estado general a `DONE` por tener tablas o clases base.

## Fichas de implementación

### Paso 1 — Contrato con AUTH

**Objetivo y razón:** Documentar origen y estructura de identidad/contexto, manejo de tenant suspendido y frontera previa al login; distinguir validación UUID de autorización.

**Dependencias:** —. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** docs/modules/tenant-01-contract.md (nuevo); tipos puros en backend/src/shared/application/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Juanangel:** Documentar origen y estructura de identidad/contexto, manejo de tenant suspendido y frontera previa al login; distinguir validación UUID de autorización.

**Verificación y aceptación:** Contrato de Juanangel revisado con Vivian y Humberto, con casos de sesión ausente, tenant manipulado y acceso de plataforma.

**Decisiones y pendiente:** Publicar contrato y nombres; no implementar aún una segunda sesión.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 2 — Pruebas del contexto

**Objetivo y razón:** Escribir casos de construcción desde identidad verificada, ausencia, inconsistencias y arquitectura. Usar dobles solo en tests.

**Dependencias:** 1. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/shared/application/; backend/src/modules/tenants/test/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Juanangel:** Escribir casos de construcción desde identidad verificada, ausencia, inconsistencias y arquitectura. Usar dobles solo en tests.

**Verificación y aceptación:** Pruebas expresan denegación sin consultas y tipos libres de frameworks.

**Decisiones y pendiente:** Precisar códigos de error y política de suspensión.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 3 — Contexto y puertos

**Objetivo y razón:** Implementar tipos/servicio y puertos mínimos para comprobar empresa activa; adaptador HTTP recibe identidad de AUTH. Exigir contexto a nuevos casos de uso.

**Dependencias:** 1–2. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/shared/application/; backend/src/modules/tenants/{application,domain,presentation}/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Juanangel:** Implementar tipos/servicio y puertos mínimos para comprobar empresa activa; adaptador HTTP recibe identidad de AUTH. Exigir contexto a nuevos casos de uso.

**Verificación y aceptación:** Casos de uso se instancian sin Nest; contexto del body/query/header no sustituye identidad.

**Decisiones y pendiente:** Coordinar guardas con paso 6 de AUTH; evitar imports circulares.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 4 — Adaptadores y transacción

**Objetivo y razón:** Reutilizar runWithTenant y rol runtime; filtrar lecturas/mutaciones por tenant. Mantener consultas del agregado en la misma transacción y evaluar impacto en consumidores existentes antes de cambiar firmas.

**Dependencias:** 3. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/database/; backend/src/modules/tenants/infrastructure/; adaptadores afectados acordados. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Juanangel:** Reutilizar runWithTenant y rol runtime; filtrar lecturas/mutaciones por tenant. Mantener consultas del agregado en la misma transacción y evaluar impacto en consumidores existentes antes de cambiar firmas.

**Verificación y aceptación:** Tests de rollback, falta de contexto, relaciones cruzadas y migraciones/grants conservados.

**Decisiones y pendiente:** No mover automáticamente database/ ni cambiar la política de plataforma.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 5 — Integración real con AUTH

**Objetivo y razón:** Añadir runner desechable y E2E con login real A/B, recursos ajenos, peticiones simultáneas y reutilización de conexiones; no reemplazar el guard en la prueba final.

**Dependencias:** 4; sesión AUTH disponible. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/test/tenant-isolation.e2e-spec.ts; backend/test/integration/; backend/package.json; Makefile. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Juanangel:** Añadir runner desechable y E2E con login real A/B, recursos ajenos, peticiones simultáneas y reutilización de conexiones; no reemplazar el guard en la prueba final.

**Verificación y aceptación:** Lecturas y mutaciones ajenas denegadas, ausencia de contexto cerrada y conexiones sin fuga de tenant; build pasa.

**Decisiones y pendiente:** Documentar comando nuevo solo cuando exista; no inferir aislamiento HTTP del test SQL.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 6 — Evidencia y traspaso

**Objetivo y razón:** Registrar pruebas, contratos, límites, comandos y commit de implementación; enlazar integración desde AUTH y planes operativos.

**Dependencias:** 5. **Estado:** `TODO`. **Responsable:** `CODEX_MECHANICAL`.

**Archivos esperados:** docs/modules/tenant-01-report.md; docs/plans/tenant-01.md; README.md. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Juanangel:** Registrar pruebas, contratos, límites, comandos y commit de implementación; enlazar integración desde AUTH y planes operativos.

**Verificación y aceptación:** Vivian o Humberto integra el contexto sin consultar directamente tablas de identidad ni adoptar Prisma en aplicación.

**Decisiones y pendiente:** Cierre conjunto con AUTH; módulos futuros añaden sus propias pruebas tenant.

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

La integración requiere un runner nuevo que prepare una base aleatoria en el servidor PostGIS dedicado, aplique migraciones, ejecute suites y limpie en `finally`, siguiendo [la guía](../../backend/test/integration/README.md). Incorporar script y allowlist de Makefile cuando corresponda. No anunciar `test:tenant-01` ni `make integration-test TEST=tenant-01` como disponibles antes de implementarlos. No ejecutar fixtures/migraciones de pruebas sobre SLS compartido. No correr el lint backend con `--fix` durante revisiones de solo lectura.

Conservar salida real, base/servidor de prueba, casos cubiertos y fallos pendientes en el informe. El formato no constituye una fase independiente: respetar convención/Definition of Done y corregirlo de forma acotada cuando aplique.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-09-29 | Reutilizar modelos y código auditados | Evitar duplicar capacidades existentes | Implementar brechas del encargo y probar regresiones |
| 2026-09-30 | Contratos/endpoints nuevos son propuestas para el paso 1 | Todavía no hay implementación funcional de esta entrega | Juanangel concreta decisiones antes de lógica/migraciones |
| 2026-09-30 | Proponer mismo dueño que AUTH, manteniendo plan separado | Coordinación solicitada por Humberto | Nombres y TENANT pendientes en ese momento; confirmados posteriormente |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-29 | Auditoría inicial | Existe runWithTenant, que valida formato UUID y fija SET LOCAL dentro de una transacción. | Lectura estática de fuentes; no ejecución | Base `8cdb2c4` |
| 2026-09-30 | Planificación | Plan y reporte creados; responsabilidades y aceptación explícitas | Revisión documental y enlaces | Sin commit |

## Cierre

- [ ] Criterios funcionales y errores controlados demostrados.
- [ ] Build y pruebas relevantes aprobados mediante Compose.
- [ ] Lecturas, mutaciones y relaciones entre tenants verificadas.
- [ ] Fronteras Clean Architecture verificadas automáticamente.
- [ ] Migraciones revisadas/aplicadas en entorno de prueba si fueron necesarias.
- [ ] API/consumidores integrados para este alcance.
- [ ] Informe actualizado por paso con evidencia real y commits identificados.
- [ ] Fuera de alcance e integración posterior explícitos.
