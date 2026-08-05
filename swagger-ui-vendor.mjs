import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const source = "node_modules/swagger-ui-dist";
const target = "internal/app/assets";
const files = [
  ["swagger-ui.css", "swagger-ui.css"],
  ["swagger-ui-bundle.js", "swagger-ui-bundle.js"],
  ["swagger-ui-standalone-preset.js", "swagger-ui-standalone-preset.js"],
  ["LICENSE", "swagger-ui.LICENSE.txt"],
  ["swagger-ui-bundle.js.LICENSE.txt", "swagger-ui-bundle.LICENSE.txt"],
  ["swagger-ui-standalone-preset.js.LICENSE.txt", "swagger-ui-standalone-preset.LICENSE.txt"],
];

for (const [input, output] of files) {
  await copyFile(join(source, input), join(target, output));
}

const checksums = [];
for (const [, output] of files) {
  const content = await readFile(join(target, output));
  checksums.push(`${createHash("sha256").update(content).digest("hex")}  ${output}`);
}
await writeFile(join(target, "swagger-ui.checksums.txt"), checksums.join("\n") + "\n");
