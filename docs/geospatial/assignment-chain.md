# Chain de asignación: adaptación geoespacial

El contexto de dominio ya no representa coordenadas como columnas de `Package`.
Recibe una proyección de la geocodificación seleccionada para la dirección del
paquete y un attachment a la red vial. No importa tipos de Prisma.

La cadena comprueba, después del tenant, duplicados y datos básicos:

1. Geocodificación `MATCHED`, candidato seleccionado, dirección coincidente y
   dataset `READY` igual al solicitado para la planificación.
2. Coordenadas del candidato finitas y dentro de los rangos geográficos.
3. Attachment `AUTO_ACCEPTED` o `APPROVED` para ese candidato, dataset y perfil,
   vinculado a exactamente un nodo o una arista.
4. Las reglas existentes de zona, vehículo, capacidad y repartidor.

Geocodificación y attachment también deben pertenecer al tenant del contexto.
Una revisión pendiente no se considera aprobación. Esta validación no demuestra
que exista un camino entre todas las paradas: eso corresponde al planificador.

## Integración transaccional

El servicio de aplicación recibe solamente `tenantId`, `packageId`, `routeId`,
el perfil vial y los identificadores opcionales de parada y responsable. El
`tenantId` debe proceder de identidad autenticada o metadata confiable, nunca de
un selector libre del frontend.

`PrismaAssignmentReservation` bloquea el paquete, la ruta y los vehículos,
construye el contexto desde PostgreSQL, ejecuta la cadena y crea la asignación
dentro de una transacción `SERIALIZABLE`. Las coordenadas se extraen con PostGIS
del candidato seleccionado. La ruta determina vehículo y repartidor; el llamador
no puede sustituirlos. Si la ruta tiene una ventana completa, la disponibilidad
exige un turno que la cubra. La capacidad se deriva de asignaciones activas.

Una asignación activa del mismo paquete a la misma ruta es un duplicado. Una
asignación activa en otra ruta puede convertirse en historial de reasignación.
La zona exige que el paquete esté clasificado; el esquema no modela zonas
compatibles por vehículo.

El resultado `PENDING_ASSIGNMENT` continúa siendo un retorno y todavía no se
persiste como transición de estado.

Antes de considerar completa la integración falta:

- Detectar conflictos entre rutas solapadas además de comprobar estado y turno.
- Distinguir rechazo de autorización/duplicado de un pendiente operativo;
  persistir los resultados mediante el modelo State y probar el flujo validado
  con PostgreSQL de extremo a extremo.

No se modificaron migraciones. `reserve()` se conserva como la primitiva de
persistencia probada por GDB-01 y `reserveValidated()` es la operación usada por
el servicio de aplicación.

## Verificación local

Desde la raíz del repositorio, con los servicios iniciados:

```bash
docker compose exec backend npm test -- --runInBand
docker compose exec backend npm run build
docker compose exec backend npm run demo:chain
```
