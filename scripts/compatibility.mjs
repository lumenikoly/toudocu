#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve, join, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const corpusPath = join(root, 'fixtures', 'compatibility-corpus.json');
const expectedRoot = join(root, 'fixtures', 'expected', 'compatibility');
const tempPath = resolve(tmpdir());
const timeoutMillis = 120_000;

function usage() {
  console.error(
    'usage: node scripts/compatibility.mjs [--capture] [--candidate EXECUTABLE] [--case NAME]',
  );
  process.exitCode = 2;
}

const options = {
  capture: false,
  candidate: process.env.TOUDOCU_TS_BIN ?? join(root, 'apps', 'cli', 'dist', 'main.js'),
  only: '',
};
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--capture') options.capture = true;
  else if (arg === '--candidate' && process.argv[i + 1]) options.candidate = process.argv[++i];
  else if (arg === '--case' && process.argv[i + 1]) options.only = process.argv[++i];
  else {
    usage();
    process.exit();
  }
}

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const cases = corpus.cases.filter((item) => !options.only || item.name === options.only);
if (cases.length === 0) {
  console.error(`unknown compatibility case: ${options.only}`);
  process.exitCode = 2;
  process.exit();
}

function commandFor(executable, args) {
  if (/\.(?:mjs|cjs|js)$/i.test(executable))
    return { command: process.execPath, args: [executable, ...args] };
  return { command: executable, args };
}

function commandArgs(item, project, output = '') {
  const args = item.args.map((arg) => {
    if (arg === 'docs' || arg === '$DOCS') return join(project, 'docs');
    if (arg.startsWith('$DOCS/')) return join(project, 'docs', arg.slice('$DOCS/'.length));
    if (arg === '$PROJECT') return project;
    if (arg === '$OUTPUT') return output;
    return arg;
  });
  if (
    item.args[0] !== 'version' &&
    !args.includes('--repository-root') &&
    !args.some((arg) => arg.startsWith('--repository-root='))
  ) {
    args.push('--repository-root', project);
  }
  return args;
}

function git(project, args) {
  const result = spawnSync('git', ['-C', project, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMillis,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-09-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-09-01T00:00:00Z',
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(`git ${args.join(' ')}: ${result.error?.message ?? result.stderr}`);
}

function initializeGit(project) {
  git(project, ['init', '-q']);
  git(project, ['config', 'user.email', 'compatibility@example.test']);
  git(project, ['config', 'user.name', 'Compatibility Corpus']);
  git(project, ['add', '.']);
  git(project, ['commit', '-q', '-m', 'baseline']);
}

function prepareMutation(project, kind) {
  const index = join(project, 'docs', 'index.md');
  if (kind === 'git-staged') {
    writeFileSync(index, `${readFileSync(index, 'utf8')}\nStaged change.\n`);
    git(project, ['add', 'docs/index.md']);
  } else if (kind === 'git-unstaged') {
    writeFileSync(index, `${readFileSync(index, 'utf8')}\nUnstaged change.\n`);
  } else if (kind === 'git-untracked') {
    writeFileSync(join(project, 'docs', 'untracked.md'), 'Untracked document.\n');
  } else if (kind === 'git-rename') {
    git(project, ['mv', 'docs/modules/core.md', 'docs/modules/renamed.md']);
  } else if (kind === 'git-copy') {
    const source = join(project, 'docs/modules/core.md');
    writeFileSync(source, `${readFileSync(source, 'utf8')}\nChanged before copying.\n`);
    cpSync(source, join(project, 'docs/modules/core-copy.md'));
    git(project, ['add', 'docs/modules/core.md']);
    git(project, ['add', 'docs/modules/core-copy.md']);
  } else if (kind === 'git-type') {
    git(project, ['update-index', '--chmod=+x', 'docs/index.md']);
  } else if (kind === 'task-archive') {
    const task = join(project, 'docs/work/TASK-COMPAT-001.md');
    writeFileSync(
      task,
      readFileSync(task, 'utf8')
        .replace('status: ready', 'status: done')
        .replace('- [ ] `AC-01`', '- [x] `AC-01`'),
    );
  } else if (kind === 'task-restore') {
    const source = join(project, 'docs/work/TASK-COMPAT-001.md');
    const target = join(project, 'docs/work/archive/2026/TASK-COMPAT-001.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      readFileSync(source, 'utf8')
        .replace('status: ready', 'status: done')
        .replace('- [ ] `AC-01`', '- [x] `AC-01`'),
    );
    rmSync(source);
  }
}

function seedAgentState(project, stateHome) {
  const stateDirectory = join(
    stateHome,
    'toudocu',
    'agent-feedback',
    createHash('sha256').update(project).digest('hex'),
  );
  mkdirSync(stateDirectory, { recursive: true });
  const now = '2026-09-01T00:00:00Z';
  const state = {
    schemaVersion: 1,
    storeVersion: 1,
    revision: 0,
    stateDigest: '',
    session: {
      id: 'SESS-COMPAT-001',
      createdAt: now,
      discussions: [
        {
          id: 'DISC-COMPAT-001',
          state: 'open',
          target: { kind: 'document', path: 'docs/index.md' },
          anchor: { kind: 'document', path: 'docs/index.md', sourceDigest: '' },
          placement: { status: 'current', path: 'docs/index.md' },
          messages: [
            {
              id: 'MSG-COMPAT-001',
              author: 'human',
              intent: 'question',
              state: 'draft',
              text: 'Please explain this compatibility fixture.',
              evidence: [],
              changedPaths: [],
              createdAt: now,
            },
          ],
          createdAt: now,
          updatedAt: now,
        },
      ],
    },
    deliveries: [
      {
        schemaVersion: 1,
        id: 'DEL-COMPAT-001',
        sequence: 1,
        state: 'pending',
        discussionId: 'DISC-COMPAT-001',
        messageIds: ['MSG-COMPAT-001'],
        createdAt: now,
      },
    ],
  };
  const digestState = JSON.parse(JSON.stringify(state));
  digestState.stateDigest = '';
  delete digestState.repositoryRevision;
  state.stateDigest = createHash('sha256').update(JSON.stringify(digestState)).digest('hex');
  writeFileSync(join(stateDirectory, 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}

function prepareCase(item) {
  const source = resolve(root, 'fixtures', item.project);
  const isolated = Boolean(item.isolated || item.git || item.snapshot || item.routes);
  if (!isolated) return { project: source, temporary: '', output: '' };
  const temporary = mkdtempSync(join(tempPath, 'toudocu-compat-case-'));
  const project = join(temporary, 'project');
  cpSync(source, project, { recursive: true });
  if (item.git) {
    initializeGit(project);
    prepareMutation(project, item.git);
  } else if (item.setup) prepareMutation(project, item.setup);
  const output = item.routes || item.artifacts || item.serve ? join(temporary, 'build') : '';
  const stateHome = item.agentState ? join(temporary, 'state') : '';
  if (item.agentState) seedAgentState(project, stateHome);
  return { project, temporary, output, stateHome };
}

function runProcess(
  item,
  executable,
  project,
  output,
  args,
  input = item.input ?? '',
  stateHome = '',
) {
  const command = commandFor(executable, commandArgs({ ...item, args }, project, output));
  if (item.serve) {
    const probe = join(root, 'fixtures', 'serve-probe.mjs');
    const result = spawnSync(
      process.execPath,
      [probe, command.command, JSON.stringify(command.args)],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: timeoutMillis,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          TOUDOCU_NO_UPDATE_CHECK: '1',
          ...(stateHome ? { TOUDOCU_STATE_HOME: stateHome } : {}),
        },
      },
    );
    if (result.error && result.error.code !== 'ETIMEDOUT')
      throw new Error(`serve probe: ${result.error.message}`);
    return {
      exitCode: result.error?.code === 'ETIMEDOUT' ? 124 : (result.status ?? 1),
      stdout: result.stdout ?? '',
      stderr: `${result.stderr ?? ''}${result.error?.code === 'ETIMEDOUT' ? 'process timed out\n' : ''}`,
    };
  }
  const result = spawnSync(command.command, command.args, {
    cwd: root,
    encoding: 'utf8',
    input,
    timeout: timeoutMillis,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      TOUDOCU_NO_UPDATE_CHECK: '1',
      ...(stateHome ? { TOUDOCU_STATE_HOME: stateHome } : {}),
    },
  });
  if (result.error && result.error.code !== 'ETIMEDOUT')
    throw new Error(`${command.command}: ${result.error.message}`);
  const timedOut = result.error?.code === 'ETIMEDOUT';
  return {
    exitCode: timedOut ? 124 : (result.status ?? 1),
    stdout: result.stdout ?? '',
    stderr: `${result.stderr ?? ''}${timedOut ? 'process timed out\n' : ''}`,
  };
}

function snapshot(project, normalizeDates = []) {
  const datePaths = new Set(normalizeDates);
  const entries = [];
  function walk(directory) {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      if (name.name === '.git') continue;
      const path = join(directory, name.name);
      const rel = relative(project, path).replaceAll('\\', '/');
      if (name.isDirectory()) walk(path);
      else if (name.isSymbolicLink()) entries.push({ path: rel, type: 'symlink' });
      else if (name.isFile()) {
        let data = readFileSync(path);
        if (datePaths.has(rel))
          data = Buffer.from(data.toString('utf8').replaceAll(/\d{4}-\d{2}-\d{2}/g, '<DATE>'));
        entries.push({
          path: rel.replace(/^docs\/work\/archive\/\d{4}\//, 'docs/work/archive/<YEAR>/'),
          type: 'file',
          size: data.length,
          sha256: createHash('sha256').update(data).digest('hex'),
        });
      }
    }
  }
  walk(project);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function staticRoutes(output) {
  const routes = [];
  function walk(directory) {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, name.name);
      if (name.isDirectory()) walk(path);
      else if (
        name.isFile() &&
        (name.name.endsWith('.html') || relative(output, path) === 'report.json')
      ) {
        const rel = relative(output, path).replaceAll('\\', '/');
        if (rel === 'index.html') routes.push('/');
        else if (rel.endsWith('/index.html')) routes.push(`/${rel.slice(0, -'index.html'.length)}`);
        else routes.push(`/${rel}`);
      }
    }
  }
  walk(output);
  return routes.sort();
}

function expectedRoutes() {
  return JSON.parse(readFileSync(join(root, 'fixtures', 'routes.json'), 'utf8')).routes.sort();
}

function normalizeText(value, roots = []) {
  let text = value;
  for (const path of [...roots, tempPath].filter(Boolean)) text = text.replaceAll(path, '<TEMP>');
  text = text.replaceAll(/(work\/archive\/)\d{4}(\/)/g, '$1<YEAR>$2');
  return text;
}

function digestChangeSet(value) {
  const copy = structuredClone(value);
  copy.changeSetDigest = '';
  // encoding/json escapes HTML-significant bytes (and U+2028/U+2029) before hashing.
  const encoded = JSON.stringify(copy).replace(
    /[<>&\u2028\u2029]/g,
    (character) =>
      ({
        '<': '\\u003c',
        '>': '\\u003e',
        '&': '\\u0026',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029',
      })[character],
  );
  return `sha256:${createHash('sha256').update(encoded).digest('hex')}`;
}

function normalize(value, path = [], roots = [], normalizeDigest = false) {
  if (typeof value === 'string') return normalizeText(value, roots);
  if (Array.isArray(value))
    return value.map((item, index) =>
      normalize(item, [...path, String(index)], roots, normalizeDigest),
    );
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'version' && path.at(-1) === 'generator') output[key] = '<VERSION>';
    else if (/^(generatedAt|startedAt|finishedAt|timestamp)$/.test(key))
      output[key] = '<TIMESTAMP>';
    // Command timing is a nondeterministic time field in task reports.
    else if (key === 'durationMillis') output[key] = '<DURATION>';
    else output[key] = normalize(child, [...path, key], roots, normalizeDigest);
  }
  return output;
}

function normalizeOutput(value, roots, normalizeDigest = false, normalizeVersion = false) {
  const text = normalizeText(value, roots);
  if (!/^\s*[\[{]/.test(text)) {
    return normalizeVersion && /^\s*v?\d+\.\d+\.\d+(?:[-+][^\s]+)?\s*$/.test(text)
      ? '<VERSION>\n'
      : text;
  }
  try {
    const raw = JSON.parse(value);
    const normalized = normalize(raw, [], roots, normalizeDigest);
    if (normalizeDigest && typeof raw.changeSetDigest === 'string') {
      const expectedRawDigest = digestChangeSet(raw);
      if (raw.changeSetDigest !== expectedRawDigest)
        throw new Error('legacy changeSetDigest does not match report fields');
      normalized.changeSetDigest = digestChangeSet(normalized);
    }
    return `${JSON.stringify(normalized, null, 2)}\n`;
  } catch (error) {
    if (error instanceof Error && error.message.includes('changeSetDigest')) throw error;
    return text;
  }
}

function normalizedResult(result, roots, item) {
  return {
    exitCode: result.exitCode,
    stdout: normalizeOutput(result.stdout, roots, item.normalizeDigest, item.normalizeVersion),
    stderr: normalizeOutput(result.stderr, roots, item.normalizeDigest),
  };
}

function artifactSnapshot(output) {
  const entries = [];
  function walk(directory) {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, name.name);
      const rel = relative(output, path).replaceAll('\\', '/');
      if (name.isDirectory()) walk(path);
      else if (name.isSymbolicLink()) entries.push({ path: rel, type: 'symlink' });
      else if (name.isFile()) {
        let data = readFileSync(path);
        if (rel === 'report.json')
          data = Buffer.from(normalizeOutput(data.toString('utf8'), [output]));
        entries.push({
          path: rel,
          type: 'file',
          size: data.length,
          sha256: createHash('sha256').update(data).digest('hex'),
        });
      }
    }
  }
  walk(output);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function execute(item, executable) {
  const context = prepareCase(item);
  const roots = context.temporary ? [context.project, context.output] : [];
  try {
    const argsList = item.steps ?? [item.args];
    let results;
    if (item.agentProtocol) {
      const next = runProcess(
        item,
        executable,
        context.project,
        context.output,
        item.args,
        '',
        context.stateHome,
      );
      let request;
      try {
        request = JSON.parse(next.stdout);
      } catch {
        request = {};
      }
      const response = {
        schemaVersion: 1,
        deliveryId: request.deliveryId ?? 'DEL-COMPAT-001',
        discussionId: request.discussion?.id ?? 'DISC-COMPAT-001',
        outcome: 'answered',
        message: 'The compatibility fixture is healthy.',
        evidence: [],
        changedPaths: [],
      };
      const responseArgs = ['agent', 'respond', '--repository-root', '$PROJECT'];
      const responded = runProcess(
        item,
        executable,
        context.project,
        context.output,
        responseArgs,
        `${JSON.stringify(response)}\n`,
        context.stateHome,
      );
      results = [next, responded];
    } else
      results = argsList.map((args) =>
        runProcess(
          item,
          executable,
          context.project,
          context.output,
          args,
          item.input ?? '',
          context.stateHome,
        ),
      );
    const contract = item.steps
      ? { steps: results.map((result) => normalizedResult(result, roots, item)) }
      : item.agentProtocol
        ? { steps: results.map((result) => normalizedResult(result, roots, item)) }
        : normalizedResult(results[0], roots, item);
    if (item.snapshot) contract.sideEffects = snapshot(context.project, item.normalizeDates ?? []);
    if (item.artifacts) contract.artifacts = artifactSnapshot(context.output);
    if (item.routes) {
      contract.routes = staticRoutes(context.output);
      if (JSON.stringify(contract.routes) !== JSON.stringify(expectedRoutes()))
        throw new Error('generated static routes differ from fixtures/routes.json');
    }
    return contract;
  } finally {
    if (context.temporary) rmSync(context.temporary, { recursive: true, force: true });
  }
}

function expectedPath(item) {
  return join(expectedRoot, `${item.name}.json`);
}

function capture(legacy) {
  mkdirSync(expectedRoot, { recursive: true });
  for (const item of cases) {
    const expected = {
      version: 1,
      name: item.name,
      args: item.args ?? item.steps,
      ...execute(item, legacy),
    };
    writeFileSync(expectedPath(item), `${JSON.stringify(expected, null, 2)}\n`);
    console.log(`captured ${item.name}`);
  }
}

function verify(implementation) {
  let failures = 0;
  for (const item of cases) {
    const path = expectedPath(item);
    if (!existsSync(path)) {
      console.error(`missing baseline: ${relative(root, path)}`);
      failures += 1;
      continue;
    }
    const expected = JSON.parse(readFileSync(path, 'utf8'));
    const actual = execute(item, implementation);
    const expectedContract = Object.fromEntries(
      Object.entries(expected).filter(([key]) => !['version', 'name', 'args'].includes(key)),
    );
    if (JSON.stringify(actual) !== JSON.stringify(expectedContract)) {
      failures += 1;
      console.error(`FAIL ${item.name}`);
      console.error(`  expected: ${JSON.stringify(expectedContract)}`);
      console.error(`  actual:   ${JSON.stringify(actual)}`);
    } else console.log(`ok ${item.name}`);
  }
  if (failures) {
    console.error(`${failures} compatibility case(s) failed`);
    process.exitCode = 1;
  } else console.log(`compatibility corpus passed (${cases.length} case(s))`);
}

try {
  if (options.capture) capture(options.candidate);
  else verify(options.candidate);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
