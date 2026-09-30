# Plan de AUTH-01 — Acceso, empresas y empleados

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `AUTH-01` |
| Dominio | Identidad, autenticación, autorización y contexto tenant |
| Estado general | `TODO` |
| Rama observada | `develop` |
| Última auditoría | 2026-09-29 |
| Commit auditado | `8cdb2c4` |
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

La persistencia de identidad existe y está migrada: empresa, usuario, roles, permisos y relaciones incluyen las restricciones tenant-aware principales. También existe RLS para el rol runtime y una función `runWithTenant`, pero todavía no hay módulos NestJS de tenants, usuarios o autenticación, endpoints, hashing, estrategia de sesión, guardas, DTOs ni pruebas E2E de acceso. El backend tampoco declara dependencias de validación, cookies, hashing o JWT/sesiones. El frontend tiene registro de paquetes y un cliente HTTP que deja explícitamente pendiente la integración de credenciales.

El tablero de `AGENTS.md` está desactualizado respecto a `DATA-01`: no debe rehacerse el esquema completo. Antes de añadir columnas o migraciones, el equipo debe decidir el identificador de empresa usado en login y la estrategia exacta de sesión.

En la auditoría de 2026-09-29 el árbol estaba limpio en `develop`, commit `8cdb2c4`. La nota previa sobre `qr-helper/` sin seguimiento ya no describe este checkout. Esta revisión comprueba código y migraciones versionadas, no su aplicación al entorno compartido. No se ejecutaron pruebas y la asignación a un compañero no implica avance implementado en esta rama.

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
| 1 | Contrato | `USER` | `TODO` | Cerrar el identificador de empresa, estrategia de sesión, rol plataforma, permisos y endpoints. | No quedan decisiones de seguridad implícitas; DTOs y respuestas están definidos. | — |
| 2 | Pruebas de contrato | `USER` | `TODO` | Expresar login, alta atómica, empleados, roles y aislamiento antes de la lógica. | Casos felices y rechazos críticos están descritos como pruebas. | — |
| 3 | Persistencia mínima | `USER` | `TODO` | Ajustar solo campos/índices imprescindibles para el contrato elegido. | Migración revisada; no duplica el esquema actual y preserva RLS. | — |
| 4 | Alta de empresa | `USER` | `TODO` | Crear tenant, primer administrador, rol y auditoría en una transacción. | No queda una empresa parcial ante errores y solo plataforma puede ejecutar el caso. | — |
| 5 | Autenticación | `USER` | `TODO` | Implementar hashing, login, logout, sesión e identidad actual. | Credenciales válidas autentican; inválidas y estados suspendidos se rechazan sin filtrar existencia. | — |
| 6 | Contexto y guardas | `USER` | `TODO` | Derivar tenant/roles/permisos de la sesión y aplicar RLS/transacción. | Ningún endpoint tenant-owned confía en `tenantId` del cliente. | — |
| 7 | Empleados | `USER` | `TODO` | Alta, listado, estado y roles de empleados dentro del tenant. | Administrador opera solo su empresa; roles externos o no permitidos se rechazan. | — |
| 8 | Frontend | `USER` | `TODO` | Integrar login, sesión, rutas protegidas y pantallas mínimas. | Incluye loading, error, forbidden y expiración de sesión sin `localStorage`. | — |
| 9 | Verificación | `USER` | `TODO` | Ejecutar build, unitarias, integración y E2E mediante Docker Compose. | Dos tenants prueban aislamiento de lectura y mutación; suites relevantes pasan. | — |
| 10 | Documentación | `CODEX_MECHANICAL` | `TODO` | Sincronizar plan, informe, tablero y evidencia observada. | Estado coincide con código, pruebas y commits reales. | — |

## Paso actual

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

## Cierre

- [ ] Aceptación funcional satisfecha.
- [ ] Pruebas relevantes aprobadas.
- [ ] Aislamiento por tenant comprobado.
- [ ] Migración o infraestructura verificada cuando aplica.
- [ ] Informe actualizado por cada punto.
- [ ] Trabajo fuera de alcance documentado.
- [ ] Estado del plan contrastado con el repositorio.
