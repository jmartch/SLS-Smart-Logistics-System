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
