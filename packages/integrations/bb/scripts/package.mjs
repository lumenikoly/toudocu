import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

// Publish the self-contained bb artifacts; consumers do not install monorepo packages.
const root = new URL('../', import.meta.url);
const target = new URL('build/package/', root);
await mkdir(target, { recursive: true });
for (const entry of ['dist', 'skills', 'README.md']) {
  await cp(new URL(entry, root), new URL(entry, target), { recursive: true });
}
const source = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const { dependencies, devDependencies, scripts, publishConfig, ...manifest } = source;
manifest.bb = {
  ...source.bb,
  server: './dist/server.js',
  app: './dist/app.js',
  host: './dist/host.js',
};
manifest.files = ['dist', 'skills', 'README.md'];
await writeFile(new URL('package.json', target), JSON.stringify(manifest, null, 2) + '\n');
console.log('Prepared build/package for npm pack or npm publish.');
