import { expect, test } from 'vitest';
import { parseNameStatus, parseStatusStates } from './status.js';

test('name-status preserves Unicode, spaces, tabs and newlines across rename/copy/type changes', () => {
  expect(
    parseNameStatus(
      Buffer.from(
        'M\0docs/東京 café\tline\n.md\0R100\0docs/old.md\0docs/new name.md\0C75\0docs/source.md\0docs/copy.md\0T\0docs/type.md\0',
      ),
    ),
  ).toEqual([
    { status: 'modified', path: 'docs/東京 café\tline\n.md' },
    { status: 'renamed', oldPath: 'docs/old.md', path: 'docs/new name.md' },
    { status: 'copied', oldPath: 'docs/source.md', path: 'docs/copy.md' },
    { status: 'type-changed', path: 'docs/type.md' },
  ]);
  expect(parseNameStatus(Buffer.from('A\tdocs/inline.md\0'))).toEqual([
    { status: 'added', path: 'docs/inline.md' },
  ]);
  expect(() => parseNameStatus(Buffer.from('R100\0only-source\0'))).toThrow('incomplete');
  expect(() => parseNameStatus(Buffer.from([77, 0, 255, 0]))).toThrow('UTF-8');
});

test('porcelain paths remain intact and rename origin does not become a second change', () => {
  const states = parseStatusStates(
    Buffer.from(
      '1 M. N... 100644 100644 100644 a b docs/staged name.md\0' +
        '1 .M N... 100644 100644 100644 a b docs/unstaged.md\0' +
        '2 RM N... 100644 100644 100644 a b R100 docs/renamed 東京.md\0docs/old name.md\0' +
        '? docs/untracked\nfile.md\0',
    ),
  );
  expect([...states.keys()]).toEqual([
    'docs/staged name.md',
    'docs/unstaged.md',
    'docs/renamed 東京.md',
    'docs/untracked\nfile.md',
  ]);
  expect(states.get('docs/staged name.md')).toMatchObject({ staged: true, unstaged: false });
  expect(states.get('docs/unstaged.md')).toMatchObject({ staged: false, unstaged: true });
  expect(states.get('docs/renamed 東京.md')).toMatchObject({ staged: true, unstaged: true });
  expect(states.get('docs/untracked\nfile.md')).toMatchObject({
    staged: false,
    unstaged: true,
    untracked: true,
  });
});
