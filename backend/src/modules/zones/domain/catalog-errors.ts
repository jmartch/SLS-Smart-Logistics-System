export abstract class CatalogDomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CatalogValidationError extends CatalogDomainError {
  readonly code: string = 'VALIDATION_ERROR';

  constructor(message: string, field?: string) {
    super(message, field);
  }
}

export class CatalogNotFoundError extends CatalogDomainError {
  readonly code = 'CATALOG_RESOURCE_NOT_FOUND';

  constructor(resourceId?: string, resourceName = 'Catalog resource') {
    super(
      resourceId
        ? `${resourceName} with id '${resourceId}' was not found`
        : `${resourceName} was not found`,
    );
  }
}

export class CatalogCodeConflictError extends CatalogDomainError {
  readonly code = 'CATALOG_CODE_CONFLICT';

  constructor(codeValue?: string, resourceName = 'Catalog resource') {
    super(
      codeValue
        ? `${resourceName} code '${codeValue}' is already in use`
        : `${resourceName} code is already in use`,
      'code',
    );
  }
}

export class CatalogForbiddenError extends CatalogDomainError {
  readonly code = 'FORBIDDEN';

  constructor(
    message = 'Actor is not authorized to perform this catalog operation',
  ) {
    super(message);
  }
}
