import { BaseAssignmentValidationHandler } from '../../core/assignment-validation.handler';
import type {
  AssignmentValidationContext,
  AssignmentValidationResult,
} from '../../core/assignment-validation.types';
import { TenantValidationHandler } from '../../handlers/tenant-validation.handler';
import { createContext } from '../assignment-validation.fixture';

class RecordingHandler extends BaseAssignmentValidationHandler {
  public wasCalled = false;

  override handle(
    context: AssignmentValidationContext,
  ): AssignmentValidationResult {
    this.wasCalled = true;
    return super.handle(context);
  }
}

describe('TenantValidationHandler', () => {
  it('delegates when every resource belongs to the tenant', () => {
    const handler = new TenantValidationHandler();
    const nextHandler = new RecordingHandler();
    const context = createContext();

    handler.setNext(nextHandler);

    expect(handler.handle(context)).toEqual({ ok: true });
    expect(nextHandler.wasCalled).toBe(true);
  });

  it('rejects when the package belongs to another tenant', () => {
    const handler = new TenantValidationHandler();
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      package: {
        ...originalContext.package,
        tenantId: 'tenant-b',
      },
    };

    expect(handler.handle(context)).toEqual({
      ok: false,
      code: 'TENANT_MISMATCH',
      message: 'Package, vehicle and courier must belong to the current tenant',
      handler: 'TenantValidationHandler',
    });
  });

  it('interrupts the chain when tenant validation fails', () => {
    const handler = new TenantValidationHandler();
    const nextHandler = new RecordingHandler();
    const originalContext = createContext();

    const context: AssignmentValidationContext = {
      ...originalContext,
      vehicle: {
        ...originalContext.vehicle!,
        tenantId: 'tenant-b',
      },
    };

    handler.setNext(nextHandler);

    expect(handler.handle(context).ok).toBe(false);
    expect(nextHandler.wasCalled).toBe(false);
  });
});
