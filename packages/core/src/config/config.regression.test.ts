import { expect, it } from 'vitest';
import { parseSiteConfig } from './config.js';

it('preserves legacy tolerance for unknown locale profile fields', () => {
  const source = `documentationVersion: 3
project:
  defaultLocale: en-US
locales:
  en-US:
    root: docs
    sections:
      architecture: Architecture
      modules: Modules
      use-cases: Use cases
      flows: Flows
      screens: Screens
      decisions: Decisions
      contracts: Contracts
      quality: Quality
      runbooks: Runbooks
      reference: Reference
      work: Work
      drafts: Drafts
      guides: Guides
    typo: tolerated by legacy lazy-profile parsing
`;

  expect(() => parseSiteConfig(source)).not.toThrow();
  expect(parseSiteConfig(source).locales['en-US']).toMatchObject({ root: 'docs' });
});
