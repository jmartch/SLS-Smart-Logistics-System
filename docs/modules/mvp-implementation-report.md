# MVP — auditoría y hoja de ruta

Plan canónico: [implementación del MVP](../plans/mvp-implementation.md).

Estado: `IN_PROGRESS` para el MVP completo; auditoría documental realizada el 2026-09-30 sobre `develop`, `efea332`, con árbol inicialmente limpio. El merge de frontend ya está integrado. No se ejecutaron pruebas ni se verificaron migraciones aplicadas en el entorno compartido.

## Alcance observado

Hay modelos/migraciones, RLS, State y persistencia historial/outbox, Chain y reservas, geocodificación local, grafo/Dijkstra y pruebas de componentes. Frontend contiene portada y registro/QR; Compose continúa activando mocks. Backend registra módulos internos, pero solo se encontró controlador HTTP raíz. RabbitMQ está configurado y todavía faltan publicador/worker y procesamiento confiable del flujo.

## Punto 0 — planificación

- Objetivo: guardar la secuencia necesaria para completar el MVP sin rehacer componentes existentes.
- Decisión: reutilizar planes de AUTH/TENANT, PKG/VEH, ZONE y UI; explicitar integración, refactor y evidencia faltantes.
- Archivos: nuevo plan global, este informe y enlace desde reparto de puntos 1–2.
- Resultado: inventario, siete etapas de implementación después de contratos, responsables, dependencias, aceptación y siguiente hito.
- Evidencia: estado Git, árbol de módulos, AppModule, AppController, Compose, App.tsx, servicio/adapter de assignments y reportes existentes.
- Pendiente: ejecutar los pasos del plan; comprobar avance no integrado con cada responsable y verificar comportamiento antes de cerrar módulos.

## Verificación y entorno

Esta entrega solo valida documentación y enlaces. Las comprobaciones funcionales futuras usan Compose y PostGIS desechable, según el plan y la guía de integración. No se modificaron código, bases, configuración, ramas ni commits para elaborar esta hoja.

## Cierre

Hoja de ruta disponible; MVP no cerrado. Incorporar evidencia por etapa con comandos, resultados y commits reales. Las tablas/modelos y pruebas de componentes no sustituyen una demo integrada.
