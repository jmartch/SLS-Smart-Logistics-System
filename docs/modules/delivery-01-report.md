# DELIVERY-01 — Ciclo de vida de entregas, custodia, captura de evidencias e integridad transaccional

Estado: **DONE para el alcance definido**.

Plan de trabajo: [DELIVERY-01](../plans/delivery-01.md).

---

## 1. Alcance verificado

- **Decisión Arquitectónica y ADR-007:** [ADR-007: Intentos de entrega, evidencia física y ciclo de vida final](../adr/007-delivery-attempts-evidence-and-final-lifecycle.md).
- **Entidades de Dominio e Invariantes:**
  - `DeliveryAttempt`: Entidad inmutable con numeración secuencial de intento calculada por paquete (`attemptNumber = 1 + MAX(attemptNumber)`), resultado de entrega (`DELIVERED | FAILED`), motivo estandarizado y notas.
  - `DeliveryEvidence`: Representación de evidencia física (`PHOTO` y `SIGNATURE`), con checksum SHA-256, tipo MIME verificado, tamaño en bytes y clave de almacenamiento inmutable.
  - `DeliveryFailureReason`: Catálogo cerrado de causas de fallo (`RECIPIENT_ABSENT`, `ADDRESS_NOT_FOUND`, `RECIPIENT_REFUSED`, `ACCESS_RESTRICTED`, `DAMAGED_PACKAGE`, `OTHER`).
  - `DeliveryStopResolutionPolicy`: Política pura de dominio que evalúa la resolución de paradas multipaquete (`PENDING`, `COMPLETED`, `FAILED`), asegurando que paradas con entregas mixtas no se cierren prematuramente y se marquen `FAILED` si al menos un paquete falló.
- **Casos de Uso de Aplicación:**
  - `AttendRouteStopUseCase`: Registra llegada física del mensajero a la parada (`arrivalAt`), transicionando paquetes asociados de `IN_TRANSIT` a `OUT_FOR_DELIVERY` y parada a `IN_PROGRESS`.
  - `RecordSuccessfulDeliveryUseCase`: Registra entrega exitosa, requiere al menos una evidencia fotográfica o firma, finaliza custodia en vehículo (`Assignment -> ENDED`, `reasonCode: DELIVERED`), transiciona paquete a `DELIVERED` y evalúa resolución de parada.
  - `RecordFailedDeliveryUseCase`: Registra intento fallido sin liberar la custodia física en vehículo (`Assignment -> ACTIVE`), transiciona paquete a `DELIVERY_FAILED` y evalúa resolución de parada.
  - `RescheduleDeliveryUseCase`: Permite al coordinador acordar una nueva ventana horaria para un paquete fallido (`RESCHEDULED`), preservando custodia física en vehículo hasta ingreso al depósito.
  - `RequestPackageReturnUseCase`: Solicita devolución formal tras agotar intentos o rechazo (`RETURN_PENDING`), manteniendo custodia en vehículo.
  - `ReturnPackageToDepotUseCase`: Confirmación física en depósito (`physicalReceiptConfirmed: true`), finalizando la custodia en vehículo (`Assignment -> ENDED`, `RECEIVED_AT_DEPOT_RETURNED` o `RECEIVED_AT_DEPOT_RESCHEDULED`).
  - `ReportIncidentUseCase`: Registro tipificado de incidentes operacionales vinculados a ruta, parada o paquete.
  - `GetDeliveryManifestUseCase`: Consulta del manifiesto de entrega consumiendo directamente el patrón GoF `RouteStopIterator` (`all`, `pending`, `failed`).
- **Almacenamiento de Evidencias (`EvidenceStoragePort` & `LocalEvidenceStorageAdapter`):**
  - Almacenamiento seguro en sistema de archivos local (`EVIDENCE_STORAGE_ROOT`), con validación de tipos MIME (JPEG, PNG, WebP), cálculo criptográfico SHA-256, límites de tamaño (5 MiB por archivo) y aislamiento por tenant.
  - Preparación de archivos previa a la transacción SQL y eliminación de archivos temporales/huérfanos en caso de rollback.
- **Unidad Transaccional Atómica (UoW):**
  - `PrismaDeliveryUnitOfWork` ejecutando cada mutación operativa bajo nivel de aislamiento `SERIALIZABLE`.
  - Detección y reintento automático ante colisiones de concurrencia y serialización (`P2034`, SQLSTATE `40001`, `40P01`) con backoff exponencial y jitter.
  - Ejecución bajo contexto tenant local (`runWithTenant` con variable `app.current_tenant_id`).
  - Idempotencia HTTP basada en `Idempotency-Key` y tabla `DeliveryOperation`, asegurando replay determinista ante peticiones repetidas y detección de conflictos (`409`).
  - Publicación atómica en `AuditLog` y `OutboxEvent` (`PackageDelivered`, `PackageDeliveryFailed`, `PackageOutForDelivery`, `PackageRescheduled`, `PackageReturnRequested`, `PackageReturned`).
- **Esquema Relacional y Migraciones PostgreSQL 17 / PostGIS:**
  - Migración `20261006153000_delivery_lifecycle_and_evidence`.
  - Tablas: `DeliveryAttempt`, `DeliveryEvidence`, `DeliveryOperation`, `Incident`.
  - RLS activado con `FORCE ROW LEVEL SECURITY` en todas las tablas nuevas y grants explícitos a `sls_app`.
- **Capa de Presentación y API HTTP:**
  - `DeliveriesController` (`/api/v1/deliveries`) con 8 endpoints REST.
  - DTOs con validación estricta y mapeo tipado de errores de dominio a códigos HTTP (`400`, `401`, `403`, `404`, `409`, `503`).
- **Aislamiento Multi-Tenant y Seguridad RLS:**
  - Verificado en base de datos temporal PostgreSQL 17 / PostGIS bajo el usuario runtime `sls_app`.
  - Comprobado que usuarios de un Tenant B no pueden consultar ni mutar rutas, paradas o paquetes del Tenant A.

---

## 2. Matriz de Criterios de Aceptación (CA-01 a CA-15)

| Criterio | Descripción | Estado | Caso de prueba verificador |
|---|---|---|---|
| **CA-01** | Endpoints REST de ciclo de vida de entregas y manifiesto | **PASSED** | `delivery-http.e2e-spec.ts` (17 pruebas supertest) |
| **CA-02** | Asistencia/Arribo a parada (`attendRouteStop`) | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › CA-02 & CA-03 |
| **CA-03** | Transición a `OUT_FOR_DELIVERY` de paquetes asociados | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › CA-02 & CA-03 |
| **CA-04** | Entrega exitosa con captura obligatoria de evidencia | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › CA-04, CA-05 & CA-06 |
| **CA-05** | Almacenamiento y checksum SHA-256 de evidencias | **PASSED** | `evidence-storage.spec.ts` & `delivery-lifecycle.e2e-spec.ts` |
| **CA-06** | Resolución de paradas multipaquete (`DeliveryStopResolutionPolicy`) | **PASSED** | `delivery-domain.spec.ts` & `delivery-lifecycle.e2e-spec.ts` |
| **CA-07** | Intento fallido sin pérdida de custodia en vehículo | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › CA-07 & CA-08 |
| **CA-08** | Idempotencia y replay de intentos | **PASSED** | `delivery-http.e2e-spec.ts` & `delivery-attempts.spec.ts` |
| **CA-09** | Reprogramación con nueva ventana y retención de custodia | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › CA-09 |
| **CA-10** | Solicitud de devolución y recepción física en depósito | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › CA-10 |
| **CA-11** | Registro de incidentes operacionales | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › Incident Reporting |
| **CA-12** | Consulta de manifiesto con GoF RouteStopIterator | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › Manifest Query |
| **CA-13** | Transacciones `SERIALIZABLE` con reintento ante colisión `40001` | **PASSED** | `prisma-delivery-unit-of-work.spec.ts` & suite E2E |
| **CA-14** | Aislamiento multi-tenant y RLS bajo `sls_app` | **PASSED** | `delivery-lifecycle.e2e-spec.ts` › CA-14 |
| **CA-15** | Integridad de Outbox y trazabilidad de eventos | **PASSED** | `delivery-lifecycle.e2e-spec.ts` & UoW specs |

---

## 3. Resumen de Ejecución y Pruebas

### 3.1 Pruebas Unitarias y de Arquitectura
- **Comando:** `npm run test` (en `backend/`)
- **Resultado:** **75 suites pasadas, 75 totales. 692 tests pasados, 692 totales (100% GREEN).**
- **Duración:** ~5.4 s.

### 3.2 Pruebas E2E / Integración en Base Desechable
- **Comando:** `make integration-test TEST=delivery-01`
- **Contenedores:** `integration-postgres` (PostgreSQL 17.0 + PostGIS 3.6), `sls-backend`
- **Base de datos:** `sls_delivery01_*` creada dinámicamente y destruida tras las pruebas.
- **Usuario runtime:** `sls_app` (RLS enforceado).
- **Suites ejecutadas:**
  1. `test/delivery-lifecycle.e2e-spec.ts`: 12/12 tests pasados.
  2. `test/delivery-http.e2e-spec.ts`: 17/17 tests pasados.
- **Resultado:** **2 suites pasadas, 29/29 tests pasados (100% GREEN).**

### 3.3 Calidad de Código y Tipado
- **Compilación:** `npm run build` y `npx tsc --noEmit` completados con **cero errores**.
- **Linter:** `npx eslint "src/modules/deliveries/**/*.ts"` completado con **cero errores y cero advertencias**.

---

## 4. Archivos Modificados e Implementados

### 4.1 Dominio y Puertos
- `backend/src/modules/deliveries/domain/delivery-attempt.ts`
- `backend/src/modules/deliveries/domain/delivery-evidence.ts`
- `backend/src/modules/deliveries/domain/delivery-failure-reason.ts`
- `backend/src/modules/deliveries/domain/delivery-stop-resolution.policy.ts`
- `backend/src/modules/deliveries/domain/delivery-errors.ts`
- `backend/src/modules/deliveries/application/ports/delivery-unit-of-work.ts`
- `backend/src/modules/deliveries/application/ports/evidence-storage.port.ts`
- `backend/src/modules/deliveries/application/ports/delivery-access.port.ts`

### 4.2 Casos de Uso
- `backend/src/modules/deliveries/application/use-cases/attend-route-stop.use-case.ts`
- `backend/src/modules/deliveries/application/use-cases/record-successful-delivery.use-case.ts`
- `backend/src/modules/deliveries/application/use-cases/record-failed-delivery.use-case.ts`
- `backend/src/modules/deliveries/application/use-cases/reschedule-delivery.use-case.ts`
- `backend/src/modules/deliveries/application/use-cases/request-package-return.use-case.ts`
- `backend/src/modules/deliveries/application/use-cases/return-package-to-depot.use-case.ts`
- `backend/src/modules/deliveries/application/use-cases/report-incident.use-case.ts`
- `backend/src/modules/deliveries/application/use-cases/get-delivery-manifest.use-case.ts`

### 4.3 Infraestructura, Persistencia y Presentación
- `backend/src/modules/deliveries/infrastructure/persistence/prisma-delivery-unit-of-work.ts`
- `backend/src/modules/deliveries/infrastructure/storage/local-evidence-storage.adapter.ts`
- `backend/src/modules/deliveries/infrastructure/authorization/auth-delivery-access.adapter.ts`
- `backend/src/modules/deliveries/presentation/deliveries.controller.ts`
- `backend/src/modules/deliveries/presentation/deliveries-http-errors.ts`
- `backend/src/modules/deliveries/presentation/dto/delivery-common.dto.ts`
- `backend/src/modules/deliveries/presentation/dto/delivery-requests.dto.ts`
- `backend/src/modules/deliveries/deliveries.module.ts`
- `backend/src/app.module.ts`

### 4.4 Base de Datos y Migraciones
- `backend/prisma/schema/delivery.prisma`
- `backend/prisma/migrations/20261006153000_delivery_lifecycle_and_evidence/migration.sql`

### 4.5 Pruebas y Fixtures
- `backend/src/modules/deliveries/test/delivery-domain.spec.ts`
- `backend/src/modules/deliveries/test/delivery-attempts.spec.ts`
- `backend/src/modules/deliveries/test/delivery-exceptions.spec.ts`
- `backend/src/modules/deliveries/test/evidence-storage.spec.ts`
- `backend/src/modules/deliveries/test/deliveries.controller.spec.ts`
- `backend/src/modules/deliveries/test/deliveries-architecture.spec.ts`
- `backend/src/modules/deliveries/test/prisma-delivery-unit-of-work.spec.ts`
- `backend/test/fixtures/delivery-lifecycle.fixtures.ts`
- `backend/test/delivery-lifecycle.e2e-spec.ts`
- `backend/test/delivery-http.e2e-spec.ts`
- `backend/test/integration/delivery-01.cjs`
- `backend/package.json`
- `Makefile`

---

## 5. Limitaciones y Próximos Pasos

1. **Cierre Global de Ruta:** El cierre final de la ruta (`COMPLETED`) y el cálculo consolidado del resumen operacional corresponden a los módulos posteriores del pipeline.
2. **Workers de RabbitMQ:** Los eventos depositados atómicamente en `OutboxEvent` serán consumidos y despachados por los workers de mensajería asíncrona hacia colas durables con DLQ.
3. **Interfaz de Usuario (UI-03):** La capa frontend consumirá los 8 endpoints REST documentados en este módulo para las vistas del mensajero móvil y del coordinador.
