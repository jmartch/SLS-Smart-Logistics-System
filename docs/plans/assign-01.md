# ASSIGN-01 — Planificación y asignación transaccional de rutas

## 1. Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `ASSIGN-01` |
| Nombre | Integración de clustering, capacidad, ordenamiento y Chain of Responsibility en planificación y asignación |
| Dominio | Planificación/rutas; coordinación con asignaciones, paquetes y flota |
| Prioridad | `P1` |
| Estado general | `DONE` |
| Responsable conceptual y de implementación | Humberto — `USER` |
| Coordinación | Vivian — Paquetes/State y Vehículos/Mensajeros; Juanangel — contratos tenant, persistencia y eventos |
| Apoyo del agente | `CODEX_MECHANICAL`: documentación, evidencia y transformaciones deterministas expresamente solicitadas |
| Dependencias directas | `CLUSTER-01`, `SEQ-01`, `PAT-CHAIN-01`, `VEH-01`, `PKG-01` |
| Fundamentos transitivos | `GEO-01`, `GDB-01`, `PAT-STATE-01`, AUTH/TENANT, contratos geográficos vigentes |
| Rama observada | `feature/assing-01` — nombre real, conservado sin renombrarlo |
| Commit auditado | `6405643cc1278e5a395de9c993d854fa1fd1efd9` |
| Fecha de auditoría | 2026-10-03, America/Bogota |
| Documento canónico | `docs/plans/assign-01.md` |
| Informe previsto | `docs/modules/assign-01-report.md`, por crear al registrar implementación y evidencia |

Este documento especifica trabajo futuro. La auditoría fue estática: no se ejecutaron builds, pruebas ni migraciones para elaborar el plan. Los resultados históricos de otros módulos no equivalen a verificación actual de ASSIGN-01. El árbol de trabajo estaba limpio antes de crear este documento.

## 2. Alcance detallado

### 2.1 Incluido

- Contrato puro `PlanAndAssignRoutesUseCase`, implementado por `PlanAndAssignRoutesService`, ubicado en `route-planning/application/`.
- Integración de `ClusterPackagesService`, `OrderRouteStopsService` y la Chain pública de `assignments`, conservando sus algoritmos y contratos funcionales.
- Adaptación focalizada de fronteras: aplicación sin NestJS/Prisma, Chain sin I/O, decisiones en aplicación/dominio y persistencia mediante puertos.
- Lectura autorizada por tenant de paquetes, zona, depósito, dataset, vehículos, mensajeros y disponibilidad. El cliente propone identificadores; la base proporciona estados, medidas, coordenadas y capacidad.
- Asignación inicial automática de paquetes `CLASSIFIED`; creación de rutas `PLANNED`, paradas ordenadas, asignaciones e historial de estado.
- Reserva exacta de peso y volumen, exclusión de recursos ocupados, validación de turnos y concurrencia entre solicitudes.
- Una unidad transaccional para la solicitud completa: resultados asignados y pendientes, estado de paquetes, historial, rutas/paradas y outbox.
- Persistencia de `PENDING_ASSIGNMENT` con motivo explícito para resultados logísticos esperados; resultado legible por la futura UI.
- Historial `Assignment` con identidad y contexto histórico preservados; actor y razón obligatorios para las nuevas escrituras de este caso de uso.
- Reutilización de `RoutePlanningRequest`, `PlanningPackageResult`, `PackageStatusHistory` y `OutboxEvent`; protección contra repetición de la misma solicitud.
- Pruebas unitarias, de arquitectura y de integración real con PostgreSQL/PostGIS; migraciones aditivas solo cuando el contrato definitivo las requiera.

### 2.2 Fuera de alcance

- Reimplementar o modificar la heurística de clustering, nearest-neighbor o 2-opt; resolver VRP/TSP globalmente.
- Preparación, inicio, revisión operativa, interrupción o cierre de rutas (`ROUTE-01`); intentos, incidentes y evidencia (`DELIVERY-01`). Crear una ruta `PLANNED` no autoriza su despacho.
- Interfaces web (`UI-03`) y pantalla de pendientes (`UI-02`); solo se define el resultado consumible.
- Workers RabbitMQ, ACK, reintentos de mensajes, DLQ, redrive y envío de notificaciones. El caso de uso es síncrono; puede invocarse desde un adaptador local autorizado. Outbox queda durable para integración posterior.
- Reasignación manual automática implícita, recuperación de `PENDING_ASSIGNMENT`/`RESCHEDULED`, cambio de recursos de rutas existentes o cierre de asignaciones activas. Esos flujos reutilizarán las mismas garantías en tareas posteriores.
- Cálculo de tiempos reales, ventanas de entrega por parada, tráfico y construcción de geometría vial. Se conserva la validación de network attachment existente, pero las métricas de SEQ-01 siguen siendo Haversine.
- Refactor global de módulos ajenos. La deuda detectada fuera del camino integrado se registra y se coordina por separado.

## 3. Diagnóstico del repositorio

### 3.1 Fuentes y precedencia

Se consultaron [AGENTS.md](../../AGENTS.md), [ADR-002](../adr/002-assignment-integrity.md), [ADR-003](../adr/003-deterministic-capacity-clustering.md), [ADR-004](../adr/004-deterministic-stop-ordering.md), los planes [CLUSTER-01](cluster-01.md), [SEQ-01](seq-01.md), [PKG-01](pkg-01.md), [VEH-01](veh-01.md), código, esquema y migraciones. El alcance solicitado para ASSIGN-01 incluye explícitamente PKG-01 aunque el tablero histórico no lo enumere entre sus dependencias.

Las rutas en las tablas siguientes son relativas a la raíz del repositorio. No se afirma que las migraciones estén aplicadas en una base concreta.

| Área | Contrato/implementación observada | Brecha de ASSIGN-01 |
| --- | --- | --- |
| GEO-01 | `backend/src/modules/route-planning/domain/`: coordenadas y Haversine reutilizables | Adaptar coordenadas persistidas sin duplicar cálculo geográfico |
| CLUSTER-01 | `application/cluster-packages.service.ts`: `execute(options, packages, vehicles): ClusteringResult` | Consume snapshot; no reserva recursos ni cambia estados |
| Propuesta real | `CapacityClusterProposal`: `proposalId`, `clusterId`, `candidateVehicleId`, `packageIds`, `totalWeightKg`, `totalVolumeM3` | No existe un contrato llamado simplemente `ClusterProposal`; no inventar otro equivalente |
| Capacidad CLUSTER | `ClusteringVehicleInput.availableWeightKg/availableVolumeM3`, cadenas decimales; cantidades internas exactas | El adaptador debe proyectar capacidad disponible real, no pasar máximos como disponibilidad |
| Pureza de CLUSTER | `ClusterPackagesService` importa `Injectable` y usa `@Injectable()` | Retirar decorador/import y mantener composición por factory; no cambiar el algoritmo |
| SEQ-01 | `OrderRouteStopsService.execute(options, { tenantId, proposal }, candidates): OrderedRouteSequence` | Consumir secuencia `1..n`, retorno y métricas; registrar provider público, actualmente ausente en `RoutePlanningModule` |
| Chain | `assignments/domain/validation.chain.ts` incluye diez handlers, también `DuplicateAssignmentValidationHandler` | Mantener delegación real; ampliar contexto para zona solicitada, estado elegible y precisión exacta |
| Contexto Chain | Tipos propios y handlers sin Prisma; medidas `number`; zona solo exige valor no vacío; duplicado descrito como misma ruta | Comparar zona exacta, usar unidades enteras y detectar cualquier asignación activa del paquete |
| Servicio preliminar | `AssignPackageToRouteService` delega a `reserveValidated(request, profile, callback)` | No crea rutas/paradas ni orquesta clustering/SEQ; no usar una transacción por paquete |
| Reserva Prisma | `PrismaAssignmentReservation` abre SERIALIZABLE, bloquea, calcula saldo, invoca callback Chain, decide `NO_CAPACITY`, termina filas previas y crea asignación | Infraestructura decide flujo de negocio; sus resultados pendientes no persisten State/historial/outbox |
| State | `PackageAggregate.transitionTo`, estados concretos y `pullDomainEvents()`; `CLASSIFIED` permite pendiente/asignado | Reconstituir y ejecutar State dentro del flujo de aplicación; no actualizar estado arbitrariamente |
| Persistencia State | `PrismaPackageLifecycleRepository` guarda estado, historial y outbox en una transacción propia | `transitionAtomically` no puede componerse llamándolo después de reservar: produciría commits independientes |
| Historial e integridad | `Assignment`, FK compuestas, índice SQL parcial `(tenantId, packageId) WHERE status = 'ACTIVE'` | Conservarlos; impedir que planificación inicial reutilice la reasignación implícita del prototipo |
| Esquema real | `backend/prisma/schema/{routing,packages,calendar,messaging,...}.prisma`; no existe `backend/prisma/schema.prisma` | Editar el esquema multifichero real; conservar SQL de restricciones, RLS y grants |
| Modelos disponibles | `RoutePlanningRequest`, `PlanningPackageResult`, `Route`, `RouteStop`, `PackageStatusHistory`, `OutboxEvent` | Integrarlos; no crear tablas duplicadas de resultados/historial/eventos |
| Flota/calendario | Capacidades y estados; `VehicleShift`/`CourierShift`; rutas con ventana opcional | Fijar ventana obligatoria en este caso de uso y criterio real de disponibilidad, no solo `ACTIVE` |
| Eventos | State emite `PackageAssigned` o `PackagePendingAssignment`; outbox existente | Completar envelope, correlación y vínculo con solicitud/ruta sin publicar antes del commit |
| TS | `strictNullChecks: true`, pero `noImplicitAny: false`; build excluye tests | Incorporar comprobación estricta del alcance; un build ordinario no demuestra el requisito solicitado |
| Arquitectura | Tests CLUSTER no prohíben Nest en aplicación; test SEQ inspecciona un subconjunto de archivos | Cubrir todos los archivos nuevos/modificados y sus dependencias relevantes, incluidos imports generados y reexports |
| Evidencia previa | Planes CLUSTER/SEQ documentan `DONE`; PKG/VEH siguen `TODO` para alcance funcional | No declarar disponibles APIs completas solo por existir tablas, prototipos o tests históricos |

### 3.2 Contratos que deben preservarse

1. CLUSTER devuelve propuestas y pendientes; nunca prueba disponibilidad transaccional. Su particionador utiliza cada vehículo en una única propuesta durante la ejecución.
2. SEQ requiere un origen explícito y correspondencia exacta entre paquetes de propuesta y candidatos. Cada paquete es una parada; el depósito no se inserta como paquete ni parada adicional.
3. Cantidades públicas: kg con hasta 3 decimales y m³ con hasta 6; cantidades internas: gramos y cm³ enteros seguros. Reutilizar `parseKgToGrams`, `parseM3ToCm3`, `gramsToKg` y `cm3ToM3` mediante contrato puro, sin importar infraestructura.
4. State ya permite `CLASSIFIED -> ASSIGNED_TO_ROUTE | PENDING_ASSIGNMENT`. No requiere nuevos estados; `PENDING_ASSIGNMENT -> PENDING_ASSIGNMENT` no está permitido y no debe inventarse para registrar un reintento.
5. ADR-002 conserva contexto histórico y permite únicamente cierre controlado de filas previas en una reasignación explícita. ASSIGN-01 no cierra ninguna fila previa.

## 4. Diseño contractual y límites arquitectónicos

### 4.1 Propiedad y dirección de dependencias

```text
Adaptador de entrada autorizado
  -> PlanAndAssignRoutesService (route-planning/application)
       -> servicios puros CLUSTER y SEQ (route-planning/application)
       -> contrato público de validación (assignments/domain)
       -> PackageAggregate / State (packages/domain, interfaz pública)
       -> PlanningAssignmentUnitOfWork (puerto de aplicación)
            <- PrismaPlanningAssignmentUnitOfWork (infraestructura)
                 -> repositorios ligados a una misma transacción

Presentation -> Application -> Domain
Infrastructure -> contratos de Application/Domain
Nest modules -> composición de puertos y adaptadores
```

`route-planning` posee la orquestación del lote y sus resultados. `assignments` posee elegibilidad de una asignación, Chain y registro histórico. `packages` posee transición State. Flota posee capacidad física y disponibilidad; rutas posee forma e invariantes de ruta/parada. La aplicación consume interfaces públicas; no consulta tablas ni importa adaptadores de otros módulos.

El coordinador transaccional puede componer adaptadores de esos módulos que reciban internamente el mismo cliente Prisma. Esa composición reside en infraestructura y no autoriza a trasladar allí Chain, selección de mensajeros, transiciones o decisiones de pendiente. No se introduce un módulo global ni un ciclo `assignments -> route-planning/application -> assignments`.

Los tokens Nest, `@Module`, factories e inyección viven en composition roots. Los servicios de aplicación se instancian con `new` en pruebas sin un contenedor Nest.

### 4.2 Entrada y salida previstas

Contrato público propuesto, no implementación existente. UUID y fechas son strings por transporte; validadores de entrada y fábricas puras deben verificar UUID, ISO-8601 con offset, unicidad, tamaño y consistencia. `readonly` no autentica datos ni reemplaza validación en runtime.

```ts
export interface PlanningExecutionContext {
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly correlationId: string;
}

export interface PlanAndAssignRoutesCommand {
  readonly requestId: string;
  readonly zoneId: string;
  readonly packageIds: readonly string[];
  readonly vehicleIds: readonly string[];
  readonly courierIds: readonly string[];
  readonly depotId: string;
  readonly datasetId: string;
  readonly profile: 'MOTOR_VEHICLE' | 'MOTORCYCLE' | 'BICYCLE' | 'FOOT';
  readonly window: Readonly<{ startAt: string; endAt: string }>;
  readonly radiusMeters: number;
  readonly ordering: 'nearest-neighbor' | 'nearest-neighbor-two-opt';
  readonly twoOpt?: Readonly<{
    maxIterations: number;
    minImprovementMeters: number;
  }>;
}

export type PendingAssignmentReason =
  | 'NO_VEHICLE_AVAILABLE'
  | 'NO_COURIER_AVAILABLE'
  | 'NO_CAPACITY'
  | 'WEIGHT_CAPACITY_EXCEEDED'
  | 'VOLUME_CAPACITY_EXCEEDED'
  | 'NO_JOINT_CAPACITY'
  | 'CAPACITY_EXHAUSTED_BY_HEURISTIC'
  | 'INCOMPLETE_DATA'
  | 'INVALID_COORDINATES'
  | 'GEOCODING_NOT_READY'
  | 'NETWORK_ATTACHMENT_NOT_READY'
  | 'ZONE_NOT_SUPPORTED';

export type PackagePlanningOutcome =
  | Readonly<{
      kind: 'ASSIGNED';
      packageId: string;
      routeId: string;
      routeStopId: string;
      assignmentId: string;
    }>
  | Readonly<{
      kind: 'PENDING_ASSIGNMENT';
      packageId: string;
      reasonCode: PendingAssignmentReason;
      source: 'PREVALIDATION' | 'CLUSTER' | 'CHAIN';
      sourceCode: string;
      rejectedBy: string | null;
    }>;

export interface PlannedRouteResult {
  readonly routeId: string;
  readonly vehicleId: string;
  readonly courierId: string;
  readonly state: 'PLANNED';
  readonly stops: readonly Readonly<{
    routeStopId: string;
    packageId: string;
    sequence: number;
  }>[];
  readonly totalDistanceMeters: number;
}

export interface PlanAndAssignRoutesResult {
  readonly requestId: string;
  readonly tenantId: string;
  readonly status: 'COMPLETED';
  readonly replayed: boolean;
  readonly routes: readonly PlannedRouteResult[];
  readonly outcomes: readonly PackagePlanningOutcome[];
}

export interface PlanAndAssignRoutesUseCase {
  execute(
    context: PlanningExecutionContext,
    command: PlanAndAssignRoutesCommand,
  ): Promise<PlanAndAssignRoutesResult>;
}
```

- `tenantId`, actor y correlación proceden del adaptador autenticado/autorizado; no se copian desde el body. El permiso de planificación y la pertenencia del actor deben verificarse antes de escribir. Tests directos usan contexto explícito y puertos de autorización falsos, nunca afirman probar seguridad HTTP.
- `requestId` identifica una operación lógica estable y se reutiliza ante repetición; no otorga acceso. La autorización y tenant se comprueban también al recuperar un resultado.
- Solo paquetes existentes del tenant y `CLASSIFIED` en una solicitud nueva. IDs repetidos, lista vacía, recursos inexistentes/no visibles, opciones inválidas y estados incompatibles rechazan la solicitud sin escrituras.
- Una lista de vehículos o mensajeros vacía es válida y produce pendientes; no es un error de formato. Un identificador de otra compañía se trata como no visible, no como flota vacía.
- Límite inicial propuesto: 100 paquetes y 100 candidatos por cada tipo de recurso por solicitud; verificar antes de abrir transacción. Coincide con la escala prevista en ADR-004 y acota tiempo bajo bloqueo. Validar también un máximo finito para iteraciones 2-opt y presupuesto temporal en paso 0, tras medir el conjunto máximo.
- El depósito y su origen se cargan por tenant. La solicitud usa el dataset/versión autorizado y listo; las coordenadas salen del candidato seleccionado de cada paquete. No aceptar coordenadas, capacidades o estado arbitrarios desde el cliente.
- Opciones de transporte con decoradores, si se necesitan, pertenecen a `presentation/`. Los comandos, resultados y errores internos no importan DTO HTTP.
- Los errores de solicitud, autorización e infraestructura se representan con clases/códigos tipados distintos al resultado exitoso; ningún `catch` universal devuelve pendientes.

### 4.3 Puerto transaccional

Definir `PlanningAssignmentUnitOfWork` en `route-planning/application/ports/`. Su contrato expresa una capacidad de aplicación; no `Prisma.TransactionClient`, SQL, modelos generados ni una función `validate` entregada a un repositorio.

Esqueleto normativo del puerto; `PlanningAssignmentSession` es la composición de los contratos de la tabla siguiente, a definir completamente en paso 0:

```ts
export interface PlanningAssignmentUnitOfWork {
  run<T>(
    context: PlanningExecutionContext,
    operation: (session: PlanningAssignmentSession) => Promise<T>,
  ): Promise<T>;
}
```

| Contrato de sesión | Capacidad y datos de entrada/salida |
| --- | --- |
| Solicitudes | Reclamar/cargar solicitud por tenant e ID; leer parámetros normalizados y resultados tipados; guardar finalización |
| Snapshot de planificación | Leer y bloquear paquetes, recursos, depósito, zona y hechos geográficos/calendario necesarios; devolver proyecciones propias, medidas como strings, estados de dominio y asignaciones activas |
| Rutas | Insertar ruta ya decidida y sus paradas; devolver identificadores; no decidir recursos ni orden |
| Asignaciones | Consultar actividad por paquete, insertar registros históricos completos; no cerrar filas por iniciativa del adaptador |
| Paquetes | Reconstituir agregado y guardar transición con estado previo esperado; persistir historial derivado del evento, sin elegir el destino |
| Resultados | Insertar un `PlanningPackageResult` por paquete/solicitud con motivo/evidencia tipada |
| Outbox | Insertar envelopes definidos por aplicación y asociados a los eventos de State |

La sesión es válida únicamente durante el callback; todos sus repositorios comparten una transacción y tenant. No se retiene fuera de `run`. Los métodos reciben identidades de negocio, no un cliente de base de datos. `run` inicia, establece tenant, invoca la operación de aplicación, confirma o revierte; no implementa el algoritmo del caso de uso.

Separar lecturas persistidas de decisiones: infraestructura proyecta estados, turnos, reservas, pesos y volúmenes; aplicación/dominio determina disponibilidad y capacidad restante. La suma decimal SQL puede servir como proyección de ocupación, pero el adapter no decide si un paquete cabe ni si debe quedar pendiente.

### 4.4 Precisión, inmutabilidad y tipos

- Normalizar cadenas decimales a gramos/cm³ con utilidades puras existentes. Cambiar los campos de la Chain a unidades explícitas enteras, por ejemplo `weightGrams`, `volumeCm3`, `remainingWeightGrams`, `remainingVolumeCm3`.
- Verificar `Number.isSafeInteger` y signo en entradas, sumas y restas. Cero disponible es válido; cantidades de paquete deben ser positivas. Un saldo negativo persistido es inconsistencia, no permiso para sobreasignar.
- Capacidad igual al límite es válida; exceso de 1 g o 1 cm³ se rechaza. No usar `Decimal.toNumber()` para comparar kg/m³ ni tolerancias epsilon.
- `readonly` en propiedades y colecciones; copias defensivas y congelación recursiva de DTO/resultados expuestos. No mutar propuestas de CLUSTER, secuencias de SEQ ni arrays recibidos.
- El agregado State es mutable de manera controlada; cada intento usa instancias nuevas. No exigir congelarlo y después llamar `transitionTo`.
- Mapear Prisma/JSON a tipos propios mediante validación y narrowing; `unknown` para fallos externos, uniones discriminadas y `never` para exhaustividad. Prohibidos `any`, `@ts-ignore` y casts que eludan validación.
- Añadir comprobación `strict: true`, `noImplicitAny: true`, `noEmit: true` del alcance integrado y sus tests. Puede ser `tsconfig.assign-01.json` dedicado; dependencias transitivas importadas también deben pasar. No afirmar que todo el backend es estricto ni ampliar el cambio global sin resolver su impacto.

## 5. Semántica de planificación, Chain y transacción

### 5.1 Algoritmo del caso de uso

1. Validar comando y autorización. Normalizar IDs por orden ordinal UTF-16, opciones y fechas. Comprobar ventana `startAt < endAt`. Las colecciones de flota son restricciones de candidatos, nunca prueba de disponibilidad.
2. Abrir UoW SERIALIZABLE para el lote. Reclamar `requestId`; si ya está completado y los parámetros normalizados coinciden, recuperar resultado sin ejecutar State ni emitir eventos. Si difieren, devolver `REQUEST_ID_CONFLICT` sin mutaciones.
3. Cargar snapshot bajo tenant y bloqueos. Comprobar pertenencia, existencia y estado inicial de todos los paquetes antes de cualquier escritura de negocio. Para una solicitud nueva, una asignación activa previa constituye conflicto; no se cierra ni se convierte en pendiente.
4. Validar precondiciones de datos/geografía con el mismo prefijo puro de handlers reutilizable: tenant, duplicado, datos, coordenadas, attachment y zona. Excluir de CLUSTER los paquetes propios elegibles con rechazo logístico y preparar sus pendientes. Una medida/geografía inválida detectada antes de construir `Coordinates` no debe abortar todo el lote por una excepción del algoritmo.
5. Derivar capacidad residual y recursos elegibles. Vehículo/mensajero deben estar activos, cubiertos por turno en toda la ventana y libres de rutas que los ocupen en ese intervalo. Emparejar vehículos y mensajeros elegibles en orden ordinal, sin reutilizar ninguno. Solo vehículos con pareja entran en CLUSTER.
6. Ejecutar `ClusterPackagesService` con paquetes válidos, una zona y flota emparejada. Conservar pendientes del algoritmo y su causa original. Una propuesta no constituye reserva confirmada.
7. Por cada propuesta en orden canónico, ejecutar `OrderRouteStopsService` con origen del depósito, candidatos exactos y estrategia acordada. Asociar el mensajero emparejado al vehículo propuesto.
8. Ejecutar la Chain completa por paquete de la propuesta en orden ordinal de `packageId`, independiente de la heurística de visita. Construir cada contexto desde snapshot y saldo provisional, no desde valores enviados por el cliente. Descontar gramos/cm³ solo después de aceptación; el siguiente handler/candidato ve ese saldo.
9. Si la Chain rechaza paquetes propios elegibles, preparar sus pendientes sin abortar los aceptados. Si cambia la membresía de la propuesta, crear una nueva propuesta derivada inmutable con totales recalculados y volver a llamar SEQ sobre los aceptados. No conservar paradas fantasma ni huecos de numeración. Si no queda ninguno, no crear ruta. No redistribuir automáticamente los rechazados a otra propuesta en este alcance.
10. Construir rutas `PLANNED`, paradas `PENDING`, asignaciones y transiciones de State. Para cada paquete elegible producir exactamente un resultado asignado o pendiente, incluso si no hay flota. Validar cobertura/disyunción antes de guardar.
11. Persistir solicitud, rutas, paradas, asignaciones, cambios de paquete, historial, resultados y outbox mediante la misma sesión. Finalizar solicitud `COMPLETED`, aun cuando todos los paquetes estén pendientes.
12. Confirmar transacción y devolver resultado inmutable. Ningún resultado se comunica como confirmado antes del commit.

La secuencia funcional es clustering → secuenciación → Chain → persistencia. La transacción física comienza antes de leer el snapshot, porque validar capacidad fuera del ámbito protegido permitiría decisiones obsoletas. Los cálculos son locales y acotados; no se llama geocoder, red vial remota, broker ni correo dentro de la transacción. Si el tamaño futuro vuelve inaceptable este costo, un ADR posterior deberá especificar cálculo fuera de transacción con versiones/revalidación; no se introduce esa complejidad ahora.

### 5.2 Chain canónica y adaptación

```text
TenantValidation
-> DuplicateAssignmentValidation
-> PackageEligibilityValidation (nuevo, estado CLASSIFIED)
-> CompleteDataValidation
-> CoordinateValidation
-> NetworkAttachmentValidation
-> ZoneValidation
-> VehicleAvailability
-> WeightCapacity
-> VolumeCapacity
-> CourierAvailability
-> éxito de validación
```

- Conservar `setNext`/delegación y corte temprano; probar que un rechazo evita invocar handlers posteriores. La Chain no se reemplaza por un gran condicional.
- `TenantValidation` incluye zona, depósito, ruta propuesta y recursos/geografía tenant-owned. El dataset puede ser catálogo global según el esquema: validar autorización y versión, no inventarle una propiedad tenant inexistente.
- Duplicado significa cualquier `Assignment ACTIVE` del paquete, no solo una fila de la misma ruta. `PackageEligibilityValidation` rechaza un estado ajeno al contrato de planificación inicial.
- `ZoneValidation` verifica igualdad exacta `package.zoneId === requestedZoneId` y zona válida para el tenant; un valor no vacío no basta.
- No eliminar `NetworkAttachmentValidation` por usar Haversine: mantener selección de candidato, dataset READY, perfil y attachment aceptado a exactamente un nodo/arista. La existencia de attachment no prueba conectividad vial ni calcula distancia por carretera.
- Prevalidación reutiliza handlers/reglas del prefijo y termina antes de vehículo/capacidad/mensajero; no duplicar reglas a mano. La Chain final se ejecuta completa sobre cada candidato.
- La creación de `Assignment` corresponde a la aplicación después del éxito. Si se usa un handler terminal denominado `AssignmentCreation`, solo puede construir una intención pura; nunca insertar datos ni abrir una transacción.
- Instanciar cadenas por ejecución o componerlas una vez sin reconfiguración concurrente. No compartir un saldo mutable entre ejecuciones ni cambiar enlaces durante el procesamiento.

### 5.3 Motivos y tratamiento de errores

| Origen | Resultado canónico | Persistencia/comportamiento |
| --- | --- | --- |
| Flota realmente vacía/no elegible; CLUSTER `NO_AVAILABLE_VEHICLE` | `NO_VEHICLE_AVAILABLE` | Paquete propio `CLASSIFIED -> PENDING_ASSIGNMENT` |
| Hay vehículos elegibles pero faltan mensajeros/parejas; Chain `COURIER_UNAVAILABLE` | `NO_COURIER_AVAILABLE` | Pendiente; conservar evidencia de disponibilidad |
| Chain `VEHICLE_UNAVAILABLE` | `NO_VEHICLE_AVAILABLE` | Pendiente |
| `WEIGHT_CAPACITY_EXCEEDED`, `VOLUME_CAPACITY_EXCEEDED` | Mismo código | Pendiente con unidad/causa, sin datos personales |
| `NO_JOINT_CAPACITY`, `CAPACITY_EXHAUSTED_BY_HEURISTIC` | Mismo código | Pendiente; no afirmar que la heurística prueba imposibilidad global |
| Rechazo residual genérico de capacidad de un contrato legado | `NO_CAPACITY` | Solo si es un resultado logístico confirmado; preservar detalle |
| Datos/coordenadas/geocodificación/attachment/zona rechazados en paquete elegible | Código homónimo de `PendingAssignmentReason` | Pendiente; registrar handler estable y código de origen |
| Tenant distinto/recurso no visible/actor no autorizado | Error de acceso o no visible estable | Rechazo íntegro; cero escrituras y sin revelar pertenencia externa |
| Duplicado activo o estado incompatible | Conflicto de solicitud | No degradar un paquete ya asignado ni destruir su historial |
| Opciones de SEQ inválidas o discordancia propuesta/candidatos creada por aplicación | Error de contrato/invariante | Rollback; no presentarlo como falta de capacidad |
| Conflicto SERIALIZABLE/deadlock confirmado | Fallo transitorio | Rollback y reintento completo acotado |
| Desconexión, constraint inesperado, fallo de historial/outbox, excepción desconocida | Error técnico tipado | Rollback; no fabricar pendientes ni resultado `COMPLETED` |

Precedencia: acceso/contrato/estado se resuelven primero; prevalidación de datos/geografía después; falta de vehículo precede a falta de mensajero cuando ambos faltan; luego se conserva la precedencia de ADR-003 para capacidad y la del primer handler que rechaza. Si quedan vehículos sin pareja y la flota emparejada no puede ubicar más paquetes, conservar la causa real de CLUSTER y añadir evidencia de escasez de mensajeros; no sobrescribir un exceso de peso probado con una razón genérica.

**Alcance exacto de la regla crítica:** todos los rechazos logísticos de paquetes propios, existentes y elegibles se persisten como pendientes. Fallos de autorización, duplicados y corrupción no autorizan una transición State. Aplicar literalmente «cualquier handler» a un `TENANT_MISMATCH` violaría aislamiento; aplicarlo a un duplicado violaría el ciclo de vida. Esta distinción preserva simultáneamente la regla de negocio y las invariantes obligatorias.

### 5.4 Atomicidad y concurrencia

- Unidad de atomicidad: toda la solicitud. Un lote puede terminar con asignados y pendientes, pero todos esos resultados se confirman juntos. No hacer commit por cluster o paquete; tampoco una segunda transacción para State/outbox.
- Reutilizar el rol runtime `sls_app`, contexto tenant local a la transacción y RLS. Todo predicado y escritura incluye tenant; RLS complementa los filtros y las FK compuestas.
- Reclamar solicitud mediante unicidad persistida y comparación de parámetros canónicos. Puede reutilizarse `RoutePlanningRequest.id`; su clave primaria global no permite recuperar datos de otro tenant. Tratar una colisión externa como conflicto genérico sin revelar detalles.
- Protocolo de bloqueo a concretar con los writers existentes: solicitud → paquetes por ID → vehículos por ID → mensajeros por ID → rutas existentes por ID. Bloquear padres antes de modificar sus turnos/reservas; todos los escritores concurrentes deben respetar un orden compatible. El prototipo actual bloquea ruta antes de paquete: adaptar el camino compartido o demostrar y documentar su coordinación antes del cierre.
- Bajo bloqueo, volver a leer asignaciones activas, estados, medidas, turnos, ventanas y datos geográficos usados. SERIALIZABLE también protege lecturas de ausencia y phantoms; un error de serialización obliga a repetir el snapshot y la decisión completos.
- La suma reservada por vehículo considera todas sus asignaciones activas, no solo la ruta nueva. La comparación de capacidad vive en política pura. Cambios administrativos de capacidad/medidas deben usar el mismo protocolo; de otro modo no se puede afirmar garantía global, como advierte ADR-002.
- Recursos ocupados: rutas `PLANNED`, `READY`, `IN_PROGRESS` y `INTERRUPTED` reservan vehículo/mensajero. Una ruta no terminal heredada con recursos y ventana desconocida se considera ocupación conservadora hasta revisión. `COMPLETED`/`CANCELLED` no ocupan ventana, pero asignaciones aún `ACTIVE` siguen contando en capacidad y evidencian deuda de cierre.
- Solapamiento con intervalos semiabiertos: `existing.start < requested.end && requested.start < existing.end`. Rutas adyacentes pueden reutilizar recursos. No inferir hora final a partir de metros Haversine; la ventana viene de planificación y debe estar cubierta por turnos.
- Cada vehículo/mensajero se usa una vez en el lote. Bloquear ambos evita que dos solicitudes concurrentes creen rutas distintas con el mismo mensajero aun cuando sobre capacidad de carga.
- Reintentar exclusivamente errores transitorios identificados (`P2034`, SQLSTATE `40001`/`40P01`, según traducción del adapter). Presupuesto propuesto: máximo 3 intentos totales con espera acotada inyectable. Nunca reusar agregados/eventos/saldos del intento revertido ni ejecutar efectos externos dentro del callback.
- Al agotar intentos devolver error técnico reintentable; no persistir `PENDING_ASSIGNMENT` por agotamiento técnico. Ante commit de resultado incierto, recuperar por el mismo `requestId` antes de decidir una nueva operación.

### 5.5 Persistencia, historial y outbox

| Entidad | Escritura definida por aplicación |
| --- | --- |
| `RoutePlanningRequest` | Actor, parámetros normalizados, zona/depósito/ventana/perfil, dataset y versiones de algoritmos; `COMPLETED` y fecha final tras resultados |
| `Route` | Una por propuesta final no vacía; recursos completos; `PLANNED`; depósito y ventana; `plannedDistanceM` incluye retorno |
| `RouteStop` | Una por paquete aceptado; secuencia contigua `1..n`; coordenadas del candidato validado; geocoding attempt y estado `PENDING` |
| `Assignment` | Nueva fila `INITIAL`, `ACTIVE`, tenant, paquete, ruta, parada, vehículo, mensajero, actor, `reasonCode = AUTOMATIC_PLANNING`, fecha |
| `Package` | Actualizar con tenant e igualdad de estado previo esperado; destino obtenido exclusivamente de State |
| `PackageStatusHistory` | Una fila por transición con origen, destino, actor, razón y fecha del evento |
| `PlanningPackageResult` | Una fila por paquete/solicitud: `ASSIGNED` o `PENDING`; traducir a la unión pública sin confundir enum persistido con `PENDING_ASSIGNMENT` |
| `OutboxEvent` | Un envelope por transición State, inicialmente `PENDING`; ningún publish dentro de UoW |

El esquema actual ya soporta la mayor parte. `RouteStop` no tiene `packageId`: la asociación es `Assignment.routeStopId + packageId`, que debe preservarse y probarse. `AssignmentType` representa `INITIAL/REASSIGNMENT`, no `AUTOMATIC/MANUAL`; registrar origen automático mediante razón y evidencia de solicitud, sin cambiar significado del enum. Evaluar un campo de origen explícito solo si la integración posterior lo requiere.

Inmutabilidad histórica significa que tenant, paquete, ruta, parada, vehículo, mensajero, actor, tipo, razón y creación de una asignación no se reescriben ni se borran. Conforme ADR-002, una futura reasignación puede cerrar de forma controlada `status/endedAt` y crear otra fila. Este caso de uso únicamente inserta y deja intactas filas `ENDED`/`CANCELLED` existentes. Probar esta distinción; no prometer append-only absoluto de todas las columnas si el modelo contempla cierre.

Cada pendiente persiste razón tanto en historial de estado como en `PlanningPackageResult`, con evidencia de origen/handler y solicitud. No crear una asignación activa sin ruta para un pendiente. Su recuperación manual queda disponible por consulta tenant-scoped posterior.

Envelope obligatorio: `eventId`, `tenantId`, `correlationId`, `eventType`, `occurredAt`, `producer`, `version`, payload mínimo. Reutilizar `PackageAssigned`/`PackagePendingAssignment`; aplicación completa identidad/correlación y referencias de solicitud/ruta/asignación. El esquema outbox actual no tiene columna `producer`: conservarlo en payload según convención vigente o proponer migración coordinada con EVT-01, sin afirmar que existe la columna. No almacenar direcciones, teléfonos o destinatarios innecesarios.

`pullDomainEvents()` se consume una vez por agregado e intento y alimenta historial/outbox; ningún adapter decide una transición ni genera un evento de negocio alterno. Usar puertos de reloj/IDs donde se necesite determinismo; el agregado actual usa `new Date()`, por lo que ajustar ese punto con PKG-01 o no basar el oráculo en timestamps exactos. UUID y tiempo no influyen en agrupamiento ni orden de paradas.

Persistencia redondea coordenadas a 6 decimales y distancia a 2 conforme esquema; no realimentar esos redondeos en el algoritmo. Conservar métricas completas, origen y parámetros/versiones de SEQ en evidencia tipada de solicitud/resultados para poder explicar el circuito y su retorno. Haversine no justifica completar `plannedDurationS`.

Antes de una migración: inspeccionar datos existentes, nulabilidad y compatibilidad; conservar índice parcial activo, CHECKs, FK compuestas, grants/RLS. No borrar filas ni resetear una base compartida. Si bastan campos actuales, no crear una migración vacía.

## 6. Plan de entrega paso a paso

| Paso | Entregable | Responsable | Estado | Dependencias | Evidencia actual |
| --- | --- | --- | --- | --- | --- |
| 0 | Contratos, DTOs puros y puerto transaccional | `USER` — Humberto/Vivian | `TODO` | Auditoría y contratos existentes | Diagnóstico estático de este plan |
| 1 | Fixtures canónicas y pruebas en rojo | `USER` — Humberto/Vivian | `TODO` | Paso 0 | No ejecutadas |
| 2 | Chain adaptada y fronteras verificadas | `USER` — Humberto | `TODO` | Pasos 0–1; PAT-CHAIN/PKG/VEH | Prototipo existente; integración pendiente |
| 3 | Orquestador de aplicación | `USER` — Humberto | `TODO` | Pasos 0–2; CLUSTER/SEQ | No existe implementación integrada |
| 4 | UoW y persistencia Prisma | `USER` — Humberto, coordinación Vivian/Juanangel | `TODO` | Pasos 0–3; GDB y puertos PKG/VEH | Primitivas separadas existentes |
| 5 | Verificación Docker y cierre documental | `USER` / apoyo `CODEX_MECHANICAL` solicitado | `TODO` | Pasos 0–4 | Sin evidencia de ejecución nueva |

### Paso 0 — Contratos, DTOs y puerto transaccional

**Objetivo y razón:** acordar propiedad, atomicidad y semántica antes de introducir acoplamiento al ORM. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** diagnóstico, ADR-002/003/004 y coordinación PKG/VEH.

**Archivos esperados:**

- `backend/src/modules/route-planning/application/plan-and-assign-routes.contract.ts`.
- `backend/src/modules/route-planning/application/ports/planning-assignment-unit-of-work.ts` y contratos de sesión/proyecciones.
- Interfaces públicas mínimas de `assignments`, `packages` y flota; usar `application/ports/` para coordinación y `domain/repositories/` solo para contratos realmente de dominio.
- `docs/adr/005-transactional-route-assignment.md` — número previsto; comprobar que siga disponible antes de crearlo.

**Debe aplicar USER:** materializar tipos de §4, errores y motivos; definir autorización, ventana, emparejamiento, snapshot, métodos de escritura, replay y serialización de evidencia. Definir puertos de State composables sin transacción anidada. Acordar límite de iteraciones/tiempo y protocolo de locks. Precisar campos actuales frente a migraciones necesarias. Documentar la selección de `PLANNED` y el alcance de inmutabilidad.

**Lote mecánico posible:** crear archivos/exports a partir de contratos ya acordados y actualizar enlaces, solo tras solicitud explícita; el diseño no es mecánico.

**Verificación y salida:** contratos revisables y sin tipos de frameworks, Prisma, `any` ni estado objetivo ambiguo; ejemplos completos de éxito, todos pendientes, mixto, replay y fallo técnico. Dependencias pendientes identificadas por puerto/propietario. **Evidencia obtenida:** solo lectura de contratos existentes. **Restante:** todas las definiciones propuestas.

### Paso 1 — Fixtures canónicas y pruebas en rojo

**Objetivo y razón:** fijar resultados observables, concurrencia y rollback antes del orquestador. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** paso 0.

**Archivos esperados:**

- `backend/src/modules/route-planning/test/fixtures/assignment-planning.fixtures.ts`.
- `backend/src/modules/route-planning/test/assign-route-planning.spec.ts`.
- `backend/src/modules/route-planning/test/assignment-planning-architecture.spec.ts`.
- `backend/test/assignment-planning.e2e-spec.ts` y runner aislado previsto en paso 4.

**Debe aplicar USER:** usar dos tenants A/B, IDs fijos ordenables, zona/depot/dataset READY, paquetes CLASSIFIED, candidatos/attachments válidos, turnos y flota de capacidad conocida. Construir un fake de UoW que descarte escrituras ante fallo, sin tomarlo como evidencia de locks reales. Reutilizar convenciones vigentes de fixtures y Arrange/Act/Assert.

**Matriz mínima de fixtures y oráculos:**

| Caso | Oráculo |
| --- | --- |
| Dos paquetes compatibles y una pareja | Una ruta PLANNED, dos paradas `1..2`, dos asignaciones y dos transiciones/outbox |
| Peso exactamente al límite y exceso de 0.001 kg | Igualdad aceptada; exceso rechazado sin sobrecarga |
| Volumen exactamente al límite y exceso de 0.000001 m³ | Igualdad aceptada; exceso rechazado |
| Falta de vehículo / falta de mensajero | Todos pendientes con motivos diferenciados, cero rutas/asignaciones |
| Mezcla de paquete geográficamente inválido y válidos | Inválido pendiente; válidos siguen hasta asignación |
| Chain rechaza miembro de propuesta | Ruta recalculada solo con aceptados, sin parada huérfana y con secuencia contigua |
| Todos rechazados en propuesta | Cero ruta vacía; todos con motivo persistido |
| Mismo snapshot en permutaciones distintas | Igual partición, emparejamiento, orden y motivos, omitiendo IDs/tiempos generados |
| Recurso B solicitado por A / actor no autorizado | Cero efectos, resultado externo sin revelar pertenencia |
| Paquete ya asignado/estado incompatible | Conflicto, sin transición a pendiente ni cierre de asignación |
| Historial ENDED anterior | Nueva fila INITIAL según operación actual; filas previas idénticas |
| Mismo requestId y payload / payload diferente | Replay sin efectos / conflicto sin efectos |
| Fallo al guardar ruta, parada, asignación, estado, historial, resultado u outbox | Rollback integral en cada punto de fallo |
| Dos solicitudes por mismo paquete/vehículo/mensajero | No duplicación, sobrecarga ni doble ocupación; verificar con base real |

**Lote mecánico posible:** expandir casos tabulares ya aprobados, normalizar nombres y preparar scaffolding de pruebas. **Verificación y salida:** fallos rojos atribuibles a comportamiento aún no implementado, no a fixtures inválidos, imports rotos o entorno. **Evidencia obtenida:** ninguna ejecución. **Restante:** registrar comando, casos y causa de cada fallo inicial.

### Paso 2 — Adaptación de la Chain a Clean Architecture

**Objetivo y razón:** mantener el patrón real y eliminar decisiones de negocio desde persistencia. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** pasos 0–1.

**Archivos esperados:** `assignments/domain/validation.types.ts`, `validation.chain.ts`, handlers afectados y `package-eligibility-validation.handler.ts`; `assignments/application/assign-package-to-route.service.ts`; puertos acordados; suites Chain/servicio y arquitectura.

**Debe aplicar USER:** incorporar estado y zona solicitada, duplicado global por paquete, cantidades exactas y prefijo reutilizable; hacer contextos inmutables y errores exhaustivos. Mover construcción del contexto y evaluación de la Chain a aplicación. Sustituir el uso integrado de `reserveValidated(..., validate)` por UoW + puertos. Si el servicio legado continúa expuesto, adaptar su camino al mismo núcleo y protocolo, preservando mediante pruebas su contrato de reasignación separado; no dejar un bypass activo capaz de romper las garantías del flujo nuevo.

Retirar `@Injectable` de `ClusterPackagesService` conservando factory existente. Añadir reglas automatizadas de fronteras que detecten Nest, Prisma/client generado, infraestructura y presentation donde estén prohibidos, también imports de tipo/reexports. Acotar otras deudas de `route-planning` ya existentes, sin declararlas resueltas.

**Verificación y salida:** éxito, interrupción temprana, razón estable, sensibilidad al orden y extensión con nuevo handler; regresiones geográficas y de duplicados; precisión al límite; construcción de servicios sin Nest. **Lote mecánico posible:** imports, nombres de unidades y wiring después de definir el mapa y comportamiento. **Evidencia obtenida:** diez handlers inspeccionados; ninguna adaptación implementada. **Restante:** todos los cambios/pruebas descritos.

### Paso 3 — `PlanAndAssignRoutesService`

**Objetivo y razón:** concentrar el workflow completo en aplicación. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** pasos 0–2, CLUSTER y SEQ disponibles; contratos PKG/VEH acordados.

**Archivos esperados:** `route-planning/application/plan-and-assign-routes.service.ts`, políticas puras necesarias de selección/resultados, `route-planning.module.ts`, interfaces públicas y tests del paso 1.

**Debe aplicar USER:** implementar §5.1 mediante puertos, elegir estrategias inyectadas, ordenar de forma determinista, mapear motivos exhaustivamente, usar State, formar intenciones de persistencia y reconciliar cobertura del lote. Separar helper/política solo si expresa una responsabilidad concreta; no crear carpetas vacías. No llamar `reserve()` ni `transitionAtomically()` repetidamente dentro de la UoW.

**Verificación y salida:** tests de aplicación en verde con fakes, resultado mixto atómico, ausencia de I/O fuera de puertos, replay sin transiciones, propuestas/resultados inmutables. Conteos exactos: un resultado por paquete y una ruta únicamente para una propuesta final no vacía. **Lote mecánico posible:** registro de providers/exports y propagación de tipos acordados. **Evidencia obtenida:** ninguna. **Restante:** implementación y prueba con contratos reales, no únicamente mocks de CLUSTER/SEQ.

### Paso 4 — Adaptador transaccional Prisma

**Objetivo y razón:** demostrar que las invariantes sobreviven a fallos y concurrencia reales. **Estado:** `TODO`. **Responsable:** `USER`. **Dependencias:** pasos 0–3 y puertos composables de PKG/VEH.

**Archivos esperados:**

- `route-planning/infrastructure/prisma-planning-assignment-unit-of-work.ts` y adaptadores ligados a sesión según propiedad modular.
- Adaptación focalizada de persistencia `assignments`/`packages` para compartir transacción sin exponer Prisma a capas internas.
- `backend/prisma/schema/*.prisma` y nueva migración solo si hace falta.
- `backend/test/integration/assign-01.cjs`, script propuesto `test:assign-01` en `backend/package.json` e instrucciones en `backend/test/integration/README.md`.

**Debe aplicar USER:** implementar SERIALIZABLE, tenant local, protocolo de locks, traducción tipada de errores y reintento completo; mapping exacto decimal/geometría; creación de grafo ruta/paradas/asignaciones; historial/outbox/resultados y replay. Reutilizar o extender utilidades de transacción solo dentro de infraestructura: `runWithTenant` actual abre su propia transacción y no configura SERIALIZABLE explícitamente, por lo que no se puede anidar sin revisar su contrato.

Crear runner que provisiona base aleatoria en servidor desechable PostGIS, aplica migraciones desde cero, configura runtime `sls_app`, ejecuta únicamente la suite pertinente y elimina esa base en `finally`. Verificar que URLs pertenezcan a esa base; ninguna prueba destructiva apunta a la base compartida.

**Verificación y salida:** pruebas con dos conexiones y sincronización por barreras, no sleeps arbitrarios; inyección de fallo en cada persistencia; RLS real con A/B; unique parcial; cantidades exactas; replay concurrente; lock/relectura de recursos; preservación de historial. El adapter no llama Chain/State ni selecciona recursos. **Lote mecánico posible:** scaffolding del runner y wiring acordados; consultas/migraciones/reintentos siguen siendo `USER`. **Evidencia obtenida:** SQL/prototipos existentes inspeccionados. **Restante:** integración real completa.

### Paso 5 — Verificación con Docker Compose y cierre

**Objetivo y razón:** obtener evidencia reproducible del comportamiento y límites. **Estado:** `TODO`. **Responsable:** `USER`, con apoyo mecánico solicitado. **Dependencias:** pasos 0–4 implementados.

Ejecutar desde la raíz del repositorio. Todos los comandos de aplicación corren dentro de Compose:

```bash
docker compose up -d --build
docker compose ps
docker compose exec backend npm run build
docker compose exec backend npx tsc -p tsconfig.assign-01.json --noEmit
docker compose exec backend npm test -- --runInBand --runTestsByPath src/modules/route-planning/test/assign-route-planning.spec.ts src/modules/route-planning/test/assignment-planning-architecture.spec.ts
docker compose exec backend npm test -- --runInBand
docker compose exec backend npm run test:e2e
```

`tsconfig.assign-01.json` y los dos tests del comando focalizado son entregables previstos; no existen como resultado de este documento. Ejecutar el runner real de ASSIGN una vez creado y con variable administrativa apuntando **al servidor desechable**:

```bash
docker compose exec -e GDB_TEST_ADMIN_URL backend npm run test:assign-01
```

El host solo suministra esa variable; no imprimir credenciales en evidencia. Consultar el [README de integración](../../backend/test/integration/README.md) para el entorno y repetir `test:gdb-01`/`test:gdb-06` contra el servidor desechable si se modifican sus adaptadores. `test:e2e` genérico no sustituye la base real ni el runner aislado.

Si hubo cambios de esquema, generar cliente y revisar/aplicar migración en base de desarrollo apropiada mediante Compose; probar además migración desde esquema previo con historial existente, sin resetear datos. Registrar versión y resultado. Usar opciones/configuración Prisma multifichero vigentes; no asumir una ruta monolítica inexistente.

Verificar estilo según configuración vigente y solo en archivos del cambio. `npm run lint` incluye `--fix`: no ejecutarlo durante revisión documental o sin alcance de edición. No repetir suites sin nuevos cambios o fallos que lo justifiquen.

**Archivos de cierre:** este plan, ADR previsto, `docs/modules/assign-01-report.md`, README de integración y tablero solo tras verificar. El informe debe enlazar de vuelta a este plan.

**Criterio de salida:** CA-01–CA-08 satisfechos, build/typecheck estricto y pruebas relevantes aprobadas, evidencia PostgreSQL real registrada, deuda/limitaciones explícitas, migraciones revisadas cuando correspondan. **Lote mecánico posible:** ejecutar checks autorizados, compilar resultados y actualizar documentación con evidencia observada. **Evidencia obtenida:** ninguna ejecución en esta auditoría. **Restante:** toda la verificación funcional.

## 7. Criterios de aceptación

Sea `P` el conjunto de paquetes de una solicitud nueva autorizada y elegible, `A` los asignados y `Q` los pendientes persistidos. Un commit exitoso exige `A ∩ Q = ∅`, `A ∪ Q = P` y exactamente un `PlanningPackageResult` por elemento de `P`.

| ID | Invariantes exactos | Evidencia obligatoria |
| --- | --- | --- |
| **CA-01 — Aislamiento y autorización** | Tenant/actor vienen de contexto confiable. Lecturas/escrituras/relaciones y eventos respetan tenant; A no consulta ni muta recursos B. Recursos no visibles rechazan toda solicitud sin estados parciales ni revelación de pertenencia. | Tests de aplicación y PostgreSQL con runtime RLS; prueba del adaptador autorizado si se expone entrada real |
| **CA-02 — Plan válido y determinista** | Misma entrada/snapshot produce misma partición, parejas, motivos y secuencia, excluyendo IDs/fechas. Cada aceptado tiene exactamente una asignación activa y una parada ligada a su ruta. Ruta PLANNED con secuencia `1..n`, origen explícito y distancia total con retorno; ninguna ruta vacía. | CLUSTER/SEQ reales integrados, permutaciones y rechazo de miembro con reordenamiento |
| **CA-03 — Capacidad y exclusión concurrente** | Por vehículo, suma de gramos/cm³ de asignaciones ACTIVE tras commit no supera máximos. Igualdad válida, mínimo exceso inválido. No doble asignación activa de paquete ni vehículo/mensajero reservado en rutas solapadas. | Límites exactos, unique parcial y carreras con conexiones reales; comprobar turnos, ventanas y saldo previo |
| **CA-04 — Atomicidad completa** | Solicitud/resultados, rutas/paradas/asignaciones, estado/historial/outbox se confirman juntos o se revierten juntos. Error técnico nunca produce pendiente exitoso ni emisión externa antes de commit. | Fallos inducidos en cada fase de escritura y fallo de commit; ausencia de huérfanos en base real |
| **CA-05 — Pendientes explícitos** | Todo rechazo logístico elegible tiene `CLASSIFIED -> PENDING_ASSIGNMENT` vía State, razón estable en historial/resultado y evento durable; no Assignment ACTIVE. Cero flota y mezcla de éxitos/rechazos son resultados COMPLETED, sin DLQ ni error técnico. | Tabla exhaustiva de mapping/precedencia, todos pendientes y lote mixto persistidos |
| **CA-06 — State e historial preservado** | State es el único decisor de transición; cada transición genera una fila de historial y evento outbox. Nuevas asignaciones incluyen actor/razón/contexto completo; filas previas permanecen intactas. Duplicados/estados incompatibles no se degradan a pendiente. | Tests de State integrados, historial previo, snapshots de filas anteriores y ausencia de cierres implícitos |
| **CA-07 — Fronteras y tipos** | Dominio/aplicación integrados no importan Nest, Prisma/client generado, HTTP ni infraestructura. UoW no expone ORM; persistencia no invoca Chain/State ni decide resultados. Typecheck estricto sin any ni supresiones. | Test de arquitectura sobre archivos/transitivos pertinentes, instanciación sin Nest y typecheck que incluye tests |
| **CA-08 — Inmutabilidad y repetición segura** | Entradas/propuestas/secuencias no se mutan; DTO/resultados expuestos son copias inmutables. Repetir requestId con mismo comando devuelve mismos IDs/resultados sin nuevas filas/eventos; distinto comando rechaza. Un retry recrea agregados/saldos y no duplica efectos. | Deep-freeze/snapshots, replay secuencial y concurrente, conflicto de payload y retry con rollback real |

Las garantías de replay corresponden al comando síncrono de planificación. No equivalen a implementar Idempotent Consumer, entrega exactamente una vez por RabbitMQ ni publicación de outbox; esas tareas siguen separadas.

## 8. Decisiones técnicas y ADR previsto

Crear `ADR-005: Planificación y asignación atómica por solicitud`, estado inicial **Propuesto**, sujeto a revisión conceptual por responsables antes de implementar. Las siguientes decisiones constituyen el diseño propuesto de este plan; no se presentan como ADR aceptado ya existente.

| Decisión propuesta | Justificación | Consecuencia/verificación |
| --- | --- | --- |
| Orquestador en route-planning; Chain/historial en assignments; State en packages | Cada capacidad conserva sus políticas; no se concentra negocio en ORM | Contratos públicos y tests de fronteras; ningún import inverso circular |
| Una UoW por solicitud, SERIALIZABLE y locks ordenados | Capacidad, recursos, historial y estado deben describir una misma operación | Rollback integral; costo temporal acotado y protocolo compartido con otros writers |
| Cálculo puro acotado dentro de transacción | Primera versión evita snapshot obsoleto y revalidación optimista compleja | Límite de lote y 2-opt, medición antes del cierre; ninguna llamada externa |
| Route inicial PLANNED | La secuencia ya fue calculada y validada | No significa READY ni despacho; revisión/ejecución posteriores |
| Emparejamiento determinista de recursos y ventana obligatoria | CLUSTER solo entiende vehículos; falta cubrir mensajero y ocupación | Un recurso por propuesta/lote; restricciones de turno sin inferir tiempo de viaje |
| Pendiente como éxito de negocio durable | Falta de recursos/geografía corregible requiere intervención operativa | State + razón + resultado + outbox; nunca DLQ por falta de capacidad |
| Rechazos de seguridad/duplicados separados de pendientes | No existe autorización para degradar un paquete ajeno o ya asignado | Rechazo sin escrituras; invariantes más fuertes que un mapping indiscriminado de errores |
| Reutilizar historial y resultados existentes | El esquema ya modela trazabilidad y unicidad | Evitar tablas paralelas; preservar SQL fuera de representación Prisma |
| Payload histórico inmutable con cierre de ciclo explícito | Compatible con ADR-002 y conservación de reasignaciones | ASSIGN-01 inserta; futuro cierre solo modifica campos permitidos y crea otra fila |
| Outbox transaccional y replay por solicitud | Evita evento sin estado y duplicación por repetición del comando | Durabilidad local demostrable; publicación posterior fuera de alcance |
| Cadenas decimales e enteros exactos | Consistencia con ADR-003 y NUMERIC persistido | Sin redondeos de capacidad ni tolerancias que admitan sobrecarga |

Alternativas descartadas para este alcance: commit por paquete (deja lote incoherente ante fallo técnico), reserva seguida de otra transacción State (riesgo de estado divergente), adapter que invoca Chain (inversión de responsabilidades), publicación directa antes del commit (eventos fantasma), microservicios o saga distribuida (complejidad innecesaria en una base compartida), borrar/sobrescribir historial para reasignar (pérdida de auditoría).

Las ventanas por parada, prioridad/deadline como objetivos de optimización, compatibilidad especializada de vehículos y recuperación manual requieren contratos posteriores. Este plan no promete que una heurística de distancia satisfaga automáticamente esos requisitos.

## 9. Bitácora inicial y siguiente paso

| Fecha | Paso | Cambio observado | Verificación | Commit |
| --- | --- | --- | --- | --- |
| 2026-10-03 | Auditoría inicial | Leídos AGENTS, habilidad de workflow, ADR-002/003/004, planes relacionados, contratos CLUSTER/SEQ/Chain/State, esquema y migraciones | Inspección estática; árbol limpio; rama `feature/assing-01` | Base `6405643cc1278e5a395de9c993d854fa1fd1efd9` |
| 2026-10-03 | Diagnóstico | Confirmadas Chain con duplicado, transacciones separadas, decisiones en adapter, outbox existente, esquema multifichero y noImplicitAny desactivado | Código/configuración; sin ejecución de pruebas | Misma base |
| 2026-10-03 | Plan canónico | Definidos alcance, contratos propuestos, semántica transaccional, seis pasos y CA-01–CA-08 | Revisión documental y trazabilidad de fuentes; sin cambios de implementación | `10aa285` |
| 2026-10-04 | Paso 1 | Adaptación de Chain a unidades enteras y prevalidación sin I/O | 431 tests unitarios aprobados | `fb1b228` |
| 2026-10-04 | Paso 2 | Implementación pura de `PlanAndAssignRoutesService` y puertos | Compilación limpia | `0760064` |
| 2026-10-05 | Paso 3 | Tests unitarios de orquestación y fronteras de arquitectura | 15 tests dedicados verdes | `3c562ad` |
| 2026-10-05 | Paso 4 | UoW SERIALIZABLE, permisos/RLS en Postgres y test E2E | 5/5 tests de integración verdes | `508a117`, `80e1966` |
| 2026-10-05 | Paso 5 | Informe canónico y cierre documental de ASSIGN-01 | Verificación completa 100% | Pendiente |

**Estado del módulo: COMPLETADO.** Todos los pasos (0 a 5) y criterios (CA-01 a CA-08) han sido implementados y verificados con pruebas automatizadas en Docker.

## 10. Condiciones de cierre

- [x] Contratos/ADR revisados y límites de responsabilidad consistentes.
- [x] Pasos 0–5 completados con evidencia real por paso.
- [x] CA-01–CA-08 satisfechos, incluida concurrencia PostgreSQL real.
- [x] Build y typecheck estricto del alcance, unitarias, arquitectura y regresiones relevantes aprobados en Compose.
- [x] Integración ejecutada en base desechable; migraciones y datos históricos verificados cuando apliquen.
- [x] Autorización/tenant comprobados en el punto de entrada disponible; declarar explícitamente cualquier integración HTTP pendiente.
- [x] Sin deuda de writers concurrentes que invalide capacidad, exclusión de recursos o historial.
- [x] Informe con comandos, fecha, resultados, limitaciones y vínculo de retorno al plan.
- [x] Estado del plan/tablero actualizado solo tras contrastar evidencia y código.
- [x] Ningún cambio ajeno sobrescrito ni commit creado por la mera generación del plan.

`DONE` significará que el caso de uso de planificación/asignación cumple este alcance. La ejecución completa de rutas, entregas, UI y publicación/consumo RabbitMQ continuará dependiendo de sus módulos propios.
