import { PrismaProcessedEventRegistry } from '../../infrastructure/messaging/persistence/prisma-processed-event.registry';

describe('PrismaProcessedEventRegistry (IDEMP-01, Unit)', () => {
  const tenantId = '51083af7-26d2-4b61-bb7e-9f46b3377811';
  const eventId = '41d37449-68a4-4d23-a818-c793e2e51b36';
  const consumerName = 'audit.integration-events.v1';

  let mockTx: any;
  let registry: PrismaProcessedEventRegistry;

  beforeEach(() => {
    mockTx = {
      $queryRaw: jest.fn(),
    };
    registry = new PrismaProcessedEventRegistry(mockTx);
  });

  it('debe devolver true cuando la inserción ON CONFLICT retorna fila (primer procesamiento)', async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([{ id: 'proc-1' }]);

    const acquired = await registry.tryRegister({
      tenantId,
      eventId,
      consumerName,
    });

    expect(acquired).toBe(true);
    expect(mockTx.$queryRaw).toHaveBeenCalled();
  });

  it('debe devolver false cuando la inserción ON CONFLICT no retorna filas (duplicado)', async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([]);

    const acquired = await registry.tryRegister({
      tenantId,
      eventId,
      consumerName,
    });

    expect(acquired).toBe(false);
  });

  it('debe devolver true cuando el evento ya existe en isProcessed', async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([{ id: 'proc-1' }]);

    const exists = await registry.isProcessed({
      tenantId,
      eventId,
      consumerName,
    });

    expect(exists).toBe(true);
  });

  it('debe devolver false cuando el evento no existe en isProcessed', async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([]);

    const exists = await registry.isProcessed({
      tenantId,
      eventId,
      consumerName,
    });

    expect(exists).toBe(false);
  });
});
