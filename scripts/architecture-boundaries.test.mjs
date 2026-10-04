import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';
import { checkArchitecture } from './architecture-boundaries.mjs';

test('core cannot reach runtime or browser globals without an adapter', async () => {
  const [result] = await new ESLint().lintText(
    'process.cwd(); fetch("https://example.com"); window.location;',
    { filePath: 'packages/core/src/forbidden-global.ts' },
  );
  assert.equal(result.errorCount, 3);
  assert.ok(result.messages.every((message) => message.ruleId === 'no-restricted-globals'));
});

function fixture(relativePath, source) {
  const file = join(process.cwd(), relativePath);
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, source);
  return { file };
}

test('repository architecture has no forbidden imports', () => {
  assert.deepEqual(checkArchitecture(), []);
});

test('core rejects Node, React, and adapter imports', () => {
  const { file } = fixture(
    'packages/core/src/architecture-boundary-fixture.ts',
    "import 'node:fs'; import 'react'; import '@toudocu/application';",
  );
  try {
    const violations = checkArchitecture([file]);
    assert.equal(violations.length, 3);
  } finally {
    rmSync(file, { force: true });
  }
});

test('browser code rejects Node and core imports but allows contracts', () => {
  const { file } = fixture(
    'apps/web/app/architecture-boundary-fixture.ts',
    "import 'node:fs'; import '@toudocu/core'; import '@toudocu/contracts';",
  );
  try {
    const violations = checkArchitecture([file]);
    assert.deepEqual(
      violations.map(({ specifier }) => specifier),
      ['node:fs', '@toudocu/core'],
    );
  } finally {
    rmSync(file, { force: true });
  }
});

test('relative and dynamic layer imports are checked', () => {
  const core = fixture(
    'packages/core/src/architecture-boundary-relative-fixture.ts',
    "export {\n} from '../../platform-node/src/index.js'; import('../../platform-node/src/index.js');",
  );
  const browser = fixture(
    'apps/web/app/architecture-boundary-relative-fixture.ts',
    "export {\n} from '../../../packages/core/src/index.js'; import('../../../packages/core/src/index.js');",
  );
  try {
    assert.equal(checkArchitecture([core.file]).length, 2);
    assert.equal(checkArchitecture([browser.file]).length, 2);
  } finally {
    rmSync(core.file, { force: true });
    rmSync(browser.file, { force: true });
  }
});

test('contracts cannot import implementations and core cannot import HTTP or CLI frameworks', () => {
  const contracts = fixture(
    'packages/contracts/src/architecture-boundary-fixture.ts',
    "export * from '../../core/src/index.js';",
  );
  const core = fixture(
    'packages/core/src/architecture-boundary-fixture.ts',
    "import 'fastify'; import 'commander'; import 'vite'; const fs = require('fs/promises');",
  );
  try {
    assert.equal(checkArchitecture([contracts.file]).length, 1);
    assert.equal(checkArchitecture([core.file]).length, 4);
  } finally {
    rmSync(contracts.file, { force: true });
    rmSync(core.file, { force: true });
  }
});

test('bb integration depends on contracts and SDK, never Toudocu implementations', () => {
  const { file } = fixture(
    'packages/integrations/bb/src/architecture-boundary-fixture.ts',
    "import '@get-bb/plugin-sdk'; import '@toudocu/contracts'; import '@toudocu/core'; import '@toudocu/application'; import '@toudocu/platform-node'; import '@toudocu/server'; import '../../../core/src/index.js';",
  );
  try {
    assert.deepEqual(
      checkArchitecture([file]).map(({ specifier }) => specifier),
      [
        '@toudocu/core',
        '@toudocu/application',
        '@toudocu/platform-node',
        '@toudocu/server',
        '../../../core/src/index.js',
      ],
    );
  } finally {
    rmSync(file, { force: true });
  }
});
