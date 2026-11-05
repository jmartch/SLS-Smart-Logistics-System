# Plan de SEQ-01 — Ordenamiento heurístico de paradas: Nearest-Neighbor y 2-opt

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `SEQ-01` |
| Dominio | Planificación de rutas: secuencia de visitas y distancia del circuito |
| Prioridad | `P1` |
| Estado general | `DONE` |
| Responsable principal | Humberto (`USER`) |
| Rama observada | `develop` |
| Última auditoría | 2026-10-02, America/Bogota |
| Commit auditado | `ba41303` — integración de CLUSTER-01 |
| Informe previsto | `docs/modules/seq-01-report.md` — por crear en el paso 7 |
| Dependencias | `GEO-01`; `CLUSTER-01` para composición con propuestas |
| Consumidores posteriores | `ASSIGN-01`, `ROUTE-01` y revisión del coordinador |

`USER` identifica la implementación conceptual a cargo de Humberto. `CODEX_MECHANICAL` identifica documentación, verificación y transformaciones repetitivas determinadas. Esta entrega crea el plan; los contratos, algoritmos, ADR-004 y pruebas descritos abajo son **propuestos**, no implementados ni verificados por este documento.

## Alcance

### Incluido

- Una llamada ordena los paquetes de una propuesta, con un único tenant y un depósito fijo `origin`. Cada paquete constituye una parada, incluso si varios comparten coordenadas.
- Nearest-Neighbor manual desde el depósito, con Haversine en metros, desempate ordinal de `packageId` y secuencia `1..n`.
- Circuito cerrado: depósito → todas las paradas → depósito. El retorno se mide por separado y se incluye en el total.
- Refinamiento manual 2-opt, inicializado siempre con Nearest-Neighbor, determinista y acotado por pasadas y mejora mínima.
- Strategy mediante `StopOrderingAlgorithm`; ambas estrategias intercambiables bajo el mismo contrato.
- Contratos inmutables, errores tipados, validación completa antes de calcular y salida sin efectos laterales.
- Servicio de aplicación puro que verifica la pertenencia de candidatos a una propuesta de CLUSTER-01 y delega el cálculo a la estrategia inyectada.
- Pruebas de distancias, determinismo, conservación de paquetes, aislamiento de tenant, inmutabilidad, parada y fronteras arquitectónicas; ADR y evidencia reproducible en Docker.

AGENTS.md §5/12 considera 2-opt opcional para el MVP general. **El encargo actual lo incluye expresamente en SEQ-01**: cerrar este plan requiere ambas estrategias. Esto aumenta el alcance de este módulo sin cambiar las prioridades del tablero global.

### Fuera de alcance

- Garantizar un óptimo global, resolver TSP/VRP exactamente, usar solvers o librerías externas de optimización.
- Distancia vial, sentidos de circulación, tráfico, ETA, geocodificación, ventanas horarias, prioridades/deadlines o tiempos de servicio.
- Rutas abiertas, múltiples depósitos, recogidas intercaladas y restricciones de precedencia. 2-opt presupone que cualquier inversión de visitas es admisible en este alcance.
- Reagrupar paquetes, cambiar vehículo/mensajero o recalcular/reservar capacidades. Se conserva exactamente la membresía de la propuesta.
- Crear rutas persistidas, `RouteStop`, asignaciones, historial, estados, eventos, colas, notificaciones, endpoints o pantallas.
- Fusionar varios paquetes en una sola parada por dirección. El depósito tampoco se convierte en un paquete ni recibe número de secuencia.
- Refactorizar deuda de otros módulos o ampliar pruebas de base de datos sin relación con SEQ-01.

Una secuencia es factible respecto del conjunto de visitas y del modelo geográfico adoptado. La factibilidad operativa requiere validación posterior en ASSIGN-01: capacidad vigente, tenant, zona, disponibilidad y restricciones del negocio. Ninguna heurística aquí promete una ruta óptima ni una autorización de despacho.

## Dependencias y fuentes

| Fuente | Uso |
| --- | --- |
| [AGENTS.md](../../AGENTS.md) §5 y §12 | Ordenamiento manual, Haversine, alcance del MVP y limitaciones de heurísticas |
| AGENTS.md §8–9, §17, §20–23, §25 y §28 | Clean Architecture, tenant, errores, pruebas, Docker, cierre y ADR |
| [Plantilla canónica](../../.agents/skills/sls-module-workflow/assets/module-plan-template.md) | Identidad, diagnóstico, pasos verificables, decisiones, bitácora y cierre |
| [GEO-01](geo-01.md) e [informe GEO-01](../modules/geo-01-report.md) | Coordenadas validadas e inmutables y distancia geográfica |
| [Coordinates](../../backend/src/modules/route-planning/domain/coordinates.ts) y [Haversine](../../backend/src/modules/route-planning/domain/haversine.ts) | Reutilizar `Coordinates.create` y `calculateHaversineDistance`; `EARTH_RADIUS_METERS = 6_371_000` |
| [CLUSTER-01](cluster-01.md), [informe CLUSTER-01](../modules/cluster-01-report.md) y [ADR-003](../adr/003-deterministic-capacity-clustering.md) | Snapshot de agrupamiento y partición por capacidad; las propuestas todavía no son asignaciones |
| [Contratos de clustering](../../backend/src/modules/route-planning/domain/models/clustering.types.ts) | `CapacityClusterProposal.packageIds`; `ClusteringResult.tenantId` |
| [Fachada de dominio](../../backend/src/modules/route-planning/domain/index.ts) | Exportación pública de tipos, error y estrategias |
| [Prueba de arquitectura existente](../../backend/src/modules/route-planning/test/clustering-architecture.spec.ts) | Base para verificar imports; complementar sus comprobaciones para el código nuevo |
| ADR-004 previsto: `docs/adr/004-deterministic-stop-ordering.md` | Registrar contrato, desempates, política de 2-opt, alternativas y consecuencias en el paso 1 |

El algoritmo puro depende directamente de GEO-01 y puede probarse con fixtures. El servicio necesita los contratos de CLUSTER-01, pero no ejecutarlo ni consultar una base de datos. La integración con identidad autenticada y datos operativos corresponde al llamador de planificación.

## Diagnóstico actual

1. Se inspeccionó el árbol limpio en `develop`, commit `ba41303`. No se localizaron implementación de Nearest-Neighbor/2-opt, plan de SEQ-01 ni ADR-004. El tablero conserva SEQ-01 en `TODO`.
2. GEO-01 existe: `Coordinates` valida números finitos y rangos, normaliza `-0` y congela las instancias. Haversine devuelve metros y acota su término intermedio para evitar errores numéricos en los extremos.
3. CLUSTER-01 existe y sus documentos registran cierre y pruebas aprobadas. `CapacityClusterProposal` contiene IDs, vehículo candidato y totales; **no contiene tenant ni coordenadas**. El tenant está en `ClusteringResult`. No añadir propiedades supuestas a ese contrato.
4. Hay código de caminos viales en route-planning, pero no sustituye el ordenamiento geográfico solicitado. SEQ-01 no debe importar esos adaptadores.
5. `ClusterPackagesService` importa `@nestjs/common` y usa `@Injectable()`. Aunque su informe lo describe como desacoplado, SEQ-01 seguirá la regla estricta actual: servicio de aplicación sin imports ni decoradores de NestJS, y composición externa cuando exista un consumidor real. No se refactoriza el servicio anterior en este plan.
6. La prueba de arquitectura existente prohíbe NestJS en dominio, pero no en aplicación. El paso 2 cubrirá explícitamente el nuevo servicio y sus dependencias; no se asumirá que la suite actual prueba toda la independencia requerida.
7. Esta auditoría leyó código, documentación y Git; **no ejecutó pruebas ni build**. Los resultados de módulos previos son evidencia histórica, no una nueva comprobación. No hay commit nuevo de SEQ-01.

## Contrato propuesto de entrada y salida

### Interfaces inmutables

Distribución prevista: modelos en `domain/models/stop-ordering.types.ts`, Strategy en `domain/algorithms/stop-ordering-algorithm.ts` e imports internos hacia `../coordinates` o el modelo correspondiente. El bloque siguiente presenta el contrato reunido para su revisión; no es un archivo ya existente.

```typescript
import type { Coordinates } from '../coordinates';

export type StopOrderingName = 'nearest-neighbor' | 'nearest-neighbor-two-opt';

export interface StopCandidateInput {
  readonly packageId: string;
  readonly tenantId: string;
  readonly coordinates: Coordinates;
}

export interface StopOrderingOptions {
  readonly tenantId: string;
  readonly origin: Coordinates;
  readonly twoOpt?: Readonly<{
    maxIterations: number;
    minImprovementMeters: number;
  }>;
}

export interface OrderedStop {
  readonly packageId: string;
  readonly tenantId: string;
  readonly coordinates: Coordinates;
  readonly sequence: number;
  readonly distanceFromPreviousMeters: number;
  readonly cumulativeDistanceMeters: number;
}

export type TwoOptTerminationReason =
  | 'TRIVIAL_ROUTE'
  | 'NO_IMPROVEMENT'
  | 'MAX_ITERATIONS';

export interface OrderedRouteSequence {
  readonly tenantId: string;
  readonly origin: Coordinates;
  readonly algorithm: StopOrderingName;
  readonly algorithmVersion: '1';
  readonly stops: readonly OrderedStop[];
  readonly distanceToLastStopMeters: number;
  readonly returnToOriginMeters: number;
  readonly totalDistanceMeters: number;
  readonly refinement: Readonly<{
    initialDistanceMeters: number;
    improvementMeters: number;
    iterations: number;
    acceptedSwaps: number;
    maxIterations: number;
    minImprovementMeters: number;
    terminationReason: TwoOptTerminationReason;
  }> | null;
}

export interface StopOrderingAlgorithm {
  readonly name: StopOrderingName;
  readonly version: '1';
  order(
    candidates: readonly StopCandidateInput[],
    options: StopOrderingOptions,
  ): OrderedRouteSequence;
}
```

### Semántica y reglas comunes

- `origin` es obligatorio; nunca inferirlo del primer paquete. El llamador obtiene el depósito de una configuración autorizada del tenant/zona. `Coordinates` no acredita pertenencia a un tenant.
- `options.tenantId` procede de identidad o metadatos confiables. Cada candidato debe coincidir exactamente con él. Validar igualdad protege el contrato interno, pero no sustituye autenticación ni filtros tenant-aware al cargar datos.
- IDs y tenant son cadenas no vacías y sin espacios externos; rechazar datos mal formados, sin recortar, cambiar mayúsculas ni reinterpretar IDs. Un mismo `packageId` repetido es error, aunque sus coordenadas coincidan.
- La API interna recibe instancias `Coordinates`, no DTOs ni objetos JSON. La frontera externa crea el VO con GEO-01. En runtime, comprobar presencia/tipo y validar sus valores mediante `Coordinates.create`; no copiar las reglas de rangos en otro algoritmo. Esto también rechaza objetos falsificados o casts inválidos de pruebas.
- Validar todo antes de devolver resultados; nunca omitir silenciosamente un paquete inválido ni devolver una ruta parcial.
- Coordenadas coincidentes son válidas. No deduplicar visitas; tramos de longitud cero son válidos.
- Entrada vacía válida al llamar directamente a la Strategy: `stops=[]`, las tres distancias de ruta son `0`. Una parada: secuencia `1`, ida y regreso medidos, sin intercambio 2-opt.
- El último acumulado excluye el regreso. El total lo incluye. No generar una parada adicional para el depósito.
- `twoOpt` ausente en `TwoOptOrdering`: usar `maxIterations=100` y `minImprovementMeters=0.000001` metros. Si se suministra, ambos campos son obligatorios: máximo entero seguro entre `0` y `1000`, tolerancia finita y no negativa. El límite superior es una política inicial de coste, no un SLA.
- `maxIterations=0` desactiva el refinamiento y devuelve la secuencia base. `NearestNeighborOrdering` valida opciones presentes para detectar errores de contrato, pero no las aplica; su `refinement` es `null`.
- En `TwoOptOrdering`, `iterations` cuenta pasadas iniciadas, no pares examinados; cada pasada acepta como máximo un intercambio. `acceptedSwaps <= iterations <= maxIterations`. Las opciones efectivas se conservan en los metadatos.
- `TRIVIAL_ROUTE` para `n <= 2`, con cero pasadas; prevalece sobre el límite cero. Para `n >= 3` y máximo cero: `MAX_ITERATIONS`. `NO_IMPROVEMENT` exige una pasada completa sin intercambio; significa ausencia de mejora superior a la tolerancia bajo esta vecindad, no optimalidad global.
- `readonly` protege el contrato estático. La implementación además construye y congela nuevos registros, array de paradas, metadatos y resultado. Copiar/normalizar coordenadas con GEO-01; no congelar ni modificar objetos del llamador. No usar `.sort()`/`.reverse()` directamente sobre la entrada.
- Versión fija de implementación, sin permitir que el cliente declare una versión ficticia; sin fecha, tiempo de ejecución, UUID, aleatoriedad ni estado retenido entre llamadas.

### Error tipado de dominio

Archivo previsto: `domain/models/invalid-stop-ordering-input.error.ts`.

```typescript
export type InvalidStopOrderingInputReason =
  | 'INVALID_TENANT_ID'
  | 'INVALID_CANDIDATES'
  | 'TENANT_MISMATCH'
  | 'INVALID_PACKAGE_ID'
  | 'DUPLICATE_PACKAGE_ID'
  | 'INVALID_ORIGIN'
  | 'MISSING_STOP_COORDINATES'
  | 'INVALID_STOP_COORDINATES'
  | 'INVALID_MAX_ITERATIONS'
  | 'INVALID_MIN_IMPROVEMENT'
  | 'INVALID_PROPOSAL'
  | 'PROPOSAL_PACKAGE_MISMATCH';

export class InvalidStopOrderingInputError extends Error {
  public readonly reason: InvalidStopOrderingInputReason;

  public constructor(reason: InvalidStopOrderingInputReason) {
    super(reason);
    this.name = 'InvalidStopOrderingInputError';
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

| Motivo | Ejemplo y tratamiento |
| --- | --- |
| `INVALID_TENANT_ID` | Contexto ausente, vacío o mal formado |
| `INVALID_CANDIDATES` | Colección que no es array o contiene registros nulos/no objetos |
| `TENANT_MISMATCH` | Candidato o snapshot de propuesta de otro tenant; error genérico sin exponer IDs/coordenadas ajenos |
| `INVALID_PACKAGE_ID` / `DUPLICATE_PACKAGE_ID` | ID mal formado o repetido; no deduplicar |
| `INVALID_ORIGIN` | Depósito ausente, no VO o valores inválidos |
| `MISSING_STOP_COORDINATES` / `INVALID_STOP_COORDINATES` | Destino ausente frente a VO/tipo/valores inválidos |
| `INVALID_MAX_ITERATIONS` / `INVALID_MIN_IMPROVEMENT` | Fracción, negativo, exceso del máximo, `NaN`/infinito o tipo incorrecto, según el campo |
| `INVALID_PROPOSAL` | Propuesta sin ID válido o con lista vacía/mal formada, IDs inválidos o repetidos; solo aplica al servicio |
| `PROPOSAL_PACKAGE_MISMATCH` | Candidatos faltantes o adicionales frente a `proposal.packageIds`; solo aplica al servicio |

Precedencia determinista para la Strategy: contexto tenant → estructura de colección → cualquier tenant distinto → IDs inválidos → duplicados → origen → cualquier coordenada ausente → cualquier coordenada inválida → opciones 2-opt. Evaluar por categorías sobre el conjunto completo, no lanzar el primer error dependiente del orden de entrada. Los errores no incluyen el índice de entrada ni datos de otro tenant. Traducir únicamente `InvalidCoordinatesError` conocido al motivo correspondiente; no ocultar fallos de programación con un `catch` genérico.

### Integración de aplicación y Strategy

Archivo previsto: `application/order-route-stops.service.ts`. Constructor con `StopOrderingAlgorithm` requerido, sin algoritmo por defecto ni selector por cadenas dentro del servicio. Un composition root futuro elegirá `new NearestNeighborOrdering()` o `new TwoOptOrdering()`; no registrar proveedores sin consumidor real.

Firma propuesta del servicio:

```typescript
execute(
  options: StopOrderingOptions,
  source: Readonly<{
    tenantId: string;
    proposal: CapacityClusterProposal;
  }>,
  candidates: readonly StopCandidateInput[],
): OrderedRouteSequence;
```

`source.tenantId` es el tenant del `ClusteringResult` confiable del cual se extrajo la propuesta; no es un dato de autorización suministrado libremente por el frontend. El snapshot de candidatos contiene **exactamente** los paquetes de esa propuesta, con sus coordenadas, no el catálogo entero. El llamador selecciona el subconjunto y debe comprobar que la propuesta realmente pertenece al resultado de clustering utilizado.

Flujo del servicio:

1. Validar contexto, estructura de `source` y colección; rechazar primero cualquier mezcla de tenants en source/candidatos.
2. Validar los IDs de candidatos y de propuesta. Comparar conjuntos y cardinalidades: ningún faltante, adicional ni duplicado. Usar `INVALID_PROPOSAL` para forma inválida y `PROPOSAL_PACKAGE_MISMATCH` para conjuntos diferentes.
3. Delegar a `algorithm.order(candidates, options)` una vez. La Strategy sigue validando sus propias precondiciones para uso independiente. Compartir utilidades puras si evita duplicar política.
4. Devolver la secuencia. El llamador conserva la asociación `proposalId → secuencia`; no inventar `routeId` ni modificar totales/capacidad de la propuesta.

El servicio no consulta tablas, no recibe clientes Prisma y no importa NestJS, infraestructura o presentación. La coherencia de zona, depósito y datos elegibles se obtiene por contratos del llamador y se revalida al asignar. El refinamiento cambia el orden, nunca la membresía: conserva las sumas de gramos/cm³ de CLUSTER-01 sin repetir sus cálculos.

## Especificación matemática y algorítmica

### Distancia y circuito

Sean `o` el origen, `P` el conjunto de paquetes con IDs únicos y `s₁..sₙ` una permutación de `P`. `d(a,b)` es `calculateHaversineDistance(a,b)`, en metros, usando `R = 6 371 000 m`. Para latitudes/longitudes en radianes:

```text
a = sin²((φ₂ − φ₁)/2) + cos(φ₁) cos(φ₂) sin²((λ₂ − λ₁)/2)
h = clamp(a, 0, 1)
d = 2R · atan2(√h, √(1 − h))

s₀ = o
legᵢ = d(sᵢ₋₁, sᵢ),                         i = 1..n
cumulativeᵢ = sum(legₖ, k = 1..i)
distanceToLastStop = cumulativeₙ,              o 0 si n = 0
returnToOrigin = d(sₙ, o),                     o 0 si n = 0
L(s) = distanceToLastStop + returnToOrigin
```

La fórmula documenta la dependencia; **no reimplementarla**. Usar `number` sin redondeo en selección, refinamiento y totales. La exactitud entera de capacidades no aplica a distancias trigonométricas. Redondear solo al presentar posteriormente al usuario.

Toda evaluación de `L` suma de izquierda a derecha en el orden del recorrido y añade el regreso al final. El materializador de salida usa exactamente esa regla, para que el total aceptado coincida con el reportado. Comparar distancias esperadas en tests con tolerancia explícita; el desempate NN usa igualdad exacta de los números calculados, nunca tolerancia.

### Nearest-Neighbor determinista

Comparación ordinal propuesta para cadenas: `a < b ? -1 : a > b ? 1 : 0`, por unidades de código UTF-16 de JavaScript. No usar `localeCompare`, orden numérico natural ni normalización dependiente del entorno.

```text
ORDER_NEAREST_NEIGHBOR(candidates, options):
  validar toda la entrada y normalizar/copiar los VO
  remaining ← copia de candidatos ordenada por packageId ordinal ascendente
  current ← origin
  route ← []

  mientras remaining no esté vacío:
    best ← ninguno
    bestDistance ← +infinito
    para cada candidate en remaining:
      distance ← d(current, candidate.coordinates)
      si best es ninguno
         o distance < bestDistance
         o (distance === bestDistance y candidate.packageId < best.packageId):
        best ← candidate
        bestDistance ← distance
    añadir best a route
    quitar únicamente best.packageId de remaining
    current ← best.coordinates

  devolver MATERIALIZE(route, origin, tenantId, 'nearest-neighbor', null)

MATERIALIZE(route, origin, tenantId, algorithm, refinement):
  previous ← origin
  cumulative ← 0
  stops ← []
  para i desde 0 hasta route.length − 1:
    leg ← d(previous, route[i].coordinates)
    cumulative ← cumulative + leg
    añadir un nuevo OrderedStop congelado:
      packageId, tenantId, coordinates, sequence = i + 1,
      distanceFromPreviousMeters = leg,
      cumulativeDistanceMeters = cumulative
    previous ← route[i].coordinates
  returnDistance ← 0 si route está vacía; en otro caso d(previous, origin)
  devolver resultado nuevo congelado con stops congelado,
    distanceToLastStopMeters = cumulative,
    returnToOriginMeters = returnDistance,
    totalDistanceMeters = cumulative + returnDistance,
    versión '1' y metadatos de refinamiento congelados cuando apliquen
```

No ordenar el resultado por ID después del cálculo: el orden final es el de visita. La ordenación inicial solo fija un recorrido canónico de candidatos. Si dos distancias difieren aunque sea poco, gana la menor; si son exactamente iguales, gana el menor ID.

### 2-opt determinista y acotado

`TwoOptOrdering` implementa la misma Strategy y usa NN como inicializador fijo. No recibe una secuencia arbitraria ni utiliza el orden de entrada como ruta inicial. El algoritmo GoF es **Strategy**; 2-opt es la heurística contenida en una implementación de esa estrategia.

Con índices `0..n−1`, invertir el segmento inclusivo `[i,j]` sustituye las aristas `(a,b)` y `(c,e)` por `(a,c)` y `(b,e)`, donde:

```text
a = origin si i = 0; de otro modo route[i−1]
b = route[i]
c = route[j]
e = origin si j = n−1; de otro modo route[j+1]

ganancia teórica = d(a,b) + d(c,e) − d(a,c) − d(b,e)
```

Haversine es simétrica; las aristas interiores invertidas conservan su longitud matemática. El depósito permanece fijo y el retorno participa en cada comparación. Omitir la inversión de toda la ruta (`i=0,j=n−1`): representa el mismo circuito al revés y no aporta una mejora geométrica. No intercambiar por igualdad ni elegir orientación por ID después del refinamiento.

Para esta primera versión se propone evaluar **el total completo de cada candidato**, con el mismo orden de suma que la salida. La expresión de cuatro aristas sirve para explicar el movimiento, pero no decide sola su aceptación: la suma IEEE 754 puede diferir ligeramente. Esta opción sacrifica coste asintótico a cambio de una regla directamente verificable para conjuntos pequeños.

```text
ORDER_TWO_OPT(candidates, options):
  validar toda la entrada y resolver opciones efectivas
  base ← ORDER_NEAREST_NEIGHBOR(candidates, options)
  route ← copia de las visitas de base, sin distancias/secuencias derivadas
  initialTotal ← base.totalDistanceMeters
  currentTotal ← initialTotal
  iterations ← 0
  acceptedSwaps ← 0

  si route.length <= 2:
    reason ← TRIVIAL_ROUTE
    ir a FINALIZAR

  reason ← MAX_ITERATIONS
  mientras iterations < maxIterations:
    iterations ← iterations + 1
    accepted ← falso
    para i desde 0 hasta n−2, en orden ascendente:
      para j desde i+1 hasta n−1, en orden ascendente:
        si i = 0 y j = n−1: continuar
        candidateRoute ← copia de route con [i,j] invertido
        candidateTotal ← L(candidateRoute)
        gain ← currentTotal − candidateTotal
        si candidateTotal < currentTotal y gain > minImprovementMeters:
          route ← candidateRoute
          currentTotal ← candidateTotal
          acceptedSwaps ← acceptedSwaps + 1
          accepted ← verdadero
          salir de AMBOS bucles de pares
    si accepted es falso:
      reason ← NO_IMPROVEMENT
      salir del mientras
    // Si hubo mejora, reiniciar pares desde (0,1) en la siguiente pasada.
    // Si consumió la última pasada, conservar MAX_ITERATIONS.

  FINALIZAR:
    refinement ← initialTotal, initialTotal − currentTotal,
      iterations, acceptedSwaps, opciones efectivas, reason
    devolver MATERIALIZE(route, origin, tenantId,
      'nearest-neighbor-two-opt', refinement)
```

Es política **first-improvement**: aceptar el primer par admisible que reduce el total más que la tolerancia, reiniciar el recorrido de pares y repetir. La tolerancia es un umbral de parada, nunca una autorización para empeorar. Con tolerancia cero acepta cualquier disminución estricta del total calculado. Con tolerancia positiva una mejora menor o igual al umbral se ignora. Si varias inversiones mejoran, decide el orden lexicográfico de `(i,j)`, no el tiempo ni un contenedor sin orden.

El número máximo de pasadas asegura parada incluso con tolerancia cero. Cada intercambio aceptado reduce estrictamente el total; por inducción, `L(final) <= L(NN)`. No se declara óptimo local si se agotó el límite. El mismo snapshot, estrategia, versión y opciones producen la misma salida completa bajo el mismo entorno numérico; no se promete identidad binaria entre implementaciones diferentes de funciones trigonométricas.

### Complejidad temporal y espacial

Sean `n` el número de candidatos y `I` el máximo de pasadas configurado.

| Etapa | Tiempo de peor caso | Espacio auxiliar máximo |
| --- | --- | --- |
| Validación, conjuntos e IDs canónicos | `O(n log n)` incluyendo ordenación | `O(n)` |
| Nearest-Neighbor | `O(n²)`; hasta `n(n+1)/2` distancias de selección, más materialización lineal | `O(n)` |
| Una pasada 2-opt de esta versión | `O(n³)`: `O(n²)` pares por `O(n)` copia/evaluación | `O(n)` reutilizando/liberando candidatos, sin acumularlos |
| NN + 2-opt acotado | `O(n² + I·n³)` para `I > 0`; con cero pasadas domina NN | `O(n)` más salida `O(n)` |
| Servicio: comprobar membresía y delegar | `O(n)` esperado con `Set`, más la Strategy | `O(n)` |

No atribuir `O(I·n²)` a una implementación que recalcula cada circuito. Una versión futura basada en delta de aristas puede alcanzar ese coste por exploración, pero necesita otra política explícita de confirmación numérica y pruebas. No construir matriz `n×n`, guardar todas las rutas candidatas ni introducir caches globales. Registrar tamaños y coste observado antes de fijar un límite operativo de paquetes.

## Criterios de aceptación verificables

| ID | Criterio y evidencia requerida |
| --- | --- |
| CA-01 | NN empieza en `origin` y selecciona en cada paso la menor distancia Haversine; tests con oráculos pequeños y revisión del algoritmo manual, sin dependencias externas |
| CA-02 | Empates exactos se resuelven por `packageId` ordinal ascendente; probar coordenadas iguales, distancias simétricas y IDs cuyo orden ordinal difiere del natural |
| CA-03 | Todos los IDs válidos aparecen exactamente una vez, secuencias `1..n`, sin depósito como parada; vacíos y uno/dos paquetes definidos para ambas estrategias |
| CA-04 | Cada tramo, acumulado, regreso y total coincide con las ecuaciones en metros; casos colineales/triángulo y recálculo después de invertir; números finitos no negativos |
| CA-05 | Ambas estrategias producen igualdad profunda de salida para ejecuciones repetidas y todas las permutaciones de un fixture pequeño, incluyendo `proposal.packageIds` en el servicio; sin mutación de entrada y con salida inmutable |
| CA-06 | 2-opt parte de NN, solo acepta disminuciones estrictas superiores al umbral y reduce el recorrido en un fixture conocido mejorable; una ruta sin mejora conserva su orden; final nunca peor que NN |
| CA-07 | Orden de exploración y primera mejora fijos; máximo cero, una pasada, límite agotado, tolerancia cero/alta y ruta trivial prueban contadores y motivos de parada; opciones inválidas se rechazan |
| CA-08 | Origen inválido, coordenadas ausentes/incorrectas, IDs duplicados y tenant mezclado fallan con error tipado, sin resultado parcial; permutar entradas inválidas conserva el motivo conforme a precedencia |
| CA-09 | Servicio rechaza propuestas de otro tenant, listas duplicadas, faltantes y extras antes de invocar Strategy; un doble prueba delegación única y estrategias reales prueban misma membresía sin alterar propuesta/capacidad |
| CA-10 | Dominio y nuevo servicio no importan frameworks, adaptadores ni capas prohibidas, ni realizan I/O; fachada accesible, build y pruebas relevantes en Docker aprobados, ADR-004 e informe con evidencia real y limitaciones |

## Plan verificable

| Paso | Fase | Responsable | Estado | Objetivo | Aceptación | Evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ADR-004 y contratos | `USER` | `DONE` | Fijar decisiones e interfaces | Contratos coherentes, error y fachada; ADR revisado | ADR-004 creado, contratos e interfaz Strategy exportados en domain/index.ts; build limpio en Docker |
| 2 | Fixtures y pruebas | `USER` | `DONE` | Definir oráculos antes de los algoritmos | Casos que cubren CA-01 a CA-10 y fallos iniciales explicados | Fixtures creados; arquitectura verde (4/4); 4 suites en fase roja controlada (37 tests con 'Not implemented') |
| 3 | Nearest-Neighbor | `USER` | `DONE` | Construir secuencia y métricas | CA-01 a CA-05 y validación aplicable de CA-08 | stop-ordering-input.ts, route-sequence.ts y nearest-neighbor-ordering.ts implementados; 22/22 tests verdes en Docker |
| 4 | 2-opt | `USER` | `DONE` | Refinar sin empeorar, con parada | CA-05 a CA-08, incluyendo fixture mejorable | TwoOptOrdering implementado con first-improvement y evaluación completa del circuito; 11/11 tests verdes en two-opt-ordering.spec.ts |
| 5 | Servicio de aplicación | `USER` | `DONE` | Conectar propuesta y Strategy | CA-09 y frontera de CA-10 | OrderRouteStopsService implementado; validación de pertenencia y delegación a Strategy; 6/6 tests verdes |
| 6 | Verificación en Docker | `CODEX_MECHANICAL` | `DONE` | Obtener evidencia de funcionamiento/regresión | CA-01 a CA-10, build y suites verdes | Docker Compose verificado: build limpio, 21 suites (193 tests) de route-planning verdes, regresión global (51 suites, 413 tests) 100% aprobada |
| 7 | Documentación | `CODEX_MECHANICAL` | `DONE` | Registrar resultados y cerrar alcance | Informe/ADR/plan coherentes con código y pruebas | docs/modules/seq-01-report.md creado y enlazado; plan reconciliado con resultados y evidencias reales |

Las rutas siguientes son relativas a `backend/src/modules/route-planning/`, salvo aquellas que empiezan por `docs/`.

### Paso 1 — ADR-004 y contratos

**Por qué:** fijar el circuito, la pertenencia de tenant y la política numérica antes de implementar dos estrategias intercambiables.

**Estado / responsable / dependencias:** `DONE` / `USER` (Humberto) / GEO-01 y contratos existentes de CLUSTER-01.

**Debe aplicar el usuario:**

1. Registrar ADR-004 con contexto, decisión, alternativas, consecuencias y fecha; comparar NN solo, NN + 2-opt y optimización exacta fuera de alcance.
2. Adoptar las interfaces, razones y precedencia de validación; fijar default/límite de pasadas y coste de la evaluación completa.
3. Añadir modelos, error e interfaz Strategy; exportar desde la fachada sin importar adaptadores. Preparar validadores puros compartidos solo cuando tengan uso concreto.

**Archivos esperados:** `docs/adr/004-deterministic-stop-ordering.md`, `domain/models/stop-ordering.types.ts`, `domain/models/invalid-stop-ordering-input.error.ts`, `domain/algorithms/stop-ordering-algorithm.ts`, `domain/index.ts`.

**Lote mecánico disponible:** exports/imports y formato acotado, una vez determinados los símbolos y solicitado el lote.

**Verificación / salida:** revisión del contrato contra CA-02/03/04/07/08/09 y build en Docker. Sin ambigüedad entre acumulado y total, tenant de propuesta y contexto, ni entre pasadas e intercambios.

**Evidencia / pendiente:** solo propuesta en este plan; ADR y archivos TypeScript por implementar. No registrar el ADR como aceptado antes de su revisión.

### Paso 2 — Fixtures y pruebas

**Por qué:** probar comportamiento con expectativas independientes y detectar errores de cierre de circuito, tenant y determinismo.

**Estado / responsable / dependencias:** `DONE` / `USER` / paso 1.

**Debe aplicar el usuario:**

1. Crear fixtures explícitos con tenant A/B, origen fijo y VO de GEO-01; documentar coordenadas y resultados esperados de la sección de escenarios.
2. Escribir pruebas de contratos, NN, 2-opt, servicio y arquitectura. Usar Arrange/Act/Assert y convenciones vigentes de tests de SLS.
3. Congelar recursivamente fixtures para detectar mutaciones; enumerar permutaciones pequeñas sin usar azar. Calcular oráculos colineales con `R·π/180` y totales mediante suma independiente del resultado del SUT.
4. Cubrir imports directos y reexports/dependencias locales alcanzables del código nuevo; instanciar el servicio sin contenedor Nest. Las reglas mínimas rechazan dominio → aplicación/infraestructura/presentación y aplicación → infraestructura/presentación, además de frameworks en el nuevo núcleo.

**Archivos esperados:** `test/fixtures/stop-ordering.fixtures.ts`, `test/stop-ordering-input.spec.ts`, `test/nearest-neighbor-ordering.spec.ts`, `test/two-opt-ordering.spec.ts`, `test/order-route-stops.service.spec.ts`, `test/stop-ordering-architecture.spec.ts`.

**Lote mecánico disponible:** adaptación repetitiva de fixtures/imports y normalización de bloques conforme a decisiones fijadas; el usuario define los oráculos.

**Verificación / salida:** matriz escenario → CA completa y revisión de cada oráculo. Registrar fase roja; un error de importación por clase aún inexistente no demuestra por sí solo el comportamiento esperado. Las suites deberán ejecutarse realmente al implementar los pasos 3–5.

**Evidencia / pendiente:** Los 6 archivos de prueba/fixtures creados. Arquitectura pasando (4/4). Suites de NN, TwoOpt, Input y Service ejecutadas en Docker en fase roja controlada (37 tests fallando de forma determinista por 'Not implemented').

### Paso 3 — Algoritmo Nearest-Neighbor

**Por qué:** obtener la ruta base determinista y la única regla de materialización de distancias.

**Estado / responsable / dependencias:** `DONE` / `USER` / pasos 1–2.

**Debe aplicar el usuario:** implementar validación, comparación ordinal, selección NN y materialización conforme al pseudocódigo. Separar utilidades puras de validación/métricas solo si ambas estrategias las necesitan; ninguna utilidad importa el barrel que la reexporta.

**Archivos esperados:** `domain/algorithms/nearest-neighbor-ordering.ts`, `domain/algorithms/stop-ordering-input.ts`, `domain/algorithms/route-sequence.ts`, fachada y suites correspondientes.

**Lote mecánico disponible:** exportaciones y formato de archivos acordados; no implementar la selección ni decidir validaciones.

**Verificación / salida:** suites NN/entrada verdes para CA-01 a CA-05 y CA-08 aplicable; todos los acumulados y retorno correctos, incluso vacío y coordenadas idénticas. Verificar que los números de secuencia se construyen desde cero en cada llamada.

**Evidencia / pendiente:** stop-ordering-input.ts, route-sequence.ts y nearest-neighbor-ordering.ts implementados; 22/22 tests verdes en stop-ordering-input.spec.ts y nearest-neighbor-ordering.spec.ts.

### Paso 4 — Algoritmo 2-opt

**Por qué:** mejorar la ruta base sin alterar el conjunto de paquetes ni permitir ciclos sin límite.

**Estado / responsable / dependencias:** `DONE` / `USER` / paso 3 y fixtures del paso 2.

**Debe aplicar el usuario:** componer con NN; implementar inversión inclusiva, primera mejora, recálculo completo de candidatos, reinicio de pares y contadores. Recalcular todas las métricas finales; no reutilizar acumulados de la ruta base tras invertir.

**Archivos esperados:** `domain/algorithms/two-opt-ordering.ts`, utilidades compartidas ya justificadas, fachada y `test/two-opt-ordering.spec.ts`.

**Lote mecánico disponible:** exports/imports y documentación del resultado; la política y bucles corresponden a `USER`.

**Verificación / salida:** CA-05 a CA-08; prueba mejorable reduce el total, caso estable no cambia, límite y tolerancia detienen según contrato. Contrastar complejidad declarada con el código real.

**Evidencia / pendiente:** TwoOptOrdering implementado con first-improvement y evaluación completa del circuito; 11/11 tests verdes en two-opt-ordering.spec.ts.

### Paso 5 — Servicio de aplicación

**Por qué:** convertir los IDs de una propuesta en una secuencia sin perder pertenencia ni introducir dependencias de infraestructura.

**Estado / responsable / dependencias:** `DONE` / `USER` / contratos CLUSTER-01 y pasos 1–4.

**Debe aplicar el usuario:** crear el servicio con inyección por constructor de la interfaz; validar tenant y membresía exacta; delegar sin instanciar algoritmos concretos. Mantener asociación a propuesta en el llamador. No añadir consultas ni wiring Nest hasta necesitar un consumidor real.

**Archivos esperados:** `application/order-route-stops.service.ts`, `test/order-route-stops.service.spec.ts`, pruebas de arquitectura.

**Lote mecánico disponible:** wiring/exports solo si aparece un consumidor concreto y la transformación está acordada; no crear capas vacías.

**Verificación / salida:** doble de Strategy prueba llamada única y ausencia de llamadas ante rechazo; pruebas con ambas estrategias prueban membresía y determinismo; tenants A/B y faltantes/extras cubren CA-09. Construcción y ejecución sin Nest.

**Evidencia / pendiente:** OrderRouteStopsService implementado y verificado; 6/6 tests pasando en order-route-stops.service.spec.ts.

### Paso 6 — Verificación en Docker

**Por qué:** demostrar implementación real y detectar regresiones de GEO-01/CLUSTER-01 en el entorno requerido.

**Estado / responsable / dependencias:** `DONE` / `CODEX_MECHANICAL` / pasos 1–5.

**Acciones:** comprobar estado de servicios y ejecutar los comandos desde la raíz. Si no están activos, iniciarlos según AGENTS.md; no ejecutar herramientas del proyecto en el host.

```bash
docker compose ps
# Solo si es necesario iniciar/reconstruir servicios:
docker compose up -d --build

# Suites propias y regresión de GEO-01/CLUSTER-01 en route-planning:
docker compose exec backend npm test -- --runInBand modules/route-planning/test
docker compose exec backend npm run build
# Regresión completa al cerrar la implementación:
docker compose exec backend npm test -- --runInBand
```

Revisar formato conforme a AGENTS.md §21/25, de forma acotada a archivos cambiados y mediante Compose. No ejecutar el script `lint` con `--fix` durante una revisión de solo lectura. No hacen falta migraciones ni suites PostGIS para este núcleo sin persistencia. Si se amplía el alcance a una integración externa, definir y ejecutar sus verificaciones antes de declararla terminada.

**Archivos esperados:** código/pruebas de los pasos previos; evidencias en el informe y bitácora del plan. Registrar fecha, commit/base y cambios locales relevantes, comandos, salida/resumen, suites, tests y fallos reales.

**Lote mecánico disponible:** ejecución de comprobaciones y registro de evidencia; correcciones de formato autorizadas. Un fallo conceptual vuelve al paso correspondiente.

**Verificación / salida:** build y suites relevantes aprobados, CA-01 a CA-10 contrastados. No repetir toda la suite tras documentación o formato salvo que aparezca un riesgo concreto.

**Evidencia / pendiente:** Ejecutado en Docker. 21/21 suites de route-planning aprobadas (193 tests). Build NestJS limpio. Regresión general de 51 suites (413 tests) 100% verde sin errores.

### Paso 7 — Documentación

**Por qué:** preservar decisiones y evidencia reproducible sin confundir un algoritmo terminado con el flujo logístico completo.

**Estado / responsable / dependencias:** `DONE` / `CODEX_MECHANICAL` / implementación y evidencia del paso 6.

**Acciones:** crear informe por puntos con alcance, decisiones, archivos, comandos/resultados, pendientes y ejemplo de entrada/salida; enlazarlo al plan y viceversa. Actualizar ADR-004 con decisiones realmente adoptadas y limitaciones. Reconciliar CA, estados y tablero solo con evidencia verificada.

**Archivos esperados:** `docs/modules/seq-01-report.md`, este plan, ADR-004 y fila SEQ-01 de AGENTS.md cuando corresponda el cierre.

**Lote mecánico disponible:** documentación y enlaces, sin alterar módulos previos ni su evidencia histórica.

**Verificación / salida:** todos los CA demostrados; ejemplo con origen, IDs, secuencias, tramos, acumulados, regreso, total y motivo de parada. Documentar que Haversine no representa tiempo/distancia vial y que no se garantiza óptimo global. No inventar commit; el plan no implica autorización para crearlo.

**Evidencia / pendiente:** plan creado; informe, ADR, evidencia funcional y cierre pendientes.

## Escenarios clave de prueba unitaria

En los fixtures siguientes, las coordenadas se expresan como **(latitud, longitud)** en grados y se crean con GEO-01. Tenant por defecto `tenant-a`; origen `O=(0,0)`. Usar `u = R·π/180` metros por grado sobre el ecuador como oráculo independiente. Para las distancias pequeñas propuestas, tolerancia de aserción inicial `0.000001 m`; no reutilizar esa tolerancia para desempatar NN.

| Escenario | Fixture y comprobación | CA |
| --- | --- | --- |
| Vacío | `[]`: cero paradas/distancias; NN sin refinamiento, 2-opt trivial con cero iteraciones | 03, 04, 07 |
| Un paquete | A=(0,0.01): ida `0.01u`, retorno `0.01u`, total `0.02u`, secuencia 1 | 03, 04 |
| Dos paquetes | A=(0,0.01), B=(0,0.02): salida A,B; 2-opt trivial, sin invertir el circuito por igualdad | 03, 07 |
| Colineales | A=(0,0.01), B=(0,0.02), C=(0,0.03): A,B,C; tramos `0.01u`, acumulados `0.01u,0.02u,0.03u`; regreso `0.03u`, total `0.06u` | 01, 04 |
| Triángulo con depósito | A=(0,0.01), B=(0.01,0): igual distancia desde O, salida A,B por ID; total incluye lado A–B y regreso B–O | 01, 02, 04 |
| Coincidentes | A y B en O; C=(0,0.01): conservar A,B,C, dos tramos cero y total `0.02u`; no fusionar paquetes | 02, 03, 04 |
| Empate ordinal | `pkg-2` y `pkg-10` en la misma coordenada: elegir `pkg-10` primero; probar también dos puntos equidistantes en direcciones opuestas | 02, 05 |
| Distancias próximas distintas | `pkg-z`=(0,0.01) y `pkg-a`=(0,0.010000000001): menor distancia gana aunque el ID sea mayor y la diferencia pequeña | 01, 02 |
| Circuito con cruce | A=(0,0.01), B=(0.01,0.01), C=(0.02,0), D=(0.022,0.02): NN esperado A,B,C,D; B–C cruza D–O en proyección local. 2-opt sin límite alcanzado debe reducir L y eliminar ese cruce; demostrar numéricamente, no solo con dibujo | 04, 06 |
| Mejora que involucra retorno | En el fixture con cruce, invertir C,D sustituye B–C y D–O por B–D y C–O; verificar disminución conocida del circuito, aunque first-improvement pueda aceptar antes otro par | 04, 06 |
| Primera mejora y una pasada | Fixture con cruce y `maxIterations=1`, tolerancia 0: enumerar pares manualmente; primer par esperado `(1,3)` sobre A,B,C,D produce A,D,C,B. Un intercambio, una pasada, `MAX_ITERATIONS` | 06, 07 |
| Ruta estable/tolerancia | Colineales con tolerancia por defecto: sin mejora aceptada. Fixture mejorable con tolerancia superior al total base: ruta NN intacta y `NO_IMPROVEMENT`; comprobar frontera `gain <= threshold` con fixture controlado | 06, 07 |
| Cero iteraciones | Fixture mejorable, máximo 0: mismas paradas y métricas que NN, metadatos 2-opt con cero intercambios y `MAX_ITERATIONS` | 06, 07 |
| Permutación | Las 24 permutaciones de A,B,C,D: igualdad profunda de cada Strategy frente a su resultado canónico; repetir llamadas con la misma instancia. Permutar IDs de propuesta y candidatos por separado en el servicio | 05 |
| Coordenadas extremas | Origen/paradas válidos cerca de antípodas, polos y antimeridiano; métricas finitas no negativas; no utilizar distancia euclidiana de grados | 01, 04 |
| Contrato inválido | `undefined`/VO falsificado, `NaN`, infinito, latitud 91 o longitud 181 mediante fixture de frontera; origen inválido y parada sin coordenadas dan motivos distintos | 08 |
| IDs/tenant | Vacíos, espacios externos, repetidos y tenant B; rechazo total sin datos ajenos. Múltiples defectos permutados preservan precedencia | 08 |
| Opciones inválidas | Máximo negativo, fraccionario, mayor que 1000, infinito; tolerancia negativa/NaN; objeto parcial mediante frontera `unknown` | 07, 08 |
| Propuesta inconsistente | IDs vacíos/duplicados, candidato faltante/adicional y tenant del snapshot distinto; Strategy no invocada | 09 |
| Inmutabilidad/Strategy | Entradas congeladas, salida congelada y membresía preservada; doble registra una llamada; ambas estrategias cumplen el contrato común y pueden inyectarse en el mismo servicio | 05, 09, 10 |

Los casos inválidos no requieren crear VO inválidos mediante su constructor normal: probar primero el rechazo de GEO-01 donde corresponda y usar `unknown` con conversión localizada en tests de la frontera para simular datos runtime mal formados; no introducir `any` en dominio.

El fixture de cruce usa distancias pequeñas, por lo que el dibujo plano sirve para explicar la inversión. La aceptación siempre depende de Haversine. Para la prueba de eliminación del cruce puede emplearse un oráculo geométrico independiente del test sobre segmentos del fixture, sin añadir un detector de cruces al algoritmo productivo. Una comprobación matemática independiente durante la revisión documental confirmó NN=A,B,C,D, primera mejora `(1,3)` de aproximadamente `158.332 m` e inversión `(2,3)` mejorable en aproximadamente `917.778 m`. Son referencias del fixture, no resultados de una implementación de SEQ-01. Contrastar estas expectativas con el código en el paso 2 antes de registrar la prueba como aprobada.

## Paso actual

**Cerrado (DONE para el alcance definido de SEQ-01).** Los 7 pasos del plan han sido completados y verificados con evidencia reproducible en Docker. NearestNeighborOrdering, TwoOptOrdering y OrderRouteStopsService operan según especificación, con pureza arquitectónica y 51/51 suites (413/413 tests) pasando. Informe disponible en `docs/modules/seq-01-report.md`.

## Decisiones

| Fecha | Decisión propuesta para SEQ-01 | Motivo | Consecuencia |
| --- | --- | --- | --- |
| 2026-10-02 | Incluir NN y 2-opt en el cierre | Encargo explícito, aunque 2-opt es opcional en el MVP general | Se requieren pruebas de ambas estrategias |
| 2026-10-02 | Circuito cerrado, depósito explícito y una visita por paquete | Contrato reproducible y retorno medible | No hay rutas abiertas ni fusión de destinos |
| 2026-10-02 | Desempate exacto por ID ordinal | Independencia del orden de consulta y del locale | No usar epsilon en NN |
| 2026-10-02 | NN como inicialización fija de 2-opt y first-improvement por `(i,j)` | Evitar que la entrada permutada cambie el resultado | La estrategia no acepta tours iniciales arbitrarios |
| 2026-10-02 | Evaluación completa, máximo de pasadas y mejora mínima | Regla numérica clara y parada comprobable | Coste `O(n² + I·n³)`; medir antes de escalar |
| 2026-10-02 | Servicio puro con tenant del snapshot y membresía exacta | La propuesta actual no lleva tenant/coordenadas | Composición con CLUSTER-01 sin consultas ni cambios de contrato previos |

Registrar la adopción y cualquier ajuste en ADR-004 durante el paso 1. Una modificación posterior de reglas que altere la salida requiere actualizar versión, pruebas y documentación de reproducción.

## Bitácora de progreso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-10-02 | Auditoría inicial | GEO-01 y CLUSTER-01 presentes; sin SEQ-01 ni ADR-004; árbol inicialmente limpio | Lectura de código, plantilla, AGENTS.md, informes y Git; sin ejecutar herramientas de aplicación | Base `ba41303` |
| 2026-10-02 | Planificación | Creado plan canónico con contratos propuestos, pseudocódigo, CA-01 a CA-10, siete pasos y escenarios | 12 enlaces locales comprobados, estructura/bloques revisados y oráculo del fixture con cruce calculado independientemente; implementación/verificación funcional pendientes | Sin commit nuevo |
| 2026-10-02 | Paso 1 (Inicio) | Inicio de modo guiado; preflight ejecutado en Docker (16 suites de route-planning, 141 tests verdes) | `docker compose exec backend npm test -- --runInBand modules/route-planning/test` | Pendiente |
| 2026-10-02 | Paso 1 (Cierre) | ADR-004 y contratos de dominio implementados y exportados en `domain/index.ts` | `docker compose exec backend npm run build` (nest build exitoso) + 16 suites / 144 tests verdes | En rama `feature/seq-01` |
| 2026-10-02 | Paso 2 (Cierre) | Fixtures y 5 suites creadas con sls-test-normalization; arquitectura 4/4 verde; fase roja controlada (37 tests) | `docker compose exec backend npm test -- --runInBand ...` (37 tests fallando por 'Not implemented') | En rama `feature/seq-01` |
| 2026-10-02 | Paso 3 (Cierre) | NN, validador de entrada y materializador implementados; 22/22 tests verdes en suites de NN e Input | `docker compose exec backend npm test ... nearest-neighbor-ordering.spec.ts stop-ordering-input.spec.ts` | En rama `feature/seq-01` |
| 2026-10-02 | Paso 4 (Cierre) | TwoOptOrdering implementado; refinamiento first-improvement acotado y métricas; 11/11 tests verdes | `docker compose exec backend npm test ... two-opt-ordering.spec.ts` | En rama `feature/seq-01` |
| 2026-10-02 | Paso 5 (Cierre) | OrderRouteStopsService implementado con validación de propuesta y delegación pura; 6/6 tests verdes | `docker compose exec backend npm test ... order-route-stops.service.spec.ts` | En rama `feature/seq-01` |
| 2026-10-02 | Paso 6 (Cierre) | Verificación completa en Docker: build limpio, 21 suites (193 tests) de route-planning y 51 suites (413 tests) globales verdes | `docker compose exec backend npm test -- --runInBand` | En rama `feature/seq-01` |
| 2026-10-02 | Paso 7 (Cierre) | Informe docs/modules/seq-01-report.md creado y enlazado; plan actualizado y alcance cerrado | Inspección documental y verificación de enlaces cruzados | En rama `feature/seq-01` |

## Cierre

- [x] ADR-004 revisado y consistente con el comportamiento implementado.
- [x] CA-01 a CA-10 satisfechos con evidencia concreta.
- [x] Ambas estrategias y servicio implementados, exportados y formateados.
- [x] Build y pruebas relevantes/regresión aprobados mediante Docker Compose.
- [x] Rechazo de mezcla de tenants y membresía de propuesta comprobados.
- [x] Pureza, inmutabilidad y fronteras arquitectónicas comprobadas.
- [x] Informe por puntos creado y enlazado; comandos, resultados y limitaciones registrados.
- [x] Plan y tablero contrastados con implementación real; sin atribuir integración operativa pendiente.
- [x] Migraciones/infraestructura marcadas como no aplicables para este alcance puro.
- [x] Cambios ajenos preservados; commit registrado únicamente si se solicita y se crea.

SEQ-01 podrá declararse `DONE` para su alcance al satisfacer esta lista. La creación transaccional de rutas, reserva de recursos y ejecución logística seguirá perteneciendo a ASSIGN-01/ROUTE-01.
