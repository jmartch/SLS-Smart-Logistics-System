# Plan de PKG-01 — Registro, consulta, clasificación e historial de paquetes

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `PKG-01` |
| Dominio | Registro, consulta, clasificación e historial de paquetes |
| Estado general | `TODO` para el encargo funcional |
| Asignación | Vivian |
| Rama observada | `develop` |
| Última auditoría | 2026-09-29; plan finalizado 2026-09-30 |
| Commit auditado | `8cdb2c4` |
| Informe | [PKG-01](../modules/pkg-01-report.md) |
| Coordinación | [Puntos 1 y 2](mvp-puntos-1-2.md) |

## Responsables confirmados — 2026-09-30

Vivian es responsable de este módulo. Juanangel mantiene AUTH/TENANT, Vivian PKG/VEH, Humberto ZONE y Santiago frontend. Las tareas de pantallas e integración web de este plan se coordinan con Santiago; el responsable backend publica contratos y participa en la verificación conjunta. Las etiquetas `USER`/`CODEX_MECHANICAL` conservan su significado y no son nombres de personas. Esta confirmación sustituye propuestas de asignación anteriores sin acreditar implementación.

## Alcance

### Incluido

Registro de paquete y dirección, remitente/destinatario/contactos, peso/dimensiones, guía, prioridad y plazo; listado/detalle/historial, correcciones permitidas y clasificación básica; persistencia atómica de registro/historial/evento; integración del formulario existente.

Refactorización del código existente de `packages` para cumplir Clean Architecture antes de ampliar sus funcionalidades: orquestación en aplicación, reglas en dominio, puertos internos y adaptadores de persistencia desacoplados. Ejecutar este trabajo en un cambio enfocado, separado de las nuevas funcionalidades y migraciones, conservando el comportamiento de State, aislamiento e historial/outbox.

### Fuera de alcance

Planificación automática, asignación a ruta, entregas, publicación RabbitMQ y rastreo público UI-04. Reutilizar State y geocodificación existentes; no rehacerlos ni exponer cambio libre de estado. Inbox/notificaciones quedan fuera.

## Dependencias y fuentes

DATA-01; contratos y endpoints AUTH-01/TENANT-01; ZONE-01/ShipmentType; State existente; GEOCODE-01 para resolver dirección cuando corresponda; coordinación de contrato de eventos con EVT-01.

ZONE-01 lo implementa Humberto, no Vivian. Coordinar con él los catálogos de zonas/sectores/tipos de envío, pertenencia al tenant y tratamiento de destinos sin clasificación. Consumir su interfaz pública sin duplicar reglas de zonas/clustering ni consultar directamente sus tablas. El paso 0 y pruebas con dobles pueden avanzar antes de la API ZONE; la integración final necesita catálogos reales.

- `AGENTS.md`: arquitectura y aislamiento (§8–9), reglas de dominio (§10–12), errores/persistencia (§17–18), pruebas/comandos (§20–22) y tablero (§26).
- [backend/prisma/schema/packages.prisma](../../backend/prisma/schema/packages.prisma)
- [backend/prisma/schema/geospatial.prisma](../../backend/prisma/schema/geospatial.prisma)
- [backend/src/modules/packages/domain/package.aggregate.ts](../../backend/src/modules/packages/domain/package.aggregate.ts)
- [backend/src/modules/packages/application/transition-package-state.service.ts](../../backend/src/modules/packages/application/transition-package-state.service.ts)
- [backend/src/modules/packages/infrastructure/prisma-package-lifecycle.repository.ts](../../backend/src/modules/packages/infrastructure/prisma-package-lifecycle.repository.ts)
- [frontend/src/features/packages/types.ts](../../frontend/src/features/packages/types.ts)
- [frontend/src/features/packages/components/PackageForm.tsx](../../frontend/src/features/packages/components/PackageForm.tsx)
- [docs/modules/geocode-01-report.md](../../docs/modules/geocode-01-report.md)

## Diagnóstico actual

Packages ya contiene State, servicio de transición y persistencia atómica con historial/outbox; esto no implementa registro ni consulta HTTP. Package requiere Address y ShipmentType; zona y sector son opcionales. Ni Package ni el formulario actual contienen remitente/destinatario/contactos completos. El payload provisional aporta latitude/longitude, pero el modelo actual obtiene coordenadas de la geocodificación, no de columnas en Package. Debe resolverse ese desacuerdo antes de escribir el registro.

La asignación no equivale a implementación. El código base está confirmado en `8cdb2c4`; las comprobaciones de esta auditoría son estáticas. Los nuevos contratos/runners/rutas son propuestas pendientes, no herramientas o endpoints disponibles. No se ejecutaron builds ni tests ni se modificó la base compartida para elaborar este plan.

La revisión del 2026-09-30 identifica una responsabilidad a refactorizar: `PrismaPackageLifecycleRepository.transitionAtomically` carga/bloquea el agregado, invoca la operación recibida, extrae y exige un evento, persiste los efectos y construye el resultado `TRANSITIONED`. Aunque la transición la decide State y el servicio aporta el callback, parte de la secuencia del caso de uso y la validación del resultado vive en infraestructura. El contrato `PackageLifecycleRepository`, ubicado en dominio, también agrupa operación transaccional y resultado de aplicación. Se debe trasladar esa coordinación a aplicación mediante un puerto transaccional propio. No basta con mover archivos o renombrar carpetas; los repositorios genuinamente de dominio pueden permanecer en dominio.

## Criterios de aceptación

1. Registrar persiste paquete, dirección/referencias, historial inicial REGISTERED y evento local coherente de forma atómica; un fallo no deja datos parciales.
2. Guía única por tenant, repetible entre tenants; generación de token público impredecible sin exponer datos sensibles.
3. Peso kg, dimensiones cm y volumen m³ calculado en backend como lengthCm × widthCm × heightCm / 1 000 000, con precisión y límites acordados; no confiar en volumen del cliente.
4. Remitente, destinatario, dirección/contactos y fecha se conservan con modelo mínimo revisado; relaciones ajenas se rechazan.
5. Listado paginado, detalle e historial son tenant-aware; correcciones respetan estado/rol y preservan trazabilidad.
6. Clasificación usa reglas y State; la geocodificación ambigua/no encontrada queda revisable, nunca se inventa MATCHED. PENDING_ASSIGNMENT corresponde al resultado de asignación, no a cualquier error de registro.
7. Formulario registra y consulta datos reales tras recarga; errores por campo, conflicto y permisos visibles.
8. La refactorización permite probar el caso de uso completo sin NestJS, Prisma ni base de datos: aplicación decide carga, transición, eventos y resultado usando puertos; infraestructura implementa transacciones, bloqueo, mapeo y escrituras, sin decidir la secuencia de negocio.
9. Pruebas automáticas rechazan imports de dominio hacia aplicación/infraestructura/presentación/frameworks y de aplicación hacia infraestructura/presentación. La regresión confirma State, aislamiento y atomicidad de estado, historial y outbox antes de incorporar las nuevas funcionalidades.

## Plan verificable

| Paso | Fase | Responsable | Estado | Dependencias | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Refactorización Clean Architecture | `USER` | `TODO` | Código y pruebas existentes; §8 de AGENTS.md | Caso de uso orquesta a través de puertos internos; dominio puro; adaptador sin decisiones de negocio; regresiones y fronteras aprobadas. | Inspección estática; implementación pendiente |
| 1 | Contrato y brechas de datos | `USER` | `TODO` | Contrato AUTH/TENANT; coordinación ZONE | Matriz campo UI → DTO → dominio → persistencia completa; zona opcional y geocodificación ambigua tienen resultado definido. | Pendiente |
| 2 | Pruebas y dominio | `USER` | `TODO` | 0–1 | Cálculo conocido de volumen, cero/negativo/no finito rechazado, estados no mutables libremente y imports limpios. | Pendiente |
| 3 | Persistencia mínima | `USER` | `TODO` | 1–2 | Migración aplica en base desechable y preserva datos/constraints; rollback del registro completo probado. | Pendiente |
| 4 | Casos de uso | `USER` | `TODO` | 2–3; consultas ZONE disponibles | Errores tipados, selección de catálogo válida, historial inicial único y fallo sin escrituras parciales. | Pendiente |
| 5 | API y formulario real | `USER` | `TODO` | 4; AUTH/TENANT HTTP; ZONE HTTP | POST real devuelve ID persistido, consulta tras recarga confirma; 400/401/403/404/409 controlados y UI con carga/error/vacío. | Pendiente |
| 6 | Integración y cierre | `USER` | `TODO` | 5 | Builds y pruebas relevantes pasan; A/B aislados; fallo inducido revierte paquete/historial/outbox; demo sin mocks. | Pendiente |

## Paso actual

Empezar por el paso 0: caracterizar el comportamiento actual y refactorizar el ciclo de vida de paquetes con pruebas de regresión. Este paso puede avanzar sin AUTH HTTP. La definición documental del paso 1 puede coordinarse entretanto, pero la implementación nueva de los pasos 2–6 debe reutilizar las fronteras verificadas. No cambiar el estado general a `DONE` por tener tablas o clases base.

## Fichas de implementación

### Paso 0 — Refactorización Clean Architecture del código existente

**Objetivo y razón:** hacer visible y comprobable la dirección `Presentation → Application → Domain` e `Infrastructure → Application/Domain`, evitando que el adaptador Prisma orqueste el ciclo de vida. Conservar las reglas y comportamiento existentes en una entrega independiente de registro/clasificación.

**Dependencias:** implementación State, servicio de transición, adapter y pruebas actuales; sección 8 de `AGENTS.md`. **Estado:** `TODO`. **Responsable:** `USER` (Vivian).

**Archivos esperados:**

- `backend/src/modules/packages/application/transition-package-state.service.ts` y nuevos puertos/resultados bajo `application/`.
- `backend/src/modules/packages/domain/package-lifecycle.repository.ts`: separar o reubicar responsabilidades según pertenezcan a dominio o aplicación; actualizar consumidores.
- `backend/src/modules/packages/infrastructure/prisma-package-lifecycle.repository.ts` y adapter transaccional si se requiere.
- `backend/src/modules/packages/packages.module.ts`: composición de puertos y adaptadores.
- `backend/src/modules/packages/test/`: pruebas existentes y nueva prueba de fronteras `packages-architecture.spec.ts`.
- `backend/test/package-lifecycle.e2e-spec.ts`: conservar y adaptar regresión de persistencia sin debilitar sus aserciones.

**Instrucción para Vivian:**

1. Ejecutar/caracterizar las pruebas actuales de transición válida/inválida, eventos, tenant y rollback. Registrar la línea base real antes de modificar código.
2. Definir un puerto transaccional propiedad de aplicación, por ejemplo una unidad de trabajo que entregue capacidades de carga bloqueada y persistencia de efectos. No exponer `Prisma.TransactionClient`, DTOs HTTP ni servicios NestJS a las capas internas.
3. Hacer que el caso de uso controle, dentro de ese ámbito transaccional, la carga del paquete, ausencia, invocación de State, extracción/validación de eventos, solicitud de persistencia y resultado. El agregado conserva la regla de transición; aplicación coordina. Los resultados `NOT_FOUND`/`TRANSITIONED` propios del caso de uso pertenecen a aplicación.
4. Limitar infraestructura a abrir/confirmar/revertir transacciones, establecer tenant, bloquear, mapear y persistir lo solicitado. Mantener estado, historial y outbox en una única transacción; no separar la lectura bloqueada de la escritura. Mapear fallos técnicos sin ocultarlos como éxito.
5. Mantener dominio puro y módulos NestJS como composición. Definir puertos solo para necesidades reales; conservar nombres/exportaciones compatibles o actualizar todos los consumidores y tests en el mismo cambio.
6. Probar aplicación con dobles de puertos, dominio con pruebas State y adapter con integración real. Añadir reglas de imports que también consideren imports de tipos y rutas/aliases usados por el repositorio; adaptar como referencia la prueba de arquitectura de geocoding.

**Verificación y aceptación:** unitarias demuestran transición/rechazo sin NestJS ni Prisma; un paquete ausente no produce escrituras; la integración demuestra tenant, rollback de historial/outbox y transición válida sin cambiar el comportamiento previo. Pruebas de fronteras y build pasan. La inspección confirma que el adapter ya no invoca reglas de negocio ni determina el resultado del caso de uso. Las pruebas de imports por sí solas no demuestran esa separación de responsabilidades.

**Decisiones y pendiente:** concretar el contrato transaccional con Vivian, incluyendo traducción de conflictos y consistencia entre eventos e historial. La ubicación definitiva se justifica por responsabilidad, no por una estructura obligatoria de carpetas. No ampliar el refactor a assignments, geocoding ni infraestructura global salvo ajustes mínimos de consumidores necesarios y explícitos.

**Lote mecánico posible:** una vez definido el mapa de cambios, mover archivos, actualizar imports/exports, wiring y referencias de pruebas/documentación. Diseñar los puertos y redistribuir la orquestación corresponde a `USER`.

**Evidencia obtenida:** lectura de contrato, servicio, adapter y módulo el 2026-09-30. Refactorización y pruebas aún pendientes; no se modificó código al ampliar este plan.

### Paso 1 — Contrato y brechas de datos

**Objetivo y razón:** Mapear formulario a Address/Package/ShipmentType y definir remitente, destinatario/contactos, precisión, fechas, token público y coordenadas suministradas frente a GEOCODE. Definir POST/GET /packages, GET /packages/:id, GET /packages/:id/history y acciones de corrección/clasificación autorizadas.

**Dependencias:** Contrato AUTH/TENANT; coordinación ZONE. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** docs/modules/pkg-01-contract.md (nuevo); backend/prisma/schema/packages.prisma; geospatial.prisma; frontend/src/features/packages/types.ts. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Mapear formulario a Address/Package/ShipmentType y definir remitente, destinatario/contactos, precisión, fechas, token público y coordenadas suministradas frente a GEOCODE. Definir POST/GET /packages, GET /packages/:id, GET /packages/:id/history y acciones de corrección/clasificación autorizadas.

**Verificación y aceptación:** Matriz campo UI → DTO → dominio → persistencia completa; zona opcional y geocodificación ambigua tienen resultado definido.

**Decisiones y pendiente:** Elegir modelo mínimo de contactos y representación auditada de coordenadas manuales antes de migrar.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 2 — Pruebas y dominio

**Objetivo y razón:** Escribir casos de unidades/precisión, límites, duplicado por tenant, referencia ajena, estado inicial y corrección prohibida; ampliar dominio solo para reglas nuevas y reutilizar State.

**Dependencias:** 0–1. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/packages/domain/; application/ports/; test/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Escribir casos de unidades/precisión, límites, duplicado por tenant, referencia ajena, estado inicial y corrección prohibida; ampliar dominio solo para reglas nuevas y reutilizar State.

**Verificación y aceptación:** Cálculo conocido de volumen, cero/negativo/no finito rechazado, estados no mutables libremente y imports limpios.

**Decisiones y pendiente:** Definir creación inicial explícita: reconstitute existente no equivale a crear ni genera por sí mismo el evento de registro.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 3 — Persistencia mínima

**Objetivo y razón:** Añadir solo datos faltantes con Prisma/migración revisada; revisar datos existentes antes de NOT NULL o backfill. Mantener RLS, FK compuestas y restricciones SQL. Definir puerto transaccional interno para registro, historial y evento.

**Dependencias:** 1–2. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/prisma/schema/; backend/prisma/migrations/; backend/src/modules/packages/application/ports/; infrastructure/. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Añadir solo datos faltantes con Prisma/migración revisada; revisar datos existentes antes de NOT NULL o backfill. Mantener RLS, FK compuestas y restricciones SQL. Definir puerto transaccional interno para registro, historial y evento.

**Verificación y aceptación:** Migración aplica en base desechable y preserva datos/constraints; rollback del registro completo probado.

**Decisiones y pendiente:** No usar reset ni fabricar contactos para filas existentes; documentar estrategia de compatibilidad.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 4 — Casos de uso

**Objetivo y razón:** Implementar registrar/listar/consultar/historial/corregir/clasificar. Orquestar reglas en aplicación y usar puertos de catálogos/geocodificación; evitar queries directas a tablas ajenas. Usar State para transición y conservar atomicidad al clasificar.

**Dependencias:** 2–3; consultas ZONE disponibles. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/packages/application/; infrastructure/; packages.module.ts. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Implementar registrar/listar/consultar/historial/corregir/clasificar. Orquestar reglas en aplicación y usar puertos de catálogos/geocodificación; evitar queries directas a tablas ajenas. Usar State para transición y conservar atomicidad al clasificar.

**Verificación y aceptación:** Errores tipados, selección de catálogo válida, historial inicial único y fallo sin escrituras parciales.

**Decisiones y pendiente:** Registro no espera a RabbitMQ: registrar intención local; coordinar envelope con EVT-01 y no duplicar outbox.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 5 — API y formulario real

**Objetivo y razón:** Implementar DTOs/controllers y permisos. Ampliar formulario/detalle mínimo a campos acordados, alinear URL, credenciales y catálogo real; retirar mocks de la demo integrada.

**Dependencias:** 4; AUTH/TENANT HTTP; ZONE HTTP. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/src/modules/packages/presentation/; frontend/src/features/packages/; docker-compose.yml para flag acordado. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Implementar DTOs/controllers y permisos. Ampliar formulario/detalle mínimo a campos acordados, alinear URL, credenciales y catálogo real; retirar mocks de la demo integrada.

**Verificación y aceptación:** POST real devuelve ID persistido, consulta tras recarga confirma; 400/401/403/404/409 controlados y UI con carga/error/vacío.

**Decisiones y pendiente:** No exponer endpoint genérico para asignar cualquier state; publicar acciones del caso de uso.

**Lote mecánico posible:** sincronizar documentación y referencias de este paso; scaffolding/imports/wiring solo cuando se solicite una transformación ya determinada. Las decisiones de dominio, autorización, SQL, migraciones y concurrencia corresponden a `USER`.

**Evidencia obtenida:** ninguna de implementación nueva; completar con comando, resultado, fecha y commit al ejecutar el paso.

### Paso 6 — Integración y cierre

**Objetivo y razón:** Añadir runner desechable, E2E de registro atómico, duplicado concurrente, relaciones cruzadas, clasificación/corrección e historial; ejecutar regresión State y evidencia desde navegador/API.

**Dependencias:** 5. **Estado:** `TODO`. **Responsable:** `USER`.

**Archivos esperados:** backend/test/package-registration.e2e-spec.ts (nuevo); backend/test/integration/; docs/modules/pkg-01-report.md. Las rutas nuevas son propuestas; adaptar nombres al contrato sin crear capas vacías.

**Instrucción para Vivian:** Añadir runner desechable, E2E de registro atómico, duplicado concurrente, relaciones cruzadas, clasificación/corrección e historial; ejecutar regresión State y evidencia desde navegador/API.

**Verificación y aceptación:** Builds y pruebas relevantes pasan; A/B aislados; fallo inducido revierte paquete/historial/outbox; demo sin mocks.

**Decisiones y pendiente:** Registrar commits y comandos reales; el cierre no demuestra rutas, entrega ni envío RabbitMQ.

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

Para el paso 0, ejecutar la regresión existente de paquetes y la integración del ciclo de vida con servidor desechable:

```bash
docker compose exec backend npm test -- --runInBand --testPathPatterns=modules/packages/test
make integration-test TEST=gdb-06
make integration-db-down
```

El Makefile ejecuta las herramientas dentro de Compose. Registrar la línea base y repetir estas comprobaciones después del refactor; incluir la nueva suite de arquitectura cuando se implemente. No se requiere frontend ni una migración nueva para una redistribución de responsabilidades que conserve el esquema.

La integración requiere un runner nuevo que prepare una base aleatoria en el servidor PostGIS dedicado, aplique migraciones, ejecute suites y limpie en `finally`, siguiendo [la guía](../../backend/test/integration/README.md). Incorporar script y allowlist de Makefile cuando corresponda. No anunciar `test:pkg-01` ni `make integration-test TEST=pkg-01` como disponibles antes de implementarlos. No ejecutar fixtures/migraciones de pruebas sobre SLS compartido. No correr el lint backend con `--fix` durante revisiones de solo lectura.

Conservar salida real, base/servidor de prueba, casos cubiertos y fallos pendientes en el informe. El formato no constituye una fase independiente: respetar convención/Definition of Done y corregirlo de forma acotada cuando aplique.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-09-29 | Reutilizar modelos y código auditados | Evitar duplicar capacidades existentes | Implementar brechas del encargo y probar regresiones |
| 2026-09-30 | Contratos/endpoints nuevos son propuestas para el paso 1 | Todavía no hay implementación funcional de esta entrega | Vivian concreta decisiones antes de lógica/migraciones |
| 2026-09-30 | Agrupar este módulo en el encargo inicial de Vivian | Coordinación solicitada por Humberto | Nombres y TENANT pendientes en ese momento; confirmados posteriormente |
| 2026-09-30 | Añadir refactorización explícita como paso 0 | Solicitud de Humberto y orquestación observada en el adapter del ciclo de vida | Resolver fronteras con regresión antes de nuevas funcionalidades, en un cambio enfocado |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-29 | Auditoría inicial | Packages ya contiene State, servicio de transición y persistencia atómica con historial/outbox; esto no implementa registro ni consulta HTTP. | Lectura estática de fuentes; no ejecución | Base `8cdb2c4` |
| 2026-09-30 | Planificación | Plan y reporte creados; responsabilidades y aceptación explícitas | Revisión documental y enlaces | Sin commit |
| 2026-09-30 | Ampliación de alcance | Paso 0 de refactorización Clean Architecture, puertos transaccionales internos y aceptación de regresión añadidos | Inspección estática de repository, servicio, adapter y módulo; pruebas no ejecutadas | Documentación sin commit |
| 2026-09-30 | Coordinación | ZONE-01 pasa a Humberto; Vivian conserva PKG-01 y consume contrato de catálogos | Petición expresa; implementación sin cambios | Sin commit |

## Cierre

- [ ] Criterios funcionales y errores controlados demostrados.
- [ ] Build y pruebas relevantes aprobados mediante Compose.
- [ ] Lecturas, mutaciones y relaciones entre tenants verificadas.
- [ ] Fronteras Clean Architecture verificadas automáticamente.
- [ ] Refactorización del ciclo de vida cerrada con orquestación en aplicación y atomicidad preservada, antes de implementar nuevas funcionalidades.
- [ ] Migraciones revisadas/aplicadas en entorno de prueba si fueron necesarias.
- [ ] API/consumidores integrados para este alcance.
- [ ] Informe actualizado por paso con evidencia real y commits identificados.
- [ ] Fuera de alcance e integración posterior explícitos.
