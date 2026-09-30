export type InvalidAddressCode = 'EMPTY_ADDRESS' | 'UNSUPPORTED_ADDRESS_FORMAT';

export class InvalidAddressError extends Error {
    constructor(
        readonly code: InvalidAddressCode,
        message: string,
    ) {
        super(message);
        this.name = 'InvalidAddressError';
    }
}
