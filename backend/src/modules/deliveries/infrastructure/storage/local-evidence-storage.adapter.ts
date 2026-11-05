import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import {
  DeliveryForbiddenError,
  DeliveryNotFoundError,
  DeliveryValidationError,
} from '../../domain/delivery-errors';
import type {
  EvidenceStoragePort,
  EvidenceType,
  ReadEvidenceResult,
  StoredEvidenceDescriptor,
} from '../../application/ports/evidence-storage.port';

const ALLOWED_MIME_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

@Injectable()
export class LocalEvidenceStorageAdapter implements EvidenceStoragePort {
  private readonly rootDir: string;

  constructor(@Optional() baseDir?: string) {
    this.rootDir = path.resolve(
      baseDir ??
        process.env.STORAGE_LOCAL_ROOT ??
        path.join(process.cwd(), 'storage', 'evidence'),
    );
  }

  async storeEvidence(
    tenantId: string,
    fileBuffer: Buffer,
    evidenceType: EvidenceType,
    mimeType: string,
  ): Promise<StoredEvidenceDescriptor> {
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      throw new DeliveryValidationError(
        'Evidence file buffer cannot be empty',
        'file',
      );
    }

    const extension = ALLOWED_MIME_TYPES.get(mimeType.toLowerCase());
    if (!extension) {
      throw new DeliveryValidationError(
        `Unsupported evidence MIME type '${mimeType}'. Allowed types: image/jpeg, image/png, image/webp`,
        'mimeType',
      );
    }

    const checksum = createHash('sha256').update(fileBuffer).digest('hex');
    const folderName = evidenceType === 'SIGNATURE' ? 'signatures' : 'photos';
    const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
    const relativeKey = `${tenantId}/${folderName}/${fileName}`;
    const absolutePath = this.resolveAndValidatePath(tenantId, relativeKey);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, fileBuffer);

    return {
      storageKey: relativeKey,
      evidenceType,
      checksum,
      byteSize: fileBuffer.length,
      mimeType: mimeType.toLowerCase(),
    };
  }

  async readEvidence(
    tenantId: string,
    storageKey: string,
  ): Promise<ReadEvidenceResult> {
    const absolutePath = this.resolveAndValidatePath(tenantId, storageKey);

    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isFile()) {
        throw new DeliveryNotFoundError(storageKey, 'EvidenceFile');
      }

      const ext = path.extname(storageKey).toLowerCase().replace('.', '');
      let mimeType = 'application/octet-stream';
      for (const [mime, allowedExt] of ALLOWED_MIME_TYPES.entries()) {
        if (allowedExt === ext) {
          mimeType = mime;
          break;
        }
      }

      const stream = createReadStream(absolutePath);

      return {
        stream,
        mimeType,
        byteSize: stats.size,
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new DeliveryNotFoundError(storageKey, 'EvidenceFile');
      }
      throw error;
    }
  }

  async deleteEvidence(tenantId: string, storageKey: string): Promise<void> {
    const absolutePath = this.resolveAndValidatePath(tenantId, storageKey);
    try {
      await fs.unlink(absolutePath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private resolveAndValidatePath(tenantId: string, storageKey: string): string {
    if (!storageKey || typeof storageKey !== 'string') {
      throw new DeliveryValidationError('Invalid storage key', 'storageKey');
    }

    const tenantRoot = path.resolve(this.rootDir, tenantId);
    const resolvedPath = path.resolve(this.rootDir, storageKey);

    // Prevención de path traversal y verificación de pertenencia al tenant
    if (!resolvedPath.startsWith(tenantRoot + path.sep)) {
      throw new DeliveryForbiddenError(
        'Access to evidence outside tenant boundary is forbidden',
      );
    }

    return resolvedPath;
  }
}
