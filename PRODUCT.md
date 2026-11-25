# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El personal operativo de empresas de mensajería y distribución: recepción,
clasificación, coordinación de rutas, couriers y administradores del tenant.
Gestionan paquetes desde su recepción hasta la entrega o devolución.

## Product Purpose

SLS es una plataforma SaaS B2B multiempresa para centralizar las operaciones
logísticas urbanas y el ciclo de los paquetes, desde su recepción hasta la
entrega, reintento, reprogramación o devolución.

## Positioning

SLS combina la gestión del ciclo del paquete con clasificación y planificación
de rutas que considera la capacidad de los vehículos por peso y volumen, dentro
de una plataforma con aislamiento de datos por empresa.

## Operating Context

El contexto inicial es la distribución urbana en Barranquilla, Colombia. La
operación incluye registrar y clasificar paquetes, planificar y revisar rutas,
asignar recursos, ejecutar entregas y gestionar intentos fallidos o
devoluciones. El modelo debe poder extenderse a otras empresas y ciudades.

## Capabilities and Constraints

- El producto debe mantener aislamiento multi-tenant; la identidad autenticada
  determina el tenant activo.
- El flujo del dominio abarca recepción, clasificación, planificación,
  asignación, ejecución de rutas, intentos de entrega, reprogramación y
  devolución.
- La asignación de rutas debe considerar capacidad de vehículos por peso y
  volumen; los paquetes que no puedan asignarse automáticamente deben quedar
  disponibles para revisión manual.
- El stack del proyecto es React, TypeScript y Vite para el frontend; NestJS y
  TypeScript para la API y los procesos asíncronos; PostgreSQL con Prisma para
  persistencia; y RabbitMQ para mensajería.
- Estas capacidades describen el producto y sus restricciones, no certifican
  por sí solas que cada flujo esté completamente implementado. Verificar el
  código y las pruebas antes de afirmar que una función está disponible.

## Evidence on Hand

El repositorio contiene código, pruebas, documentación y material para
demostraciones. Consultarlos para verificar el comportamiento actual antes de
describir capacidades como implementadas. No se han establecido aquí métricas
validadas, testimonios ni casos de clientes; no inventarlos.

## Product Principles

- Mantener los datos de cada empresa aislados.
- Representar el ciclo logístico completo, incluidos los resultados fallidos y
  la devolución.
- Hacer visibles los resultados operativos que requieren revisión manual.
- Considerar la capacidad del vehículo al asignar paquetes a rutas.
- Distinguir el alcance previsto del producto de las funciones verificadas en
  la implementación.
