# SLS QR Helper

Herramienta auxiliar de desarrollo para generar códigos QR a partir de JSON válido. Permite preparar imágenes de prueba para los lectores QR del frontend de Smart Logistics System.

## Alcance

Actualmente permite:

- Validar y formatear JSON.
- Generar una vista previa del código QR.
- Configurar colores y nivel de corrección.
- Descargar el código como imagen PNG.
- Cargar ejemplos de datos para pruebas.

Esta herramienta no registra paquetes, no se conecta al backend y no aplica reglas de autenticación o multi-tenancy. El frontend principal actualmente interpreta el contenido escaneado como número de guía, por lo que los ejemplos JSON sirven únicamente para pruebas del lector.

No se deben incluir datos personales reales en códigos QR de demostración.

## Ejecución

Todos los comandos deben ejecutarse desde la raíz del repositorio mediante Docker Compose.

```bash
docker compose up --build qr-helper
```

La aplicación queda disponible en:

```text
http://localhost:3002
```

## Verificación

```bash
docker compose run --rm qr-helper npm run lint
docker compose run --rm qr-helper npm run build
```

## Trabajo posterior

Antes de integrar esta herramienta con el registro real de paquetes se debe definir un contrato mínimo y versionado para el contenido del QR. El tenant nunca debe aceptarse como autoridad desde el código escaneado.
