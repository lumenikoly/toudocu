import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { AgentPreferenceStore } from './preferences.js';

test('stores preferences by canonical repository and ignores invalid state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'toudocu-preferences-'));
  try {
    const first = new AgentPreferenceStore('/project/one', directory);
    const second = new AgentPreferenceStore('/project/two', directory);
    await first.save({ launchPreset: 'full-access', model: 'gpt-test', effort: 'high' });
    expect(await first.load()).toEqual({
      launchPreset: 'full-access',
      model: 'gpt-test',
      effort: 'high',
    });
    expect(await second.load()).toEqual({ launchPreset: 'default' });

    await writeFile(join(directory, 'agent-preferences.json'), '{invalid', 'utf8');
    expect(await first.load()).toEqual({ launchPreset: 'default' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
