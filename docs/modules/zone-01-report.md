# ZONE-01 — Zonas, sectores y catálogos para recepción

Estado: `TODO` para el encargo funcional.

Plan canónico: [ZONE-01](../plans/zone-01.md). Coordinación: [puntos 1 y 2](../plans/mvp-puntos-1-2.md).

## Alcance verificado

Inspección estática de `develop`, commit `8cdb2c4`, el 2026-09-29; documentación preparada hasta el 2026-09-30. Árbol limpio al inicio. Existen Zone, Sector y ShipmentType, unicidades por tenant y relación compuesta sector/zona. No existen casos de uso ni controladores de catálogos. El frontend simula GET /zones, /zones/:id/sectors y /shipment-types. Zone/Sector no tienen active; ShipmentType sí. No asumir desactivación disponible sin decidir su modelo/migración.

## Implementación por puntos

### Punto 0 — Auditoría y planificación

- Objetivo: establecer brechas y entrega asignable sin rehacer código existente.
- Decisión inicial: encargo previsto para Vivian, sustituido por asignación confirmada a Humberto. Contratos por concretar en el paso 1.
- Archivos: fuentes enumeradas en el plan; nuevos plan e informe de este módulo.
- Resultado: aceptación, dependencias, rutas esperadas y lotes mecánicos documentados.
- Evidencia: lectura de esquema, código, documentación y estado Git.
- Pendiente: todos los pasos funcionales del plan; no hay pruebas nuevas ejecutadas.

## Decisiones técnicas

Actualización de asignación (2026-09-30): Humberto asume ZONE-01 por petición expresa para coordinar zonas y clustering. Esta decisión sustituye la asignación inicial a Vivian; ella conserva PKG-01 y VEH-01. ShipmentType permanece en este plan a cargo de Humberto. El contrato entregado a PKG especificará catálogos, relaciones tenant/sector/zona y destinos sin clasificación; el algoritmo de clustering conserva su módulo separado. Cambio documental únicamente, sin implementación ni pruebas nuevas.

DATA-01; contrato TENANT-01 para dominio/puertos y AUTH-01 para endpoints protegidos. PKG-01 consume estos catálogos. Las decisiones pendientes de DTOs, políticas y migraciones están enumeradas por paso. No se consideran aprobadas ni implementadas por aparecer en este documento.

## Verificación reproducible

Seguir los comandos de Compose y preparación de integración indicados en el plan. Los runners de este módulo aún deben implementarse; no se atribuyen resultados históricos como ejecución actual.

Resultados observados: revisión documental únicamente. Build, pruebas y validación funcional pendientes.

## Estado en el entorno compartido

No se consultaron ni modificaron datos, roles ni migraciones de la base compartida. No se inspeccionó trabajo privado del compañero ni otras ramas.

## Trabajo fuera de alcance

Clustering, polígonos/geofencing, reglas Interpreter y planificación. No suprimir el módulo geográfico existente. Borrado físico de catálogos referenciados no es necesario para esta entrega.

## Cierre

Implementación no cerrada. Actualizar una sección por cada paso completado, registrando comandos, resultados, límites y commit; enlazar siempre el plan.
