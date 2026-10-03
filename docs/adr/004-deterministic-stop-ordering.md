# ADR-004: Ordenamiento heurístico determinista de paradas (Nearest-Neighbor y 2-opt)

Fecha: 2026-10-02

Estado: Aceptado para implementación

## Contexto

En Smart Logistics System (SLS), los paquetes agrupados en propuestas de clustering (`CLUSTER-01`) deben ordenarse en una secuencia de paradas eficiente antes de la revisión del coordinador o su posterior asignación operativa.

Requisitos clave del proyecto (según `AGENTS.md` §5, §8, §9 y §12):
1. **Algoritmos manuales propios**: Implementar heurísticas comprensibles y reproducibles sin librerías externas de optimización ni solvers de caja negra (sin VRP solvers o Google OR-Tools).
2. **Determinismo estricto**: La secuencia debe ser 100% idéntica ante cualquier permutación de entrada de paquetes, sin números aleatorios, timestamps ni dependencias de locale o entorno.
3. **Circuito cerrado**: La ruta parte de un depósito explícito (`origin`), visita cada parada y retorna al depósito. La distancia de retorno se mide por separado y se incluye en la distancia total.
4. **Patrón GoF Strategy**: Las heurísticas (`NearestNeighborOrdering` y `TwoOptOrdering`) deben compartir la misma interfaz inmutable `StopOrderingAlgorithm`.
5. **Clean Architecture y Aislamiento por Tenant**: Las entidades y algoritmos de dominio son puros (sin `@Injectable()`, sin Prisma, sin I/O) y exigen validación estricta de `tenantId`.

## Decisión

### 1. Modelo de Circuito y Paradas
- El depósito de origen (`origin`) es obligatorio y no se infiere de los paquetes.
- Cada paquete de la propuesta constituye una parada individual con número de secuencia `1..n`.
- La distancia acumulada de la última parada excluye el retorno; la distancia total de la ruta incluye el retorno al origen.
- Se reutilizan las distancias Haversine en metros mediante `calculateHaversineDistance` (`GEO-01`).

### 2. Heurística Base: Nearest-Neighbor Determinista
- Comienza en `origin`. En cada iteración selecciona el paquete no visitado a menor distancia Haversine.
- **Desempate determinista**: En caso de empate exacto de distancia, se desempatan por comparación ordinal estricta de `packageId` ascendente (`<` / `>`).

### 3. Heurística de Refinamiento: 2-opt Acotado (*First-Improvement*)
- **Inicialización fija**: 2-opt siempre toma como punto de partida la secuencia canónica generada por Nearest-Neighbor (no acepta secuencias arbitrarias como entrada).
- **Exploración determinista**: Examina pares de índices $(i, j)$ en orden lexicográfico ascendente ($0 \le i < j \le n-1$, omitiendo la inversión completa de la ruta $i=0, j=n-1$).
- **Política de aceptación**: *First-improvement*. Se acepta la primera inversión que reduzca estrictamente la distancia total del circuito por encima de `minImprovementMeters`. Al aceptar un intercambio, se reinician los bucles de exploración.
- **Evaluación completa**: Para evitar anomalías de precisión de punto flotante en deltas de aristas, cada candidato evalúa la distancia total completa del circuito usando la misma secuencia de suma que la materialización final.
- **Parada acotada**: Finaliza por ruta trivial ($n \le 2$, `TRIVIAL_ROUTE`), por ausencia de mejora que supere el umbral (`NO_IMPROVEMENT`) o al alcanzar `maxIterations` (`MAX_ITERATIONS`).

### 4. Manejo de Errores y Aislamiento de Tenant
- Se define `InvalidStopOrderingInputError` con razones tipadas (`TENANT_MISMATCH`, `INVALID_ORIGIN`, `DUPLICATE_PACKAGE_ID`, etc.).
- Todo candidato u opción debe pertenecer al mismo `tenantId`.

## Consecuencias

### Positivas
- Trazabilidad y determinismo total en pruebas automatizadas y en producción.
- Contratos inmutables protegidos con `readonly` y `Object.freeze`.
- Intercambiabilidad limpia de estrategias bajo el patrón Strategy.

### Limitaciones
- Haversine mide distancia ortodrómica geográfica, no tiempos ni distancias viales reales.
- Heurísticas locales: no garantizan el óptimo global del TSP.
- Complejidad $O(n^2 + I \cdot n^3)$ para 2-opt con evaluación completa del circuito. Adecuado para el tamaño de clusters del MVP ($n \le 100$ paquetes por ruta).