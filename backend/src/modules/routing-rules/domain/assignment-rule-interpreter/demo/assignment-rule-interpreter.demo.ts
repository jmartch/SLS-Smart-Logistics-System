import { InvalidRuleSyntaxError } from '../core/invalid-rule-syntax.error';
import type { AssignmentRuleContext } from '../core/rule-context';
import { AssignmentRuleParser } from '../parser/assignment-rule.parser';

const rule = 'zone = NORTH AND weight <= 20';
const parser = new AssignmentRuleParser();
const expression = parser.parse(rule);

const packages: AssignmentRuleContext[] = [
  { packageId: 'PKG-001', zone: 'NORTH', weightKg: 15 },
  { packageId: 'PKG-002', zone: 'SOUTH', weightKg: 15 },
  { packageId: 'PKG-003', zone: 'NORTH', weightKg: 25 },
];

console.log(`\nRule: ${rule}\n`);

for (const packageContext of packages) {
  const result = expression.interpret(packageContext) ? 'ACCEPTED' : 'REJECTED';

  console.log(
    `${packageContext.packageId}: ${result} ` +
      `(zone=${packageContext.zone}, weight=${packageContext.weightKg}kg)`,
  );
}

console.log('\n=== Invalid rule ===');

try {
  parser.parse('priority = HIGH OR weight < 20');
} catch (error) {
  if (error instanceof InvalidRuleSyntaxError) {
    console.log({ code: error.code, rule: error.rule, message: error.message });
  } else {
    throw error;
  }
}
