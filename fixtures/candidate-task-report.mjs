import { readFileSync } from 'node:fs';

const baseline = JSON.parse(
  readFileSync(new URL('./expected/compatibility/task-verify-run.json', import.meta.url), 'utf8'),
);
const report = JSON.parse(baseline.stdout);
report.commands[0].stdout = process.env.COMPAT_GO_STDOUT;
process.stdout.write(`${JSON.stringify(report)}\n`);
