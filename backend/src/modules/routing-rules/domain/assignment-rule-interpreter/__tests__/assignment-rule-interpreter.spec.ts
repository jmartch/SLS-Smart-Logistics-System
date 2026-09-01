import { InvalidRuleSyntaxError } from '../core/invalid-rule-syntax.error';
import type { AssignmentRuleContext } from '../core/rule-context';
import { AssignmentRuleParser } from '../parser/assignment-rule.parser';

describe('AssignmentRuleInterpreter', () => {
  const parser = new AssignmentRuleParser();

  it('accepts a package that satisfies zone and weight', () => {
    const expression = parser.parse('zone = NORTH AND weight <= 20');
    const context: AssignmentRuleContext = {
      packageId: 'PKG-001',
      zone: 'NORTH',
      weightKg: 15,
    };

    expect(expression.interpret(context)).toBe(true);
  });

  it('rejects packages that fail either condition', () => {
    const expression = parser.parse('zone = NORTH AND weight <= 20');
    const contexts: AssignmentRuleContext[] = [
      { packageId: 'PKG-002', zone: 'SOUTH', weightKg: 15 },
      { packageId: 'PKG-003', zone: 'NORTH', weightKg: 25 },
    ];

    expect(contexts.map((context) => expression.interpret(context))).toEqual([
      false,
      false,
    ]);
  });

  it('parses spaces, letter case and decimal limits', () => {
    const expression = parser.parse(' zone = north AND weight <= 20.5 ');

    expect(
      expression.interpret({
        packageId: 'PKG-004',
        zone: 'NORTH',
        weightKg: 20.5,
      }),
    ).toBe(true);
  });

  it('rejects syntax outside the supported grammar', () => {
    expect(() => parser.parse('priority = HIGH OR weight < 20')).toThrow(
      InvalidRuleSyntaxError,
    );
  });
});
