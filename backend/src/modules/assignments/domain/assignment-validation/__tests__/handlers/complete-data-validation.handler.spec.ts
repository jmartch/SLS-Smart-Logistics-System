import type { AssignmentValidationContext } from '../../core/assignment-validation.types';
import { CompleteDataValidationHandler } from '../../handlers/complete-data-validation.handler';
import { createContext } from '../assignment-validation.fixture';

type PackageData = AssignmentValidationContext['package'];

function contextWithPackage(
  changes: Partial<PackageData>,
): AssignmentValidationContext {
  const context = createContext();

  return {
    ...context,
    package: {
      ...context.package,
      ...changes,
    },
  };
}

describe('CompleteDataValidationHandler', () => {
  const handler = new CompleteDataValidationHandler();

  it('accepts complete package data', () => {
    expect(handler.handle(createContext())).toEqual({ ok: true });
  });

  it.each<Array<[string, Partial<PackageData>]>>([
    ['empty package identifier', { id: '   ' }],
    ['empty package tenant', { tenantId: '' }],
    ['empty recipient address', { recipientAddress: ' ' }],
    ['zero weight', { weightKg: 0 }],
    ['non-finite weight', { weightKg: Number.NaN }],
    ['zero volume', { volumeM3: 0 }],
    ['non-finite volume', { volumeM3: Number.POSITIVE_INFINITY }],
  ])('rejects %s', (_caseName, changes) => {
    const result = handler.handle(contextWithPackage(changes));

    expect(result).toMatchObject({
      ok: false,
      code: 'INCOMPLETE_DATA',
      handler: 'CompleteDataValidationHandler',
    });
  });
});
