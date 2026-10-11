# Plantillas de estructura

Adaptar estas plantillas a los contratos reales. Las fases AAA y la jerarquía son comunes; el runner y la administración de recursos dependen de la suite. Los comentarios AAA son útiles como referencia, pero pueden omitirse en casos cortos con bloques claros.

## Jest: dominio y errores síncronos

Ejemplo para `backend/src/modules/geocoding/test/address-normalizer.spec.ts`:

```ts
import { AddressNormalizer } from '../domain/address-normalizer';
import { InvalidAddressError } from '../domain/invalid-address.error';

function createTestContext() {
  return { normalizer: new AddressNormalizer() };
}

describe('AddressNormalizer', () => {
  describe('normalize', () => {
    it.each(['Calle 80 # 53-67', 'CL 80 # 53-67'])(
      'normalizes an equivalent street address: %s',
      (input) => {
        // Arrange
        const { normalizer } = createTestContext();

        // Act
        const result = normalizer.normalize(input);

        // Assert
        expect(result.normalizedText).toBe('CALLE 80 # 53-67');
      },
    );

    it('rejects an empty address', () => {
      // Arrange
      const { normalizer } = createTestContext();
      const input = '   ';

      // Act: la función permite que el matcher observe la excepción.
      const normalize = () => normalizer.normalize(input);

      // Assert
      expect(normalize).toThrow(InvalidAddressError);
    });
  });
});
```

La plantilla ilustra forma, no la cobertura completa del test existente: conservar también componentes de dirección y códigos de error cuando ya se prueban. Si un caso captura un error mediante `try/catch`, conservar las garantías existentes que detectan que no se lanzó (`expect.assertions`, `fail` explícito u otra comprobación). Preservar también el flujo de control: mover una aserción desde un `catch` al exterior puede hacerla obligatoria donde antes era condicional. Eso es una corrección de cobertura y requiere que el encargo la autorice; si falta una garantía, registrar la mejora por separado.

Al escribir tests nuevos, capturar una sola ejecución para comprobar la clase y propiedades de un error de una operación mutable. Al normalizar un test existente, conservar la cantidad y el orden de sus ejecuciones, incluso si ya repite una acción para comprobar su error. Registrar la posible mejora por separado; reducir esas ejecuciones requiere que el encargo también autorice corregir el test.

## Vitest: adapter HTTP y error asíncrono

Ejemplo para `frontend/src/features/packages/api/catalogApi.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchZones } from './catalogApi';

vi.mock('../../../shared/config/environment', () => ({
  API_BASE_URL: '/api',
  USE_MOCK_DATA: false,
}));

describe('catalogApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchZones', () => {
    it('rejects a null catalog response', async () => {
      // Arrange
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('null', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      // Act
      const result = fetchZones();

      // Assert
      await expect(result).rejects.toThrow('no es un catálogo válido');
    });
  });
});
```

Traducir títulos de tests no autoriza traducir mensajes contractuales ni datos esperados. Conservar la semántica hoisted de `vi.mock`; no reordenarlo junto con imports como una transformación puramente textual.

## Aplicación, adapters y composición

- **Aplicación:** `createTestContext()` devuelve la instancia del caso de uso y sus puertos con dobles nuevos. Configurar en Arrange la respuesta específica del puerto. Comprobar resultado y efectos relevantes; mantener expectativas negativas cuando demuestran que no se escribió tras un rechazo.
- **Adapter con mocks:** mantener contratos y argumentos de consultas bajo prueba; sigue siendo unitario aunque la clase utilice Prisma en producción.
- **Composición NestJS:** `Test.createTestingModule` pertenece a pruebas de wiring o HTTP. Preservar sus overrides y cierre de aplicación; no introducirlo en tests de algoritmos para compartir una plantilla.
- **Arquitectura:** agrupar por regla de imports y conservar paths, directorio de trabajo y alcance inspeccionado. No mover el test sin revisar sus rutas relativas.
- **Concurrencia:** preservar las acciones concurrentes y verificar las invariantes tras esperar todas. Una única fase Act puede contener varias llamadas si la carrera es lo probado.

## Integración con base de datos

Usar `describe('<Capacidad> integration')`, seguido de la operación/comportamiento y casos AAA. Los recursos compartidos pueden seguir en `beforeAll/afterAll`; las variantes `fresh/history` y fixtures por tenant conservan sus scopes y condiciones originales.

Arrange crea los datos del caso en la base desechable; Act ejecuta la operación; Assert consulta y verifica resultados, historial, eventos o rollback. Las lecturas necesarias para comprobar persistencia pertenecen a Assert. Mantener el cleanup aunque fallen las aserciones, y no mover operaciones del negocio a hooks por estética.

No reemplazar Prisma/PostGIS reales con mocks, ni ejecutar todas las suites mediante un único contexto de base, para conseguir una forma idéntica a los tests unitarios. Leer `verification.md` antes de ejecutarlas.

## SQL y runners CJS

La estructura común es conceptual, conservando la sintaxis nativa:

| Tipo | Orden común | Invariantes a conservar |
| --- | --- | --- |
| SQL de prueba | configuración de errores; transacción; fixtures; escenario identificado; operación; assertions; rollback | `\set ON_ERROR_STOP on`, excepciones FAIL, avisos PASS, SQLSTATE y `ROLLBACK` existentes |
| Runner CJS | imports; validación de entorno; configuración; helpers; `main`; preparación; ejecución de suites; limpieza en `finally`; propagación de error | nombre único de base, servidor de pruebas, variables de runtime, migraciones, exit status y cierre de conexiones |

En SQL, separar escenarios con comentarios legibles como `-- Arrange`, `-- Act`, `-- Assert` cuando la forma lo permita. No reordenar sentencias dependientes para reproducir el orden de un archivo TypeScript. En runners, normalizar nombres y organización sin cambiar cuándo se crea o elimina la base ni los privilegios usados.
