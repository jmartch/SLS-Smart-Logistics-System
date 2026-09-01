import type { AssignmentRuleContext } from './rule-context';

export interface RuleExpression {
  interpret(context: AssignmentRuleContext): boolean;
}
