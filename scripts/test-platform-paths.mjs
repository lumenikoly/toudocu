import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Fixtures use canonical paths, including macOS aliases and Windows short names.
const temporaryRoot = realpathSync(tmpdir());
if (process.platform === 'win32') {
  process.env.TEMP = temporaryRoot;
  process.env.TMP = temporaryRoot;
} else {
  process.env.TMPDIR = temporaryRoot;
}
