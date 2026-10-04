import type { ChangeSetReportV1 } from '@toudocu/contracts';

const utf8 = new TextEncoder();

export function formatChangesText(report: ChangeSetReportV1): string {
  let output = 'Documentation changes\n';
  output += `Base: ${report.comparison.base.displayRef ?? ''} — ${shortObjectID(report.comparison.base.resolved)}\n`;
  output += `Target: ${report.comparison.target.displayRef ?? ''}`;
  if (report.comparison.target.resolved) {
    output += ` — ${shortObjectID(report.comparison.target.resolved)}`;
  }
  output += `\nBranch: ${emptyLabel(report.repository.branch, 'detached HEAD')}\n`;
  output += `State: ${report.repository.dirty ? 'dirty' : 'clean'}\n\n`;
  output += `Added: ${report.summary.files.added + report.summary.files.untracked}  `;
  output += `Modified: ${report.summary.files.modified}  `;
  output += `Deleted: ${report.summary.files.deleted}  `;
  output += `Renamed: ${report.summary.files.renamed}\n`;
  output += `Lines: +${report.summary.lines.added} −${report.summary.lines.deleted}\n`;

  for (const change of report.changes) {
    output += `${statusSymbol(change.status)} ${change.path}`;
    if (change.oldPath) {
      output += ` ← ${change.oldPath}`;
    }
    output += `  +${change.lines.added} −${change.lines.deleted}\n`;
    for (const semantic of change.semanticChanges) {
      output += `    ${semantic.summary}\n`;
    }
  }

  for (const diagnostic of report.diagnostics) {
    if (diagnostic.code === 'DOCS_MIGRATION_REQUIRED') {
      output += `\n${diagnostic.code}\n\n`;
      output += `Migration: ${diagnostic.migration ?? ''}\n`;
      output += `File: ${diagnostic.documentPath ?? ''}\n`;
      continue;
    }
    output += `[${diagnostic.severity.toUpperCase()}] ${diagnostic.code} — ${diagnostic.message}\n`;
  }

  return output;
}

export function formatChangesMarkdown(report: ChangeSetReportV1): string {
  let output = '# Documentation changes\n\n';
  output += `Base: \`${report.comparison.base.displayRef ?? ''}\` (\`${shortObjectID(report.comparison.base.resolved)}\`)  \n`;
  output += `Target: \`${report.comparison.target.displayRef ?? ''}\``;
  if (report.comparison.target.resolved) {
    output += ` (\`${shortObjectID(report.comparison.target.resolved)}\`)`;
  }
  output += '\n\n## Summary\n\n';
  output += `- Added: ${report.summary.files.added + report.summary.files.untracked}\n`;
  output += `- Modified: ${report.summary.files.modified}\n`;
  output += `- Deleted: ${report.summary.files.deleted}\n`;
  output += `- Renamed: ${report.summary.files.renamed}\n`;
  output += `- Lines: +${report.summary.lines.added} −${report.summary.lines.deleted}\n`;
  output += '\n## Semantic changes\n';

  const changes = [...report.changes].sort((left, right) => comparePaths(left.path, right.path));
  for (const change of changes) {
    if (!change.semanticChanges.length) {
      continue;
    }
    output += `\n### \`${change.path}\`\n\n`;
    for (const semantic of change.semanticChanges) {
      output += `- ${semantic.summary}\n`;
    }
  }

  if (report.taskImpact) {
    output += '\n## Task impact\n';
    for (const diagnostic of report.taskImpact.diagnostics) {
      output += `\n- \`${diagnostic.code}\`: ${diagnostic.message}\n`;
    }
  }

  return output;
}

function statusSymbol(status: string): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return '+';
    case 'deleted':
      return '−';
    case 'renamed':
      return '→';
    case 'copied':
      return '⧉';
    default:
      return '~';
  }
}

function emptyLabel(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  return value;
}

function shortObjectID(value: string | undefined): string {
  const normalized = value ?? '';
  return normalized.length > 7 ? normalized.slice(0, 7) : normalized;
}

function comparePaths(left: string, right: string): number {
  const leftBytes = utf8.encode(left);
  const rightBytes = utf8.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    const leftByte = leftBytes[index] ?? 0;
    const rightByte = rightBytes[index] ?? 0;
    if (leftByte !== rightByte) {
      return leftByte - rightByte;
    }
  }
  return leftBytes.length - rightBytes.length;
}
