import type { Readable } from 'node:stream';

export type EvidenceType = 'PHOTO' | 'SIGNATURE';

export interface StoredEvidenceDescriptor {
  readonly storageKey: string;
  readonly evidenceType: EvidenceType;
  readonly checksum: string;
  readonly byteSize: number;
  readonly mimeType: string;
}

export interface ReadEvidenceResult {
  readonly stream: Readable;
  readonly mimeType: string;
  readonly byteSize: number;
}

export interface EvidenceStoragePort {
  storeEvidence(
    tenantId: string,
    fileBuffer: Buffer,
    evidenceType: EvidenceType,
    mimeType: string,
  ): Promise<StoredEvidenceDescriptor>;

  readEvidence(
    tenantId: string,
    storageKey: string,
  ): Promise<ReadEvidenceResult>;

  deleteEvidence(tenantId: string, storageKey: string): Promise<void>;
}
