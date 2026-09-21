# GDB-03 — Paquetes con dirección y dimensiones

Estado: cambios de persistencia probados en base temporal; aplicación a SLS confirmada por el usuario. La confirmación final no incluyó salida de migrate status. El asistente no ejecutó el despliegue.

## Decisión y cambios

El usuario confirmó que Package estaba vacío y decidió eliminar directamente las coordenadas duplicadas, en lugar de conservar compatibilidad. La migración nueva `20260915030000_package_address_dimensions` bloquea Package y comprueba que siga vacío antes de modificarlo; si hay filas aborta sin transformarlas ni borrarlas. Todo ocurre dentro de BEGIN/COMMIT.

- Package exige Address y dimensiones lengthCm, widthCm y heightCm.
- GeocodingAttempt es opcional y debe pertenecer al mismo tenant y dirección.
- Zone es opcional; un Sector requiere Zone y debe pertenecer a ella.
- Las coordenadas de Package se eliminan. Las de RouteStop se conservan.
- La ubicación de geocodificación procede del candidato seleccionado del intento asociado.
- volumeM3 y maxVolumeM3 usan Decimal(12,6); dimensiones en cm con dos decimales y peso en kg sin cambio.
- CHECK de dimensiones positivas/finitas y volumen igual al producto de dimensiones dividido por un millón, redondeado a seis decimales. Se conserva el CHECK de volumen positivo: cantidades que redondean a cero se rechazan.
- Se conservaron los dos índices GiST de GDB-02 que Prisma propuso eliminar en el diff automático.

## Evidencia comunicada

El usuario ejecutó la migración sobre una copia solo de esquema de SLS en el contenedor temporal sls-gdb02-test. Tras reconstruir ese contenedor (el anterior había sido eliminado), confirmó haber completado la migración.

`backend/test/sql/gdb-03-package.sql`: nueve PASS y ROLLBACK:

1. Registro sin zona ni geocódigo.
2. Volumen contradictorio rechazado.
3. Dimensión cero rechazada.
4. Actualización coherente de dimensiones y volumen.
5. Dirección de otra empresa rechazada.
6. Intento de otra dirección rechazado.
7. Dirección e intento compatibles aceptados.
8. Sector sin zona rechazado.
9. Zona y sector compatibles aceptados.

`tenant-isolation.e2e-spec.ts`: salida compartida con una suite y tres pruebas PASS. Se usaron DATABASE_URL y RUNTIME_DATABASE_URL explícitas hacia la base temporal. El rol runtime se autenticó como sls_app. Las pruebas comprobaron ausencia de acceso sin tenant y lectura exclusiva de paquetes de cada empresa.

El usuario generó el cliente Prisma y ejecutó build. La primera ejecución de tsc detectó dimensiones faltantes en el fixture B; ambas creaciones ya incluyen dimensiones según revisión posterior y la suite E2E pasó. No se aportó salida independiente de una segunda ejecución completa de tsc.

## Pruebas históricas

El runner gdb-01.cjs quedó limitado explícitamente a sus tres migraciones originales. Conserva coordenadas en sus fixtures porque prueba aquel esquema. Sus resultados no deben presentarse como regresión de concurrencia sobre el esquema actual de GDB-03. La prueba E2E actual crea y elimina Address además de Package.

## Aplicación

Tras las pruebas se indicó detener backend, respaldar SLS, aplicar con Prisma migrate deploy mediante un contenedor puntual, iniciar backend y consultar migrate status. El usuario confirmó haber completado la secuencia; no se inspeccionó PostgreSQL de forma independiente en este cierre.

## Límites y pendientes funcionales

Esta entrega cubre esquema y persistencia. La aplicación aún debe calcular el volumen antes de escribir y bloquear asignación cuando no exista candidato confirmado. La FK permite asociar un intento NOT_FOUND para conservar evidencia; no significa que se pueda despachar.

La operación de reserva de GDB-01 es una primitiva de capacidad, no el caso de uso completo: no valida geocódigo ni publica eventos/estado. Falta integrar esas reglas antes de declarar completa la aceptación funcional de GDB-03. Cambiar la selección de un intento tampoco debe modificar rutas históricas: su snapshot se implementará en el modelo de planificación.

No se modificaron migraciones históricas ni el cambio previo del usuario en tsconfig.json. La siguiente fase de datos es GDB-04 (calendario y ventanas), después de guardar este bloque en un commit.
