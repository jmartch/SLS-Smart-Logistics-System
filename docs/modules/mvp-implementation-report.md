# MVP — auditoría y hoja de ruta

Plan canónico: [implementación del MVP](../plans/mvp-implementation.md).

Estado: `IN_PROGRESS` para el MVP completo. Actualizado al 2026-10-02 en rama `feature/seq-01`. Se ejecutaron suites completas de pruebas unitarias y de arquitectura dentro del contenedor Docker (`backend`), alcanzando 51 suites y 413 tests pasando al 100%, junto con compilación TypeScript exitosa (`nest build`).

## Alcance observado y estado de componentes

1. **Entorno y datos**: Docker Compose funcional con backend, frontend, PostgreSQL/PostGIS 17 y RabbitMQ. Prisma multiarchivo con RLS y aislamiento tenant en base de datos.
2. **Paquetes y Estado**: Agregado `Package` con máquina de estados finita (patrón GoF State), historial de transiciones y eventos outbox.
3. **Validación y Asignación**: Cadena de responsabilidad (GoF Chain of Responsibility) con reserva de capacidad transaccional (`GDB-01`). Pendiente refactor e integración final en `ASSIGN-01`.
4. **Planificación de rutas (Etapa 4 - Dominio y Aplicación)**:
   - **`GEO-01`**: Validación rigurosa de coordenadas geográficas y cálculo de distancia Haversine implementado manualmente con oráculos trigonométricos independientes.
   - **`CLUSTER-01`**: Agrupamiento determinista de destinos por radio con partición por capacidad (`maxWeightKg`, `maxVolumeM3`), oráculo centroidal k-means y servicio de aplicación `ClusterPackagesService` ([ADR-003](../adr/003-deterministic-radius-clustering.md), [reporte](cluster-01-report.md)).
   - **`SEQ-01`**: Ordenamiento de paradas mediante estrategia GoF (`StopOrderingAlgorithm`), implementando `NearestNeighborOrdering` como tour base cerrado y `TwoOptOrdering` como optimización local bounded *first-improvement*. Desempate determinista por `packageId` ordinal UTF-16, inmutabilidad profunda y servicio de aplicación `OrderRouteStopsService` ([ADR-004](../adr/004-deterministic-stop-ordering.md), [reporte](seq-01-report.md)).
   - **Fronteras Clean Architecture**: Verificadas mediante tests automatizados (`clustering-architecture.spec.ts`, `stop-ordering-architecture.spec.ts`) garantizando que `domain/` y `application/` no importen NestJS, Prisma ni frameworks externos.
5. **Caminos viales**: Grafo vial dirigido y algoritmo de Dijkstra implementados ([GDB-05](../plans/gdb-05.md)).
6. **Frontend**: Interfaz React + Vite con registro de paquetes y visor de códigos QR; configuración de mocks lista para desconexión progresiva hacia endpoints reales.
7. **Mensajería y Workers**: RabbitMQ aprovisionado; modelos OutboxEvent, ProcessedEvent y DeadLetterMessage disponibles; pendiente worker de consumo idempotente y DLQ en `EVT-01` / `RMQ-01`.

## Resumen de etapas del MVP

| Etapa | Módulos | Estado | Avance reciente |
| --- | --- | --- | --- |
| 0 | Contratos y fronteras | `IN_PROGRESS` | Contratos de clustering (`CLUSTER-01`) y ordenamiento (`SEQ-01`) cerrados con ADR-003 y ADR-004. |
| 1 | AUTH-01 / TENANT-01 / UI-01 | `TODO` | Pendiente sesión y aislamiento HTTP interactivo. |
| 2 | ZONE-01 / PKG-01 / VEH-01 / UI-02 | `TODO` | Pendiente integración de casos de uso y endpoints de catálogos/recursos. |
| 3 | EVT-01 / RMQ-01 / IDEMP-01 / DLQ-01 | `TODO` | Infraestructura lista; pendiente worker y pipeline de reintentos/DLQ. |
| 4 | GEO-01 / CLUSTER-01 / SEQ-01 / ASSIGN-01 / UI-03 | `IN_PROGRESS` | **GEO-01, CLUSTER-01 y SEQ-01 completados al 100% en dominio/aplicación**. Resta `ASSIGN-01` (Chain + persistencia transaccional de rutas) y `UI-03`. |
| 5 | ROUTE-01 / DELIVERY-01 / ROUTE-CLOSE-01 | `TODO` | Modelos de datos listos; pendiente ciclo de vida operativo. |
| 6 | NOTIF-01 / NOTIF-02 / UI-04 | `TODO` | Modelos listos; pendiente consumers y adapter de email. |
| 7 | SEC-01 / QA-01 / EVID-01 / DOC-01/02 | `IN_PROGRESS` | Documentación viva actualizada; suites de tests unitarios y de arquitectura en crecimiento continuo. |

## Verificación y entorno

- **Entorno de ejecución**: Contenedores Docker Compose (`sls-backend`, `sls-postgres`, `sls-rabbitmq`, `sls-frontend`).
- **Compilación backend**:
  ```bash
  docker compose exec backend npm run build
  # nest build -> 0 errores de compilación
  ```
- **Pruebas automatizadas backend**:
  ```bash
  docker compose exec backend npm test -- --runInBand
  # Test Suites: 51 passed, 51 total
  # Tests:       413 passed, 413 total
  # Snapshots:   0 total
  # Time:        15.42 s
  ```
- **Auditoría arquitectónica**: Cumplimiento estricto de Clean Architecture en `modules/route-planning` (aislamiento total de NestJS/Prisma en dominio y aplicación).

## Cierre

La capa de algoritmos de optimización logística del MVP (`GEO-01`, `CLUSTER-01`, `SEQ-01`) se encuentra completamente implementada, documentada y blindada con pruebas unitarias y de arquitectura. El siguiente foco en la planificación de rutas es `ASSIGN-01` para conectar la propuesta de clusters y secuencias con la cadena de validación transaccional y la persistencia de rutas en PostgreSQL.
