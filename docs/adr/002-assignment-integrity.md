# ADR-002: Integridad y reserva de capacidad

Estado: aceptado e implementado para GDB-01. Aplicación a SLS confirmada mediante salida de terminal aportada por el usuario; véase el informe.

## Decisión

Reutilizar Assignment como historial. Sus referencias de ruta, vehículo y conductor describen el contexto histórico, deben coincidir y no se reescriben cuando cambia la ruta. Una reasignación cierra la fila previa y crea otra en la misma transacción. Una fila ACTIVE necesita ruta y recursos completos.

Implementar FK compuestas tenant/contexto y restricciones escalares en PostgreSQL; reservar capacidad mediante un adaptador de infraestructura con SERIALIZABLE, bloqueos y reintentos limitados. Mantener cálculos NUMERIC exactos. El servicio de aplicación futuro debe integrar el resultado con State y outbox, sin colocar SQL en controllers ni en dominio.

Revocar operaciones de plataforma al runtime: Tenant es lectura del propio tenant y Permission es catálogo global de lectura. La administración explícita/auditada se realizará fuera de este rol. Nuevas tablas no reciben grants implícitos.

## Consecuencias

El SQL de migración contiene CHECK/índice parcial/políticas no representados íntegramente en Prisma. Se deben conservar al generar migraciones futuras. Los cambios de recursos de rutas históricas se hacen mediante nueva ruta/reasignación. La reserva no protege modificaciones administrativas directas de capacidad: futuras operaciones de edición deben seguir el protocolo de bloqueo/recálculo.

Alternativas descartadas: unicidad completa que borra la posibilidad de historial; confiar solo en RLS para integridad referencial; comparar capacidad sin transacción; otorgar al runtime permisos globales de administración.

Evidencia: [informe GDB-01](../geospatial/gdb-01-report.md).
