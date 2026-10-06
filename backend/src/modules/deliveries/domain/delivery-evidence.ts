import { DeliveryEvidenceValidationError } from './delivery-errors';

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i;

export interface DeliveryEvidenceProps {
  readonly id: string;
  readonly tenantId: string;
  readonly deliveryAttemptId: string;
  readonly evidenceType: 'PHOTO' | 'SIGNATURE';
  readonly storageKey: string;
  readonly checksum: string;
  readonly createdAt: Date;
}

export class DeliveryEvidence {
  constructor(private readonly props: DeliveryEvidenceProps) {
    if (!props.id || !props.tenantId || !props.deliveryAttemptId) {
      throw new DeliveryEvidenceValidationError(
        'Evidence id, tenantId and deliveryAttemptId are required',
      );
    }
    if (!props.storageKey || !props.storageKey.trim()) {
      throw new DeliveryEvidenceValidationError(
        'storageKey is mandatory',
        'storageKey',
      );
    }
    if (!SHA256_HEX_REGEX.test(props.checksum)) {
      throw new DeliveryEvidenceValidationError(
        `Checksum '${props.checksum}' is not a valid 64-character SHA-256 hexadecimal string`,
        'checksum',
      );
    }
    Object.freeze(this.props);
    Object.freeze(this);
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get deliveryAttemptId(): string {
    return this.props.deliveryAttemptId;
  }
  get evidenceType(): 'PHOTO' | 'SIGNATURE' {
    return this.props.evidenceType;
  }
  get storageKey(): string {
    return this.props.storageKey;
  }
  get checksum(): string {
    return this.props.checksum;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
