export class InvalidNetworkAttachmentPolicyError extends Error {
  readonly code = 'INVALID_NETWORK_ATTACHMENT_POLICY';

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'InvalidNetworkAttachmentPolicyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
