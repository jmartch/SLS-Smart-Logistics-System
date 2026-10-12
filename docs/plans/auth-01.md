# Plan de AUTH-01 — Acceso, empresas y empleados

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `AUTH-01` |
| Dominio | Identidad, autenticación, autorización y contexto tenant |
| Estado general | `DONE` — remediación R0–R8 completada, verificada en backend, base desechable y frontend real |
| Rama observada | `develop` |
| Última auditoría | 2026-10-10 |
| Commit auditado | `39fd747` + remediación R0–R8 en árbol de trabajo |
| Asignación | Juanangel; asignación confirmada por Humberto |
| Informe | [AUTH-01](../modules/auth-01-report.md) |

## Coordinación vigente con TENANT-01

Humberto confirmó que Juanangel es responsable de AUTH-01 y TENANT-01. Ambos planes mantienen entregas separadas. El [plan TENANT-01](tenant-01.md) es canónico para el contrato de contexto, aislamiento y adaptación de repositorios; este plan conserva login, sesión, permisos, empleados y alta controlada de empresa. Véase la [guía de reparto](mvp-puntos-1-2.md).

AUTH-01 produce una identidad verificada; TENANT-01 convierte esa identidad en el contexto requerido por los casos de uso y sus adaptadores. El paso 6 de este plan integra TENANT-01: no implica una segunda implementación del contexto ni de RLS. Alta de empresa y primer administrador permanecen aquí, aunque su código se distribuya entre tenants/users/auth.

Antes del login aún no existe sesión: el identificador público de empresa solo selecciona el ámbito de búsqueda de credenciales. La combinación empresa + credenciales debe verificarse antes de producir identidad. Como `sls_app` solo puede leer su propio Tenant y no puede crear empresas ni permisos, deben diseñarse puertos acotados para resolución inicial y aprovisionamiento de plataforma. No usar `postgres`, permisos globales o BYPASSRLS para las peticiones ordinarias. Documentar también el bootstrap del primer actor de plataforma y la auditoría de estas operaciones.

La primera entrega conjunta es el contrato de identidad/contexto, permisos y errores. Vivian y Humberto puede usar dobles de esos puertos en unitarias mientras llega la integración HTTP, sin habilitar un tenant arbitrario en producción.

## Recomendación de inicio

Conviene iniciar este módulo ahora: es una dependencia directa de `PKG-01` y de cualquier endpoint que opere datos de una empresa. La persistencia base ya existe, pero el trabajo debe empezar como un corte vertical pequeño y seguro. No se recomienda implementar un autorregistro público genérico de empresas o empleados en el MVP.

## Responsables confirmados — 2026-09-30

Juanangel es responsable de este módulo. Juanangel mantiene AUTH/TENANT, Vivian PKG/VEH, Humberto ZONE y Santiago frontend. Las tareas de pantallas e integración web de este plan se coordinan con Santiago; el responsable backend publica contratos y participa en la verificación conjunta. Las etiquetas `USER`/`CODEX_MECHANICAL` conservan su significado y no son nombres de personas. Esta confirmación sustituye propuestas de asignación anteriores sin acreditar implementación.

## Alcance

### Incluido en el primer corte

- Alta controlada de una empresa (`Tenant`) por un superadministrador de plataforma.
- Creación atómica del primer administrador de la empresa y asignación de su rol.
- Inicio y cierre de sesión por correo y contraseña.
- Contexto confiable de identidad con `userId`, `tenantId`, roles y permisos.
- Guardas de autenticación, pertenencia al tenant y autorización por permisos.
- Alta, listado, cambio de estado y asignación de roles de empleados por el administrador de su propia empresa.
- Pantallas mínimas de login, alta de empresa para plataforma y gestión de empleados para el administrador tenant.
- Pruebas de aislamiento: una empresa no puede consultar ni modificar usuarios de otra.
- Auditoría de operaciones sensibles sin registrar contraseñas, hashes ni tokens.

### Fuera del primer corte

- Autorregistro público de empresas o activación automática sin revisión de plataforma.
- Autorregistro libre de empleados, selección de `tenantId` desde el frontend o autoasignación de roles.
- Recuperación de contraseña, MFA, SSO, OAuth social y dispositivos recordados.
- Invitaciones por correo y aceptación mediante token; puede añadirse después sobre el módulo de notificaciones.
- Administración avanzada de permisos personalizados por tenant.
- Facturación o aprovisionamiento SaaS automatizado.

## Contrato funcional inicial

1. Un actor de plataforma autenticado crea empresa + primer administrador en una sola transacción.
2. El correo identifica al usuario dentro de su empresa, de acuerdo con `@@unique([tenantId, email])`.
3. Como un mismo correo puede existir en varias empresas, el login debe resolver explícitamente la empresa mediante un identificador estable de acceso; no debe adivinarla ni aceptar un `tenantId` arbitrario como autorización.
4. La identidad autenticada, no el cuerpo o los parámetros de la petición, establece el `tenantId` para operaciones tenant-owned.
5. Solo el administrador tenant puede crear o administrar empleados de su empresa y solo puede asignar roles permitidos dentro de ella.
6. Un usuario inactivo o suspendido no puede iniciar una nueva sesión.
7. Las respuestas de login no distinguen entre usuario, empresa o contraseña inexistentes.
8. Las contraseñas se almacenan únicamente como hashes con un algoritmo de contraseña mantenido; nunca se registran ni se devuelven.
9. Para navegador se prefiere una sesión en cookie `HttpOnly`, `Secure` en producción y `SameSite`, evitando persistir tokens en `localStorage`.

## Dependencias y fuentes

- `AGENTS.md`: secciones 8, 9, 10, 16, 17, 18, 19, 20, 22 y tareas `DATA-01`, `TENANT-01`, `AUTH-01`.
- `backend/prisma/schema/identity.prisma`: modelos `Tenant`, `User`, `Role`, `Permission`, `UserRole` y `RolePermission` ya definidos.
- `backend/prisma/migrations/20260906213751_init_schema/migration.sql`: tablas e índices iniciales de identidad.
- `backend/prisma/migrations/20260914130000_logistics_integrity/migration.sql`: restricciones tenant-aware, RLS y permisos runtime.
- `backend/src/database/run-with-tenant.ts`: contexto transaccional tenant existente.
- `frontend/src/shared/api/httpClient.ts`: integración de sesión pendiente y prohibición documentada de `localStorage`.
- Dependencias previas: existen esquema y migraciones de identidad; [TENANT-01](tenant-01.md) aporta el contexto y aislamiento, con cierre conjunto de integración HTTP. La auditoría actual no reaplicó migraciones ni comprobó la base compartida.

## Diagnóstico actual

La implementación fue integrada en `develop` mediante `39fd747` (PR #34) y estabilizada mediante el plan de remediación R0–R8 (2026-10-10). Existen módulos funcionales de autenticación, plataforma y usuarios; sesiones opacas en cookie `HttpOnly`, Argon2id, rate limiting no enumerable, protección CSRF por `Origin`/`Referer`, guardas de autenticación/permisos, identidad actual, aprovisionamiento atómico de tenant, catálogo de roles por tenant (`GET /api/v1/users/roles`) y administración auditada de empleados (`AuditLog` transaccional). El frontend consume la sesión real sobre `/api/v1/auth/{login,logout,me}`, `/api/v1/platform/{login,tenants}` y `/api/v1/users` sin `MOCK_USERS` ni tokens en `localStorage`.

## División delegable

| Frente | Entrega | Dependencias | Integración acordada |
| --- | --- | --- | --- |
| A — Contrato y seguridad | Decidir identificador de empresa, cookie/sesión, códigos de error, permisos y matriz de endpoints. | Ninguna | OpenAPI/DTOs y casos de aceptación antes de implementar UI. |
| B — Plataforma y tenants | Caso de uso transaccional empresa + administrador inicial, acceso exclusivo de plataforma y auditoría. | A | Expone un puerto de identidad; no comparte consultas Prisma con auth. |
| C — Auth backend | Hash/verificación, login, logout, identidad actual y guardas. | A; consulta controlada de B | Produce el contexto confiable consumido por tenants/users. |
| D — Empleados y roles | Crear/listar/desactivar empleados y asignar roles dentro del tenant autenticado. | A y C | Nunca recibe `tenantId` autoritativo desde el DTO. |
| E — Frontend | Login, estado de sesión, rutas protegidas y gestión mínima de empresa/empleados. | Contratos A; endpoints B-D | Usa cookies y estados loading/error/forbidden; no replica autorización. |
| F — Pruebas y evidencia | Unitarias, integración Prisma/RLS y E2E multi-tenant. | B-E | Fixtures con dos tenants y actor de plataforma explícito. |

Los frentes B, C y D pueden delegarse a personas distintas después de cerrar A. E puede trabajar con contratos y respuestas simuladas; F prepara matrices y fixtures desde el inicio, pero su verificación final depende de todos.

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contrato | `USER` | `DONE` | Cerrar el identificador de empresa, estrategia de sesión, rol plataforma, permisos y endpoints. | No quedan decisiones de seguridad implícitas; DTOs y respuestas están definidos. | `docs/adr/009-auth-session-csrf-cors-and-rate-limiting.md` y DTOs/controladores bajo `/api/v1`. |
| 2 | Pruebas de contrato | `USER` | `DONE` | Expresar login, alta atómica, empleados, roles y aislamiento antes de la lógica. | Casos felices y rechazos críticos están descritos como pruebas. | Suites unitarias (`123/123`) y E2E (`6/6`, `60/60` tests) bajo `/api/v1`. |
| 3 | Persistencia mínima | `USER` | `DONE` | Ajustar solo campos/índices imprescindibles para el contrato elegido. | Migración revisada; no duplica el esquema actual y preserva RLS. | 19 migraciones aplicadas en limpio, `sls_provisioning NOLOGIN` y `Session_actor_coherence_check`. |
| 4 | Alta de empresa | `USER` | `DONE` | Crear tenant, primer administrador, rol y auditoría en una transacción. | No queda una empresa parcial ante errores y solo plataforma puede ejecutar el caso. | `ProvisionTenantService` + `platform-provision-tenant.e2e-spec.ts` aprobados. |
| 5 | Autenticación | `USER` | `DONE` | Implementar hashing, login, logout, sesión e identidad actual. | Credenciales válidas autentican; inválidas y estados suspendidos se rechazan sin filtrar existencia. | `AuthController`, `PlatformAuthController`, `LoginRateLimiter`, `origin-policy.ts` y `auth-login.e2e-spec.ts`. |
| 6 | Contexto y guardas | `USER` | `DONE` | Derivar tenant/roles/permisos de la sesión y aplicar RLS/transacción. | Ningún endpoint tenant-owned confía en `tenantId` del cliente. | Decoradores unificados en `request-context.decorator.ts`; `auth-tenant-isolation.e2e-spec.ts` y `tenant-isolation.e2e-spec.ts`. |
| 7 | Empleados | `USER` | `DONE` | Alta, listado, estado y roles de empleados dentro del tenant. | Administrador opera solo su empresa; roles externos o no permitidos se rechazan. | `GET /api/v1/users/roles`, auditoría atómica en `AuditLog` y `users-employees.e2e-spec.ts`. |
| 8 | Frontend | `USER` | `DONE` | Integrar login, sesión, rutas protegidas y pantallas mínimas. | Incluye loading, error, forbidden y expiración de sesión sin `localStorage`. | `frontend/src/auth.tsx`, `httpClient.ts`, `AppShell.tsx`, `AppPages.tsx` y `auth.spec.ts` (`3/3` suites, `13/13` tests). |
| 9 | Verificación | `USER` | `DONE` | Ejecutar build, unitarias, integración y E2E mediante Docker Compose. | Dos tenants prueban aislamiento de lectura y mutación; suites relevantes pasan. | Backend build + `123/123` unitarias; `auth-tenant-01`, `route-01`, `delivery-01`, `route-close-01` y frontend build/tests en verde. |
| 10 | Documentación | `CODEX_MECHANICAL` | `DONE` | Sincronizar plan, informe, tablero y evidencia observada. | Estado coincide con código, pruebas y commits reales. | Planes, informes y tablero actualizados con evidencia R0–R8 (2026-10-10). |

## Paso actual

Remediación **R0–R8** completada y verificada en verde (`DONE`).

## Plan de remediación posterior a la auditoría — 2026-10-10

Este plan sustituye el orden de implementación inicial para el trabajo restante. No se aplicarán las migraciones AUTH/TENANT a una base compartida hasta cerrar R0–R3 y aprobarlas en una base desechable. Cada bloque debe terminar con evidencia antes de iniciar el siguiente, salvo R1 y R2, que pueden prepararse en paralelo después de R0.

| ID | Prioridad | Entrega | Responsable | Estado | Depende de | Criterio de salida |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | P0 | Confirmar historial de migraciones y estrategia de credenciales | `USER` | `DONE` | — | Se sabe si `20261004120000` fue aplicada en cada entorno y existe una decisión escrita de corrección compatible. |
| R1 | P0 | Hacer reproducible Prisma y recuperar build/unitarias | `USER` / `CODEX_MECHANICAL` | `DONE` | R0 | Un checkout limpio genera el cliente únicamente mediante Compose; backend build y unitarias pasan. |
| R2 | P0 | Unificar rutas reales y configuración E2E | `USER` / `CODEX_MECHANICAL` | `DONE` | R0 | API y E2E usan `/api/v1/...`; ninguna ruta pública contiene `/api/v1/api/...`. |
| R3 | P0 | Corregir seguridad e integridad de migraciones | `USER` | `DONE` | R0–R2 | No hay secretos versionados; `Session` impide actores incoherentes; migraciones aplican desde cero. |
| R4 | P0 | Crear verificación AUTH/TENANT en base desechable | `USER` / `CODEX_MECHANICAL` | `DONE` | R1–R3 | Runner crea base aleatoria, migra, prueba y limpia en `finally`; aislamiento A/B pasa con configuración HTTP real. |
| R5 | P1 | Endurecer sesión y superficie de login | `USER` | `DONE` | R4 | Rate limiting y política CSRF/CORS/origin están documentados, implementados y probados. |
| R6 | P1 | Completar contrato administrativo y errores | `USER` | `DONE` | R4 | Roles son consultables, cambios sensibles se auditan y errores cumplen el estándar SLS sin fugas tenant. |
| R7 | P1 | Sustituir autenticación simulada del frontend | `USER` | `DONE` | R2, R5–R6 | Login con slug, restauración de sesión, logout y navegación por permisos funcionan sin `MOCK_USERS`. |
| R8 | P0 | Regresión, evidencia y cierre | `CODEX_MECHANICAL` | `DONE` | R1–R7 | Builds, unitarias, E2E y migraciones pasan; planes/informes/tablero coinciden con commits reales. |

### R0 — Confirmar historial antes de editar migraciones

**Objetivo y razón:** decidir si la migración con la contraseña fija puede corregirse en origen o necesita una migración compensatoria. Reescribir una migración ya aplicada produciría historiales incompatibles.

**Archivos/documentos:** `backend/prisma/migrations/20261004120000_auth_platform_sessions/migration.sql`; registro de despliegues o una nota de decisión en este plan/ADR de seguridad.

**Debe aplicar el equipo:** consultar `_prisma_migrations` en cada entorno conocido (local, pruebas, demo y cualquier despliegue compartido) sin modificar datos. Registrar únicamente aplicada/no aplicada y checksum relevante; no copiar URLs ni secretos. Elegir una ruta:

- Si no fue aplicada en ningún entorno compartido: corregir la migración original antes del primer despliegue.
- Si fue aplicada en alguno: no reescribirla; preparar migración correctiva, revocar/rotar la credencial y documentar el procedimiento operativo.

**Verificación:** inventario revisado por el responsable de base. **Evidencia (2026-10-10):** confirmado por el usuario que las migraciones `20261004*` no fueron aplicadas en ningún entorno compartido; se aprueba corregir la migración en origen en **R3**.

### R1 — Cliente Prisma y build reproducibles

**Objetivo y razón:** eliminar la dependencia de un `backend/generated/prisma` local, ignorado y potencialmente obsoleto.

**Archivos esperados:** `backend/Dockerfile`; `docker-compose.yml`; `backend/package.json`; `backend/prisma/schema/generator.prisma`; `backend/src/database/run-with-tenant.spec.ts`.

**Instrucción concreta:** definir una única generación dentro de Compose que funcione tanto en build de imagen como en desarrollo con bind mount. La estrategia recomendada es conservar el artefacto fuera de Git, generar después de copiar el esquema y asegurar que el volumen de desarrollo no oculte una versión vieja. Evitar generación host-side y archivos creados con propietario incorrecto. Reparar el identificador de fixture `TENANT_ID` usando la constante UUID ya presente o una constante única explícita.

**Comprobación:** reconstrucción sin caché desde un checkout sin `backend/generated`; `docker compose exec backend npm run build`; unitarias completas. **Aceptación:** cero errores TypeScript y cero pruebas fallidas. **Evidencia (2026-10-10):** `prisma:generate` integrado en `backend/package.json` (`build`, `start:dev`) y `backend/Dockerfile`; `TENANT_ID` declarado en `run-with-tenant.spec.ts`; tipado estricto corregido en specs de repositorios auth; `slug` propagado en 7 fixtures/E2E de ramas paralelas. `docker compose exec backend npm run build` PASS (0 errores) y `docker compose exec backend npm test -- --runInBand` PASS (`119/119` suites, `1026/1026` tests).

**Lote mecánico posible para Codex:** completado tras aprobación del usuario.

### R2 — Una sola convención de rutas y bootstrap HTTP

**Objetivo y razón:** asegurar que producción, desarrollo y E2E prueben la misma API.

**Archivos esperados:** `backend/src/app.setup.ts`; `backend/src/main.ts`; controladores bajo `modules/auth`, `modules/platform` y `modules/users`; suites `backend/test/*auth*`, `*platform*`, `*users*` y regresiones de otros módulos que reutilicen `configureApp`.

**Instrucción concreta:** centralizar prefijo global y versionado en una función de bootstrap reutilizada por `main.ts` y E2E. Los controladores deben declarar rutas de capacidad (`auth`, `platform`, `users`), no repetir `api`. Actualizar todos los E2E a `/api/v1/...` y añadir un smoke test que confirme que `/api/v1/api/...` responde 404.

**Comprobación:** login inválido alcanza validación en `/api/v1/auth/login`; `/api/v1/api/auth/login` no existe; rutas operativas previas mantienen su contrato. **Aceptación:** ningún test crea una aplicación con configuración HTTP parcial. **Evidencia (2026-10-10):** `setGlobalPrefix('api', { exclude: [''] })` y `enableVersioning(URI, defaultVersion: '1')` centralizados en `configureApp(app)` (`backend/src/app.setup.ts`); `AppController` marcado `VERSION_NEUTRAL`; controladores `auth`, `platform`, `platform/tenants` y `users` actualizados sin prefijo `api/` duplicado; decoradores de contexto unificados en `backend/src/shared/presentation/request-context.decorator.ts` (eliminando los duplicados de `modules/auth/presentation/`); E2E ejecutados y aprobados (`6/6` suites, `57/57` tests) en `make integration-test TEST=auth-tenant-01`.

**Lote mecánico posible para Codex:** completado y verificado en E2E.

### R3 — Seguridad e integridad de base

**Objetivo y razón:** impedir credenciales conocidas e impedir filas `Session` ambiguas que hoy terminan como error 500.

**Archivos esperados:** migración AUTH original o migración correctiva según R0; esquema `backend/prisma/schema/auth.prisma`; script operativo de aprovisionamiento de roles; `.env.example`; pruebas de migración/repositorio.

**Instrucción concreta:** sacar el password de `sls_provisioning` del SQL versionado. El rol puede quedar sin `LOGIN` en la migración y recibir credencial/rotación desde un procedimiento administrativo alimentado por secreto de entorno. Añadir una restricción que exija exactamente una forma válida:

- `TENANT_USER`: `tenantId` y `userId` presentes, `platformAdminId` ausente.
- `PLATFORM_ADMIN`: `platformAdminId` presente, `tenantId` y `userId` ausentes.

Revisar grants mínimos de `Session` y aprovisionamiento; no ampliar permisos del runtime para resolver fallos.

**Comprobación:** migración desde cero, intento de insertar ambas formas inválidas rechazado, aprovisionamiento válido aprobado y secreto ausente de `git grep`. **Aceptación:** no hay ventana en la que un entorno nuevo use una contraseña conocida. **Evidencia (2026-10-10):** `20261004120000_auth_platform_sessions/migration.sql` crea `sls_provisioning NOLOGIN` y añade `Session_actor_coherence_check` junto con `ON DELETE CASCADE` en claves foráneas de `Session` (`auth.prisma`); `backend/.env.example` actualizado con placeholder; `git grep "sls_provisioning_dev_password"` devuelve 0 coincidencias; `prisma-session.repository.spec.ts` verifica el rechazo de filas incoherentes en PostgreSQL.

**Decisión restante:** ninguna; corregida en origen según R0.

### R4 — Runner desechable y aislamiento HTTP real

**Objetivo y razón:** convertir las suites versionadas en evidencia reproducible sin tocar SLS compartido.

**Archivos esperados:** `backend/test/integration/auth-tenant-01.cjs`; `backend/test/integration/README.md`; `backend/package.json`; `Makefile` si se mantiene su allowlist; suites E2E existentes.

**Instrucción concreta:** seguir el patrón de runners actuales: recibir URL administrativa del servidor PostgreSQL/PostGIS dedicado, crear base con nombre aleatorio, aplicar todas las migraciones, generar Prisma, ejecutar únicamente las suites AUTH/TENANT/Users y limpiar en `finally`. Las suites deben crear la aplicación con la configuración HTTP real, no reemplazar guardas, y cubrir dos tenants concurrentes y reutilización de conexiones.

**Comprobación:** login tenant/plataforma; logout/me; tenant suspendido; permisos; creación/estado/roles de empleados; lectura y mutación A→B neutras; cabecera/query/body falsificados ignorados; rollback de aprovisionamiento; pool sin fuga de `SET LOCAL`.

**Aceptación:** comando único reproducible termina en verde y `prisma migrate status` queda sin pendientes dentro de la base temporal. **Evidencia (2026-10-10):** `make integration-test TEST=auth-tenant-01` PASS: 19 migraciones aplicadas desde cero (`prisma migrate status` sin pendientes), `5/5` suites de repositorio (`72/72` tests) y `6/6` suites E2E (`57/57` tests) aprobadas y base temporal eliminada en `finally`.

### R5 — Rate limiting y política de cookie/CSRF/CORS

**Objetivo y razón:** proteger credenciales y operaciones con cookie frente a fuerza bruta y solicitudes de origen no autorizado.

**Archivos esperados:** ADR o contrato AUTH; bootstrap HTTP/config; login tenant/plataforma; cookie de sesión; pruebas HTTP.

**Instrucción concreta:** preferir frontend y API bajo mismo origen (proxy de Vite en desarrollo y reverse proxy en despliegue). Definir explícitamente `Secure`, `HttpOnly`, `SameSite`, origen permitido y tratamiento de métodos mutantes. Añadir rate limiting acotado a ambos logins con respuesta 429 estable y clave que no permita enumerar empresa/usuario. Si se adopta CORS, usar allowlist exacta y credenciales; nunca `*` con cookies.

**Comprobación:** intentos dentro del límite conservan el error genérico; exceso recibe 429; origen no permitido no ejecuta mutaciones; cookie productiva conserva flags. **Aceptación:** ADR, código y pruebas expresan la misma política. **Evidencia (2026-10-10):** documentado en `docs/adr/009-auth-session-csrf-cors-and-rate-limiting.md`; implementado `LoginRateLimiter` (`backend/src/modules/auth/presentation/login-rate-limiter.ts`) aplicado en `AuthController` y `PlatformAuthController` con clave no enumerable (`tenant:<ip>:<slug>:<email>` y `platform:<ip>:<email>`) y cabecera `Retry-After`; configurado middleware CSRF de `Origin`/`Referer` y CORS con allowlist (`CORS_ALLOWED_ORIGINS`) en `backend/src/app.setup.ts` (`origin-policy.ts`), más proxy `/api` en `frontend/vite.config.ts`; verificado con unitarias (`login-rate-limiter.spec.ts`, `origin-policy.spec.ts`) y E2E (`auth-login.e2e-spec.ts`).

### R6 — Roles, auditoría y errores

**Objetivo y razón:** volver utilizable la administración y cerrar las brechas de trazabilidad/contrato observadas.

**Archivos esperados:** módulo `users` o un módulo de roles con puerto público; `AuditLog`/puerto de auditoría; errores de `auth`, `platform` y `users`; mappers HTTP; pruebas.

**Instrucción concreta:** exponer un catálogo tenant-scoped mínimo de roles asignables (`id`, `name` y, si la UI lo requiere, permisos). Registrar atómicamente creación de empleado, cambio de estado y cambio de roles; registrar acceso de plataforma sensible sin contraseñas, hashes, tokens ni payload personal innecesario. Normalizar errores de dominio/aplicación en inglés, con código estable y campo cuando corresponda; presentación conserva un envelope único y respuestas neutras para IDs de otro tenant.

**Comprobación:** tenant A no ve roles ni auditoría de B; un fallo revierte cambio y auditoría juntos; frontend puede crear un empleado sin conocer IDs fuera de la API; tests afirman código/field y no texto libre. **Aceptación:** no hay mutación administrativa sensible sin traza. **Evidencia (2026-10-10):** expuesto `GET /api/v1/users/roles` (`ListRolesService` + `UserManagementRepository.listRoles` con RLS en `PrismaUserManagementRepository`); añadido `UserManagementTx.recordAudit` dentro de la misma transacción `runExclusive` para `EMPLOYEE_CREATED`, `EMPLOYEE_STATUS_UPDATED` y `EMPLOYEE_ROLES_UPDATED` en `AuditLog` sin credenciales ni hashes; estandarizados errores de dominio/contexto en inglés con `code` y `field`; verificado en unitarias (`123/123` suites, `1042/1042` tests) y en `make integration-test TEST=auth-tenant-01` (`5/5` suites de repositorios con `74/74` tests + `6/6` suites E2E con `60/60` tests).

**Decisión restante:** resuelta en `users` (`GET /api/v1/users/roles` y `UserManagementTx.recordAudit` atómico).

### R7 — Integración real del frontend

**Objetivo y razón:** sustituir el prototipo que acepta cualquier contraseña para correos mock por la sesión real.

**Archivos esperados:** `frontend/src/auth.tsx` o feature `features/auth`; `frontend/src/shared/api/httpClient.ts`; login y shell; configuración Vite; pruebas frontend.

**Instrucción concreta:** login solicita `slug`, email y contraseña; `AuthProvider` llama `/api/v1/auth/login`, restaura con `/api/v1/auth/me` al recargar y cierra con `/api/v1/auth/logout`. El cliente debe entender `{ error: { code, message, fields } }`, manejar 401 globalmente y enviar cookies según la topología de R5. Derivar navegación visible de permisos, sin convertirla en autorización. Eliminar `MOCK_USERS` del flujo productivo.

**Comprobación:** recarga conserva sesión; expiración devuelve al login; logout invalida backend; 401/403/validaciones se muestran; no hay token en `localStorage`. **Aceptación:** login real A/B y pantalla administrativa consumen roles/empleados persistidos. **Evidencia (2026-10-10):** eliminado `MOCK_USERS` de `frontend/src/auth.tsx`; `httpClient.ts` envía `credentials: 'include'`, normaliza el envelope `{ error: { code, message, fields } }` y notifica `401` globales (`onUnauthorizedResponse`); `LoginPage` soporta login de empresa (`slug`, `email`, `password`) y de plataforma (`email`, `password`); `AppShell` espera hidratación de `/api/v1/auth/me` y deriva navegación de `user.permissions`; `AdminUsersPage` (`/app/admin/usuarios`) consume `/api/v1/users` y `/api/v1/users/roles`; `AdminTenantsPage` (`/app/admin/empresas`) consume `POST /api/v1/platform/tenants`; verificado con `docker compose exec frontend npm test` (`3/3` suites, `13/13` tests) y `docker compose exec frontend npm run build`.

### R8 — Regresión y cierre

**Objetivo y razón:** demostrar que la corrección no rompe módulos operativos que ya dependen de AUTH/TENANT.

**Verificación final mediante Compose:** build y unitarias backend; runner AUTH/TENANT; E2E relevantes de packages/zones/vehicles/routes/deliveries; build y lint frontend; smoke HTTP de prefijo/versionado; revisión de migraciones/grants y diff de secretos. El lint backend solo se ejecuta cuando se autorice su modificación automática.

**Criterio de cierre:** AUTH-01 y TENANT-01 pasan a `DONE` únicamente cuando todas las comprobaciones aplicables están verdes, UI-01 usa sesión real, el informe contiene comandos/resultados actuales y los commits relacionados están identificados. **Evidencia (2026-10-10):** `docker compose exec backend npm run build` PASS; `docker compose exec backend npm test -- --runInBand` PASS (`123/123` suites, `1042/1042` tests); `make integration-test TEST=auth-tenant-01` PASS (`5/5` suites de repositorios con `74/74` tests + `6/6` suites E2E con `60/60` tests); `make integration-test TEST=route-01` PASS (`2/2` suites, `23/23` tests); `make integration-test TEST=delivery-01` PASS (`2/2` suites, `29/29` tests); `make integration-test TEST=route-close-01` PASS (`2/2` suites, `20/20` tests); `docker compose exec frontend npm test` PASS (`3/3` suites, `13/13` tests); `docker compose exec frontend npm run build` PASS; `docker compose exec frontend npm run lint` PASS (`0` errores); `git grep` confirma `0` ocurrencias de `sls_provisioning_dev_password` y `MOCK_USERS`.

**Lote mecánico disponible para Codex:** sincronizar estados, tablas, informes, README y evidencia; preparar commits únicamente si el usuario lo solicita expresamente.

### Detalle de ejecución y dependencias por paso

Esta tabla complementa los objetivos, responsables, estados y aceptación del plan verificable. En todos los pasos la evidencia nueva está pendiente; registrar decisiones/resultados en el informe al avanzar. Las rutas propuestas se crean solo cuando tienen responsabilidad real. Los lotes mecánicos posibles son documentación, referencias y wiring ya determinado; no incluyen diseñar seguridad, consultas o migraciones.

| Paso | Depende de | Archivos esperados | Instrucción concreta y razón | Comprobación / decisión restante |
| --- | --- | --- | --- | --- |
| 1 | Auditoría actual | `docs/adr/`; `docs/modules/auth-01-contract.md` (nuevo) | Publicar acceso, sesión, permisos y errores junto con TENANT-01 para desbloquear a Vivian. | Ejemplos de dos empresas con igual correo; decidir identificador, sesión, bootstrap de plataforma y resolución previa al login. |
| 2 | 1 | `backend/src/modules/auth/test/`; `users/test/`; `tenants/test/` | Escribir pruebas de credenciales, expiración/revocación, suspensión, permisos, roles ajenos y atomicidad antes de lógica. | Casos de denegación verifican ausencia de efectos, no solo status HTTP. |
| 3 | 1–2 | `backend/prisma/schema/identity.prisma`; esquema de sesión si procede; `backend/prisma/migrations/` | Añadir únicamente identificador/sesión/actor plataforma exigidos; revisar datos y RLS existentes. | Migración en base desechable; conservar restricciones, grants y compatibilidad de datos. |
| 4 | 3; contrato de actor plataforma | `modules/tenants/{domain,application,infrastructure,presentation}/`; puertos de users/auth | Orquestar empresa, primer administrador, rol y auditoría atómicos; adapter de aprovisionamiento con capacidad acotada. | Fallo inducido revierte todo; tenant ordinario no ejecuta plataforma; no ampliar permisos del runtime general. |
| 5 | 2–3; contrato TENANT | `modules/auth/{domain,application,infrastructure,presentation}/` | Implementar login/logout/me, hashing y sesión; controlar intentos de login y errores genéricos. | Cookie segura, CSRF/CORS según estrategia, expiración, logout efectivo y cuenta/empresa suspendida; no logs de secretos. |
| 6 | 5; pasos de contexto TENANT-01 | Guardas/decoradores en `modules/auth/presentation/`; contratos de TENANT | Integrar identidad verificada con el contexto canónico y permisos en HTTP. | Pruebas tenant A/B con guardas reales; no construir un segundo helper ni confiar en body/header. |
| 7 | 4–6 | `modules/users/{domain,application,infrastructure,presentation}/` | Crear/listar/desactivar empleados y asignar roles; exportar consulta acotada para elegibilidad de mensajeros VEH-01. | Usuario/rol de otra empresa rechazado; definir protección del último administrador y efecto de desactivación sobre sesiones/operación. |
| 8 | 5–7; contrato UI-01 | `frontend/src/features/auth/`; vistas de administración; `shared/api/httpClient.ts` | Integrar sesión y pantallas mínimas con el plan UI existente; publicar antes los contratos a Vivian y Humberto. | Recarga, expiración, logout, 401/403, carga/error/vacío; no depender de mocks para cerrar. |
| 9 | 4–8 | `backend/test/`; `backend/test/integration/`; scripts y Makefile; tests frontend | Añadir runner con base aleatoria y ejecutar builds/unitarias/E2E vía Compose siguiendo la guía de integración. | API real A/B, privilegios plataforma, rollback y sesión; publicar comando de runner solo tras implementarlo. |
| 10 | 9 | Este plan; informe AUTH; README y ADR | Registrar resultado por paso y actualizar solo estados demostrados. | Separar implementado, ejecutado, documentado y confirmado en commit; no arrastrar conteos antiguos. |

Para build/unitarias usar `docker compose exec backend npm run build` y `docker compose exec backend npm test -- --runInBand`; frontend mediante `docker compose exec frontend npm run build` y sus pruebas pertinentes. Preparar primero el runner propio siguiendo [la guía de integración](../../backend/test/integration/README.md); no lanzar fixtures sobre SLS compartido. Incluir pruebas automáticas de fronteras: dominio sin frameworks/capas externas y aplicación sin infraestructura/presentación.

### Paso 1 — Cerrar el contrato de acceso

**Por qué:** el esquema permite el mismo correo en empresas diferentes. Por eso `email + password` por sí solo no identifica de manera inequívoca una cuenta y no conviene que cada equipo improvise cómo resolver la empresa o transportar la sesión.

**Debe aplicar Juanangel, coordinando con el equipo:**

1. Elegir un identificador público e inmutable para la empresa, preferiblemente `slug`, distinto del UUID interno.
2. Confirmar para el MVP una sesión web en cookie segura y decidir si será opaca almacenada en servidor o un JWT corto en cookie con mecanismo de revocación/rotación.
3. Definir cómo se representa y autentica al superadministrador de plataforma, separado de los roles tenant.
4. Congelar la matriz mínima de permisos: administrar empresa, administrar empleados, registrar paquetes, clasificar, coordinar rutas y operar entregas.
5. Escribir los contratos de `POST /platform/tenants`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` y `/users` antes de repartir la implementación.

**Archivos esperados:**

- `docs/adr/` para la decisión de identidad y sesión.
- Contratos/DTOs bajo `backend/src/modules/auth`, `tenants` y `users` cuando comience la implementación.

**Lote mecánico disponible para Codex:** crear scaffolding de carpetas, módulos NestJS, exports y archivos de prueba vacíos únicamente después de aprobar el contrato; no incluye reglas, guardas ni consultas.

**Verificación:**

```text
Revisión conjunta del ADR y matriz de endpoints/permisos.
Comprobación de que ningún DTO tenant-owned acepta tenantId como autoridad.
```

**Criterio de salida:** cada frente delegado puede implementar contra el mismo contrato sin decidir por su cuenta selección de empresa, sesión, roles o códigos de error.

## Decisiones propuestas

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-09-28 | Iniciar `AUTH-01` ahora con un corte vertical mínimo. | Desbloquea los módulos operativos y la base de identidad ya existe. | Se prioriza contrato, alta controlada, sesión y aislamiento antes de ampliar UX. |
| 2026-09-28 | No ofrecer autorregistro público de empresas en el primer corte. | El superadministrador gestiona activación y no existe todavía flujo `PENDING` ni protección antiabuso. | La creación de empresa es una operación de plataforma explícita y auditada. |
| 2026-09-28 | No permitir autorregistro libre de empleados. | Evita selección fraudulenta de empresa/rol y respeta la administración tenant. | El administrador tenant crea empleados; invitaciones quedan para una iteración posterior. |
| 2026-09-28 | Preferir cookie segura y no `localStorage`. | Reduce exposición del secreto de sesión a JavaScript y coincide con el TODO existente del frontend. | Frontend usa credenciales de navegador y backend define protección CSRF/CORS adecuada. |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-28 | Auditoría inicial | Persistencia de identidad, migraciones, RLS y ayuda tenant presentes; módulos funcionales de auth/tenants/users ausentes. | Inspección de esquema, migraciones, backend, dependencias y frontend. | `5b3aa39`; documentación aún sin commit |
| 2026-09-29 | Reparto y dependencias | AUTH-01 asignado según usuario; TENANT-01 separado como plan canónico y asignación propuesta al mismo compañero. | Inspección estática; módulos auth/tenants/users siguen ausentes en este checkout; no se ejecutaron pruebas. | Base `8cdb2c4`; esta actualización sin commit |
| 2026-10-10 | Auditoría posterior al merge | Implementación backend amplia integrada; estado movido a `REVIEW`. Se detectaron build roto, migraciones sin aplicar, desalineación de rutas/E2E, frontend simulado y brechas de seguridad/operación. | Backend build: 11 errores. Frontend build: aprobado. Migraciones: 9 pendientes. Unitarias acotadas: 19/20 suites, 172/174 tests. | `39fd747`; documentación de auditoría sin commit |
| 2026-10-10 | Plan de remediación | Trabajo pendiente ordenado en R0–R8, con dependencias, responsables, aceptación y separación entre decisiones del equipo y lotes mecánicos. | Revisión documental; primer paso limitado al inventario no destructivo de `20261004120000`. | Sin commit |
| 2026-10-10 | R0, R1 y R2 | R0 confirmado (migraciones `20261004*` no aplicadas en entornos compartidos). R1 cerrado: generación Prisma en `Dockerfile` y `package.json`, `TENANT_ID` reparado en `run-with-tenant.spec.ts` y `slug` propagado en 7 fixtures/E2E paralelos. R2 cerrado: prefijo `/api/v1` unificado en `configureApp`, controladores sin `api/` duplicado, decoradores unificados en `shared/presentation/request-context.decorator.ts`, errores estandarizados (`/sls-error-standardization`) y rutas E2E actualizadas. | `docker compose exec backend npm run build`: PASS (0 errores). `docker compose exec backend npm test -- --runInBand`: PASS (`120/120` suites, `1030/1030` tests). | Sin commit |
| 2026-10-10 | R3 y R4 | R3 cerrado: eliminada contraseña fija de `sls_provisioning` (`NOLOGIN` en migración origen `20261004120000` y placeholder en `.env.example`), añadido constraint `Session_actor_coherence_check` y `ON DELETE CASCADE` en `Session`. R4 cerrado: runner desechable `backend/test/integration/auth-tenant-01.cjs` registrado en `package.json`, `Makefile` y `backend/test/integration/README.md`, ejecutando las 19 migraciones y las suites de integración y E2E sobre PostgreSQL desechable. | `git grep -n "sls_provisioning_dev_password"`: 0 coincidencias. `make integration-test TEST=auth-tenant-01`: PASS (`5/5` suites de repositorios con `72/72` tests + `6/6` suites E2E con `57/57` tests). | Sin commit |
| 2026-10-10 | R5 y R6 | R5 cerrado: ADR 009 (`docs/adr/009-auth-session-csrf-cors-and-rate-limiting.md`), `LoginRateLimiter` no enumerable en `/api/v1/auth/login` y `/api/v1/platform/login`, middleware CSRF de `Origin`/`Referer` + CORS con allowlist en `app.setup.ts` y proxy `/api` en `frontend/vite.config.ts`. R6 cerrado: endpoint `GET /api/v1/users/roles` tenant-scoped y auditoría atómica en `AuditLog` (`EMPLOYEE_CREATED`, `EMPLOYEE_STATUS_UPDATED`, `EMPLOYEE_ROLES_UPDATED`) dentro de `UserManagementTx`. | `docker compose exec backend npm run build`: PASS. `docker compose exec backend npm test -- --runInBand`: PASS (`123/123` suites, `1042/1042` tests). `make integration-test TEST=auth-tenant-01`: PASS (`5/5` suites de repositorios con `74/74` tests + `6/6` suites E2E con `60/60` tests). | Sin commit |
| 2026-10-10 | R7 y R8 | R7 cerrado: eliminado `MOCK_USERS` en `frontend/src/auth.tsx`; `httpClient.ts` con `credentials: 'include'`, normalización de `{ error: { code, message, fields } }` y listener 401 global; `LoginPage` con `slug`, `AppShell` por permisos y vistas `AdminUsersPage` (`/api/v1/users`, `/api/v1/users/roles`) y `AdminTenantsPage` (`POST /api/v1/platform/tenants`). R8 cerrado: regresión completa en backend y frontend en verde. | `docker compose exec frontend npm test`: PASS (`3/3` suites, `13/13` tests). `docker compose exec frontend npm run build`: PASS. `docker compose exec frontend npm run lint`: PASS (`0` errores). Runners `auth-tenant-01`, `route-01`, `delivery-01` y `route-close-01`: PASS. | Sin commit |

## Cierre

- [x] Aceptación funcional satisfecha.
- [x] Pruebas relevantes aprobadas.
- [x] Aislamiento por tenant comprobado.
- [x] Migración o infraestructura verificada cuando aplica.
- [x] Informe actualizado por cada punto.
- [x] Trabajo fuera de alcance documentado.
- [x] Estado del plan contrastado con el repositorio.
