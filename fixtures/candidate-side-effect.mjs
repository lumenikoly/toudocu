import { writeFileSync } from "node:fs";
import { join } from "node:path";

const docs = process.argv.find((arg) => arg.endsWith("/docs") || arg.endsWith("\\docs"));
if (docs) writeFileSync(join(docs, "candidate-side-effect.md"), "unexpected mutation\n");
