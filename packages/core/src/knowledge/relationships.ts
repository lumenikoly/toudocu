import type { Issue } from '@toudocu/contracts';
import { sectionTypes, type LocaleProfile } from '../config/config.js';
import { canonicalText, type DocumentIndex } from '../documents/project.js';
import type { ResolvedLink } from '../documents/links.js';
import { checkMermaid, mermaidMaxBytes } from '../markdown/mermaid.js';
import { splitReferences } from './entities.js';

export function validateRelationships(
  index: DocumentIndex,
  links: ReadonlyMap<string, readonly ResolvedLink[]>,
  localization?: { locale: string; profile: LocaleProfile | undefined },
): Issue[] {
  const issues: Issue[] = [];
  const report = (
    documentPath: string,
    code: string,
    message: string,
    line?: number,
    severity: Issue['severity'] = 'error',
  ): void => {
    issues.push({ severity, code, message, documentPath, ...(line ? { line } : {}) });
  };
  const ids = new Map(
    index.documents
      .filter((document) => document.metadata.id)
      .map((document) => [document.metadata.id, document]),
  );
  const listed = new Set(
    (links.get('architecture/overview.md') ?? [])
      .filter((link) => !link.image)
      .map((link) => link.targetDocumentPath),
  );
  for (const document of index.documents) {
    const fail = (code: string, message: string, line?: number): void =>
      report(document.sourcePath, code, message, line);
    if (document.type === 'architecture' && document.sourcePath !== 'architecture/overview.md') {
      if (!document.metadata.architectureQuestion?.trim())
        fail(
          'missing-architecture-question',
          'A detailed architecture document must contain a non-empty Architecture question field.',
        );
      if (!listed.has(document.sourcePath))
        fail(
          'unlisted-architecture-document',
          'A detailed architecture document must be linked directly from architecture/overview.md.',
        );
    }
    const flowUseCases = splitReferences(document.metadata.useCase ?? '');
    if (document.type === 'flow') {
      for (const id of flowUseCases)
        if (ids.get(id)?.type !== 'use-case')
          fail('dangling-use-case-reference', `The flow references unknown use case ${id}.`);
      const module = document.metadata.module?.trim();
      if (module && ids.get(module)?.type !== 'module')
        fail('dangling-module-reference', `The flow references unknown module ${module}.`);
      if (!document.mermaidBlocks.length)
        fail('missing-flow-diagram', 'The flow document must contain a Mermaid block.');
    }
    for (const block of document.codeBlocks.filter(
      (block) => block.info.trim().toLowerCase() === 'mermaid',
    )) {
      const line = block.range.start.line;
      if (!block.closed)
        fail('unterminated-mermaid-diagram', 'The Mermaid block is not closed.', line);
      if (!block.source.trim()) {
        fail('empty-mermaid-diagram', 'The Mermaid block must not be empty.', line);
        continue;
      }
      const policy = checkMermaid(block.source);
      if (policy.tooLarge)
        fail(
          'mermaid-diagram-too-large',
          `The Mermaid block exceeds ${mermaidMaxBytes} bytes.`,
          line,
        );
      if (policy.configurationForbidden)
        fail(
          'forbidden-mermaid-configuration',
          'Mermaid front matter and %%{...}%% directives are forbidden.',
          line,
        );
      else if (!policy.diagramType)
        fail(
          'unsupported-mermaid-diagram-type',
          'The first Mermaid line must declare flowchart, stateDiagram-v2, or sequenceDiagram.',
          line,
        );
    }
    if (!document.mermaidBlocks.length) continue;
    const linked =
      ['use-case', 'architecture'].includes(document.type) ||
      (document.type === 'flow' && flowUseCases.some((id) => ids.get(id)?.type === 'use-case')) ||
      (links.get(document.sourcePath) ?? []).some(
        (link) =>
          !link.blocked &&
          !link.broken &&
          !link.image &&
          ['use-case', 'architecture'].includes(
            index.byPath.get(link.targetDocumentPath ?? '')?.type ?? '',
          ),
      );
    if (!linked)
      fail(
        'unlinked-mermaid-diagram',
        'A document containing Mermaid must be linked to a use case or an architecture document.',
        document.mermaidBlocks[0]?.range.start.line,
      );
  }
  if (localization) {
    if (!localization.locale)
      report(
        '.toudocu/config.yml',
        'missing-project-locale',
        'Set project.locale in .toudocu/config.yml for localized built-in sections.',
        undefined,
        'warning',
      );
    const sections = localization.profile?.sections ?? {};
    const complete = Object.keys(sections).length === sectionTypes.length;
    if (!complete)
      report(
        '.toudocu/config.yml',
        'incomplete-project-sections',
        'Define every project.sections entry in .toudocu/config.yml for localized built-in sections.',
        undefined,
        'warning',
      );
    if (localization.locale && complete)
      for (const section of sectionTypes) {
        const document = index.byPath.get(
          `${section}/${section === 'architecture' ? 'overview' : 'index'}.md`,
        );
        if (document && canonicalText(document.title) !== canonicalText(sections[section] ?? ''))
          report(
            document.sourcePath,
            'builtin-section-title-mismatch',
            `The built-in section H1 must match project.sections.${section}.`,
            undefined,
            'warning',
          );
      }
  }
  return issues;
}
