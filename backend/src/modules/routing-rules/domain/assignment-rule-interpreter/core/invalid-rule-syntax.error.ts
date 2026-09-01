export class InvalidRuleSyntaxError extends Error {
  readonly code = 'INVALID_RULE_SYNTAX';

  constructor(readonly rule: string) {
    super('Rule must follow: zone = <value> AND weight <= <positive number>');
    this.name = 'InvalidRuleSyntaxError';
  }
}
