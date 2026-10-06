import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { isValidTenantId, runWithTenant } from './run-with-tenant';

describe('run-with-tenant', () => {
  describe('isValidTenantId', () => {
    it('accepts a well-formed UUID', () => {
      // Arrange
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';

      // Act
      const result = isValidTenantId(validUuid);

      // Assert
      expect(result).toBe(true);
    });

    it('rejects a value that is not a UUID', () => {
      // Arrange
      const maliciousInput = "'; DROP TABLE \"Package\"; --";

      // Act
      const result = isValidTenantId(maliciousInput);

      // Assert
      expect(result).toBe(false);
    });

    it('rejects an empty string', () => {
      // Arrange
      const emptyInput = '';

      // Act
      const result = isValidTenantId(emptyInput);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('runWithTenant', () => {
    const validTenantId = '123e4567-e89b-12d3-a456-426614174000';

    it('throws error without executing transaction when tenant id is invalid', async () => {
      // Arrange
      const mockPrisma = {
        $transaction: jest.fn(),
      } as unknown as PrismaClient;
      const callback = jest.fn();

      // Act & Assert
      await expect(
        runWithTenant(mockPrisma, 'invalid-tenant-id', callback),
      ).rejects.toThrow('runWithTenant: "invalid-tenant-id" is not a valid tenant id');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('executes transaction, sets tenant config and returns callback result', async () => {
      // Arrange
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      const mockPrisma = {
        $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
      } as unknown as PrismaClient;
      const expectedOutput = { success: true };
      const callback = jest.fn().mockResolvedValue(expectedOutput);

      // Act
      const result = await runWithTenant(mockPrisma, validTenantId, callback);

      // Assert
      expect(result).toBe(expectedOutput);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockTx);
    });

    it('forwards isolation level and options to transaction when specified', async () => {
      // Arrange
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      const mockPrisma = {
        $transaction: jest.fn(async (cb: (tx: any) => Promise<any>, _opts: any) => cb(mockTx)),
      } as unknown as PrismaClient;
      const callback = jest.fn().mockResolvedValue('ok');
      const options = {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      };

      // Act
      const result = await runWithTenant(mockPrisma, validTenantId, callback, options);

      // Assert
      expect(result).toBe('ok');
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        },
      );
    });
  });
});
