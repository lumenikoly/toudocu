import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const sourceDirectory = resolve(packageDirectory, '../../skills/toudocu');
const targetDirectory = join(packageDirectory, 'dist', 'toudocu');

await mkdir(dirname(targetDirectory), { recursive: true });
await rm(targetDirectory, { recursive: true, force: true });
await cp(sourceDirectory, targetDirectory, { recursive: true, force: true });
