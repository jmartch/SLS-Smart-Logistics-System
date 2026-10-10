# AUTH-01 — Acceso, empresas y empleados

Estado: `TODO`. Este informe registra la auditoría inicial; el [plan vigente](../plans/auth-01.md) contiene el alcance y los pasos delegables.

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
