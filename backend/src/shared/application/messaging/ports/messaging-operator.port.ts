export interface OperatorContext {
  readonly operatorId: string;
  readonly allowedTenantScope: readonly string[];
}

export function assertOperatorAuthorized(
  context: OperatorContext,
  tenantId: string,
): void {
  if (!context || !context.operatorId || context.operatorId.trim() === '') {
    throw new Error(
      'Operator context is missing or operator principal is unauthenticated',
    );
  }

  if (
    context.allowedTenantScope.length > 0 &&
    !context.allowedTenantScope.includes(tenantId)
  ) {
    throw new Error(
      `Operator '${context.operatorId}' is not authorized to operate on tenant '${tenantId}'`,
    );
  }
}
