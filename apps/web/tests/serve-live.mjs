import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runCLI } from '../../cli/dist/cli.js';

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => controller.abort(Object.assign(new Error(signal), { signal })));
}

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'toudocu-live-browser-'));
const project = join(temporary, 'project');
const canonical = process.argv.includes('--canonical');
const execute = promisify(execFile);
try {
  if (canonical) {
    await cp(join(repository, 'docs'), join(project, 'docs'), { recursive: true });
    await mkdir(join(project, '.toudocu'));
    await cp(join(repository, '.toudocu/config.yml'), join(project, '.toudocu/config.yml'));
    await cp(join(repository, 'CHANGELOG.md'), join(project, 'CHANGELOG.md'));
  } else {
    await cp(resolve(repository, 'fixtures/projects/compat-basic'), project, { recursive: true });
  }
  await execute('git', ['init', '-q'], { cwd: project });
  await execute('git', ['add', '.'], { cwd: project });
  await execute(
    'git',
    [
      '-c',
      'user.name=Toudocu',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ],
    { cwd: project },
  );
  process.env.TOUDOCU_STATE_HOME = join(temporary, 'state');
  const code = await runCLI(
    [
      'serve',
      resolve(project, 'docs'),
      '--repository-root',
      project,
      '--host',
      '127.0.0.1',
      '--port',
      canonical ? '4177' : '4175',
      '--no-update-check',
    ],
    () => {},
    (value) => process.stderr.write(value),
    controller.signal,
  );
  process.exitCode = controller.signal.aborted ? 0 : code;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
