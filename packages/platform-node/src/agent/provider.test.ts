import { expect, test } from 'vitest';
import { normalizeCodexModels, normalizeCodexThreads } from './provider.js';

test('normalizes extensible Codex model and thread responses', () => {
  expect(
    normalizeCodexModels([
      {
        id: 'gpt-test',
        model: 'gpt-test',
        displayName: 'GPT Test',
        description: 'test model',
        supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'thorough' }],
        defaultReasoningEffort: 'high',
        isDefault: true,
        serviceTiers: [{ id: 'priority' }],
      },
    ]),
  ).toEqual([
    {
      id: 'gpt-test',
      displayName: 'GPT Test',
      description: 'test model',
      supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'thorough' }],
      defaultReasoningEffort: 'high',
      isDefault: true,
    },
  ]);
  expect(
    normalizeCodexThreads([
      { id: 'thread-1', preview: 'Hello', name: null, createdAt: 1, updatedAt: 2, status: {} },
    ]),
  ).toEqual([{ id: 'thread-1', preview: 'Hello', createdAt: 1, updatedAt: 2 }]);
});
