# SEQ-01 — Ordenamiento heurístico de paradas: Nearest-Neighbor y 2-opt

Estado: **DONE para el alcance definido**.

Plan de trabajo: [SEQ-01](../plans/seq-01.md).

## Alcance verificado

- **Decisión y ADR-004:** [ADR-004: Ordenamiento heurístico determinista de paradas (Nearest-Neighbor y 2-opt)](../adr/004-deterministic-stop-ordering.md).
- **Abstracción Strategy (GoF):** Interfaz inmutable `StopOrderingAlgorithm` compartida por `NearestNeighborOrdering` y `TwoOptOrdering` en `domain/algorithms/`.
- **Contratos inmutables de dominio:** `StopOrderingName`, `StopCandidateInput`, `StopOrderingOptions`, `OrderedStop`, `TwoOptTerminationReason`, `OrderedRouteSequence` y códigos estables de error `InvalidStopOrderingInputError` en `domain/models/`.
- **Validación pura de entrada y precedencia determinista:** `validateStopOrderingInput` en `domain/algorithms/stop-ordering-input.ts` asegurando aislamiento de `tenantId`, estructura, no duplicidad de IDs, coordenadas válidas de origen y paradas, y opciones de refinamiento.
- **Materialización de circuito cerrado:** `materializeRouteSequence` y `calculateCircuitDistance` en `domain/algorithms/route-sequence.ts`, midiendo distancias tramo a tramo, acumuladas y retorno al depósito de origen, con congelación profunda (`Object.freeze`).
- **Heurística Base (Nearest-Neighbor):** `NearestNeighborOrdering` partiendo de `origin`, seleccionando el vecino más cercano bajo Haversine en metros y resolviendo empates por comparación ordinal estricta de `packageId` ascendente (`<` / `>`).
- **Heurística de Refinamiento (2-opt acotado):** `TwoOptOrdering` inicializado fijamente con Nearest-Neighbor, política *first-improvement* en orden lexicográfico de pares `(i, j)`, evaluación completa del circuito para evitar anomalías de punto flotante en deltas de aristas, y parada controlada por ruta trivial ($n \le 2$), falta de mejora superior al umbral o agotamiento de `maxIterations`.
- **Servicio de Aplicación:** `OrderRouteStopsService` en `application/` que valida la correspondencia y membresía exacta de candidatos contra una propuesta de `CLUSTER-01`, comprobando aislamiento de tenant y delegando el cálculo a la estrategia inyectada sin acoplamiento a frameworks.
- **Fronteras arquitectónicas:** Pruebas automatizadas en `test/stop-ordering-architecture.spec.ts` y `test/clustering-architecture.spec.ts` garantizando que el dominio y aplicación no importen NestJS, Prisma, infraestructura ni capas externas.

## Implementación por puntos

### Punto 1 — ADR-004 y Contratos de Dominio
- **Objetivo:** Establecer el modelo de circuito cerrado, el aislamiento estricto por tenant y las interfaces inmutables de la estrategia.
- **Decisión:** Depósito de origen obligatorio, retorno al depósito incluido en el total pero no como parada adicional, desempate ordinal por `packageId` y error tipado `InvalidStopOrderingInputError`.
- **Archivos:**
  - `docs/adr/004-deterministic-stop-ordering.md`
  - `backend/src/modules/route-planning/domain/models/stop-ordering.types.ts`
  - `backend/src/modules/route-planning/domain/models/invalid-stop-ordering-input.error.ts`
  - `backend/src/modules/route-planning/domain/algorithms/stop-ordering-algorithm.ts`
  - `backend/src/modules/route-planning/domain/index.ts`
- **Resultado:** Modelos puros, inmutables y compilación limpia con `nest build`.
- **Evidencia:** 4 tests de arquitectura pasando inmediatamente.
- **Pendiente:** Ninguno.

### Punto 2 — Fixtures y Pruebas Unitarias Normalizadas
- **Objetivo:** Definir oráculos independientes ($u = R \cdot \pi / 180$) y suites de prueba exhaustivas bajo `/sls-test-normalization` antes de la lógica productiva.
- **Decisión:** Fixtures congelados con escenarios canónicos (vacío, un punto, colineales, triángulo equidistante, coincidentes, empates ordinales y circuito con cruce eliminable).
- **Archivos:**
  - `backend/src/modules/route-planning/test/fixtures/stop-ordering.fixtures.ts`
  - `backend/src/modules/route-planning/test/stop-ordering-architecture.spec.ts`
  - `backend/src/modules/route-planning/test/stop-ordering-input.spec.ts`
  - `backend/src/modules/route-planning/test/nearest-neighbor-ordering.spec.ts`
  - `backend/src/modules/route-planning/test/two-opt-ordering.spec.ts`
  - `backend/src/modules/route-planning/test/order-route-stops.service.spec.ts`
- **Resultado:** 5 suites creadas cubriendo CA-01 a CA-10; arquitectura verde y suites de comportamiento inicialmente en fase roja controlada (37 tests fallando deterministamente por `Not implemented`).
- **Evidencia:** Ejecución registrada en Docker.
- **Pendiente:** Ninguno.

### Punto 3 — Validación y Heurística Nearest-Neighbor
- **Objetivo:** Resolver la ruta base determinista y la materialización de métricas de circuito cerrado.
- **Decisión:** Validador puro desacoplado, desempate ordinal estricto UTF-16 y materializador de distancias con retorno independiente.
- **Archivos:**
  - `backend/src/modules/route-planning/domain/algorithms/stop-ordering-input.ts`
  - `backend/src/modules/route-planning/domain/algorithms/route-sequence.ts`
  - `backend/src/modules/route-planning/domain/algorithms/nearest-neighbor-ordering.ts`
- **Resultado:** 22 tests unitarios pasando en verde (12 de validación y 10 de NN).
- **Evidencia:** `stop-ordering-input.spec.ts` y `nearest-neighbor-ordering.spec.ts` 100% aprobadas.
- **Pendiente:** Ninguno.

### Punto 4 — Heurística de Refinamiento 2-opt Acotado
- **Objetivo:** Mejorar la ruta base eliminando cruces sin empeorar nunca el recorrido y garantizando parada determinista.
- **Decisión:** Composición fija con NN; búsqueda *first-improvement* en orden ascendente $(i, j)$; evaluación completa del circuito; terminación por `TRIVIAL_ROUTE`, `NO_IMPROVEMENT` o `MAX_ITERATIONS`.
- **Archivos:**
  - `backend/src/modules/route-planning/domain/algorithms/two-opt-ordering.ts`
- **Resultado:** 11 tests unitarios pasando en verde, comprobando reducción de distancia en circuito con cruce, estabilidad en rutas colineales, respeto de tolerancias e inmutabilidad de salida.
- **Evidencia:** `two-opt-ordering.spec.ts` 100% aprobada.
- **Pendiente:** Ninguno.

### Punto 5 — Servicio de Aplicación y Correspondencia de Propuesta
- **Objetivo:** Conectar las propuestas de `CLUSTER-01` con las estrategias de ordenamiento sin acoplarse a base de datos ni frameworks.
- **Decisión:** Inyección de Strategy por constructor; validación de correspondencia estricta (cardinalidad y coincidencia de IDs sin faltantes ni extras) y aislamiento de tenant.
- **Archivos:**
  - `backend/src/modules/route-planning/application/order-route-stops.service.ts`
- **Resultado:** 6 tests unitarios pasando en verde, comprobando delegación única a la Strategy y rechazo de inconsistencias.
- **Evidencia:** `order-route-stops.service.spec.ts` 100% aprobada.
- **Pendiente:** Ninguno.

## Decisiones técnicas

1. **Circuito cerrado con retorno explícito:** La ruta modela una salida y regreso al depósito de la empresa. La distancia a la última parada (`distanceToLastStopMeters`) y el regreso (`returnToOriginMeters`) se reportan por separado y se integran en `totalDistanceMeters`.
2. **Determinismo ordinal absoluto:** Los desempates en distancias idénticas se resuelven mediante comparación ordinal JavaScript de cadenas (`a < b ? -1 : a > b ? 1 : 0`), garantizando resultados reproducibles independientes del orden de entrada de la colección o del locale del servidor.
3. **Inicialización canónica de 2-opt:** 2-opt nunca parte de la colección desordenada del usuario ni de un orden aleatorio; se inicializa estrictamente con la solución de Nearest-Neighbor.
4. **Evaluación de circuito completo en 2-opt:** Cada permutación candidata recalcula la suma total de izquierda a derecha para prevenir diferencias numéricas debidas a la no asociatividad de punto flotante en deltas locales de aristas.
5. **Aislamiento por Tenant en la frontera:** Toda operación verifica que `options.tenantId`, los candidatos y la propuesta pertenezcan al mismo tenant, rechazando la ejecución completa si existe mezcla de datos.

## Verificación reproducible

Ejecutado en el entorno de contenedores Docker oficial del repositorio:

```bash
# 1. Compilación TypeScript sin errores
docker compose exec backend npm run build

# 2. Pruebas exclusivas del módulo SEQ-01 (5 suites / 52 tests)
docker compose exec backend npm test -- --runInBand src/modules/route-planning/test/stop-ordering- src/modules/route-planning/test/nearest-neighbor-ordering.spec.ts src/modules/route-planning/test/two-opt-ordering.spec.ts src/modules/route-planning/test/order-route-stops.service.spec.ts

# 3. Suite completa del módulo route-planning (21 suites / 193 tests)
docker compose exec backend npm test -- --runInBand modules/route-planning/test

# 4. Regresión global completa del backend (51 suites / 413 tests)
docker compose exec backend npm test -- --runInBand
```

### Resumen de resultados de pruebas
- **Suites ejecutadas:** 51 suites de 51 pasadas (100%).
- **Tests ejecutados:** 413 tests de 413 aprobados (0 fallos).
- **Cobertura de criterios:** CA-01 a CA-10 satisfechos con evidencia comprobada.

## Limitaciones conocidas

- **Modelo de distancia:** Utiliza distancia ortodrómica Haversine esférica ($R = 6\,371\,000\text{ m}$), no distancias de red vial ni tiempos con congestión vehicular.
- **Heurística local:** Nearest-Neighbor y 2-opt son heurísticas de aproximación rápida que eliminan cruces locales pero no garantizan la solución óptima global del TSP.
- **Complejidad de evaluación completa:** La reevaluación completa del circuito en 2-opt tiene coste temporal $O(n^2 + I \cdot n^3)$, óptimo para el tamaño de cluster previsto para el MVP ($n \le 100$ paquetes por propuesta).
- **Asignación transaccional:** `SEQ-01` calcula la secuencia geométrica; la creación de entidades persistidas `Route` y `RouteStop`, reserva de flota y transacciones de base de datos corresponden a los módulos posteriores `ASSIGN-01` y `ROUTE-01`.
