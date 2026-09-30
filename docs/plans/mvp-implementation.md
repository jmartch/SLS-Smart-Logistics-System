# Hoja de ruta de implementación del MVP SLS

## Identidad y uso

| Campo | Valor |
| --- | --- |
| Entregable | MVP funcional y defensa técnica |
| Estado | `IN_PROGRESS`: componentes existentes; recorrido completo pendiente |
| Auditoría | 2026-09-30, rama `develop`, commit `efea332` |
| Responsables | Juanangel: acceso/mensajería; Vivian: paquetes/vehículos/mensajeros; Humberto: zonas/planificación/rutas; Santiago: frontend |
| Informe | [Auditoría del MVP](../modules/mvp-implementation-report.md) |
| Reparto inicial | [Puntos 1 y 2](mvp-puntos-1-2.md) |

Este es el orden recomendado para completar el MVP a partir del código actual. Los planes individuales siguen siendo canónicos para sus pasos detallados. No sustituye criterios de AGENTS.md ni cambia estados del tablero sin verificación. No se fijan fechas de entrega porque no se ha informado disponibilidad ni plazo.

La inspección fue estática, con árbol limpio y merge de frontend integrado. No se ejecutaron builds/tests ni se comprobó la base compartida. “Existe” significa código/configuración versionados; los resultados históricos se enlazan como antecedentes y no equivalen a verificar este commit. No se inspeccionó avance no integrado de otras ramas.

## Lo que ya tenemos y lo que falta

| Capacidad | Evidencia existente | Pendiente para el MVP |
| --- | --- | --- |
| Entorno y datos | Compose con frontend/backend, PostgreSQL/PostGIS y RabbitMQ; Prisma multiarchivo y migraciones en `backend/prisma/` | Verificar arranque reproducible y migraciones en entorno de prueba; ampliar solo brechas del dominio |
| Base tenant | RLS, FK compuestas, `runWithTenant`, `PrismaService`, pruebas de aislamiento | Identidad autenticada, contexto obligatorio, guardas y aislamiento HTTP real |
| Paquetes/State | Agregado, estados, servicio de transición, adapter con historial/outbox y tests | Refactor Clean Architecture; registro/consulta/corrección/clasificación, datos completos de remitente/destinatario/contacto y API |
| Asignación/Chain | Handlers, Chain, servicio y reserva transaccional; [evidencia GDB-01](../geospatial/gdb-01-report.md) | Revisar orquestación dentro del adapter, integrar planificación, State/outbox, resultados pendientes y recuperación manual |
| Geocodificación | Normalización, ranking local, puertos/adapters y pruebas; [GEOCODE-01](geocode-01.md) | Integración de registro/revisión y catálogo adecuado para demo; no es geocodificador universal |
| Caminos viales | Grafo dirigido, Dijkstra, geometría y persistencia de recorrido; [GDB-05](gdb-05.md) | Integración operativa; Dijkstra no reemplaza Haversine, clustering ni ordenamiento de paradas |
| Zonas y recursos | Modelos Zone/Sector/ShipmentType, Vehicle/Courier y turnos | Casos de uso, endpoints, permisos, disponibilidad y edición segura de capacidad |
| API | Solo `AppController` raíz encontrado bajo `backend/src` | Endpoints de acceso y negocio, DTOs, errores controlados y contratos para frontend |
| Frontend | Portada, registro manual/QR, validación y cliente API; cambios de frontend integrados en `efea332` | Sesión, navegación por rol, consultas y flujos operativos reales; Compose aún fija `VITE_USE_MOCK_DATA=true` |
| Eventos | Modelos OutboxEvent/ProcessedEvent/DeadLetterMessage; outbox en transición de paquete; RabbitMQ configurado | Envelope común, publicador, worker, confirmaciones, ACK manual, idempotencia, reintentos y DLQ |
| Entrega y cierre | Modelos de rutas/paradas/intentos/evidencias/incidentes y estados | Casos de uso y API de ejecución, fallo, reprogramación, devolución y resumen de cierre |
| Notificaciones | Modelos de notificación/plantilla | Consumidores, bandeja interna, adapter de correo y deduplicación |
| Evidencia académica | Tests y reportes de componentes, dos ADR y planes de módulos | C4 final, README alineado, pruebas del recorrido, logs correlacionados y guion de defensa |

La portada contiene cifras y envíos de demostración; no se presentan como dashboard operativo ni seguimiento en tiempo real.

## Orden recomendado y criterios de salida

Todos los pasos de implementación corresponden a `USER`, con la persona indicada. `CODEX_MECHANICAL` puede mantener documentación y aplicar movimientos/imports/wiring ya definidos cuando se solicite. Las políticas, algoritmos, contratos y migraciones los implementan sus responsables.

| Etapa | Tareas y responsable | Estado del trabajo restante | Dependencia | Resultado verificable |
| --- | --- | --- | --- | --- |
| 0 | Contratos y fronteras: Juanangel, Vivian, Humberto y Santiago | `TODO` | Auditoría actual | Contexto, permisos, errores, unidades, APIs y eventos tienen dueños y ejemplos acordados |
| 1 | AUTH-01/TENANT-01: Juanangel; UI-01: Santiago | `TODO` | Contrato etapa 0 | Login real A/B, identidad actual y navegación; lectura/mutación ajena denegadas |
| 2 | ZONE-01: Humberto; PKG-01/VEH-01: Vivian; UI-02/admin: Santiago | `TODO` | Contratos etapa 0; HTTP final requiere 1 | Registrar/consultar paquete persistido; administrar catálogos y recursos con capacidad/tenant válidos |
| 3 | EVT-01/RMQ-01/IDEMP-01/DLQ-01/OBS-01: Juanangel con apoyo de Humberto | `TODO` | Contratos etapa 0; base tenant y persistencia | Evento real del flujo publicado/consumido; duplicado sin doble efecto; fallo acotado llega a DLQ y puede recuperarse deliberadamente |
| 4 | GEO-01/CLUSTER-01/SEQ-01/ASSIGN-01: Humberto con Vivian; UI-03: Santiago | `TODO` | Datos de 2; transporte de 3 para planificación asíncrona | Dataset pequeño produce rutas reproducibles, capacidad válida, orden de paradas y pendientes visibles |
| 5 | ROUTE-01/DELIVERY-01/ROUTE-CLOSE-01: Humberto, Vivian y Santiago | `TODO` | 4 y State integrado | Preparar/iniciar, registrar entrega o fallo, reprogramar/devolver y cerrar con conteos coherentes |
| 6 | NOTIF-01/02: Santiago y Juanangel; apoyo Vivian; UI-04: Santiago | `TODO` | 3 y eventos operativos | Bandeja/correo observables, deduplicados; fallo de correo no revierte entrega; consulta pública sin datos sensibles |
| 7 | SEC-01/QA-01/EVID-01/DOC-01/02: todos | `TODO` para cierre integral | 1–6 integradas | Demo sin mocks, pruebas pertinentes, README reproducible, C4 y defensa coherentes con código |

El orden indica dependencias, no obliga a esperar para todo: Juanangel comienza mensajería después de acceso mientras el resto termina datos operativos; Humberto puede probar algoritmos con fixtures durante PKG/VEH. Santiago integra cada contrato conforme esté disponible. Pruebas, logs, documentación y fronteras arquitectónicas se incorporan en cada etapa, no únicamente al final.

## Instrucciones de implementación por etapa

### 0. Publicar contratos y preparar la refactorización

- Juanangel: identidad/contexto confiable, sesión, permisos, errores y envelope versionado; resolver acceso previo al login y plataforma sin elevar privilegios del runtime.
- Vivian: comenzar [paso 0 de PKG-01](pkg-01.md#paso-0--refactorización-clean-architecture-del-código-existente). Llevar orquestación a aplicación conservando transacción y State; verificar regresión antes de añadir funcionalidades.
- Humberto: publicar contrato de zonas/sectores/tipos de envío y entradas/salidas de planificación. Revisar `reserveValidated`: el adapter actual invoca el callback de validación; separar el refactor de asignaciones de nuevas funcionalidades, con puerto transaccional de aplicación y regresión de reservas.
- Santiago: acordar prefijo API, sesión, códigos de error y estados de interfaz; no decidir autorización en el navegador.

Archivos: planes/contratos en `docs/modules/`, `packages/application/`, puertos de assignments y módulos de identidad por crear. Aceptación: ejemplos de entradas, salidas y rechazos; tests de fronteras y orquestación sin NestJS/Prisma. Pendiente: contratos concretos y refactor, no solo cambio de carpetas.

### 1. Completar acceso y aislamiento

Seguir [AUTH-01](auth-01.md), [TENANT-01](tenant-01.md) y [UI-01 a UI-04](ui-01-04.md). Juanangel entrega login/logout/me, empleados/roles y alta controlada; Santiago implementa pantallas y sesión. Usar la infraestructura RLS existente y probar peticiones reales entre dos tenants.

Archivos: `backend/src/modules/auth/`, `tenants/`, `users/`, contexto interno y `frontend/src/features/auth/`. Aceptación: sesión expirada/inactiva denegada, tenant del cliente no autoriza, permisos aplicados y accesos cruzados sin revelar existencia. La asignación a Juanangel ya está confirmada; verificar avance de su rama antes de duplicarlo.

### 2. Completar recepción y recursos

Humberto implementa [ZONE-01](zone-01.md), incluyendo ShipmentType. Vivian continúa [PKG-01](pkg-01.md) y [VEH-01](veh-01.md). Resolver contactos ausentes, dirección obligatoria y discrepancia entre coordenadas del formulario y modelo geocodificado. Reutilizar State y catálogo local; resultados ambiguos requieren revisión, nunca inventar coordenadas o estado MATCHED.

Archivos: módulos zones/packages/vehicles/couriers, esquemas/migraciones mínimos y features web de Santiago. Aceptación: guía única por tenant, cálculo servidor de volumen, historial inicial/outbox atómicos, recursos propios y disponibilidad real; editar máximos concurrentemente con reservas no crea sobrecarga. Integrar formulario y consulta tras recarga antes de desactivar mocks para la demo.

### 3. Hacer funcional la arquitectura por eventos

Juanangel define envelope con eventId/tenantId/correlationId/tipo/fecha/productor/versión; completa publicador de outbox y worker. Mantener entrega al menos una vez y efectos idempotentes, incluidos reenvíos tras caída entre publicación y marcado. Confirmación del broker precede al marcado de publicación; ACK de consumidor solo después de commit local del efecto y registro de procesamiento.

Archivos: puertos internos, `shared/infrastructure/messaging/`, `worker.ts`, `worker.module.ts`, Compose y tests. Aceptación: duplicado por tenant/evento/consumidor no repite efecto; fallo transitorio recupera con reintentos limitados; mensaje inválido/agota intentos llega a DLQ con contexto. Redrive explícito y auditado, sin bucle infinito. Logs enlazan API/worker por correlationId sin datos sensibles. La existencia de tablas o del contenedor RabbitMQ no cierra esta etapa.

### 4. Planificar y asignar rutas

Humberto implementa validación de coordenadas, Haversine, clustering determinista y nearest-neighbor. Separar zonas operativas de clusters calculados. Reutilizar grafo/Dijkstra solo para la parte de caminos que corresponda; documentar distancias geográficas frente a viales y alcance del dataset local.

Integrar Chain con datos confiables, reserva concurrente y State/outbox; crear rutas/paradas y asignaciones con historia en una operación coherente. Falta de capacidad produce PENDING_ASSIGNMENT con motivo y revisión manual, no DLQ. Incorporar revisión de geocodificación y conexión al grafo exigidas por los handlers existentes para que la demo no quede bloqueada por datos incompletos.

Archivos: `route-planning/domain/`, aplicación/puertos de planificación, assignments, rutas y UI de Santiago. Aceptación: repetibilidad, cada parada una vez, límites de peso/volumen, ruta/vehículo/mensajero del mismo tenant, reasignación sin perder historia y pendientes recuperables. Definir contrato mínimo de creación de ruta/paradas conjuntamente con ROUTE-01 para evitar dependencia circular entre módulos.

### 5. Ejecutar y cerrar

Humberto coordina rutas/cierre; Vivian integra State y flujo de paquetes; Santiago construye ejecución web responsive. Añadir preparación/inicio, intentos, evidencia básica e incidentes; diferenciar entrega, fallo, reprogramación, devolución y cancelación permitida. Asignar responsable de cada caso de uso al detallar esta etapa, según AGENTS.md.

Archivos: módulos routes/deliveries/incidents, puertos de evidencia, storage si hay archivos y pantallas de ejecución. Aceptación: mensajero solo opera rutas autorizadas, transición inválida no escribe, evidencia es tenant-aware, cierre concilia cantidades y resultados, y no elimina historia. Pruebas tanto de entrega exitosa como del camino de fallo y recuperación.

### 6. Notificar y consultar estado público

Santiago/Juanangel integran eventos con notificación interna y adapter de correo; Vivian apoya eventos del paquete. Deduplicar por tenant/evento/destinatario/canal y exponer pendiente/enviado/fallido. Coordinar rastreo público mínimo de UI-04 con consulta backend por identificador seguro.

Archivos: módulo notifications, adapters email, consumers y features web. Aceptación: evento genera notificación una vez, correo fallido se recupera sin revertir entrega; bandeja aislada y rastreo sin contactos, evidencia privada ni datos internos. No incluir canales WhatsApp/SMS/push.

### 7. Consolidar evidencia de MVP y defensa

Todos revisan un recorrido reproducible: login → registro → clasificación → planificación → revisión/asignación → preparación/inicio → entrega o fallo/reprogramación/devolución → cierre → notificación. Añadir demos de tenant ajeno, capacidad insuficiente, evento duplicado y fallo con recuperación/DLQ.

Archivos: README, `docs/adr/`, documentación C4, tests E2E, colección API y evidencia. C4 debe mostrar contexto, contenedores y componentes relevantes; acompañar con secuencia de un caso/evento y referencias a clases/capas como evidencia de implementación. Cada integrante explica problema, patrón, implementación, trade-offs y relación con Clean Architecture.

Aceptación: requisitos 8.14–8.19 cubiertos por código organizado, patrones funcionales, capas visibles, API/demo, logs/errores y README técnico; diagramas coinciden con implementación. Tablero actualizado únicamente con comprobaciones reales. No presentar landing/mocks ni modelos Prisma como flujo funcional.

## Siguiente paso y trabajo inmediato por persona

El siguiente hito conjunto es cerrar los contratos de la etapa 0. Para empezar hoy:

| Persona | Acción inmediata | Evidencia que debe devolver |
| --- | --- | --- |
| Juanangel | Publicar identidad/contexto, sesión y matriz de permisos de AUTH/TENANT | Contrato con ejemplos y rechazos; rama/commit del trabajo existente |
| Vivian | Caracterizar ciclo de vida existente e iniciar refactor del paso 0 de PKG | Tests de regresión, contrato transaccional propuesto y diff enfocado |
| Humberto | Definir contrato ZONE/ShipmentType y su frontera con clasificación/clustering | DTOs/resultados propuestos, fixtures pequeños y reglas sector-zona |
| Santiago | Acordar integración de sesión/navegación y formulario con esos contratos | Mapa de rutas/estados y requests/responses acordados |

## Verificación y mantenimiento

Herramientas de aplicación siempre en Compose. Ejecutar build y pruebas pertinentes por módulo; evitar lint backend con `--fix` en auditoría. Integración sobre PostGIS desechable siguiendo [la guía](../../backend/test/integration/README.md), nunca fixtures destructivos en SLS compartido. Los runners existentes se reutilizan donde cubran comportamiento; los nuevos deben crearse antes de anunciar sus comandos.

Cada cierre debe registrar por separado: código implementado, comandos/resultados verificados, documentación actualizada y commit. Actualizar plan individual e informe; después resumir aquí. Los estados TODO de esta hoja describen lo que falta para el flujo integrado, no borran trabajo previo ni cambian cierres acotados como GEOCODE-01.

Fuera de esta hoja: dashboard analítico avanzado, GPS, móvil nativo, optimización exacta/IA, 2-opt opcional, Interpreter opcional, iterator adicional, facturación y microservicios independientes. Mantener auditoría de acciones sensibles y redrive aunque no se construya una pantalla de auditoría avanzada.

## Bitácora y cierre

| Fecha | Observación | Verificación | Commit |
| --- | --- | --- | --- |
| 2026-09-30 | Hoja de ruta basada en merge frontend y componentes backend existentes | Inspección estática; tests no ejecutados | Base `efea332`; documento aún sin commit |

- [ ] Etapas 1–6 integradas sin mocks en la demo.
- [ ] Clean Architecture, State, Chain, Idempotent Consumer y DLQ demostrados.
- [ ] Aislamiento, concurrencia, errores y recuperación comprobados.
- [ ] README, C4, ADR y evidencia alineados.
- [ ] Informe y estados finales sustentados por pruebas/commits.
