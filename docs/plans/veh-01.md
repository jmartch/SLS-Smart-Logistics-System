# Plan de VEH-01 — Vehículos, mensajeros, disponibilidad y capacidad

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `VEH-01` |
| Dominio | Vehículos, mensajeros, disponibilidad y capacidad |
| Estado general | `IN_PROGRESS` |
| Asignación | Vivian |
| Rama observada | `feature/mvp-demo-flow` |
| Última auditoría | 2026-10-13 |
| Commit auditado | `4e03970`; cambios de planificación posteriores aún sin commit |
| Informe | [VEH-01](../modules/veh-01-report.md) |
| Coordinación | [Puntos 1 y 2](mvp-puntos-1-2.md) |

## Coordinación del equipo

Vivian implementa VEH-01 y PKG-01; Juanangel publica contratos de AUTH/TENANT/users; Humberto coordina zonas y planificación; Santiago es responsable de las pantallas e integración frontend, con apoyo del responsable backend. `USER` identifica ejecución humana, no una persona distinta.

## Alcance

### Incluido

Alta/listado/detalle/edición de vehículos; vincular mensajero a usuario existente; estados operativos y disponibilidad por intervalo/turnos; cálculo de capacidad ocupada/disponible y contrato para asignación.

### Fuera de alcance

Crear cuentas/roles de usuario (AUTH-01), clustering, creación de rutas, modificar Chain o reescribir reserva GDB-01, GPS y calendario visual avanzado. No borrar recursos con historial.

## Dependencias y fuentes

DATA-01; AUTH-01/TENANT-01 para acceso; servicio público de usuarios de AUTH para elegibilidad de mensajero; ADR-002 y reserva existente para concurrencia.

- `AGENTS.md`: arquitectura y aislamiento (§8–9), reglas de dominio (§10–12), errores/persistencia (§17–18), pruebas/comandos (§20–22) y tablero (§26).
- [backend/prisma/schema/routing.prisma](../../backend/prisma/schema/routing.prisma)
- [backend/prisma/schema/calendar.prisma](../../backend/prisma/schema/calendar.prisma)
- [backend/src/modules/assignments/domain/validation.types.ts](../../backend/src/modules/assignments/domain/validation.types.ts)
- [backend/src/modules/assignments/infrastructure/prisma-assignment-reservation.ts](../../backend/src/modules/assignments/infrastructure/prisma-assignment-reservation.ts)
- [docs/adr/002-assignment-integrity.md](../../docs/adr/002-assignment-integrity.md)
- [docs/geospatial/gdb-01-report.md](../../docs/geospatial/gdb-01-report.md)
- [Contrato administrativo propuesto](../modules/veh-01-contract.md)

## Diagnóstico actual

Existen `Vehicle`, `Courier`, `Depot`, `VehicleShift` y `CourierShift`, estados e índices. `POST /vehicles` y `POST /couriers` están implementados, protegidos con sesión y `MANAGE_TENANT`, probados y confirmados en `649f34d`/`7356d59`. Courier requiere un User activo del mismo tenant; no es una segunda cuenta. El workspace de planificación en el árbol de trabajo consulta depósitos, capacidades, turnos y ocupación, pero no constituye una API administrativa.

Vehículos ya permite listado, alta, detalle, edición y cambio de estado con `MANAGE_TENANT`, capacidades exactas y acciones reales en `AdminVehiclesPage`. Las ediciones y estados se auditan atómicamente y respetan carga activa/rutas comprometidas bajo bloqueo serializable; la carrera con reserva y el rollback de auditoría se probaron en PostgreSQL real. Mensajeros ya permite listado/detalle, candidatos de usuarios activos, vinculación y cambio de estado con auditoría atómica y protección frente a compromiso. El directorio lo posee `UsersModule` y no expone credenciales. Siguen pendientes depósitos y turnos. El árbol contiene además cambios previos de planificación.

## Criterios de aceptación

1. Vehículo válido tiene placa única por tenant, peso máximo kg y volumen máximo m³ positivos; cambios de estado se controlan.
2. Mensajero se vincula una sola vez a un usuario elegible de la misma empresa, consultado mediante contrato de users.
3. Disponibilidad considera estado, turnos e incompatibilidades con ocupación/rutas conforme a una política explícita; ACTIVE no significa libre automáticamente.
4. Capacidad disponible deriva de asignaciones activas: maxWeightKg − suma(weightKg), maxVolumeM3 − suma(volumeM3); no acumular snapshots sin necesidad.
5. Edición concurrente de capacidad y reserva no permite sobrecarga; reducción por debajo de ocupación se rechaza; inactivación/turnos no invalidan silenciosamente una ruta comprometida.
6. Listas, detalles, cambios, turnos y relaciones están aislados por tenant; APIs exponen resultados que Chain/planning pueden consumir.

## Plan verificable

| Paso | Fase | Responsable | Estado | Dependencias | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Contrato operativo | `USER` | `IN_PROGRESS` | Contrato AUTH/TENANT; ADR-002 | Ejemplos de recurso activo ocupado, sin turno, mantenimiento, usuario ajeno y capacidad insuficiente resueltos. | Contrato aprobado; corte de listado de vehículos verificado; políticas de mutación pendientes |
| 2 | Reglas y pruebas | `USER` | `IN_PROGRESS` | 1 | Pruebas de bordes/precisión, intervalos inválidos y elegibilidad; imports independientes de Nest/Prisma. | Placa, capacidad, estados y elegibilidad de mensajeros probados; depósitos/turnos pendientes |
| 3 | Casos de uso y adapters | `USER` | `IN_PROGRESS` | 2; gateway users acordado | Duplicados y recursos ajenos controlados; capacidades/turnos persistidos sin romper FK ni historia. | Vehículos/mensajeros implementados; lector público users integrado; depósitos/turnos pendientes |
| 4 | Consistencia con reservas | `USER` | `IN_PROGRESS` | 3; ADR-002 | Dos operaciones concurrentes de reserva/edición nunca dejan carga mayor al máximo; historial de asignaciones preservado. | Vehículo: carrera reserva/reducción verificada. Mensajero: compromiso, vínculo concurrente y rollback verificados; carrera con planificación completa y turnos pendientes |
| 5 | HTTP y consumo | `USER` | `IN_PROGRESS` | 4; AUTH/TENANT HTTP | Demo autenticada de alta/cambio/consulta; usuario sin permiso rechazado y tenant ajeno invisible. | Vehículos y mensajeros conectados con UI, permisos y aislamiento A/B; depósitos/turnos pendientes |
| 6 | Verificación y documentación | `USER` | `IN_PROGRESS` | 5 | Pruebas relevantes y regresión pasan; contrato listo para ASSIGN-01; informe enlazado. | 152 suites/1332 pruebas backend; 63 E2E; 59 pruebas frontend y builds aprobados; módulo parcial |

## Paso actual

Primer corte terminado localmente: `GET /vehicles` con capacidad ocupada/disponible derivada, paginación, búsqueda, estado y `MANAGE_TENANT`. Verificado con 7 suites/72 pruebas unitarias de vehículos, build backend y 40 pruebas HTTP de `registration-01` sobre PostgreSQL/PostGIS desechable. Sin commit de este corte.

Segundo corte terminado localmente: `AdminVehiclesPage` conecta listado y alta reales, búsqueda, paginación, estados, carga/vacío/error/reintento, permiso denegado y errores por campo. Verificado con 7 archivos/43 pruebas frontend, build aprobado, lint con 0 errores (15 advertencias existentes), y navegador demo para carga real, búsqueda vacía y placa duplicada.

Tercer corte terminado localmente (2026-10-13): detalle, edición y estado de vehículos con política de capacidad/compromiso en dominio, escritura serializable, bloqueo de vehículo y auditoría atómica. Verificado: 8 suites/96 pruebas unitarias de vehículos, 49 E2E `registration-01`, builds backend/frontend y 7 archivos/48 pruebas frontend; lint frontend sin errores, con 15 advertencias previas. Navegador: detalle real, estados comprometidos bloqueados y rechazo de reducción inválida.

Cuarto corte terminado localmente (2026-10-13): administración de mensajeros con listado/detalle, directorio paginado de usuarios elegibles, alta auditada y cambio de estado transaccional. UI real en `/app/admin/mensajeros`, sin crear cuentas ni modificar roles/permisos. Verificado con 57 pruebas unitarias de mensajeros, regresión backend completa de 152 suites/1332 pruebas, 63 E2E `registration-01` y frontend 8 archivos/59 pruebas; builds aprobados y lint sin errores. Navegador: datos reales, usuarios candidatos e inactivación deshabilitada por 3 asignaciones y 1 ruta. Sin escrituras exitosas sobre la base compartida durante la comprobación visual.

Siguiente corte: depósitos — listado/detalle/alta/edición, coordenadas, zona horaria y horario validados, auditoría y pantalla real. Después turnos. Los cortes de administración siguen sin commit. Queda por demostrar específicamente la carrera mensajero/planificación completa; este corte prueba vinculación concurrente y mantiene bloqueos compatibles con el planificador existente, sin atribuirle una E2E de esa carrera.

## Fichas de implementación

### Paso 1 — Contrato operativo

**Objetivo y razón:** Acordar normalización placa, unidades, elegibilidad usuario, estados, fecha/intervalo de consulta, zona horaria y política de turnos/solapamientos. Proponer /vehicles, /couriers, acciones de estado, /shifts y consulta de disponibilidad/capacidad.

**Dependencias:** Contrato AUTH/TENANT; ADR-002. **Estado:** `REVIEW`. **Responsable:** `USER`.

**Archivos esperados:** docs/modules/veh-01-contract.md (nuevo); backend/prisma/schema/routing.prisma; calendar.prisma. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Acordar normalización placa, unidades, elegibilidad usuario, estados, fecha/intervalo de consulta, zona horaria y política de turnos/solapamientos. Proponer /vehicles, /couriers, acciones de estado, /shifts y consulta de disponibilidad/capacidad.

**Verificación y aceptación:** Ejemplos de recurso activo ocupado, sin turno, mantenimiento, usuario ajeno y capacidad insuficiente resueltos.

**Decisiones y pendiente:** Publicar firma consumida por assignments sin exponer Prisma.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** borrador `docs/modules/veh-01-contract.md`, reconciliado el 2026-10-12 con controladores, puertos, esquema, frontend e historial actual. Falta aprobación del contrato.

### Paso 2 — Reglas y pruebas

**Objetivo y razón:** Implementar políticas puras y tests de placa/capacidad, estado, intervalos y carga; definir puertos de repositorio y gateway de usuarios.

**Dependencias:** 1. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/vehicles/{domain,application,test}/; backend/src/modules/couriers/{domain,application,test}/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Implementar políticas puras y tests de placa/capacidad, estado, intervalos y carga; definir puertos de repositorio y gateway de usuarios.

**Verificación y aceptación:** Pruebas de bordes/precisión, intervalos inválidos y elegibilidad; imports independientes de Nest/Prisma.

**Decisiones y pendiente:** Mantener una única regla de capacidad compatible con Chain y reservas.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 3 — Casos de uso y adapters

**Objetivo y razón:** Crear/consultar/editar recursos, vincular mensajeros y gestionar turnos con filtros tenant. Consultar usuarios por interfaz del dueño; leer ocupación por puerto de assignments cuando corresponda.

**Dependencias:** 2; gateway users acordado. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/vehicles/{application,infrastructure}/; backend/src/modules/couriers/{application,infrastructure}/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Crear/consultar/editar recursos, vincular mensajeros y gestionar turnos con filtros tenant. Consultar usuarios por interfaz del dueño; leer ocupación por puerto de assignments cuando corresponda.

**Verificación y aceptación:** Duplicados y recursos ajenos controlados; capacidades/turnos persistidos sin romper FK ni historia.

**Decisiones y pendiente:** Usar modelos actuales; migración solo si contrato demuestra una brecha.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 4 — Consistencia con reservas

**Objetivo y razón:** Alinear edición de máximos, estado y turnos con el protocolo transaccional de reservas; releer ocupación bajo bloqueo y definir resultado ante conflicto. Mantener política en aplicación/dominio.

**Dependencias:** 3; ADR-002. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** Puertos transaccionales de vehicles/couriers; adaptadores; backend/test/vehicle-capacity.e2e-spec.ts (nuevo). Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Alinear edición de máximos, estado y turnos con el protocolo transaccional de reservas; releer ocupación bajo bloqueo y definir resultado ante conflicto. Mantener política en aplicación/dominio.

**Verificación y aceptación:** Dos operaciones concurrentes de reserva/edición nunca dejan carga mayor al máximo; historial de asignaciones preservado.

**Decisiones y pendiente:** Compartir protocolo de bloqueo y orden de acceso; no copiar sin revisión políticas dentro de Prisma.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 5 — HTTP y consumo

**Objetivo y razón:** Añadir controllers/DTOs, permisos administrativos y consultas para coordinador. Publicar contrato y colección API para administración operativa; enlazar listado de usuarios elegibles.

**Dependencias:** 4; AUTH/TENANT HTTP. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/vehicles/presentation/; backend/src/modules/couriers/presentation/; backend/src/app.module.ts; bruno/SLS API/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Añadir controllers/DTOs, permisos administrativos y consultas para coordinador. Publicar contrato y colección API para administración operativa; enlazar listado de usuarios elegibles.

**Verificación y aceptación:** Demo autenticada de alta/cambio/consulta; usuario sin permiso rechazado y tenant ajeno invisible.

**Decisiones y pendiente:** Pantallas administrativas completas pertenecen al plan UI; integración API obligatoria para cerrar este alcance.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 6 — Verificación y documentación

**Objetivo y razón:** Crear runner desechable y pruebas A/B, usuario inválido, turnos, carga y concurrencia; ejecutar regresión de reservas existente y build. Registrar resultados y limitaciones.

**Dependencias:** 5. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/test/integration/; docs/modules/veh-01-report.md; docs/plans/veh-01.md. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Crear runner desechable y pruebas A/B, usuario inválido, turnos, carga y concurrencia; ejecutar regresión de reservas existente y build. Registrar resultados y limitaciones.

**Verificación y aceptación:** Pruebas relevantes y regresión pasan; contrato listo para ASSIGN-01; informe enlazado.

**Decisiones y pendiente:** Cierre de catálogo/recursos, no de asignación automática ni rutas.

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

La integración requiere un runner nuevo que prepare una base aleatoria en el servidor PostGIS dedicado, aplique migraciones, ejecute suites y limpie en `finally`, siguiendo [la guía](../../backend/test/integration/README.md). Incorporar script y allowlist de Makefile cuando corresponda. No anunciar `test:veh-01` ni `make integration-test TEST=veh-01` como disponibles antes de implementarlos. No ejecutar fixtures/migraciones de pruebas sobre SLS compartido. No correr el lint backend con `--fix` durante revisiones de solo lectura.

Conservar salida real, base/servidor de prueba, casos cubiertos y fallos pendientes en el informe. El formato no constituye una fase independiente: respetar convención/Definition of Done y corregirlo de forma acotada cuando aplique.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-09-29 | Reutilizar modelos y código auditados | Evitar duplicar capacidades existentes | Implementar brechas del encargo y probar regresiones |
| 2026-09-30 | Contratos/endpoints nuevos son propuestas para el paso 1 | Todavía no hay implementación funcional de esta entrega | Vivian concreta decisiones antes de lógica/migraciones |
| 2026-09-30 | Agrupar este módulo en el encargo de Vivian | Coordinación solicitada por el usuario | Reparto confirmado: Juanangel AUTH/TENANT; Vivian PKG/VEH; Humberto ZONE; Santiago frontend |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-29 | Auditoría inicial | Existen Vehicle, Courier, VehicleShift y CourierShift, estados e índices. | Lectura estática de fuentes; no ejecución | Base `8cdb2c4` |
| 2026-09-30 | Planificación | Plan y reporte creados; responsabilidades y aceptación explícitas | Revisión documental y enlaces | Sin commit |
| 2026-10-12 | Auditoría Bloque 8 | Confirmadas altas de vehículos/mensajeros; faltan lecturas, ediciones, estados, depósitos, turnos y frontend. Se redactó contrato administrativo propuesto y se aisló el trabajo sucio de planificación. | Inspección estática de schema, módulos, frontend, historial y árbol de trabajo; sin ejecutar pruebas nuevas | `649f34d`, `7356d59`; documentación en árbol de trabajo |
| 2026-10-12 | Primer corte aprobado | `GET /vehicles` tenant-scoped, paginado, filtrado por placa/estado y capacidad decimal derivada de asignaciones activas. Pruebas de 401/403, identidad de sesión, aislamiento A/B, histórico excluido y precisión real. | `docker compose exec backend npm test -- --runInBand modules/vehicles`: 7 suites/72 pruebas; `make integration-test TEST=registration-01`: build aprobado y 40 pruebas E2E aprobadas; base aleatoria eliminada por runner | Sin commit |
| 2026-10-12 | Segundo corte — UI vehículos | Sustituido stub con listado, registro, capacidad, filtros y paginación reales. Cliente valida respuestas y conserva errores por campo de API. | Frontend: 7 archivos/43 pruebas; build PASS; lint 0 errores, 15 advertencias existentes; navegador: BAQ101 con carga real, búsqueda sin resultados y conflicto de placa | Sin commit |
| 2026-10-13 | Tercer corte — edición/estado de vehículos | Detalle, PATCH parcial y estado con `MANAGE_TENANT`, capacidad exacta, bloqueo de recurso comprometido, transacción serializable y `AuditLog` atómico. UI con panel de edición y errores traducidos por código. | 8 suites/96 pruebas vehículos; build backend; 49 E2E en PostgreSQL/PostGIS desechable, aislamiento/rollback/carrera con reserva; 7 archivos/48 pruebas frontend, build y lint 0 errores; navegador BAQ101 verificado | Sin commit |
| 2026-10-13 | Cuarto corte — mensajeros | Listado/detalle/candidatos/alta/estado reales; lector público users; compromiso y auditoría atómica con rollback de alta/estado; UI sin mocks | 152 suites/1332 pruebas backend; 63 E2E en base desechable; 8 archivos/59 pruebas frontend; builds, lint y navegador verificados | Sin commit |

## Cierre

- [ ] Criterios funcionales y errores controlados demostrados.
- [ ] Build y pruebas relevantes aprobados mediante Compose.
- [ ] Lecturas, mutaciones y relaciones entre tenants verificadas.
- [ ] Fronteras Clean Architecture verificadas automáticamente.
- [ ] Migraciones revisadas/aplicadas en entorno de prueba si fueron necesarias.
- [ ] API/consumidores integrados para este alcance.
- [ ] Informe actualizado por paso con evidencia real y commits identificados.
- [ ] Fuera de alcance e integración posterior explícitos.
