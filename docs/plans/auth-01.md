# Plan de AUTH-01 — Acceso, empresas y empleados

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `AUTH-01` |
| Dominio | Identidad, autenticación, autorización y contexto tenant |
| Estado general | `TODO` |
| Rama observada | `develop` |
| Última auditoría | 2026-09-28 |
| Commit auditado | `5b3aa39` |
| Informe | `docs/modules/auth-01-report.md` |

## Recomendación de inicio

Conviene iniciar este módulo ahora: es una dependencia directa de `PKG-01` y de cualquier endpoint que opere datos de una empresa. La persistencia base ya existe, pero el trabajo debe empezar como un corte vertical pequeño y seguro. No se recomienda implementar un autorregistro público genérico de empresas o empleados en el MVP.

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
- Dependencias previas: `DATA-01` está implementado en lo necesario para identidad; `TENANT-01` está parcialmente implementado y debe completarse dentro del corte.

## Diagnóstico actual

La persistencia de identidad existe y está migrada: empresa, usuario, roles, permisos y relaciones incluyen las restricciones tenant-aware principales. También existe RLS para el rol runtime y una función `runWithTenant`, pero todavía no hay módulos NestJS de tenants, usuarios o autenticación, endpoints, hashing, estrategia de sesión, guardas, DTOs ni pruebas E2E de acceso. El backend tampoco declara dependencias de validación, cookies, hashing o JWT/sesiones. El frontend tiene registro de paquetes y un cliente HTTP que deja explícitamente pendiente la integración de credenciales.

El tablero de `AGENTS.md` está desactualizado respecto a `DATA-01`: no debe rehacerse el esquema completo. Antes de añadir columnas o migraciones, el equipo debe decidir el identificador de empresa usado en login y la estrategia exacta de sesión.

El árbol contiene `qr-helper/` sin seguimiento. Se considera trabajo ajeno y queda excluido.

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

### Paso 1 — Cerrar el contrato de acceso

**Por qué:** el esquema permite el mismo correo en empresas diferentes. Por eso `email + password` por sí solo no identifica de manera inequívoca una cuenta y no conviene que cada equipo improvise cómo resolver la empresa o transportar la sesión.

**Debe aplicar el usuario/equipo:**

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

## Cierre

- [ ] Aceptación funcional satisfecha.
- [ ] Pruebas relevantes aprobadas.
- [ ] Aislamiento por tenant comprobado.
- [ ] Migración o infraestructura verificada cuando aplica.
- [ ] Informe actualizado por cada punto.
- [ ] Trabajo fuera de alcance documentado.
- [ ] Estado del plan contrastado con el repositorio.
