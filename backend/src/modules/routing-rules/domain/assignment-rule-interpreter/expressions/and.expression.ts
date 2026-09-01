import type { AssignmentRuleContext } from '../core/rule-context';
import type { RuleExpression } from '../core/rule-expression';

export class AndExpression implements RuleExpression {
  constructor(
    private readonly left: RuleExpression,
    private readonly right: RuleExpression,
  ) {}

  interpret(context: AssignmentRuleContext): boolean {
    return this.left.interpret(context) && this.right.interpret(context);
  }
}
