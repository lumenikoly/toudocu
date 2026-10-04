import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';

// macOS exposes /var through /private/var; fixtures compare canonical paths.
if (process.platform !== 'win32') process.env.TMPDIR = realpathSync(tmpdir());
