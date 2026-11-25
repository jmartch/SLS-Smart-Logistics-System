# PKG-GEO-01: integrar registro y resolución geoespacial

Estado: implementado, pendiente de revisión del PR.

El registro HTTP ordinario persistía el paquete sin ejecutar GEOCODE-01. El enriquecimiento de las semillas no demostraba integración del registro normal.

La aplicación coordina registro, geocodificación local, selección y conexión vial mediante una unidad de trabajo transaccional. Reutiliza el catálogo y las políticas existentes; no incorpora proveedores externos, colas ni migraciones nuevas. El paquete permanece REGISTERED hasta la clasificación explícita.

Los resultados negativos esperados se persisten como diagnósticos recuperables. Un error técnico revierte la transacción. La recuperación mediante resolución o revisión admite identidad de operación y conflicto por cambio de intención; la corrección versiona la dirección y conserva referencias históricas. El tenant y el actor provienen de la identidad autenticada.

La aptitud exige intento y candidato válidos, dataset READY compatible y conexión aceptada para el perfil y radio configurados. Las consultas no inventan coordenadas, distancias ni aceptación. Los adaptadores entregan snapshots y la aplicación invoca las políticas puras. Una conexión local no acredita por sí sola alcanzabilidad dirigida de una ruta completa.

Configuración y comandos reproducibles: [guía operativa](../geospatial/pkg-geo-01-operation.md). Diseño y evidencia: [plan](../plans/pkg-geo-01.md), [informe](../modules/pkg-geo-01-report.md).
