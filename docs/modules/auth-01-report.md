# AUTH-01 — Acceso, empresas y empleados

Estado: `DONE`. La implementación backend, el runner desechable de integración/E2E y la integración real de sesión y administración en el frontend fueron completados y verificados mediante los bloques **R0–R8**. El [plan vigente](../plans/auth-01.md) contiene el detalle por paso.

## Estado observado — 2026-09-28

La capa de datos ya contiene `Tenant`, `User`, `Role`, `Permission`, `UserRole` y `RolePermission`, junto con unicidades por tenant, migraciones, restricciones compuestas y RLS para el rol runtime. Existe `runWithTenant` como primitiva de contexto transaccional.

No se encontraron módulos funcionales NestJS para tenants, usuarios o autenticación, endpoints de acceso, hashing de contraseñas, sesiones, guardas, DTOs ni pruebas E2E de autenticación y aislamiento. El cliente HTTP del frontend deja `AUTH-01` pendiente y documenta que no deben almacenarse tokens directamente en `localStorage`.

## Recomendación vigente

Iniciar el módulo ahora con un primer corte vertical: alta controlada de empresa y administrador, login/logout/sesión, contexto tenant confiable, gestión básica de empleados y pruebas con dos empresas. Autorregistro público, invitaciones por correo, recuperación de contraseña, MFA y SSO quedan fuera de este corte.

## Verificación realizada

- Inspección estática de esquema Prisma multiarchivo y migraciones de identidad/integridad.
- Inspección de módulos y dependencias actuales del backend.
- Inspección del cliente HTTP y features actuales del frontend.
- Inspección del árbol y commit `5b3aa39` en rama `develop`.

No se ejecutaron builds ni pruebas porque esta auditoría no modifica código y todavía no existe implementación funcional de `AUTH-01`.

## Pendiente inmediato

Cerrar el contrato de acceso: identificador público de empresa, estrategia de sesión, identidad del superadministrador, permisos y contratos de endpoints. Solo después conviene repartir la implementación entre backend de plataforma, autenticación, empleados, frontend y pruebas.

## Actualización de coordinación — 2026-09-30

Humberto confirmó que Juanangel implementa AUTH-01 y TENANT-01; no se ha verificado su avance fuera de este checkout. La revisión estática de `develop`, `8cdb2c4`, no encontró módulos funcionales de auth/tenants/users. El árbol estaba limpio al inicio de la auditoría de 2026-09-29. No se ejecutaron builds/tests ni se confirmó el estado de las migraciones aplicadas en la base compartida.

Se creó el [plan TENANT-01](../plans/tenant-01.md), asignado a Juanangel según confirmación de Humberto. Este plan es dueño del contrato de contexto y aislamiento; AUTH conserva identidad verificada, sesión, permisos, empleados y aprovisionamiento controlado de empresa/primer administrador. El paso 6 de AUTH integra ese trabajo y no lo duplica.

La [guía de reparto](../plans/mvp-puntos-1-2.md) relaciona la entrega de acceso con PKG-01/VEH-01 de Vivian, ZONE-01 de Humberto y frontend de Santiago. Se documentaron restricciones de resolución prelogin y plataforma: RLS limita Tenant y `sls_app` no puede crear empresas ni permisos globales. La decisión de adapter acotado y bootstrap se concreta en el contrato, sin elevar privilegios del runtime ordinario.

Resultado de esta actualización: documentación y trazabilidad, sin nueva implementación, pruebas ejecutadas ni commits. Pendiente inmediato: contrato conjunto AUTH/TENANT y matriz de permisos para los módulos operativos.

## Auditoría posterior al merge — 2026-10-10

Base auditada: `develop`, commit `39fd747` (merge de PR #34). Árbol limpio al iniciar. Se verificó la existencia de autenticación tenant/plataforma, sesiones opacas, Argon2id, guardas, permisos, `GET /auth/me`, aprovisionamiento atómico y administración de empleados. Las reglas de aislamiento usan identidad de sesión, filtros tenant explícitos y RLS; las respuestas de recursos externos son neutras.

### Hallazgos que bloquean cierre

1. El build falla con 11 errores porque `backend/generated/prisma` no fue regenerado después de añadir `Session`, `PlatformAdmin`, `Tenant.slug` y `AuditLog.actorPlatformAdminId`. El servicio backend queda en watch sin escuchar HTTP. Además, el directorio generado está ignorado y el `Dockerfile` no ejecuta `prisma generate`, así que un checkout limpio tampoco es reproducible.
2. El entorno Docker tiene nueve migraciones pendientes, incluidas `20261004120000` a `20261004140000`; no hay evidencia de aplicación en una base desechable.
3. `main.ts` agrega prefijo `/api` y versión URI, pero los controladores AUTH/Platform/Users ya declaran rutas con `api`. Los E2E solo llaman `configureApp`, por lo que prueban `/api/...` y no el enrutamiento real `/api/v1/...`.
4. Una ejecución unitaria acotada terminó con 19/20 suites y 172/174 tests: los dos fallos usan `TENANT_ID` sin declarar en `run-with-tenant.spec.ts`.
5. La migración crea `sls_provisioning` con una contraseña fija conocida. Debe salir del SQL versionado y aprovisionarse/rotarse por entorno.

### Brechas funcionales y de endurecimiento

- El frontend sigue usando `MOCK_USERS`, ignora la contraseña y no restaura sesión real. Su cliente no configura `credentials: 'include'` para un despliegue cross-origin y tampoco interpreta el envelope `{ error: ... }`.
- No hay rate limiting/bloqueo temporal de intentos de login ni decisión CSRF/CORS implementada para la sesión en cookie.
- Solo el alta de tenant genera auditoría; faltan eventos de login/logout y cambios sensibles de estado/roles de empleados.
- No existe endpoint para listar el catálogo de roles asignables, por lo que un cliente no puede descubrir los `roleIds` por la API.
- Los errores de dominio/aplicación no siguen una jerarquía uniforme con `code` y `field`, y los mensajes HTTP mezclan convenciones de idioma/formato.
- `Session` carece de una restricción de integridad que obligue a que `TENANT_USER` y `PLATFORM_ADMIN` tengan exactamente las claves correspondientes.

### Verificación ejecutada

```text
docker compose exec backend npm run build
Resultado: FAIL, 11 errores TypeScript.

docker compose exec backend npm test -- --runInBand --runTestsByPath <20 suites AUTH/TENANT/Users>
Resultado: FAIL, 19 suites aprobadas, 1 fallida; 172 tests aprobados, 2 fallidos.

docker compose exec backend npx prisma migrate status
Resultado: 19 migraciones detectadas, 9 pendientes.

docker compose exec frontend npm run build
Resultado: PASS.
```

No se ejecutaron E2E ni se aplicaron migraciones sobre la base compartida. No se regeneró Prisma porque esta auditoría fue de solo lectura para código; las únicas modificaciones son documentación de progreso.

## Cierre de remediación R0–R8 — 2026-10-10

- **R0 (`DONE`):** Confirmado por el responsable que las migraciones `20261004*` no se habían aplicado en ningún entorno compartido; se aprobó corregirlas directamente en origen en `R3`.
- **R1 (`DONE`):**
  - Añadido `"prisma:generate": "prisma generate --config prisma7.config.ts"` en `backend/package.json` y encadenado en `build` y `start:dev`.
  - Añadido `RUN npm run prisma:generate` en `backend/Dockerfile`.
  - Declarada la constante `TENANT_ID` faltante en `backend/src/database/run-with-tenant.spec.ts` y corregido el tipado estricto en specs de repositorios de autenticación.
  - Propagado el campo obligatorio `slug` de `Tenant` en los 7 archivos de fixtures/E2E de ramas paralelas (`zone-catalogs`, `assignment-planning`, `route-lifecycle`, `delivery-lifecycle`, `route-close-lifecycle`, `messaging-consumer`, `messaging-outbox`).
- **R2 (`DONE`):**
  - Centralizados `app.setGlobalPrefix('api', { exclude: [{ path: '', method: RequestMethod.GET }] })` y `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })` dentro de `configureApp(app)` en `backend/src/app.setup.ts`, eliminando la duplicación en `backend/src/main.ts`.
  - Marcado `AppController` como `VERSION_NEUTRAL`.
  - Retirado el prefijo `api/` duplicado en `AuthController` (`@Controller('auth')`), `PlatformAuthController` (`@Controller('platform')`), `PlatformTenantsController` (`@Controller('platform/tenants')`) y `UsersController` (`@Controller('users')`).
  - Unificados todos los decoradores HTTP de actor y tenant (`@CurrentActor`, `@CurrentTenantContext`, `@CurrentContext`, `@CurrentTenant`, `@CurrentUser`) en `backend/src/shared/presentation/request-context.decorator.ts`, eliminando los archivos duplicados de `modules/auth/presentation/` y estandarizando errores bajo `/sls-error-standardization`.
  - Actualizadas las rutas E2E a `/api/v1/{auth,platform,users}` y añadido smoke test que verifica `404` en `/api/v1/api/auth/login`.
- **R3 (`DONE`):**
  - Eliminada la contraseña literal del rol `sls_provisioning` en `backend/prisma/migrations/20261004120000_auth_platform_sessions/migration.sql` (`CREATE ROLE sls_provisioning NOLOGIN;`) y en `backend/.env.example`.
  - Añadido el constraint `Session_actor_coherence_check` y `ON DELETE CASCADE` en las claves foráneas de `Session` (`migration.sql` y `backend/prisma/schema/auth.prisma`), junto con su prueba de integración en `prisma-session.repository.spec.ts`.
- **R4 (`DONE`):**
  - Creado el runner desechable `backend/test/integration/auth-tenant-01.cjs` que provisiona una base PostgreSQL aislada, configura `sls_app` y `sls_provisioning`, aplica las 19 migraciones y ejecuta las 5 suites de repositorios y las 6 suites E2E.
  - Registrado `test:auth-tenant-01` en `backend/package.json`, `Makefile` (`TEST=auth-tenant-01`) y `backend/test/integration/README.md`, y añadido `PROVISIONING_DATABASE_URL` en los runners de integración existentes (`route-01`, `delivery-01`, `route-close-01`).
- **R5 (`DONE`):**
  - Documentado el contrato de acceso, atributos de cookie `sls_session`, política Same-Origin / CORS allowlist / CSRF (`Origin`/`Referer`) y rate limiting en `docs/adr/009-auth-session-csrf-cors-and-rate-limiting.md`.
  - Implementado `LoginRateLimiter` (`backend/src/modules/auth/presentation/login-rate-limiter.ts`) con claves no enumerables (`tenant:<ip>:<slug>:<email>` y `platform:<ip>:<email>`), cabecera `Retry-After` y respuesta `429 TOO_MANY_REQUESTS`.
  - Configurado `createOriginCsrfMiddleware` y `enableCors` con allowlist explícita (`CORS_ALLOWED_ORIGINS`) en `backend/src/app.setup.ts` y proxy `/api` en `frontend/vite.config.ts`.
- **R6 (`DONE`):**
  - Expuesto `GET /api/v1/users/roles` (`ListRolesService` y `UserManagementRepository.listRoles`) con RLS tenant-scoped para consultar los roles asignables (`id`, `name`, `permissions`).
  - Añadido `UserManagementTx.recordAudit` para registrar atómicamente en `AuditLog` la creación de empleados (`EMPLOYEE_CREATED`), cambios de estado (`EMPLOYEE_STATUS_UPDATED`) y cambios de roles (`EMPLOYEE_ROLES_UPDATED`) dentro de la misma transacción `runExclusive`, sin almacenar contraseñas ni hashes.
- **R7 (`DONE`):**
  - Eliminado `MOCK_USERS` en `frontend/src/auth.tsx` y conectado `AuthProvider` a `POST /api/v1/auth/login`, `POST /api/v1/platform/login`, `GET /api/v1/auth/me` y `POST /api/v1/auth/logout`.
  - Actualizado `frontend/src/shared/api/httpClient.ts` con `credentials: 'include'`, normalización del envelope `{ error: { code, message, fields } }` y notificación global de `401` (`onUnauthorizedResponse`).
  - Conectadas las pantallas `LoginPage` (`slug` + credenciales), `AppShell` (navegación derivada de `user.permissions`), `AdminUsersPage` (`/api/v1/users` y `/api/v1/users/roles`) y `AdminTenantsPage` (`POST /api/v1/platform/tenants`), junto con la suite `frontend/src/auth.spec.ts`.
- **R8 (`DONE`):**
  - Ejecutadas y aprobadas todas las suites unitarias, builds y runners de integración/E2E de backend y frontend sin regresiones.

### Verificación final ejecutada (R1–R8)

```text
docker compose exec backend npm run build
Resultado: PASS (Prisma Client 7.10.0 generado + nest build con 0 errores).

docker compose exec backend npm test -- --runInBand
Resultado: PASS (123 suites aprobadas de 123; 1042 tests aprobados de 1042).

make integration-test TEST=auth-tenant-01
Resultado: PASS (19 migraciones aplicadas; 5/5 suites de repositorios con 74/74 tests; 6/6 suites E2E con 60/60 tests; base desechable eliminada al finalizar).

make integration-test TEST=route-01
Resultado: PASS (2/2 suites E2E, 23/23 tests).

make integration-test TEST=delivery-01
Resultado: PASS (2/2 suites E2E, 29/29 tests).

make integration-test TEST=route-close-01
Resultado: PASS (2/2 suites E2E, 20/20 tests).

docker compose exec frontend npm test
Resultado: PASS (3/3 suites, 13/13 tests).

docker compose exec frontend npm run build
Resultado: PASS (tsc --noEmit && vite build con 0 errores).

docker compose exec frontend npm run lint
Resultado: PASS (0 errores).

git grep -n "sls_provisioning_dev_password\|MOCK_USERS" backend/ frontend/src/
Resultado: 0 coincidencias.
```

