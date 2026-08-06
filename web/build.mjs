import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rm, watch, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(webRoot, "..");
const output = resolve(repositoryRoot, "internal/site/assets/generated");
const expectedOutput = join(repositoryRoot, "internal", "site", "assets", "generated");

if (output !== expectedOutput || !output.endsWith(`${sep}internal${sep}site${sep}assets${sep}generated`)) {
  throw new Error(`Unsafe generated asset path: ${output}`);
}

const jsEntries = {
  appearance: "src/entries/appearance.ts",
  portal: "src/entries/portal.ts",
  serve: "src/entries/serve.ts",
  editor: "src/entries/editor.ts",
  changes: "src/entries/changes.ts",
  "screen-map": "src/entries/screen-map.ts",
  "playable-flow": "src/entries/playable-flow.ts",
  "api-docs": "src/entries/api-docs.ts",
  codemirror: "src/entries/codemirror.ts",
};

const cssEntries = {
  portal: "src/styles/portal.css",
  serve: "src/styles/serve.css",
  editor: "src/styles/editor.css",
  changes: "src/styles/changes.css",
  "screen-map": "src/styles/screen-map.css",
  "playable-flow": "src/styles/playable-flow.css",
};

const vendorFiles = [
  "mermaid.tiny.js",
  "mermaid.LICENSE.txt",
  "swagger-ui.css",
  "swagger-ui-bundle.js",
  "swagger-ui-standalone-preset.js",
  "swagger-ui.LICENSE.txt",
  "swagger-ui-bundle.LICENSE.txt",
  "swagger-ui-standalone-preset.LICENSE.txt",
  "swagger-ui.checksums.txt",
  "codemirror.LICENSE.txt",
];

const staticAssets = [
  "manifest.json",
  "appearance.js",
  "portal.css",
  "portal.js",
  "screen-map.css",
  "screen-map.js",
  "playable-flow.css",
  "playable-flow.js",
  "mermaid.tiny.js",
  "mermaid.LICENSE.txt",
  "favicon.svg",
];

const serveOnlyAssets = [
  "serve.css",
  "serve.js",
  "editor.css",
  "editor.js",
  "changes.css",
  "changes.js",
  "codemirror.js",
  "codemirror.LICENSE.txt",
  "codemirror.checksums.txt",
  "api-docs.js",
  "swagger-ui.css",
  "swagger-ui-bundle.js",
  "swagger-ui-standalone-preset.js",
  "swagger-ui.LICENSE.txt",
  "swagger-ui-bundle.LICENSE.txt",
  "swagger-ui-standalone-preset.LICENSE.txt",
  "swagger-ui.checksums.txt",
];

async function filesBelow(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(absolute, base));
    else if (entry.isFile()) files.push(relative(base, absolute).split(sep).join("/"));
  }
  return files;
}

async function checksum(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function buildAll() {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const common = {
    absWorkingDir: webRoot,
    bundle: true,
    minify: true,
    legalComments: "external",
    logLevel: "info",
    outdir: output,
    sourcemap: false,
    target: ["es2020"],
  };
  await build({ ...common, entryPoints: jsEntries, format: "esm" });
  await build({ ...common, entryPoints: cssEntries });

  await copyFile(join(webRoot, "public/favicon.svg"), join(output, "favicon.svg"));
  for (const file of vendorFiles) await copyFile(join(webRoot, "vendor", file), join(output, file));

  const codeMirrorChecksums = ["codemirror.js", "codemirror.LICENSE.txt"];
  const codeMirrorLines = [];
  for (const file of codeMirrorChecksums) codeMirrorLines.push(`${await checksum(join(output, file))}  ${file}`);
  await writeFile(join(output, "codemirror.checksums.txt"), `${codeMirrorLines.join("\n")}\n`);

  const generated = (await filesBelow(output)).filter((file) => file !== "manifest.json");
  const assets = {};
  for (const file of generated) assets[file] = { file, sha256: await checksum(join(output, file)) };
  const manifest = {
    schemaVersion: 1,
    assets,
    runtimes: {
      static: staticAssets,
      serve: [...staticAssets, ...serveOnlyAssets],
    },
  };
  await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

await buildAll();

if (process.argv.includes("--watch")) {
  let pending;
  const watcher = watch(join(webRoot, "src"), { recursive: true });
  for await (const _event of watcher) {
    clearTimeout(pending);
    pending = setTimeout(() => buildAll().catch((error) => process.stderr.write(`${error.stack || error}\n`)), 75);
  }
}
