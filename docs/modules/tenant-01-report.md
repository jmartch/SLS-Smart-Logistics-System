# TENANT-01 — Contexto confiable y aislamiento entre empresas

Estado: `DONE`. Remediación `R0–R8` completada y verificada en entorno desechable y unitario/E2E (2026-10-10).

Plan canónico: [TENANT-01](../plans/tenant-01.md). Coordinación: [puntos 1 y 2](../plans/mvp-puntos-1-2.md).

## Alcance verificado

Inspección estática de `develop`, commit `8cdb2c4`, el 2026-09-29; documentación preparada hasta el 2026-09-30. Árbol limpio al inicio. Existe runWithTenant, que valida formato UUID y fija SET LOCAL dentro de una transacción. Eso no verifica identidad ni pertenencia: un UUID válido por sí solo no autoriza. PrismaService usa RUNTIME_DATABASE_URL y hay migraciones de RLS/relaciones compuestas. No hay módulo de contexto autenticado ni guardas; Tenant tiene RLS y el rol runtime no puede aprovisionar empresas. No se comprobó la base compartida ni se ejecutaron las pruebas existentes en esta auditoría.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: establecer brechas y entrega asignable sin rehacer código existente.
- Decisión: Juanangel; asignación confirmada por Humberto. Contratos por concretar en el paso 1.
- Archivos: fuentes enumeradas en el plan; nuevos plan e informe de este módulo.
- Evidencia: lectura de esquema, código, documentación y estado Git.

## Decisiones técnicas

DATA-01 (esquema/migraciones existentes); contrato conjunto con AUTH-01. La base del contexto se implementa antes de las guardas; el E2E final se completa cuando AUTH funcione.

## Verificación reproducible

Seguir los comandos de Compose y preparación de integración indicados en el plan (`make integration-test TEST=auth-tenant-01`).

## Estado en el entorno compartido

No se consultaron ni modificaron datos, roles ni migraciones de la base compartida. Toda la verificación de integración corrió sobre bases desechables en `integration-postgres`.

## Trabajo fuera de alcance

Publicador/worker y validación de mensajes futuros quedan para RMQ-01; no aceptar metadata AMQP sin una frontera confiable. No crear una base por empresa ni refactorizar todo el backend.

## Auditoría posterior al merge — 2026-10-10

`39fd747` integra el contexto puro de actor/tenant, guardas y repositorios con `runWithTenant`. La sesión persistida es la fuente del `tenantId`; las pruebas versionadas intentan falsificar cabecera, query y body y cubren lectura/mutación entre dos empresas. La protección de último administrador y la recarga de permisos por petición reducen carreras y sesiones con privilegios obsoletos.

## Cierre de remediación R0–R8 — 2026-10-10 (`DONE`)

- **R0 (`DONE`):** Confirmado que las migraciones `20261004*` no se habían aplicado en entornos compartidos; se corrigieron en origen durante `R3`.
- **R1 (`DONE`):** Cliente Prisma regenerado de forma reproducible en `Dockerfile` y `package.json`; reparado `TENANT_ID` en `backend/src/database/run-with-tenant.spec.ts`; propagado `slug` en los 7 fixtures/E2E de los módulos paralelos.
- **R2 (`DONE`):** `configureApp(app)` en `backend/src/app.setup.ts` centraliza `/api/v1`; `extractRequestContext` (`backend/src/shared/presentation/request-context.decorator.ts`) unifica los decoradores de actor/tenant y prioriza `request.actor` mediante `requireTenantContext`, ignorando cabeceras `x-tenant-id` falsificadas cuando existe sesión autenticada y rechazando `PLATFORM_ADMIN` en rutas tenant.
- **R3 (`DONE`):** Eliminado password fijo de `sls_provisioning` (`NOLOGIN`) y añadido `Session_actor_coherence_check` + `ON DELETE CASCADE` en `20261004120000_auth_platform_sessions/migration.sql` y `auth.prisma`.
- **R4 (`DONE`):** Implementado y verificado `backend/test/integration/auth-tenant-01.cjs` (`make integration-test TEST=auth-tenant-01`), validando RLS, restricciones de coherencia de sesión y aislamiento cross-tenant HTTP real sobre `/api/v1/...`.
- **R5 (`DONE`):** Documentado ADR 009 (`docs/adr/009-auth-session-transport-and-csrf.md`), configurado proxy Vite `/api` same-origin (`frontend/vite.config.ts`), origin policy para mutaciones autenticadas con cookie (`backend/src/modules/auth/presentation/origin-policy.ts`) y rate limiting en login.
- **R6 (`DONE`):** Estandarización de errores cross-tenant y de contexto (`require-tenant-context.ts`, `auth-error-response.ts`) sin filtrar existencia de recursos ajenos; auditoría transaccional en mutaciones sensibles de administración tenant.
- **R7 (`DONE`):** Frontend conectado a sesión y contexto tenant reales (`frontend/src/auth.tsx`, `frontend/src/AppShell.tsx`, `frontend/src/AppPages.tsx`), eliminando `MOCK_USERS` y selectores de cambio arbitrario de empresa.
- **R8 (`DONE`):** Regresión completa en verde (`auth-tenant-01`, `route-01`, `delivery-01`, `route-close-01`, tests unitarios y builds de backend y frontend).

### Verificación final ejecutada (R0–R8)

```text
docker compose exec backend npm run build
Resultado: PASS (0 errores TypeScript).

docker compose exec backend npm test -- --runInBand
Resultado: PASS (123/123 suites, 1042/1042 tests).

make integration-test TEST=auth-tenant-01
Resultado: PASS (5/5 suites de repositorios con 74/74 tests + 6/6 suites E2E con 60/60 tests).

make integration-test TEST=route-01
Resultado: PASS (2/2 suites E2E, 23/23 tests).

make integration-test TEST=delivery-01
Resultado: PASS (2/2 suites E2E, 29/29 tests).

make integration-test TEST=route-close-01
Resultado: PASS (2/2 suites E2E, 20/20 tests).

docker compose exec frontend npm test
Resultado: PASS (3/3 suites, 13/13 tests).

docker compose exec frontend npm run build
Resultado: PASS (tsc --noEmit && vite build).

docker compose exec frontend npm run lint
Resultado: PASS (0 warnings, 0 errors).

git grep -n "sls_provisioning_dev_password\|MOCK_USERS" backend/ frontend/src/
Resultado: 0 coincidencias.
```


