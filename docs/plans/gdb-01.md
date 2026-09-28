# Plan de GDB-01 — Integridad logística y reserva de asignaciones

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `GDB-01` |
| Dominio | Persistencia, aislamiento tenant y reserva transaccional de capacidad |
| Estado general | `DONE` |
| Rama observada | `develop` |
| Última auditoría | 2026-09-27 |
| Commit auditado | `2b8e574` |
| Informe | `docs/geospatial/gdb-01-report.md` |

## Alcance

### Incluido

- Cadena completa de migraciones Prisma aplicada sobre una base desechable antes de probar la implementación actual de GDB-01.
- Integridad entre tenants, RLS/permisos, restricciones escalares y unicidad de asignación activa.
- Reserva concurrente por peso y volumen, reasignación atómica e historial.
- Compatibilidad de la prueba con el esquema actual sin confundir una prueba de migración incremental con compatibilidad de la aplicación actual sobre un esquema incompleto.

### Fuera de alcance

- Cadena completa de validación de asignaciones, geocodificación, red vial y disponibilidad por calendario, salvo donde su integración haya causado una regresión en el runner.
- Soportar en producción que el binario actual opere contra una base que no haya aplicado todas las migraciones requeridas por ese binario.
- Demostrar en el mismo runner la actualización histórica desde solo las tres primeras migraciones; esa compatibilidad puede conservarse en una prueba de migración separada si el equipo todavía la necesita.

## Dependencias y fuentes

- `AGENTS.md`: secciones 9, 10, 18, 20 y 22.
- `docs/adr/002-assignment-integrity.md`.
- `docs/geospatial/gdb-01-report.md`.
- `backend/test/integration/README.md`.
- Dependencias posteriores que hoy comparte el adaptador: GDB-02/GDB-03/GDB-04/GDB-05 y cadena de asignación.

## Diagnóstico actual

La evidencia histórica de `PASS empty` y `PASS upgrade` corresponde al adaptador SQL original. El commit `aef3c4b` sustituyó ese adaptador por `PrismaAssignmentReservation`, cuya consulta reúne tanto la reserva básica como datos de validación añadidos por migraciones posteriores. El commit `7f86baa` cambió el runner para ejecutar ese adaptador actual también sobre bases con solo las tres primeras migraciones.

El resultado vigente es una regresión de prueba con dos causas independientes:

1. `empty` y `upgrade` fallan con Prisma `P2022` porque el cliente actual selecciona `Route.plannedStartAt`/`plannedEndAt` y otras relaciones/columnas posteriores sobre una base deliberadamente detenida en la tercera migración.
2. `current` sí supera esa incompatibilidad de esquema, pero falla en la aserción de parada/ruta: el adaptador actual devuelve `NOT_FOUND` antes de insertar, mientras el runner conserva la expectativa histórica de una excepción `P2003`.

Por diseño de despliegue, el binario actual no necesita funcionar sobre un esquema parcialmente migrado. La prueba debe separar la validación de migraciones `empty/upgrade` de la validación funcional del adaptador actual en `current`, o bien introducir explícitamente una primitiva histórica de prueba. Hacer consultas dinámicas en producción para tolerar columnas ausentes no es la opción recomendada.

El usuario aclaró que el objetivo principal del runner es probar GDB-01 y su implementación vigente. Por tanto, el contrato objetivo pasa a ser: aplicar todas las migraciones Prisma en una base desechable, crear después los fixtures compatibles con el esquema actual y ejecutar `PrismaAssignmentReservation`. La actualización histórica de una base detenida en la tercera migración deja de ser requisito de este runner.

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Auditoría | `CODEX_MECHANICAL` | `DONE` | Confirmar el origen y ejecutar escenarios por separado. | Se identifica cada fallo sin depender del corte temprano del runner. | `upgrade`: `P2022`; `current`: aserción faltante en línea 307. |
| 2 | Contrato de prueba | `USER` | `DONE` | Aplicar el esquema Prisma completo antes de probar la implementación actual y fijar la semántica `NOT_FOUND`. | Todos los casos funcionales usan las migraciones completas y expectativas acordes con el contrato público. | `fresh` y `history` ejecutados con las 10 migraciones. |
| 3 | Runner | `USER` | `DONE` | Sustituir los escenarios históricos por casos funcionales sobre el esquema completo. | Reserva nueva y reserva con historial previo prueban concurrencia, capacidad, atomicidad y aislamiento. | `PASS fresh`; `PASS history`. |
| 4 | Verificación | `USER` | `DONE` | Ejecutar build y `test:gdb-01` en Docker con PostgreSQL/PostGIS desechable. | Los casos `fresh` y `history` pasan y las bases temporales se eliminan. | Build correcto; suite completa correcta; contenedor temporal eliminado. |
| 5 | Documentación | `CODEX_MECHANICAL` | `DONE` | Actualizar README, informe y estado global con la evidencia final. | La documentación describe el runner y resultados realmente observados. | README, plan e informe sincronizados. |
| 6 | Estructura Jest | `USER` | `DONE` | Extraer las comprobaciones inline del runner a una suite E2E protegida. | La suite recibe ambas URLs, valida una base `sls_gdb01_<uuid>` y contiene la cobertura funcional actual. | 14/14 casos Jest correctos sobre las variantes `fresh/history`. |
| 7 | Orquestación Prisma | `USER` | `DONE` | Alinear `gdb-01.cjs` con el ciclo de vida de `gdb-05.cjs`. | Crea base aleatoria, ejecuta `prisma migrate deploy`, lanza Jest en banda y elimina la base en `finally`. | Base aleatoria, 10 migraciones, runtime `sls_app`, Jest y limpieza observados. |
| 8 | Reverificación | `USER` | `DONE` | Ejecutar la nueva estructura y actualizar evidencia. | `fresh/history` o sus equivalentes pasan bajo Jest sin usar el PostgreSQL compartido. | Build correcto; 1 suite y 14 pruebas correctas; base eliminada. |

## Paso actual

### Paso 6 — Extraer la cobertura a una suite Jest protegida

GDB-05 ya verificó el patrón de base aleatoria, `prisma migrate deploy`, Jest en banda y limpieza. GDB-01 puede adoptar esa estructura, pero debe conservar una diferencia crítica: el adaptador y las comprobaciones RLS deben conectarse como `sls_app`, no como el administrador que aplica migraciones.

**Debe aplicar el usuario:**

1. Crear `backend/test/assignment-reservation.e2e-spec.ts` sin modificar todavía `gdb-01.cjs`.
2. Validar `DATABASE_URL` y `RUNTIME_DATABASE_URL` con el patrón estricto `^/sls_gdb01_[0-9a-f]{32}$`.
3. Crear un `Pool` administrador desde `DATABASE_URL`, un `Pool` runtime desde `RUNTIME_DATABASE_URL` y un `PrismaService` para `PrismaAssignmentReservation`.
4. Trasladar a la suite, sin cambiar su semántica, `expectCode`, `fixture`, `makePackage` y el cuerpo funcional actual de `run(scenario)`; excluir creación/eliminación de base y aplicación manual de migraciones.
5. Expresar `fresh` y `history` como dos casos Jest secuenciales, por ejemplo con `it.each(['fresh', 'history'])`. Los UUID y tenants independientes permiten compartir una sola base desechable.
6. Conectar en `beforeAll` y cerrar Prisma y ambos pools en `afterAll`. No limpiar fixtures individualmente: el runner eliminará toda la base en el paso 7.
7. Mantener explícitamente la comprobación `SELECT current_user` igual a `sls_app`, las pruebas RLS/grants, concurrencia, capacidad, `NOT_FOUND` e historial.

**Importante:** no copiar literalmente de GDB-05 el mismo URL administrativo en `RUNTIME_DATABASE_URL`. En el paso 7, el runner deberá construir el URL runtime con usuario `sls_app` y contraseña `sls_app_dev_password`, igual que `gdb-06.cjs`.

**Resultado final:** la suite contiene fixtures Prisma transaccionales para `fresh/history` y siete grupos de comportamiento por variante. Cubre el usuario runtime `sls_app`, RLS/permisos, integridad logística, concurrencia por peso, aislamiento `NOT_FOUND`, atomicidad e historial de reasignación, restricciones de asignación y concurrencia por volumen.

**Subpasos del paso 6:**

- `6A — DONE`: fixtures, conexión runtime y comprobaciones RLS/permisos.
- `6B — DONE`: restricciones de integridad mediante conexión administrativa.
- `6C1 — DONE`: reserva concurrente por peso y aislamiento `NOT_FOUND` implementados y comprobados estáticamente.
- `6C2a — DONE`: parada/ruta inválida y preservación atómica del historial comprobadas estáticamente.
- `6C2b1 — DONE`: reasignación exitosa e historial `ACTIVE/ENDED` comprobados estáticamente.
- `6C2b2 — DONE`: restricciones de integridad de `Assignment` y relación ruta/vehículo verificadas en la suite.
- `6C2c — DONE`: capacidad individual y concurrente por volumen verificada en la suite.

**Archivos previstos para la ampliación:**

- `backend/test/integration/gdb-01.cjs`
- `backend/test/assignment-reservation.e2e-spec.ts`
- `backend/test/integration/README.md`
- `docs/plans/gdb-01.md`
- `docs/geospatial/gdb-01-report.md`

**Verificación:**

```text
docker compose exec \
  -e GDB_TEST_ADMIN_URL=postgresql://<usuario>:<clave>@<host-pruebas>:5432/postgres \
  backend npm run test:gdb-01
```

**Criterio de salida de la ampliación:** GDB-01 conserva su cobertura funcional, pero el runner se limita a orquestar base, `prisma migrate deploy`, Jest y limpieza, siguiendo el patrón ya verificado de GDB-05.

**Pendiente no bloqueante:** Node mostró una advertencia de deprecación de `pg` por invocar `client.query()` mientras otra consulta está activa. La suite pasa, pero conviene serializar esas aserciones RLS antes de actualizar a `pg@9`.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-09-27 | Recomendar separación entre pruebas de migración y prueba funcional actual. | Prisma genera el cliente contra un único esquema; el despliegue exige migrar antes de ejecutar la aplicación. | No se añade compatibilidad artificial con columnas ausentes al código de producción. |
| 2026-09-27 | Tratar `NOT_FOUND` como la semántica vigente recomendada para una parada que no pertenece a la ruta. | Es parte del contrato del repositorio y evita filtrar detalles o depender de una excepción de infraestructura. | La expectativa `P2003` del runner debe actualizarse si el equipo confirma esta decisión. |
| 2026-09-27 | Orientar `test:gdb-01` a la implementación actual con todas las migraciones Prisma. | El usuario confirmó que el objetivo es probar el módulo y su implementación, no compatibilidad binaria con esquemas parciales. | Los fixtures se crean después de migrar; los casos pasan a representar reserva nueva e historial previo. |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-27 | Auditoría inicial | Se confirmó que el runner actual conserva escenarios históricos pero usa el adaptador Prisma enriquecido. | Revisión de migraciones, historial y código. | `05defce` |
| 2026-09-27 | Escenario `upgrade` aislado | Falla en `Route.plannedStartAt` ausente. | Ejecución desechable en Docker: Prisma `P2022`. | árbol sin cambios de código |
| 2026-09-27 | Escenario `current` aislado | Llega a la validación de parada/ruta, pero no lanza el `P2003` esperado. | Ejecución desechable en Docker: `AssertionError: Missing expected rejection`, línea 307. | árbol sin cambios de código |
| 2026-09-27 | Continuación guiada | `develop` avanzó a `2b8e574`; no hay cambios posteriores en el runner ni el adaptador que resuelvan la regresión. Se precisó la forma mínima del paso 2. | Inspección de estado, plan, informe e historial reciente. | `2b8e574` |
| 2026-09-27 | Alcance aclarado | El usuario priorizó probar la implementación vigente usando todas las migraciones Prisma. El plan deja la actualización histórica como prueba separable. | Revisión de incompatibilidad de fixtures con `package_address_dimensions`. | árbol sin cambios de código |
| 2026-09-27 | Implementación | El runner aplica todas las migraciones antes de fixtures, usa escenarios `fresh/history` y comprueba `NOT_FOUND` para una parada de otra ruta. | `docker compose exec backend npm run build`: correcto. | sin commit |
| 2026-09-27 | Verificación final | Suite ejecutada contra `postgis/postgis:17-3.6-alpine` temporal, separado de `sls-postgres`. | `PASS fresh`; `PASS history`; contenedor temporal eliminado. | sin commit |
| 2026-09-27 | Nueva ampliación solicitada | Se pidió que GDB-01 adopte después la estructura de runner de GDB-05. | Dependencia de planificación: completar y verificar primero GDB-05 pasos 2–4. | sin commit |
| 2026-09-27 | Dependencia completada | GDB-05 ejecutó correctamente dos suites y cuatro pruebas sobre una única base aleatoria migrada. | GDB-01 avanza al paso 6; GDB-06 se usa como referencia para el URL de `sls_app`. | sin commit |
| 2026-09-27 | Paso 6 parcial | Codex adaptó mecánicamente los fixtures actuales a Prisma dentro de la nueva suite Jest. | Prettier y ESLint correctos; ejecución diferida hasta añadir los casos funcionales y el runner. | sin commit |
| 2026-09-27 | Paso 6A en revisión | El usuario añadió el pool runtime y los casos RLS para `fresh/history`. | La inspección confirma la cobertura esperada; `prettier --check` y ESLint fallan por 287 observaciones de formato autocorregibles. | sin commit |
| 2026-09-27 | Paso 6A verificado | El usuario aplicó Prettier y conservó las comprobaciones RLS para ambos escenarios. | `prettier --check`: correcto; ESLint del spec: correcto. La ejecución E2E queda diferida hasta refactorizar el runner. | sin commit |
| 2026-09-27 | Paso 6B verificado | El usuario añadió un pool administrativo y casos para claves tenant, coherencia zona/sector, valores positivos, capacidad y secuencia de paradas. | `prettier --check`: correcto; ESLint del spec: correcto. La ejecución E2E queda diferida hasta refactorizar el runner. | sin commit |
| 2026-09-27 | Paso 6C1 parcial | Se importó e instanció `PrismaAssignmentReservation`, pero el caso Jest de concurrencia todavía no está en el archivo. | Prettier correcto; ESLint falla únicamente porque `reservations` aún no se utiliza. | sin commit |
| 2026-09-27 | Paso 6C1 en revisión | El usuario añadió el caso concurrente, el conteo de asignaciones activas y la respuesta `NOT_FOUND` entre tenants. | La inspección funcional coincide con el alcance; `prettier --check` y ESLint fallan por 402 observaciones de formato autocorregibles. | sin commit |
| 2026-09-27 | Paso 6C1 verificado | El caso concurrente quedó formateado y comprueba un resultado `ASSIGNED`, uno `PENDING_ASSIGNMENT`, una sola asignación activa y aislamiento `NOT_FOUND`. | `prettier --check`: correcto; ESLint del spec: correcto. La ejecución E2E queda diferida hasta refactorizar el runner. | sin commit |
| 2026-09-27 | Paso 6C2a verificado | Se añadió una ruta objetivo y se intentó reasignar usando una parada perteneciente a la ruta original. El caso espera `NOT_FOUND`, conserva el conteo histórico y mantiene activa la ruta original. | `prettier --check`: correcto; ESLint del spec: correcto. La ejecución E2E queda diferida hasta refactorizar el runner. | sin commit |
| 2026-09-27 | Paso 6C2b1 verificado | Se añadió una reasignación exitosa hacia otra ruta del tenant, conservando asignaciones previas como `ENDED` y creando una única `ACTIVE` de tipo `REASSIGNMENT`. | `prettier --check`: correcto; ESLint del spec: correcto. La ejecución E2E queda diferida hasta refactorizar el runner. | sin commit |
| 2026-09-27 | Auditoría del spec completo | Las restricciones de `Assignment`, vehículo y ruta están presentes. La cobertura histórica de volumen aún no fue trasladada y el archivo volvió a guardarse con indentación no conforme. | `prettier --check`: falla; ESLint: 616 observaciones autocorregibles de formato; búsqueda sin caso de `11 m³` ni concurrencia `6 + 6 m³`. | sin commit |
| 2026-09-27 | Cobertura funcional trasladada | Se añadió rechazo individual de `11 m³` y reserva concurrente de dos paquetes de `6 m³`, completando los comportamientos del runner histórico dentro de Jest. | Inspección confirma siete grupos `it.each`; Prettier/ESLint aún fallan solo por formato. | sin commit |
| 2026-09-27 | Runner en revisión | `gdb-01.cjs` ya crea una base `sls_gdb01_<uuid>`, aplica migraciones, ejecuta Jest y limpia en `finally`. | Sintaxis Node correcta. Pendiente usar credenciales `sls_app` en Jest, `--runTestsByPath`, `KEEP_GDB01_TEST_DB` y mensaje GDB-01. | sin commit |
| 2026-09-27 | Ampliación cerrada | El runner final aplica las 10 migraciones, ejecuta la suite con `sls_app` y elimina la base aleatoria. | `npm run build`: correcto; 1 suite y 14/14 pruebas correctas en 1.393 s; base `sls_gdb01_f1deddc95c684035a24b6fef29b3e429` eliminada. | sin commit |

## Cierre

- [x] Aceptación funcional de la ampliación satisfecha.
- [x] Nueva estructura de pruebas aprobada.
- [x] Aislamiento por tenant comprobado cuando aplica.
- [x] Migración o infraestructura verificada cuando aplica.
- [x] Informe actualizado por cada punto.
- [x] Trabajo fuera de alcance documentado.
- [x] Estado del plan contrastado con el repositorio.
