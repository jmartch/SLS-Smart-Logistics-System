# Plan de DEMO-01 — demostración y defensa técnica

## Identidad

| Campo | Valor |
| --- | --- |
| Módulo | `DEMO-01` |
| Dominio | Demo académica e integración operativa |
| Estado general | `TESTING` |
| Rama observada | `feature/mvp-demo-flow` |
| Última auditoría | 2026-10-13 |
| Base Git | `4e03970` más cambios locales |
| Informe | [Auditoría actual](../demo/demo-01-report.md) |

## Alcance

La demo técnica definida en [el runbook](../demo/mvp-demo.md) y [el guion](../demo/01-guion-defensa-tecnica.md) demuestra login, registro de recursos y paquetes, historial/Outbox, worker/RabbitMQ, errores controlados y ruta/mapa. La defensa añade Clean Architecture, Chain, State, Iterator, idempotencia y DLQ. El guion propone 12–15 minutos, sujetos al tiempo asignado.

Este corte demostrable no sustituye el MVP obligatorio de AGENTS.md: el MVP requiere además ejecución completa, excepciones, cierre y notificaciones internas/email. Rastreo público seguro pertenece a UI-04. GPS, móvil nativo y optimización exacta siguen fuera del MVP; los turnos se posponen según ADR 010.

## Dependencias y fuentes

- AGENTS.md §§4, 5, 13–15, 20, 22 y 25: requisitos, evidencia y cierre.
- [UI-01 a UI-04](ui-01-04.md) y [auditoría API](../frontend/api-integration-audit.md).
- [Preparación OSM](../demo/osm-barranquilla-demo.md) y [ADR 010](../adr/010-automatic-fleet-availability.md).
- Registro, acceso, recursos, planificación, rutas y mensajería existentes; entregas/cierre existentes en backend.

## Diagnóstico actual

La semilla fue alineada con el proceso por solicitud explícita del usuario y se
aplicó una limpieza global operativa autorizada. El entorno empieza con tres
paquetes REGISTERED geocodificados, un vehículo y un mensajero libres y cero
rutas/asignaciones. Las cuentas de plataforma, permisos y migraciones se conservan.

Una prueba integrada nueva (`test:demo-01`) verifica clasificación, planificación,
pendiente real, recuperación, preparación y rechazo posterior de replanificación,
además de repetibilidad y separación de limpieza por tenant/global. Build backend
y tres escenarios integrados aprobados en PostGIS desechable. El worker local
publicó y consumió los tres eventos nuevos. Queda el ensayo visual de la demo.

La interfaz real llega hasta consultar/preparar/iniciar/interrumpir rutas.
`StopPage` sigue simulada y falta cierre web, notificaciones y rastreo funcional.

## Plan verificable

| Paso | Responsable | Estado | Objetivo y aceptación | Evidencia y restante |
| --- | --- | --- | --- | --- |
| 1. Auditar alcance y avance | `CODEX_MECHANICAL` | `DONE` | Separar demo técnica, MVP y estado observado | Informe enlazado; builds, pruebas y consultas del 2026-10-13 |
| 2. Preparar y ensayar escenario reproducible | `USER` | `TESTING` | Login → registro/clasificación → planificación → revisión → preparación/inicio, sin mocks | Semilla inicial corregida y aplicada; tres escenarios HTTP/PostGIS aprobados; falta ensayo visual |
| 3. Ensayar defensa de eventos/patrones | `USER` | `TESTING` | Mostrar Chain/State/Iterator, un solo efecto ante duplicado, retry/DLQ y recuperación auditada | Código/tests y consumidor activo; falta repetir el ensayo técnico completo |
| 4. Completar ejecución web | `USER` | `IN_PROGRESS` | Mensajero atiende, entrega/falla, adjunta evidencia, reporta incidentes; coordinación recupera/cierra | Consulta/inicio/interrupción reales; entregas y cierre pendientes en UI |
| 5. Completar notificaciones y UI-04 | `USER` | `TODO` | Bandeja/email deduplicados y rastreo público seguro | Modelos y pantallas simuladas; faltan implementaciones backend e integración |
| 6. Consolidar entrega | `USER` | `TODO` | Runbook/README/C4/documento técnico alineados; evidencia fechada y commits enfocados | Hay documentación desactualizada y cambios sin commit |

## Paso actual

### Paso 2 — fijar un escenario que pueda repetirse

**Por qué:** la preparación ya está verificada por API y persistencia; falta ensayar las pantallas con el estado inicial nuevo.

**Debe aplicar el usuario:** seguir [el runbook actualizado](../demo/mvp-demo.md):
login → clasificar las tres guías → planificar solamente dos → intentar planificar
la tercera con la misma ventana → recuperarla en Pendientes → preparar → iniciar.
Mantener una sola pareja activa durante el escenario de pendiente.

**Archivos implementados:** `backend/prisma/seed-demo.ts`, `demo-config.ts`,
`prepare-osm-demo.ts`, `backend/test/demo-seed.e2e-spec.ts` y runner `demo-01.cjs`.
El usuario autorizó expresamente modificar semillas y borrar los datos en esta
invocación; ese pedido define el alcance de implementación ejecutado.

**Lote mecánico disponible:** consolidar capturas y resultados del ensayo visual.

**Verificación:** `make integration-test TEST=demo-01` usa PostGIS dedicado. El
runner ya pasó tres escenarios; no opera sobre la base compartida. Para repetir
la semilla local y manejar colas/worker, seguir las instrucciones del runbook.

**Criterio de salida:** ensayo visual repetible; después continuar con las entregas del mensajero.

## Decisiones y bitácora

| Fecha | Observación | Verificación | Commit |
| --- | --- | --- | --- |
| 2026-10-13 | Auditoría distingue alcance técnico y MVP; no reduce requisitos. Se conserva el estado del tenant existente | 155 suites/1362 pruebas backend; 10 archivos/70 pruebas frontend; ambos builds; HTTP autenticado, PostgreSQL y RabbitMQ | Base `4e03970`; auditoría sin commit |
| 2026-10-13 | Semillas alineadas con recepción/clasificación, limpieza global expresamente autorizada y ejecutada, colas vaciadas y worker restablecido | Build backend y tres escenarios integrados aprobados; entorno local inicial y tres eventos consumidos comprobados | Sin commit |

## Cierre

- [x] Alcance y estado contrastados con el repositorio.
- [x] Informe actualizado con evidencia fechada.
- [x] Builds y suites unitarias aprobados.
- [x] Prueba integrada del escenario y repetibilidad aprobadas.
- [x] Datos iniciales nuevos aplicados y verificados en el entorno local.
- [ ] Ensayo visual y defensa técnica completados.
- [ ] MVP completo integrado, documentado y confirmado en commits.
