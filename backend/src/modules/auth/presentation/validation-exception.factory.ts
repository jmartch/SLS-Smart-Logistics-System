import { BadRequestException, type ValidationError } from '@nestjs/common';

// Flattens class-validator errors (including nested children) into
// { 'field.path': [messages] } for the error envelope's `fields` map.
function collectFields(
  errors: readonly ValidationError[],
  parentPath: string,
  fields: Record<string, string[]>,
): void {
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      fields[path] = [
        ...(fields[path] ?? []),
        ...Object.values(error.constraints),
      ];
    }
    if (error.children?.length) {
      collectFields(error.children, path, fields);
    }
  }
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const fields: Record<string, string[]> = {};
  collectFields(errors, '', fields);

  return new BadRequestException({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son validos.',
      fields,
    },
  });
}
