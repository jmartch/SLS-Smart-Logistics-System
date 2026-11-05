# ADR 010: Disponibilidad simplificada y selección automática de flota

Estado: Aceptado por solicitud del usuario.
Fecha: 2026-10-13.

## Contexto

La planificación exigía turnos de vehículos y mensajeros sin ofrecer una
interfaz para registrarlos. Eso impedía seleccionar recursos nuevos aunque
estuvieran activos. El usuario solicitó eliminar el panel manual y seleccionar
automáticamente los recursos disponibles.

## Decisión

Un vehículo activo puede participar cuando conserva capacidad por peso y volumen
y no tiene un compromiso incompatible. Un mensajero activo, asociado a un usuario
activo, puede participar bajo la misma regla de ocupación. Crear una cuenta de
trabajador no basta: debe existir el registro de mensajero que corresponda.

Las rutas IN_PROGRESS e INTERRUPTED mantienen sus recursos ocupados. Las rutas
PLANNED y READY los ocupan cuando sus ventanas se superponen. No se exige que un
turno registrado cubra la ventana. La selección se limita al tenant autenticado,
se valida en aplicación y se reserva en una transacción serializable con bloqueos
ordenados y reintentos limitados. No se toman decisiones de autorización en la UI.

El endpoint admite selección AUTOMATIC y conserva MANUAL para clientes con listas
explícitas. El frontend solicita AUTOMATIC sin listas y muestra los recursos
asignados en las rutas resultantes. La ausencia de recursos o capacidad produce
PENDING_ASSIGNMENT con motivo; no es un fallo técnico.

## Alternativas

Completar pantallas de turnos mantendría una restricción laboral más detallada,
pero añade gestión que el usuario decidió simplificar para este MVP.

## Consecuencias

Se asume disponibilidad fuera de compromisos operativos, incluso sin calendario
laboral. El estado activo es la habilitación operativa. La selección automática
es una heurística determinista y no garantiza un aprovechamiento global óptimo.
Se conservan las tablas y registros de turnos sin migración ni eliminación de
datos. Las propuestas de administración de turnos anteriores quedan pospuestas;
sus requisitos no son condiciones de planificación del MVP actual.
