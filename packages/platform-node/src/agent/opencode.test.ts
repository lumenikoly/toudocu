import { expect, test } from 'vitest';
import { parseOpenCodeModels } from './opencode.js';

test('parses verbose OpenCode model metadata', () => {
  const output = `openai/gpt-test
{
  "id": "gpt-test",
  "providerID": "openai",
  "name": "GPT Test",
  "capabilities": {"reasoning": true},
  "options": {},
  "variants": {"high": {}, "none": {}, "medium": {}}
}`;
  expect(parseOpenCodeModels(output)).toEqual([
    {
      id: 'openai/gpt-test',
      displayName: 'GPT Test',
      description: '',
      supportedReasoningEfforts: [
        { reasoningEffort: 'none', description: '' },
        { reasoningEffort: 'medium', description: '' },
        { reasoningEffort: 'high', description: '' },
      ],
      defaultReasoningEffort: 'medium',
      isDefault: false,
    },
  ]);
});
