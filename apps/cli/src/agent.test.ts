import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { runCLI } from './cli.js';

const exec = promisify(execFile);

test('uses JSON diagnostics on stderr for strict agent input errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-agent-cli-'));
  const input = join(root, 'response.json');
  await writeFile(input, '{"schemaVersion":1,"unknown":true}\n');
  let stdout = '';
  let stderr = '';
  try {
    const code = await runCLI(
      ['agent', 'respond', '--input', input, '--repository-root', root, '--json'],
      (value) => {
        stdout += value;
      },
      (value) => {
        stderr += value;
      },
    );
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(JSON.parse(stderr)).toEqual({
      schemaVersion: 1,
      diagnostics: [
        {
          severity: 'error',
          code: 'AGENT_INVALID_MESSAGE',
          message: 'invalid response JSON',
        },
      ],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('returns an empty queue request for a Git repository', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-agent-cli-'));
  const stateHome = await mkdtemp(join(tmpdir(), 'toudocu-agent-state-'));
  await exec('git', ['init', '-q'], { cwd: root });
  let stdout = '';
  let stderr = '';
  try {
    const previousStateHome = process.env.TOUDOCU_STATE_HOME;
    process.env.TOUDOCU_STATE_HOME = stateHome;
    try {
      const code = await runCLI(
        ['agent', 'next', '--repository-root', root, '--json'],
        (value) => {
          stdout += value;
        },
        (value) => {
          stderr += value;
        },
      );
      expect(code).toBe(0);
      expect(stderr).toBe('');
      expect(JSON.parse(stdout)).toEqual({ schemaVersion: 1, pending: false });
    } finally {
      if (previousStateHome === undefined) {
        delete process.env.TOUDOCU_STATE_HOME;
      } else {
        process.env.TOUDOCU_STATE_HOME = previousStateHome;
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(stateHome, { recursive: true, force: true });
  }
});
