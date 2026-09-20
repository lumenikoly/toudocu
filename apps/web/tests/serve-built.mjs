import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCLI } from '../../cli/dist/cli.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const temporary = await mkdtemp(join(tmpdir(), 'toudocu-browser-build-'));
const project = join(temporary, 'project');
const output = join(temporary, 'site');
const prefix = '/project/docs';
await cp(join(repository, 'fixtures/projects/compat-basic'), project, { recursive: true });
await writeFile(
  join(project, 'docs/roadmap.md'),
  '# Roadmap\n\n<!-- toudocu:section roadmap-stage -->\n<!-- toudocu\nstatus: planned\n-->\n\n## Next\n\n- [ ] `DLV-STATIC-001` Publish the static portal.\n',
);
let error = '';
const exitCode = await runCLI(
  ['build', join(project, 'docs'), '--repository-root', project, '--output', output, '--clean'],
  () => {},
  (value) => {
    error += value;
  },
);
if (exitCode) throw new Error(error || `toudocu build exited with ${exitCode}`);

const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
      response.writeHead(404).end();
      return;
    }
    let name = decodeURIComponent(pathname.slice(prefix.length)).replace(/^\/+/, '');
    if (!name || name.endsWith('/')) name += 'index.html';
    const file = resolve(output, name);
    const inside = relative(output, file);
    if (inside.startsWith('..') || (await stat(file)).isDirectory()) throw new Error('not found');
    response.writeHead(200, {
      'content-type': types.get(extname(file)) ?? 'application/octet-stream',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(4174, '127.0.0.1');
const stop = () => server.close(() => void rm(temporary, { recursive: true, force: true }));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
