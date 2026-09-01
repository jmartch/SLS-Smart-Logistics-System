import type { AssignmentRuleContext } from '../core/rule-context';
import type { RuleExpression } from '../core/rule-expression';

export class WeightLessThanOrEqualExpression implements RuleExpression {
  constructor(private readonly maximumWeightKg: number) {}

  interpret(context: AssignmentRuleContext): boolean {
    return (
      Number.isFinite(context.weightKg) &&
      context.weightKg <= this.maximumWeightKg
    );
  }
}
