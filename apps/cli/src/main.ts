#!/usr/bin/env node

import { runCLI } from './cli.js';
import { installSignalHandlers } from './signals.js';

const controller = new AbortController();
const removeSignalHandlers = installSignalHandlers(controller);
try {
  process.exitCode = await runCLI(
    process.argv.slice(2),
    (value) => {
      process.stdout.write(value);
    },
    (value) => {
      process.stderr.write(value);
    },
    controller.signal,
    process.stdin,
  );
} finally {
  removeSignalHandlers();
}
