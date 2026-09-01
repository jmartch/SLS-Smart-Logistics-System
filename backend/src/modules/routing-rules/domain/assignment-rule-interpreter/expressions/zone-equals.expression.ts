import type { AssignmentRuleContext } from '../core/rule-context';
import type { RuleExpression } from '../core/rule-expression';

export class ZoneEqualsExpression implements RuleExpression {
  constructor(private readonly expectedZone: string) {}

  interpret(context: AssignmentRuleContext): boolean {
    return (
      context.zone.trim().toUpperCase() ===
      this.expectedZone.trim().toUpperCase()
    );
  }
}
