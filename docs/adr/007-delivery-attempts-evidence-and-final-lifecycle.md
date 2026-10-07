# ADR-007: Intentos de entrega atómicos, custodia física y evidencias desacopladas

Fecha: 2026-10-06  
Estado: Aceptado e implementado  
Plan canónico: [docs/plans/delivery-01.md](../plans/delivery-01.md)  
Informe de implementación: [docs/modules/delivery-01-report.md](../modules/delivery-01-report.md)

## Contexto

Una vez iniciada una ruta (`RouteState.IN_PROGRESS`), el mensajero en calle requiere registrar el arribo a paradas, resultados individuales por paquete (éxito o fallo), captura de evidencias básicas (foto y/o firma), resolución de incidencias y excepciones (reprogramaciones o devoluciones) sin comprometer la consistencia transaccional ni el aislamiento multi-tenant.

## Decisión

Se adoptan las decisiones arquitectónicas D1 a D8:

### D1. Clean Architecture y Contratos
- `deliveries/domain/`: Reglas puras de intentos, evidencias inmutables, motivos de fallo y políticas de resolución de parada multipaquete.
- `deliveries/application/`: Casos de uso atómicos coordinando puertos sin importar Prisma ni Express.
- `deliveries/infrastructure/`: Adaptadores Prisma `SERIALIZABLE` y almacenamiento desacoplado en sistema de archivos local privado.
- `deliveries/presentation/`: Controlador REST HTTP `/api/v1/deliveries` con DTOs y guardas de contexto autenticado.

### D2. Ciclo de Vida y Custodia Física
- **Arribo:** Parada `PENDING` -> paquetes en manifiesto pasan de `IN_TRANSIT` a `OUT_FOR_DELIVERY`.
- **Éxito:** Intento `DELIVERED` requiere evidencia básica válida, State pasa a `DELIVERED`, asignación finaliza como `ENDED`.
- **Fallo:** Intento `FAILED` exige motivo estructurado, State pasa a `DELIVERY_FAILED`, custodia física permanece `ACTIVE` en el vehículo.
- **Reprogramación:** State `RESCHEDULED` con nueva ventana acordada sin liberar custodia hasta recepción física.
- **Devolución:** Solicitud pasa a `RETURN_PENDING`. La recepción en depósito mediante `ReturnPackageToDepotUseCase` finaliza la asignación y transiciona a `RETURNED` (o mantiene `RESCHEDULED` si ingresa para un futuro nuevo despacho).

### D3. Resolución de Parada Multipaquete
- Una parada permanece `PENDING` mientras falte resolver algún paquete de su manifiesto de despacho.
- Se resuelve a `COMPLETED` si todos los paquetes fueron entregados.
- Se resuelve a `FAILED` si todos fueron atendidos pero al menos uno resultó fallido.
- La consulta de manifiesto consume los iteradores existentes `PendingRouteStopIterator` y `FailedRouteStopIterator`.

### D4. Transacciones SERIALIZABLE e Idempotencia
- Transacciones `SERIALIZABLE` atómicas con reintentos acotados (hasta 3) ante `P2034` / `40001` con backoff y jitter.
- Bloqueo determinista anti-deadlock: Ruta -> Paquetes por ID -> Parada -> Asignaciones.
- Idempotencia por cabecera `Idempotency-Key` UUID persistida en `DeliveryOperation`. Mismo hash y actor retorna replay con `replayed: true`; colisión con distinto hash devuelve `409 IDEMPOTENCY_KEY_REUSED`.

### D5. Evidencias Desacopladas
- Subida multipart en la misma llamada del intento exitoso.
- Checksum SHA-256 de 64 caracteres calculado en el servidor sobre los bytes recibidos.
- Almacenamiento en volumen privado desacoplado (`EvidenceStoragePort`). En rollback se limpian los archivos preparados sin referencias huérfanas.
- Descarga segura por `evidenceId` validando permisos sin exponer rutas ni storage keys internas.

### D6. Esquema y Motivos Estructurados
- Numeración determinista `1..N` por `(tenantId, packageId)` bajo lock de paquete.
- Motivos de fallo: `RECIPIENT_ABSENT`, `ADDRESS_NOT_FOUND`, `RECIPIENT_REFUSED`, `ACCESS_RESTRICTED`, `DAMAGED_PACKAGE`, `OTHER` (exige notas explicativas).
- Tiempos reales en parada: `actualArrivalAt` y `actualServiceEndAt` sin sobreescribir ventanas planificadas.

### D7. HTTP v1 y Seguridad
- Rutas bajo `/api/v1/deliveries`.
- Contexto obligatorio vía `@CurrentContext()`. Prohibición de recibir `tenantId` en cuerpos para autorizar.
- Permisos explícitos: `deliveries.execute` para courier asignado; `deliveries.manage` para coordinación; `deliveries.receive` para depósito.

### D8. Eventos Outbox
- Persistencia atómica de eventos en la misma transacción: `PackageOutForDelivery`, `PackageDelivered`, `DeliveryFailed`, `PackageRescheduled`, `PackageReturnPending`, `PackageReturned`, `IncidentReported`. Envelope canónico con productor `sls-backend.deliveries`.