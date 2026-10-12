import { BadRequestException, type ValidationError } from '@nestjs/common';

export interface ValidationFieldError {
  readonly field: string;
  readonly reason: string;
}

// Flattens class-validator errors (including nested children) into one
// { field, reason } entry per violated constraint; nested properties use a
// dotted path.
function collectFields(
  errors: readonly ValidationError[],
  parentPath: string,
  fields: ValidationFieldError[],
): void {
  for (const error of errors) {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    for (const reason of Object.values(error.constraints ?? {})) {
      fields.push({ field, reason });
    }
    if (error.children?.length) {
      collectFields(error.children, field, fields);
    }
  }
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const fields: ValidationFieldError[] = [];
  collectFields(errors, '', fields);

  return new BadRequestException({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son validos.',
      fields,
    },
  });
}
