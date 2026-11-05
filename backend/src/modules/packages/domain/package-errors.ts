export abstract class PackageDomainError extends Error {
    abstract readonly code: string;

    protected constructor(message: string) {
        super(message);
        this.name = new.target.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class PackageNotFoundError extends PackageDomainError {
    readonly code = 'PACKAGE_NOT_FOUND';

    constructor(packageId: string) {
        super(`Package with id '${packageId}' was not found`);
    }
}
