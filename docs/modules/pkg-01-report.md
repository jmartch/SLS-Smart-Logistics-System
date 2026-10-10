# PKG-01 — Registro, consulta, clasificación e historial de paquetes

Estado: `TODO` para el encargo funcional.

Plan canónico: [PKG-01](../plans/pkg-01.md). Coordinación: [puntos 1 y 2](../plans/mvp-puntos-1-2.md).

## Alcance verificado

Inspección estática de `develop`, commit `8cdb2c4`, el 2026-09-29; documentación preparada hasta el 2026-09-30. Árbol limpio al inicio. Packages ya contiene State, servicio de transición y persistencia atómica con historial/outbox; esto no implementa registro ni consulta HTTP. Package requiere Address y ShipmentType; zona y sector son opcionales. Ni Package ni el formulario actual contienen remitente/destinatario/contactos completos. El payload provisional aporta latitude/longitude, pero el modelo actual obtiene coordenadas de la geocodificación, no de columnas en Package. Debe resolverse ese desacuerdo antes de escribir el registro.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: establecer brechas y entrega asignable sin rehacer código existente.
- Decisión: Vivian. Contratos por concretar en el paso 1.
- Archivos: fuentes enumeradas en el plan; nuevos plan e informe de este módulo.
- Resultado: aceptación, dependencias, rutas esperadas y lotes mecánicos documentados.
- Evidencia: lectura de esquema, código, documentación y estado Git.
- Pendiente: todos los pasos funcionales del plan; no hay pruebas nuevas ejecutadas.

## Decisiones técnicas

Reparto actualizado (2026-09-30): PKG-01 permanece con Vivian. ZONE-01 pasa a Humberto; ella integrará su contrato de catálogos sin implementar zonas ni clustering. La dependencia funcional permanece y los dobles solo habilitan pruebas mientras llega la API real.

### Ampliación solicitada — refactorización Clean Architecture (2026-09-30)

Se añadió al plan el paso 0, previo a nuevas funcionalidades. La inspección de `PackageLifecycleRepository`, `TransitionPackageStateService`, `PrismaPackageLifecycleRepository` y `PackagesModule` muestra que el adapter invoca la operación del agregado, extrae/valida eventos y construye el resultado del caso de uso. El trabajo planificado traslada esa coordinación a aplicación mediante un puerto transaccional interno; conserva State en dominio y transacción, bloqueo, RLS y mapeos en infraestructura.

Aceptación añadida: probar el caso de uso sin NestJS/Prisma, automatizar fronteras de imports y mantener regresión de transición, aislamiento y rollback de estado/historial/outbox. La entrega de refactorización se mantiene enfocada y separada de las nuevas funcionalidades y migraciones. El primer paso vigente pasa a ser caracterizar y refactorizar el código existente; el contrato del registro puede discutirse mientras tanto.

Resultado de esta actualización: plan e informe ampliados. No se implementó el refactor ni se ejecutaron pruebas de aplicación; toda evidencia funcional sigue pendiente.

DATA-01; contratos y endpoints AUTH-01/TENANT-01; ZONE-01/ShipmentType; State existente; GEOCODE-01 para resolver dirección cuando corresponda; coordinación de contrato de eventos con EVT-01. Las decisiones pendientes de DTOs, políticas y migraciones están enumeradas por paso. No se consideran aprobadas ni implementadas por aparecer en este documento.

## Verificación reproducible

Seguir los comandos de Compose y preparación de integración indicados en el plan. Los runners de este módulo aún deben implementarse; no se atribuyen resultados históricos como ejecución actual.

Resultados observados: revisión documental únicamente. Build, pruebas y validación funcional pendientes.

## Estado en el entorno compartido

No se consultaron ni modificaron datos, roles ni migraciones de la base compartida. No se inspeccionó trabajo privado del compañero ni otras ramas.

## Trabajo fuera de alcance

Planificación automática, asignación a ruta, entregas, publicación RabbitMQ y rastreo público UI-04. Reutilizar State y geocodificación existentes; no rehacerlos ni exponer cambio libre de estado. Inbox/notificaciones quedan fuera.

## Cierre

Implementación no cerrada. Actualizar una sección por cada paso completado, registrando comandos, resultados, límites y commit; enlazar siempre el plan.
