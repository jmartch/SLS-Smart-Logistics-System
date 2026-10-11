export type InvalidCatalogNameReason =
    | 'EMPTY_NAME'
    | 'NAME_TOO_LONG';

export class InvalidCatalogNameError extends Error {
    readonly field = 'name';

    constructor(readonly code: InvalidCatalogNameReason) {
        super(code);
        this.name = 'InvalidCatalogNameError';
    }
}

export function normalizeCatalogName(value: string): string {
    const name = value.trim();

    if (name.length === 0) {
        throw new InvalidCatalogNameError('EMPTY_NAME');
    }

    if ([...name].length > 100) {
        throw new InvalidCatalogNameError('NAME_TOO_LONG');
    }

    return name;
}