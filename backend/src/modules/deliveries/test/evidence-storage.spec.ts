import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { LocalEvidenceStorageAdapter } from '../infrastructure/storage/local-evidence-storage.adapter';
import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryValidationError,
} from '../domain/delivery-errors';

// --- Types & Constants ---

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';

// --- Fixtures & Helpers ---

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function createTestContext(testDir: string) {
  const adapter = new LocalEvidenceStorageAdapter(testDir);
  return { adapter, testDir };
}

describe('LocalEvidenceStorageAdapter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'sls-evidence-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('storeEvidence', () => {
    it('stores photo evidence with calculated SHA-256 checksum and isolated directory', async () => {
      // Arrange
      const { adapter, testDir } = createTestContext(tempDir);
      const fileBuffer = Buffer.from('fake-photo-image-binary-data');
      const expectedChecksum = createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      // Act
      const descriptor = await adapter.storeEvidence(
        TENANT_ID,
        fileBuffer,
        'PHOTO',
        'image/png',
      );

      // Assert
      expect(descriptor.evidenceType).toBe('PHOTO');
      expect(descriptor.checksum).toBe(expectedChecksum);
      expect(descriptor.byteSize).toBe(fileBuffer.length);
      expect(descriptor.mimeType).toBe('image/png');
      expect(descriptor.storageKey.startsWith(`${TENANT_ID}/photos/`)).toBe(
        true,
      );

      const absoluteDiskPath = path.join(testDir, descriptor.storageKey);
      const diskContent = await fs.readFile(absoluteDiskPath);
      expect(diskContent.equals(fileBuffer)).toBe(true);
    });

    it('stores signature evidence in the signatures subfolder', async () => {
      // Arrange
      const { adapter, testDir } = createTestContext(tempDir);
      const fileBuffer = Buffer.from('fake-signature-vector-or-png-bytes');

      // Act
      const descriptor = await adapter.storeEvidence(
        TENANT_ID,
        fileBuffer,
        'SIGNATURE',
        'image/webp',
      );

      // Assert
      expect(descriptor.evidenceType).toBe('SIGNATURE');
      expect(descriptor.mimeType).toBe('image/webp');
      expect(descriptor.storageKey.startsWith(`${TENANT_ID}/signatures/`)).toBe(
        true,
      );

      const absoluteDiskPath = path.join(testDir, descriptor.storageKey);
      const diskContent = await fs.readFile(absoluteDiskPath);
      expect(diskContent.equals(fileBuffer)).toBe(true);
    });

    it('rejects an empty buffer with DeliveryValidationError', async () => {
      // Arrange
      const { adapter } = createTestContext(tempDir);
      const emptyBuffer = Buffer.alloc(0);

      // Act
      const storePromise = adapter.storeEvidence(
        TENANT_ID,
        emptyBuffer,
        'PHOTO',
        'image/jpeg',
      );

      // Assert
      await expect(storePromise).rejects.toThrow(DeliveryValidationError);
    });

    it('rejects an unsupported MIME type with DeliveryValidationError', async () => {
      // Arrange
      const { adapter } = createTestContext(tempDir);
      const fileBuffer = Buffer.from('executable-or-pdf-content');

      // Act
      const storePromise = adapter.storeEvidence(
        TENANT_ID,
        fileBuffer,
        'PHOTO',
        'application/pdf',
      );

      // Assert
      await expect(storePromise).rejects.toThrow(DeliveryValidationError);
    });
  });

  describe('readEvidence', () => {
    it('reads previously stored evidence as a readable stream with exact content', async () => {
      // Arrange
      const { adapter } = createTestContext(tempDir);
      const fileBuffer = Buffer.from('image-content-for-read-stream');
      const descriptor = await adapter.storeEvidence(
        TENANT_ID,
        fileBuffer,
        'PHOTO',
        'image/jpeg',
      );

      // Act
      const result = await adapter.readEvidence(
        TENANT_ID,
        descriptor.storageKey,
      );
      const contentRead = await streamToBuffer(result.stream);

      // Assert
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.byteSize).toBe(fileBuffer.length);
      expect(contentRead.equals(fileBuffer)).toBe(true);
    });

    it('rejects reading evidence when the file does not exist on disk', async () => {
      // Arrange
      const { adapter } = createTestContext(tempDir);
      const missingKey = `${TENANT_ID}/photos/non-existent-file.png`;

      // Act
      const readPromise = adapter.readEvidence(TENANT_ID, missingKey);

      // Assert
      await expect(readPromise).rejects.toThrow(DeliveryNotFoundError);
    });

    it('rejects reading evidence attempting path traversal outside tenant boundary', async () => {
      // Arrange
      const { adapter } = createTestContext(tempDir);
      const traversalKey = `../other-tenant/private-data.png`;

      // Act
      const readPromise = adapter.readEvidence(TENANT_ID, traversalKey);

      // Assert
      await expect(readPromise).rejects.toThrow(DeliveryForbiddenError);
    });

    it('rejects reading evidence belonging to a different tenant', async () => {
      // Arrange
      const { adapter } = createTestContext(tempDir);
      const otherBuffer = Buffer.from('other-tenant-file-data');
      const otherDescriptor = await adapter.storeEvidence(
        OTHER_TENANT_ID,
        otherBuffer,
        'PHOTO',
        'image/png',
      );

      // Act
      const readAttempt = adapter.readEvidence(
        TENANT_ID,
        otherDescriptor.storageKey,
      );

      // Assert
      await expect(readAttempt).rejects.toThrow(DeliveryForbiddenError);
    });
  });

  describe('deleteEvidence', () => {
    it('deletes an existing evidence file from disk', async () => {
      // Arrange
      const { adapter, testDir } = createTestContext(tempDir);
      const fileBuffer = Buffer.from('to-be-deleted-bytes');
      const descriptor = await adapter.storeEvidence(
        TENANT_ID,
        fileBuffer,
        'PHOTO',
        'image/png',
      );
      const absoluteDiskPath = path.join(testDir, descriptor.storageKey);

      // Act
      await adapter.deleteEvidence(TENANT_ID, descriptor.storageKey);

      // Assert
      const fileExists = await fs.stat(absoluteDiskPath).catch(() => null);
      expect(fileExists).toBeNull();
      await expect(
        adapter.readEvidence(TENANT_ID, descriptor.storageKey),
      ).rejects.toThrow(DeliveryNotFoundError);
    });

    it('handles non-existent file deletion idempotently without throwing', async () => {
      // Arrange
      const { adapter } = createTestContext(tempDir);
      const nonExistentKey = `${TENANT_ID}/photos/already-deleted-file.png`;

      // Act
      const deletePromise = adapter.deleteEvidence(TENANT_ID, nonExistentKey);

      // Assert
      await expect(deletePromise).resolves.toBeUndefined();
    });

    it('rejects deleting evidence attempting path traversal outside tenant boundary', async () => {
      // Arrange
      const { adapter } = createTestContext(tempDir);
      const traversalKey = `../../etc/passwd`;

      // Act
      const deletePromise = adapter.deleteEvidence(TENANT_ID, traversalKey);

      // Assert
      await expect(deletePromise).rejects.toThrow(DeliveryForbiddenError);
    });
  });
});
