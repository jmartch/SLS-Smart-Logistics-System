export type InvalidCatalogCodeReason =
    | 'EMPTY_CODE'
    | 'CODE_TOO_LONG'
    | 'INVALID_CODE_CHARACTERS';

export class InvalidCatalogCodeError extends Error {
    readonly field = 'code';

    constructor(readonly code: InvalidCatalogCodeReason) {
        super(code);
        this.name = 'InvalidCatalogCodeError';
    }
}

export function normalizeCatalogCode(value: string): string {
    const code = value.trim().toUpperCase();

    if (code.length === 0) {
        throw new InvalidCatalogCodeError('EMPTY_CODE');
    }

    if (code.length > 30) {
        throw new InvalidCatalogCodeError('CODE_TOO_LONG');
    }

    if (!/^[A-Z0-9_-]+$/.test(code)) {
        throw new InvalidCatalogCodeError('INVALID_CODE_CHARACTERS');
    }

    return code;
}