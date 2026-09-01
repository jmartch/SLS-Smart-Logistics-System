import { InvalidRuleSyntaxError } from '../core/invalid-rule-syntax.error';
import type { RuleExpression } from '../core/rule-expression';
import { AndExpression } from '../expressions/and.expression';
import { WeightLessThanOrEqualExpression } from '../expressions/weight-less-than-or-equal.expression';
import { ZoneEqualsExpression } from '../expressions/zone-equals.expression';

const ASSIGNMENT_RULE_PATTERN =
  /^zone\s*=\s*([a-z0-9_-]+)\s+AND\s+weight\s*<=\s*(\d+(?:\.\d+)?)$/i;

export class AssignmentRuleParser {
  parse(rule: string): RuleExpression {
    const match = ASSIGNMENT_RULE_PATTERN.exec(rule.trim());

    if (!match) {
      throw new InvalidRuleSyntaxError(rule);
    }

    const [, zone, maximumWeightText] = match;
    const maximumWeightKg = Number(maximumWeightText);

    if (!zone || !Number.isFinite(maximumWeightKg) || maximumWeightKg <= 0) {
      throw new InvalidRuleSyntaxError(rule);
    }

    return new AndExpression(
      new ZoneEqualsExpression(zone),
      new WeightLessThanOrEqualExpression(maximumWeightKg),
    );
  }
}
