import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.tsx']);
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.filter((name) => !name.startsWith('node:')).map((name) => `node:${name}`),
]);

const rules = [
  {
    prefix: 'packages/integrations/bb/src/',
    forbidden: (specifier) =>
      isPackage(specifier, [
        'core',
        'application',
        'platform-node',
        'server',
        'portal',
        'skills',
      ]) || specifier.startsWith('apps/web/'),
    message: 'bb integration uses only public CLI and contracts',
  },
  {
    prefix: 'packages/contracts/src/',
    forbidden: (specifier) =>
      isNode(specifier) ||
      isReact(specifier) ||
      isPackage(specifier, ['core', 'application', 'platform-node', 'portal', 'server', 'skills']),
    message: 'contracts must stay runtime independent',
  },
  {
    prefix: 'packages/core/src/',
    forbidden: (specifier) =>
      isNode(specifier) ||
      isReact(specifier) ||
      ['fastify', 'commander', 'vite'].some(
        (name) => specifier === name || specifier.startsWith(`${name}/`),
      ) ||
      isPackage(specifier, ['application', 'platform-node', 'portal', 'server']),
    message: 'core cannot depend on adapters, presentation, React, or Node',
  },
  {
    prefix: 'packages/application/src/',
    forbidden: (specifier) =>
      isNode(specifier) || isReact(specifier) || isPackage(specifier, ['platform-node', 'server']),
    message: 'application cannot depend on platform or HTTP adapters',
  },
  {
    prefix: 'apps/web/app/',
    forbidden: (specifier) =>
      isNode(specifier) || isPackage(specifier, ['application', 'core', 'platform-node', 'server']),
    message: 'browser code can depend only on presentation and contracts',
  },
  {
    prefix: 'apps/cli/src/',
    forbidden: (specifier) => isReact(specifier) || isPackage(specifier, ['portal']),
    message: 'CLI cannot depend on browser presentation',
  },
  {
    prefix: 'packages/server/src/',
    forbidden: (specifier) => isReact(specifier),
    message: 'server cannot depend on browser presentation',
  },
];

function isNode(specifier) {
  return specifier.startsWith('node:') || nodeBuiltins.has(specifier);
}

function isReact(specifier) {
  return (
    specifier === 'react' ||
    specifier.startsWith('react/') ||
    specifier === 'react-dom' ||
    specifier.startsWith('react-dom/')
  );
}

function isPackage(specifier, names) {
  return names.some(
    (name) => specifier === `@toudocu/${name}` || specifier.startsWith(`@toudocu/${name}/`),
  );
}

function isLayerPath(path, names) {
  return names.some(
    (name) => path.startsWith(`packages/${name}/src/`) || path.startsWith(`apps/${name}/src/`),
  );
}

function resolveRelativeImport(file, specifier) {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(file), specifier);
  const extensionlessBase = /\.(?:[cm]?js|jsx)$/.test(base)
    ? base.replace(/\.(?:[cm]?js|jsx)$/, '')
    : base;
  const candidates = [
    base,
    extensionlessBase,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    `${extensionlessBase}.ts`,
    `${extensionlessBase}.tsx`,
    `${extensionlessBase}.js`,
    `${extensionlessBase}.mjs`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
    join(extensionlessBase, 'index.ts'),
    join(extensionlessBase, 'index.tsx'),
    join(extensionlessBase, 'index.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function sourceFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(path));
    else if (sourceExtensions.has(path.slice(path.lastIndexOf('.')))) result.push(path);
  }
  return result;
}

function importsFrom(source, file) {
  const imports = [];
  const extension = file.slice(file.lastIndexOf('.'));
  const scriptKind =
    extension === '.tsx'
      ? ts.ScriptKind.TSX
      : extension === '.jsx'
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const add = (specifier, node) => imports.push({ specifier, offset: node.getStart(sourceFile) });
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        add(node.moduleSpecifier.text, node);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) add(argument.text, node);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteral(expression)) add(expression.text, node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

export function checkArchitecture(
  files = sourceFiles(join(root, 'apps')).concat(sourceFiles(join(root, 'packages'))),
) {
  const violations = [];
  for (const file of files) {
    const relativePath = relative(root, file).replaceAll('\\', '/');
    const rule = rules.find(({ prefix }) => relativePath.startsWith(prefix));
    if (!rule) continue;
    const source = readFileSync(file, 'utf8');
    for (const { specifier, offset } of importsFrom(source, file)) {
      const target = resolveRelativeImport(file, specifier);
      const targetPath = target ? relative(root, target).replaceAll('\\', '/') : undefined;
      const forbiddenTarget =
        targetPath !== undefined &&
        ((relativePath.startsWith('packages/integrations/bb/src/') &&
          !targetPath.startsWith('packages/integrations/bb/')) ||
          (relativePath.startsWith('packages/contracts/src/') &&
            isLayerPath(targetPath, [
              'core',
              'application',
              'platform-node',
              'portal',
              'server',
              'skills',
            ])) ||
          (relativePath.startsWith('packages/core/src/') &&
            isLayerPath(targetPath, ['application', 'platform-node', 'portal', 'server'])) ||
          (relativePath.startsWith('packages/application/src/') &&
            isLayerPath(targetPath, ['platform-node', 'server'])) ||
          (relativePath.startsWith('apps/web/app/') &&
            isLayerPath(targetPath, ['application', 'core', 'platform-node', 'server'])));
      if (rule.forbidden(specifier) || forbiddenTarget) {
        violations.push({
          file: relativePath,
          line: lineAt(source, offset),
          specifier,
          message: rule.message,
        });
      }
    }
  }
  return violations;
}

export function formatViolations(violations) {
  return violations
    .map(({ file, line, specifier, message }) => `${file}:${line} imports ${specifier}: ${message}`)
    .join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = checkArchitecture();
  if (violations.length > 0) {
    process.stderr.write(`${formatViolations(violations)}\n`);
    process.exitCode = 1;
  }
}
