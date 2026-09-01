import type { AssignmentValidationContext } from '../../core/assignment-validation.types';
import { DuplicateAssignmentValidationHandler } from '../../handlers/duplicate-assignment-validation.handler';
import { createContext } from '../assignment-validation.fixture';

describe('DuplicateAssignmentValidationHandler', () => {
  const handler = new DuplicateAssignmentValidationHandler();

  it('accepts a package without an active assignment', () => {
    expect(handler.handle(createContext())).toEqual({ ok: true });
  });

  it('rejects a package that already has an active assignment', () => {
    const context: AssignmentValidationContext = {
      ...createContext(),
      hasActiveAssignment: true,
    };

    expect(handler.handle(context)).toEqual({
      ok: false,
      code: 'DUPLICATE_ASSIGNMENT',
      message: 'Package already has an active route assignment',
      handler: 'DuplicateAssignmentValidationHandler',
    });
  });
});
