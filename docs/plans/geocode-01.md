# Plan de GEOCODE-01 — Geocodificación local determinista

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `GEOCODE-01` (ID de trabajo; todavía no figura en el tablero de `AGENTS.md`) |
| Dominio | Geoespacial / recepción de paquetes |
| Estado general | `DONE` para el alcance definido |
| Rama observada | `feature/geocoding-algorithms` |
| Última auditoría | 2026-09-29 |
| Commit auditado | `333011b` como base; implementación aún sin commit |
| Informe | [docs/modules/geocode-01-report.md](../modules/geocode-01-report.md) |

## Alcance

### Incluido

- Normalizar y estructurar una dirección de manera determinista sin modificar el texto original.
- Consultar referencias de un `GeoDataset` publicado en estado `READY` mediante un puerto, sin acoplar el dominio a Prisma o PostGIS.
- Calcular puntuación, desglose, desempate y ranking reproducibles para candidatos locales.
- Aplicar los umbrales documentados: selección automática con score mínimo `0.95` y margen mínimo `0.10`; en los demás casos producir `REVIEW_REQUIRED` o `NOT_FOUND`.
- Persistir el intento, sus candidatos y la selección de forma atómica, respetando dirección, dataset y tenant.
- Probar coincidencia inequívoca, ambigüedad, ausencia de resultados, dataset no disponible, determinismo y aislamiento entre tenants.
- Añadir una comprobación automatizada de fronteras: `domain/` no importa capas externas y `application/` no importa `infrastructure/` ni `presentation/`.

### Fuera de alcance

- Importar datos OSM o construir un geocodificador general para Colombia.
- Consumir un proveedor externo de geocodificación.
- Validación genérica de coordenadas y cálculo Haversine de `GEO-01`.
- Clustering, capacidad, asignación, Dijkstra/A*, secuenciación de paradas y conexión al grafo vial.
- API de revisión humana completa, autorización basada en roles y pantallas frontend; dependen de `AUTH-01` y de un corte posterior.
- El proyecto o helper de QR, que pertenece al flujo de recepción y no a dirección → coordenadas.

## Dependencias y fuentes

- `AGENTS.md`: secciones 7 a 9 —incluidas las fronteras obligatorias de Clean Architecture—, 12, 17, 20 a 22 y tarea `GEO-01`.
- `docs/adr/001-geospatial-integration.md`: normalización, ranking y distancia manuales en TypeScript; persistencia de evidencia y separación de PostGIS.
- `docs/geospatial/migration-plan.md`: contrato persistente, estados y umbrales de geocodificación.
- `docs/geospatial/gdb-02-report.md`: catálogo, intentos, candidatos, RLS y restricciones ya probados para el alcance de persistencia.
- `docs/geospatial/gdb-03-report.md`: vínculo de paquetes con dirección e intento de geocodificación.
- `backend/prisma/schema/geospatial.prisma`: modelos existentes que el caso de uso debe reutilizar.
- Dependencias previas: `GDB-02` y `GDB-03` están implementados y documentados; la prueba integral necesitará PostgreSQL/PostGIS desechable y un dataset `READY` controlado.
- Dependencias posteriores: `GEO-01`, `PAT-CHAIN-01`, `ASSIGN-01` y la conexión al grafo consumen una selección de geocodificación confirmada, pero no forman parte de este cierre.

## Diagnóstico actual

El repositorio ya contiene la infraestructura persistente de geocodificación: `GeoDataset`, `AddressReference`, `Address`, `GeocodingAttempt`, `GeocodingCandidate` y `GeocodingReview`, además del vínculo opcional desde `Package`. La documentación de GDB-02 declara explícitamente pendientes la normalización, búsqueda, puntuación y orquestación funcional.

El módulo ya contiene contratos, normalizador, errores tipados, scoring, ranking y decisión determinista en dominio; puertos y orquestación en aplicación; y adaptadores Prisma/PostGIS para dirección, catálogo e intento. `GeocodingModule` compone estas dependencias y exporta el caso de uso. Las pruebas de arquitectura impiden imports del dominio hacia capas externas y de aplicación hacia infraestructura o presentación.

La persistencia real fue comprobada en un servidor PostGIS dedicado y una base aleatoria: coincidencia, ausencia, dataset no publicado, aislamiento entre tenants, ambigüedad y rollback pasan junto con el round-trip de coordenadas. La base y el contenedor temporal se eliminaron después de la ejecución. El esquema existente de GDB-02/GDB-03 fue suficiente y no se añadió una migración.

El árbol estaba limpio al iniciar la auditoría original. La implementación continúa ahora en `feature/geocoding-algorithms`, basada en `333011b`. Existe una modificación ajena en `backend/package.json` que agrega el script `prisma:studio`; no se atribuye a este módulo ni se modificará. Existe además un borrador anterior de este plan dentro de `stash@{0}`; se consultó como contexto y no se aplicó, alteró ni eliminó. El tablero solo define `GEO-01` para coordenadas y Haversine, por lo que `GEOCODE-01` se mantiene como ID de trabajo separado hasta incorporarlo formalmente al tablero.

## Contrato de aceptación propuesto

1. El caso de uso recibe contexto tenant confiable, `addressId` y `datasetId`; no acepta `tenantId` del cliente como autoridad.
2. Conserva `Address.originalText`, genera representación normalizada/componentes y registra versiones explícitas de normalizador y algoritmo.
3. Solo usa un dataset `READY` y nunca mezcla referencias de otra versión de catálogo.
4. La búsqueda obtiene un conjunto acotado de referencias; el dominio determina score, desglose, orden y estado final con reglas deterministas.
5. Una coincidencia con score `>= 0.95` y margen `>= 0.10` queda `MATCHED` y seleccionada; una lista plausible sin margen queda `REVIEW_REQUIRED`; sin candidatos válidos queda `NOT_FOUND`.
6. Empates se resuelven con una clave estable documentada, no con el orden incidental de la base de datos.
7. Intento, candidatos y selección se escriben en una transacción; un fallo no deja un intento parcial o marcado como exitoso.
8. El catálogo publicado es compartido y de solo lectura para runtime; direcciones, intentos, candidatos y revisiones privadas permanecen aislados por tenant.

Los detalles de normalización, pesos del score, límite de candidatos y clave exacta de desempate son decisiones del usuario que deben cerrarse en el paso 1, no inferirse durante la implementación.

## Plan verificable

| Paso | Fase | Responsable | Estado | Dependencias | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Contrato y pruebas | `USER` | `DONE` | GDB-02/GDB-03 | Fijar entradas, resultados, reglas y fixtures antes del algoritmo. | Casos y desempates quedan expresados como pruebas rojas por comportamiento ausente. | Suite compila: 1 suite y 5 pruebas fallan exclusivamente por `NOT_IMPLEMENTED`. |
| 2 | Dominio | `USER` | `DONE` | Paso 1 | Normalizar texto y extraer componentes de forma pura y versionada. | Variaciones acordadas producen la misma clave sin perder el original. | 10/10 pruebas aprobadas; build aprobado; suite principal permanece roja solo por el stub. |
| 3 | Dominio | `USER` | `DONE` | Pasos 1-2 | Puntuar, desglosar, ordenar y clasificar candidatos. | El mismo input produce el mismo ranking y el estado esperado en todos los bordes. | Formato aprobado; 2 suites y 21/21 pruebas aprobadas; build aprobado, todo después del ajuste de Prettier. |
| 4 | Puerto y prefiltrado | `USER` | `DONE` | Pasos 1-3 | Consultar un conjunto acotado del catálogo publicado sin filtrar reglas de dominio hacia Prisma. | Solo intervienen dataset y municipio solicitados, el dataset está `READY`, y límite/orden son explícitos. | 4/4 pruebas del adaptador y build aprobados; SQL parametrizado, orden estable, límite y coordenadas comprobados unitariamente. |
| 5 | Aplicación y persistencia | `USER` | `DONE` | Pasos 1-4 | Orquestar la geocodificación y guardar evidencia atómicamente. | Intento, candidatos y selección son coherentes o no se escribe nada parcial. | Wiring y build aprobados; fronteras de dominio/aplicación aprobadas 2/2. |
| 6 | Integración y tenant | `USER` | `DONE` | Paso 5 | Probar persistencia real y aislamiento sobre PostGIS desechable. | Tenant A no lee ni modifica datos privados de B; el catálogo compartido sigue limitado a `READY`. | 6/6 e2e aprobadas en `integration-postgres`: `MATCHED`, `NOT_FOUND`, `STAGING`, aislamiento, `REVIEW_REQUIRED` y rollback; base aleatoria y contenedor eliminados. |
| 7 | Verificación y documentación | `CODEX_MECHANICAL` | `DONE` | Pasos 1-6 | Ejecutar comprobaciones funcionales autorizadas y registrar evidencia vigente. | Build, suites relevantes y fronteras de imports pasan mediante Docker Compose; plan e informe coinciden con el repositorio. | 7 suites y 36/36 pruebas del módulo, build y 6/6 e2e aprobados; plan, informe y README sincronizados. |

## Fichas de implementación

### Paso 1 — Cerrar contrato y fixtures de aceptación

**Por qué:** el esquema permite almacenar resultados, pero no decide cómo se normaliza, puntúa, desempata o clasifica una dirección. Esas reglas no deben aparecer accidentalmente dentro del adaptador de persistencia.

**Debe aplicar el usuario:**

1. Definir tipos puros de entrada y resultado, códigos estables de error y las versiones del normalizador/algoritmo.
2. Elegir y documentar componentes admitidos, pesos del score, límite de candidatos y clave total de desempate.
3. Crear fixtures pequeños para: coincidencia exacta; candidatos plausibles sin margen; ausencia; dataset no `READY`; empate; repetición determinista; y acceso con tenant incorrecto a una dirección privada.
4. Escribir primero pruebas que fallen por ausencia de comportamiento, no por imports o fixtures inválidos.

**Archivos esperados:**

- `backend/src/modules/geocoding/domain/`
- `backend/src/modules/geocoding/application/`
- `backend/src/modules/geocoding/test/`

**Lote mecánico disponible para Codex:** scaffolding de carpetas, archivos de prueba e imports solo después de que el usuario apruebe el contrato; no incluye reglas ni casos de negocio.

**Verificación:**

```text
docker compose exec backend npm test -- --runInBand <ruta-de-las-pruebas-de-geocodificacion>
```

**Criterio de salida:** las reglas y escenarios están visibles en tipos/pruebas, y la suite queda roja únicamente porque el algoritmo aún no existe.

### Paso 2 — Implementar normalización y componentes

**Por qué:** búsqueda y ranking deben consumir una representación canónica reproducible sin destruir la dirección recibida.

**Debe aplicar el usuario:** implementar funciones puras para normalización y extracción limitada de componentes, declarar supuestos de direcciones soportadas y rechazar entradas vacías o no utilizables con códigos estables.

**Archivos esperados:** `backend/src/modules/geocoding/domain/` y sus pruebas unitarias.

**Lote mecánico disponible para Codex:** propagación repetitiva de nombres o tipos ya aprobados en fixtures; no diseño del parser.

**Verificación:** pruebas unitarias con equivalencias, caracteres/espacios acordados, casos incompletos y preservación separada del texto original.

**Criterio de salida:** normalización determinista y versionada, sin dependencias de NestJS, Prisma o PostGIS.

### Paso 3 — Implementar scoring, ranking y decisión

**Por qué:** esta es la lógica académica central del módulo y debe ser explicable, manual y reproducible.

**Debe aplicar el usuario:** calcular score/desglose según el contrato, aplicar una clave total de desempate y decidir `MATCHED`, `REVIEW_REQUIRED` o `NOT_FOUND` usando los umbrales versionados.

**Archivos esperados:** `backend/src/modules/geocoding/domain/` y pruebas unitarias de bordes `0.95`, margen `0.10`, empates y orden repetido.

**Lote mecánico disponible para Codex:** ampliación repetitiva de fixtures después de fijar la matriz; no selección de pesos ni fórmula.

**Verificación:** ejecutar la suite varias veces y comprobar idéntico orden, score, desglose y selección.

**Criterio de salida:** todos los escenarios de dominio pasan y ningún orden depende de la base de datos o de aleatoriedad.

### Paso 4 — Definir puerto y prefiltrado del catálogo

**Por qué:** PostGIS puede acotar candidatos, pero no debe decidir score o estado de negocio.

**Debe aplicar el usuario:** definir en aplicación el puerto de consulta y su adaptador parametrizado; exigir `datasetId`, municipio/clave de búsqueda y límite explícito; comprobar `READY`; devolver objetos del contrato interno, no filas Prisma.

**Archivos esperados:**

- `backend/src/modules/geocoding/application/` para el puerto requerido por el caso de uso.
- `backend/src/modules/geocoding/infrastructure/` para el adaptador.

**Lote mecánico disponible para Codex:** wiring de provider/export cuando el contrato y token estén decididos.

**Verificación:** pruebas del puerto con dataset correcto, dataset no publicado, límite y orden estable de entrada al ranking.

**Criterio de salida:** el dominio puede probarse sin infraestructura y aplicación no importa Prisma ni el adaptador concreto.

### Paso 5 — Orquestar y persistir el intento

**Por qué:** el resultado debe conservar evidencia auditable y no quedar incoherente ante fallos parciales.

**Debe aplicar el usuario:** implementar el caso de uso con contexto tenant confiable, cargar dirección/dataset, ejecutar dominio y persistir intento, candidatos y selección en una transacción local.

**Archivos esperados:**

- `backend/src/modules/geocoding/application/`
- `backend/src/modules/geocoding/infrastructure/`
- `backend/src/modules/geocoding/geocoding.module.ts`

**Lote mecánico disponible para Codex:** registro de providers e imports/exports una vez aprobados los contratos.

**Verificación:** pruebas de servicio para los tres estados y rollback ante fallo insertando candidatos o selección.

**Criterio de salida:** una operación exitosa deja evidencia completa; una fallida no deja estado parcial ni cruza tenant/dirección/dataset.

### Paso 6 — Integrar con PostGIS y demostrar aislamiento

**Por qué:** mocks unitarios no prueban RLS, relaciones compuestas, geometría ni transacciones reales.

**Debe aplicar el usuario:** crear un runner/suite contra una base PostGIS aleatoria y desechable, aplicar migraciones, cargar un dataset sintético `READY` y dos tenants, y cubrir round-trip sin invertir longitud/latitud.

**Archivos esperados:** `backend/test/`, `backend/test/integration/` y documentación del runner.

**Lote mecánico disponible para Codex:** adaptar el patrón ya aprobado de runners GDB a un nuevo nombre/rutas cuando el usuario solicite expresamente ese lote.

**Verificación:** comando dedicado mediante el servicio `backend`, usando una URL administrativa de una instancia PostGIS separada; nunca la base compartida `sls`.

**Criterio de salida:** migraciones, flujo feliz, ambigüedad, no encontrado, rollback, coordenadas e aislamiento tenant pasan sobre persistencia real y la base temporal se elimina.

### Paso 7 — Verificar, documentar y cerrar

**Por qué:** implementación, verificación, documentación y commit son hechos distintos.

**Debe aplicar el usuario:** autorizar y ejecutar build y suites relevantes mediante Docker Compose; compartir la salida relevante y los commits cuando existan. El formato solo se comprueba si una regla vigente de cierre lo exige o el usuario lo solicita.

**Archivos esperados:** este plan, `docs/modules/geocode-01-report.md`, README de integración y tablero solo cuando el equipo acepte formalmente el ID.

**Lote mecánico disponible para Codex:** sincronización documental, conteos observados, enlaces y estado del plan; no crea commits salvo solicitud explícita con el skill correspondiente.

**Verificación:** build, unitarias del módulo, integración PostGIS y revisión del diff sin cambios ajenos.

**Criterio de salida:** aceptación satisfecha con comandos reproducibles, evidencia actual, documentación cruzada y límites explícitos.

## Paso actual

### Módulo cerrado para el alcance definido

Las siete suites unitarias y de arquitectura, el build y los seis escenarios e2e están aprobados. La integración usa un servidor PostGIS dedicado, crea una base aleatoria y elimina tanto la base como el contenedor al terminar. El informe final conserva comandos, decisiones, evidencia y límites. La implementación todavía no está confirmada en un commit y no incluye API, autenticación, revisión humana ni los algoritmos posteriores de `GEO-01` y planificación.

## Decisiones

| Fecha | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-09-28 | Separar `GEOCODE-01` de `GEO-01`. | El tablero limita `GEO-01` a validación de coordenadas y Haversine; geocodificar exige normalización, catálogo y ranking. | Los criterios de cierre no se mezclan y Haversine no se presenta como geocodificación. |
| 2026-09-28 | Reutilizar el catálogo y evidencia de GDB-02/GDB-03. | El esquema y las migraciones ya modelan el problema. | No se duplican direcciones, coordenadas o intentos en un modelo nuevo. |
| 2026-09-28 | Mantener el catálogo publicado como referencia compartida. | `AddressReference` no es tenant-owned; RLS protege los datos operativos privados. | La prueba tenant se concentra en dirección, intento, candidato y revisión, sin fingir que cada tenant posee su catálogo. |
| 2026-09-28 | Mantener QR fuera del módulo. | QR identifica/recibe paquetes y no resuelve una dirección en coordenadas. | Puede evolucionar sin bloquear el algoritmo geoespacial. |
| 2026-09-29 | Versionar el primer contrato como `geocode-v1`, seleccionar automáticamente desde `0.95` con margen `0.10` y desempatar finalmente por `referenceId`. | Hace verificable y reproducible la política inicial sin depender del orden de entrada. | Los cambios futuros de política requerirán otra versión y sus propias pruebas. |
| 2026-09-29 | Usar contribuciones binarias y explícitas: tipo `0.10`, vía `0.30`, generadora `0.25`, placa `0.30`, barrio `0.05`; redondear score y margen a cuatro decimales. | La política suma `1.00`, es explicable académicamente y coincide con la escala persistente `Decimal(5,4)`. | Un componente ausente o distinto aporta cero; dataset y municipio ajenos se excluyen antes del ranking. |
| 2026-09-29 | Prefiltrar por una clave estructurada delimitada de tipo y vía, por ejemplo `CALLE|80`. | Los fixtures persistentes usan claves como `CARRERA|53|82|15`; comparar con el texto visible nunca coincidiría y una clave completa impediría evaluar candidatos plausibles. | El puerto usa `searchKeyPrefix`; SQL acepta la clave exacta o el prefijo seguido de `|`, evitando colisiones como `8`/`80`. |
| 2026-09-29 | Generalizar el servidor temporal como `integration-postgres`. | El servidor solo aporta PostgreSQL/PostGIS aislado; la especialización pertenece a runners y bases aleatorias. | GDB y futuros módulos pueden reutilizar el mismo servicio secuencialmente sin tocar `sls-postgres`. |

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-09-28 | Auditoría inicial | Persistencia geoespacial y consumidores posteriores presentes; normalizador, ranking, caso de uso y pruebas de geocodificación ausentes. | Inspección de esquema, migraciones, módulos, pruebas, documentación, historial y árbol limpio; no se ejecutaron pruebas. | `333011b`; plan aún sin commit |
| 2026-09-28 | Recuperación de contexto | Se encontró un borrador no aplicado de `GEOCODE-01` dentro de `stash@{0}` y se reconcilió con la rama actual. | Lectura de `stash@{0}^3:docs/plans/geocode-01.md`; stash preservado. | no aplica |
| 2026-09-28 | Inicio del paso 1 | El usuario confirmó el comienzo guiado de `GEOCODE-01`; todavía no existen archivos de implementación del módulo. | Revisión del árbol y búsqueda en módulos/pruebas; paso pendiente de evidencia. | sin commit |
| 2026-09-28 | Cambio concurrente de árbol | La rama activa pasó a `develop` y `backend/package.json` recibió un script `prisma:studio` ajeno a GEOCODE-01. | Diff inspeccionado; cambio preservado y excluido del módulo. | sin commit |
| 2026-09-28 | Paso 1A | El usuario creó `geocoding.types.ts` con estados, componentes, referencias, desglose, candidatos ordenados y decisión de dominio. | `docker compose exec backend npm run build`: aprobado. Contrato inspeccionado sin dependencias de NestJS, Prisma o PostGIS. | sin commit |
| 2026-09-29 | Paso 1B iniciado | `GeocodingInput` y el stub puro `DeterministicGeocoder` están presentes; la especificación existe todavía con un fixture vacío. | Inspección de los tres archivos del módulo; pruebas aún no ejecutadas porque el fixture no está completo. | sin commit |
| 2026-09-29 | Fixtures del paso 1B | La especificación ya contiene factories y referencias exacta, ambigua y diferente, sin dependencias externas. | Inspección del fixture; queda ajustar el barrio ausente y añadir/ejecutar las cinco pruebas rojas. | sin commit |
| 2026-09-29 | Paso 1 cerrado | El usuario ejecutó la suite de aceptación completa con el stub intencional. | 1 suite fallida, 5 pruebas fallidas; todas las trazas terminan únicamente en `DeterministicGeocoder.decide` con `NOT_IMPLEMENTED`. Evidencia aportada por el usuario y código inspeccionado. | sin commit |
| 2026-09-29 | Fase roja del paso 2 | Se añadieron `NormalizedAddress`, `InvalidAddressError`, el stub de `AddressNormalizer` y diez casos para CALLE/CARRERA, abreviaturas y errores estables. | 1 suite fallida, 10 pruebas fallidas; normalizaciones terminan en `NOT_IMPLEMENTED` y rechazos reciben `Error` en vez del error tipado esperado. Evidencia adjunta por el usuario y código inspeccionado. | sin commit |
| 2026-09-29 | Paso 2 cerrado | El normalizador canónico de CALLE/CARRERA y sus errores tipados quedaron implementados como dominio puro. | Usuario: 1 suite y 10/10 pruebas aprobadas. Codex: build aprobado; suite principal 5/5 roja exclusivamente por `DeterministicGeocoder.NOT_IMPLEMENTED`. | sin commit |
| 2026-09-29 | Fase roja del paso 3 | Se añadió `datasetId` al input y se cubrieron exclusión contextual, desglose ponderado, umbral `0.95` y margen `0.10`. | Ejecución independiente: 1 suite fallida, 11 pruebas fallidas, todas exclusivamente por `DeterministicGeocoder.NOT_IMPLEMENTED`. | sin commit |
| 2026-09-29 | Paso 3 en verificación | El usuario implementó normalización integrada, filtros, scoring ponderado, ranking, margen y selección determinista. | Usuario: 2 suites, 21/21 pruebas y build aprobados. Inspección de código correcta; `prettier --check` reporta los 6 archivos del módulo. | sin commit |
| 2026-09-29 | Formato del paso 3 | El usuario aplicó Prettier al módulo; solo `deterministic-geocoder.ts` fue modificado y los otros cinco archivos permanecieron sin cambios. | La comprobación previa detectó únicamente ese archivo; queda ejecutar formato, pruebas y build después de la corrección. | sin commit |
| 2026-09-29 | Paso 3 cerrado | El usuario repitió todas las comprobaciones después de aplicar el formato. | `prettier --check`: aprobado; 2 suites y 21/21 pruebas: aprobadas; `npm run build`: aprobado. | sin commit |
| 2026-09-29 | Paso 4A cerrado | Se creó el puerto `GeocodingCatalogPort` en aplicación con consulta acotada, resultado `READY` y `null` para dataset no disponible. | Inspección: solo importa `GeocodingReference` desde dominio; build ejecutado por Codex dentro de Docker: aprobado. | sin commit |
| 2026-09-29 | Fase roja del paso 4B | Se crearon el stub `PrismaGeocodingCatalog` y cuatro pruebas para disponibilidad, vacío, mapeo y SQL parametrizado. | Usuario: 1 suite fallida, 4/4 pruebas fallidas exclusivamente por `PrismaGeocodingCatalog.NOT_IMPLEMENTED`. La auditoría de fixtures detectó que el contrato debe usar `searchKeyPrefix` antes de implementar. | sin commit |
| 2026-09-29 | Contrato corregido del paso 4B | Puerto y pruebas ahora usan `searchKeyPrefix: 'CALLE|80'` y esperan coincidencia exacta o prefijo delimitado. | Codex ejecutó la suite en Docker: 1 suite fallida y 4/4 pruebas fallidas exclusivamente por `NOT_IMPLEMENTED`. | sin commit |
| 2026-09-29 | Paso 4 cerrado | El usuario implementó la consulta de catálogo en transacción `RepeatableRead`, con dataset `READY`, clave delimitada, orden, límite y mapeo de geometría. | Usuario: 1 suite y 4/4 pruebas aprobadas; build aprobado. | sin commit |
| 2026-09-29 | Paso 5A cerrado | Se definieron puertos de aplicación para cargar direcciones por tenant y guardar una decisión de geocodificación atómicamente. | Inspección de imports: sin NestJS, Prisma o infraestructura; build ejecutado por Codex en Docker: aprobado. | sin commit |
| 2026-09-29 | Fase roja del paso 5B | Se crearon el contrato, stub y cuatro pruebas de `GeocodeAddressService` para cortes tempranos, coincidencia y `NOT_FOUND`. | Usuario: 1 suite fallida y 4/4 pruebas fallidas exclusivamente por `GeocodeAddressService.NOT_IMPLEMENTED`. | sin commit |
| 2026-09-29 | Paso 5C cerrado | El caso de uso carga por tenant, construye la clave primaria de vía, consulta el catálogo, delega al dominio y persiste resultados esperados mediante el puerto atómico. | Codex: 1 suite y 4/4 pruebas aprobadas; build aprobado; aplicación sin imports externos. | sin commit |
| 2026-09-29 | Fase roja del paso 5D | Se crearon el stub y dos pruebas de `PrismaGeocodingAddress` para ausencia y lectura privada. | Usuario: 1 suite fallida y 2/2 pruebas fallidas exclusivamente por `PrismaGeocodingAddress.NOT_IMPLEMENTED`. | sin commit |
| 2026-09-29 | Revisión del paso 5E | La consulta por `tenantId + id` fue implementada y sus dos pruebas, además del build, pasan. | Evidencia aportada por el usuario. Auditoría contra la migración detectó que `Address` usa RLS forzado y requiere `app.tenant_id`; la prueba unitaria actual no simula ese contexto. | sin commit |
| 2026-09-29 | Paso 5F cerrado | La lectura privada ahora establece `app.tenant_id` dentro de la transacción y conserva el filtro explícito por tenant y dirección. | Usuario: 1 suite y 2/2 pruebas aprobadas; build aprobado. | sin commit |
| 2026-09-29 | Fase roja del paso 5G | Tras guardar correctamente el stub, la suite del escritor alcanzó `saveAtomically` para `NOT_FOUND`, `MATCHED` y fallo de inserción. | Codex: 1 suite fallida y 3/3 pruebas fallidas por `NOT_IMPLEMENTED`; el primer intento con archivo vacío no se contó como evidencia funcional. | sin commit |
| 2026-09-29 | Paso 5H en verificación | El escritor establece RLS, crea intento, inserta candidatos con geometría, selecciona por el ID persistido y propaga fallos. | Usuario: `NOT_FOUND` y fallo de inserción pasan; build pasa. `MATCHED` llega hasta una aserción textual que esperaba funciones SQL sin espacios, aunque los parámetros y su orden ya coinciden. | sin commit |
| 2026-09-29 | Paso 5H cerrado | Se ajustó la aserción SQL para tolerar espacios sin debilitar la verificación del orden longitud/latitud. | Usuario: 1 suite y 3/3 pruebas aprobadas; build aprobado. | sin commit |
| 2026-09-29 | Paso 5I cerrado | `GeocodingModule` registra los tres adaptadores, construye y exporta solo `GeocodeAddressService`; `AppModule` importa el módulo. | Inspección del wiring y build ejecutado por Codex en Docker: aprobado. | sin commit |
| 2026-09-29 | Paso 5J cerrado | Se añadió una prueba estática de imports para dominio y aplicación. | Codex: 1 suite y 2/2 pruebas aprobadas. | sin commit |
| 2026-09-29 | Inicio del paso 6 | Se crearon el script `test:geocode-01`, el runner y la ruta de la suite e2e. | Inspección: sintaxis del runner válida; el nombre de base contiene por error un espacio antes de `sls_geocode01_` y la suite tiene 0 bytes. No se ejecutó contra ninguna base. | sin commit |
| 2026-09-29 | Flujo feliz del paso 6 | Se corrigió el prefijo, se creó el fixture real y se verificaron `MATCHED`, selección y round-trip `ST_X`/`ST_Y`. | Usuario: 10 migraciones aplicadas; 1/1 e2e aprobada; base `sls_geocode01_e7c166f4eeb142079e6dc08017b30eb8` eliminada. Evidencia provisional porque la URL administrativa apuntó al servicio compartido `postgres`; no repetir allí. | sin commit |
| 2026-09-29 | Infraestructura dedicada del paso 6 | Se añadió `integration-postgres` en un Compose complementario y un `Makefile` con `integration-test TEST=<id>` limitado a `gdb-01`, `gdb-05`, `gdb-06` y `geocode-01`. | Inspección de configuración: el objetivo valida el ID antes de levantar el servidor, inyecta la URL administrativa dedicada y permite retirarlo con `make integration-db-down`; ejecución funcional aún pendiente. | sin commit |
| 2026-09-29 | Escenarios e2e ampliados | La suite contiene `MATCHED`, `NOT_FOUND`, rechazo de dataset `STAGING` y ocultamiento de dirección entre tenants, con conteos administrativos antes/después. | Código inspeccionado; los cuatro casos todavía no se han ejecutado juntos sobre `integration-postgres`. | sin commit |
| 2026-09-29 | Ejecución dedicada del paso 6 | El objetivo parametrizado levantó `sls-integration-postgres`, aplicó las 10 migraciones en una base aleatoria, ejecutó los cuatro escenarios y eliminó tanto la base como el contenedor temporal. | Usuario: 1 suite y 4/4 pruebas e2e aprobadas (`MATCHED`, `NOT_FOUND`, `STAGING`, aislamiento tenant); build aprobado dentro del runner; base `sls_geocode01_d8542f8ae0124ce9be769da8ca959423` eliminada. | sin commit |
| 2026-09-29 | Ambigüedad persistente del paso 6 | Se añadieron dos referencias exactas empatadas para una dirección y se comprobó que se conservan como candidatos sin selección automática. | Usuario: 1 suite y 5/5 pruebas e2e aprobadas; `REVIEW_REQUIRED` aprobado junto con los cuatro escenarios anteriores; base `sls_geocode01_58b7a6fcf24b4ce8838cc8acadcaba7a` eliminada. | sin commit |
| 2026-09-29 | Paso 6 cerrado | Un trigger temporal forzó el fallo al insertar el candidato; la consulta administrativa comprobó que la transacción no dejó intento ni candidatos parciales. | Usuario: 1 suite y 6/6 pruebas e2e aprobadas; build y 10 migraciones aprobados; base `sls_geocode01_96065cb7eb7c44e7b573716de7de5f3b` y contenedor dedicado eliminados. | sin commit |
| 2026-09-29 | Paso 7 y módulo cerrados | Se ejecutaron juntas las siete suites del módulo y se sincronizaron plan, informe y README de integración. | Usuario: 7 suites y 36/36 pruebas aprobadas; build aprobado. Evidencia e2e vigente: 6/6. | sin commit |

## Cierre

- [x] Aceptación funcional satisfecha.
- [x] Pruebas unitarias relevantes aprobadas.
- [x] Persistencia y aislamiento por tenant comprobados en PostGIS desechable.
- [x] Round-trip de coordenadas sin inversión comprobado.
- [x] Informe actualizado con evidencia vigente.
- [x] Trabajo fuera de alcance documentado.
- [x] Estado del plan contrastado con código, pruebas y commits; implementación todavía sin commit.
