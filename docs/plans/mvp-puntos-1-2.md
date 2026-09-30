# Reparto del MVP — puntos 1 y 2

Fecha: 2026-09-29. Base auditada: `develop`, `8cdb2c4`. Árbol limpio antes de esta edición documental.

## Encargos

“Puntos 1 y 2” corresponde al orden recomendado de implementación: identidad/aislamiento y registro de datos operativos.

| Entrega | Persona | Plan canónico | Situación |
| --- | --- | --- | --- |
| AUTH-01 | Juanangel | [AUTH-01](auth-01.md) | Asignación confirmada por el usuario; código no presente en esta rama |
| TENANT-01 | Juanangel | [TENANT-01](tenant-01.md) | Asignación confirmada por Humberto |
| PKG-01 | Vivian | [PKG-01](pkg-01.md) | Incluye refactorización Clean Architecture como paso 0 |
| ZONE-01 | Humberto | [ZONE-01](zone-01.md) | Reasignado expresamente el 2026-09-30 para coordinar zonas y clustering |
| VEH-01 | Vivian | [VEH-01](veh-01.md) | Incluye vehículos y mensajeros |
| UI-01 a UI-04 | Santiago | [Frontend](ui-01-04.md) | Pantallas e integración web con contratos de Juanangel, Vivian y Humberto |

Nombres confirmados por Humberto el 2026-09-30, alineados con AGENTS.md. `USER` identifica al responsable humano de cada módulo; `CODEX_MECHANICAL` corresponde a documentación o transformaciones repetitivas solicitadas.

## Entrega que desbloquea a ambos

Primero publicar juntos un contrato pequeño en documentación del módulo y luego en tipos puros:

- Identidad verificada: usuario, tenant, roles/permisos. AUTH-01 verifica sesión y credenciales.
- Contexto tenant: origen confiable, validación y contrato exigido por casos de uso. TENANT-01 lo mantiene; Prisma y NestJS quedan en capas externas.
- Matriz de permisos: administración de catálogos/recursos, registro/consulta/clasificación de paquetes y consulta de empleados elegibles.
- Errores HTTP: validación 400, sesión ausente 401, permiso insuficiente 403, recurso ajeno/ausente con respuesta indistinguible 404, conflictos conocidos 409; errores inesperados sin SQL ni secretos.
- Prefijo API único y transporte de sesión acordados con el cliente web. Las rutas propuestas en los planes no son endpoints existentes.
- Identificadores UUID reales, unidades kg/cm/m³, fechas con zona horaria, precisión y paginación.

No inventar un guard temporal que confíe en `tenantId` del body/header para desbloquear desarrollo. Usar contexto de prueba y repositorios en memoria exclusivamente en pruebas.

## Orden de trabajo

1. Juanangel: contrato AUTH/TENANT, base de aislamiento, sesión y guardas, luego integración y alta controlada/empleados.
2. Humberto: contrato de ZONE-01 y catálogos (incluye ShipmentType según el alcance vigente); publicar consultas de zonas/sectores y criterios que consumirá clasificación.
3. Vivian: paso 0 de refactorización Clean Architecture de PKG-01 y luego registro/consulta, reutilizando State, Address, geocodificación y el contrato de zonas de Humberto.
4. Vivian: VEH-01, reutilizando usuarios de AUTH y las reservas existentes.
5. Santiago: pantallas e integración web, coordinando contratos con Juanangel, Vivian y Humberto.
6. Los cuatro integrantes: integración de permisos y dos tenants; demo desde login hasta registro persistido, catálogos y recursos disponibles.

Mientras llegan AUTH y ZONE, Vivian puede implementar refactorización, dominio, puertos, unitarias y persistencia aislada usando dobles de los contratos solo en pruebas. El cierre HTTP requiere autenticación y catálogos reales. Humberto coordina ZONE-01 con su trabajo de clustering; el algoritmo continúa perteneciendo a CLUSTER-01/route-planning y no se agrega al alcance del CRUD de zonas ni al encargo de Vivian.

La entrega Humberto → Vivian debe especificar IDs de zona/sector, pertenencia al tenant, relación sector-zona, catálogos disponibles y tratamiento de destinos sin clasificación. PKG consume esa interfaz y aplica sus transiciones autorizadas; no duplica reglas de agrupación ni consulta directamente tablas del módulo de zonas. ShipmentType permanece dentro del alcance actual de ZONE-01, ahora a cargo de Humberto.

## Coordinación de archivos y decisiones

| Área compartida | Quién coordina | Regla |
| --- | --- | --- |
| `identity.prisma`, sesión, contexto, cliente HTTP | Juanangel | Publicar contrato antes de integraciones |
| `catalog.prisma` y módulo de zonas | Humberto | Publicar contrato para PKG; coordinar cambios con clasificación/clustering |
| `packages.prisma`, `routing.prisma`, `calendar.prisma` | Vivian | Revisar impacto y migraciones, reutilizar modelos; consumir contrato de ZONE |
| `app.module.ts`, dependencias y configuración | Autor de cada PR con revisión del otro | Cambios pequeños; no reemplazar registros existentes |
| `modules/packages`, `modules/assignments` | Vivian con revisión de sus autores | Conservar State y protocolo de reserva; evitar nueva lógica duplicada |
| Plataforma y permisos globales | Juanangel | Adapter explícito y auditado; runtime ordinario sigue sin privilegios globales |

Ramas sugeridas por entrega: `codex/tenant-01`, `codex/pkg-01`, `codex/zone-01`, `codex/veh-01`; conservar la rama AUTH ya usada por Juanangel. No se crearon ramas ni commits en esta planificación.

## Verificación y cierre

Cada plan define casos y evidencia. Ejecutar herramientas de aplicación únicamente mediante Docker Compose. La integración real usa un servidor PostGIS desechable y runners que crean una base aleatoria; seguir [la guía existente](../../backend/test/integration/README.md). Los runners nuevos se implementan antes de documentarlos como comandos disponibles.

Separar siempre código existente, pruebas ejecutadas, documentación y commits. Esta entrega solo inspeccionó el checkout y generó planes; no verifica trabajo en otras ramas ni bases aplicadas.

Aceptación conjunta: dos empresas inician sesión; cada una registra y consulta sus paquetes, catálogos, vehículos y mensajeros; la guía puede repetirse entre empresas pero no dentro de una; referencias cruzadas y mutaciones ajenas se rechazan; el navegador consulta datos reales con errores controlados. Esto cierra los puntos 1 y 2, no todo el MVP.

## Cambio de reparto — 2026-09-30

Por petición expresa del usuario, ZONE-01 pasa de Vivian a Humberto. PKG-01 y VEH-01 permanecen con ella. Se conserva la dependencia de catálogos y se explicita el contrato entre responsables; este cambio de asignación no acredita implementación ni pruebas.
