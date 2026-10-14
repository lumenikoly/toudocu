#!/usr/bin/env node
import { Buffer } from 'node:buffer';

// Offline presentation only: never executes CLI/task commands or infers readiness.
const maxInputBytes = 16 * 1024 * 1024;
const maxOutputBytes = 12 * 1024;

function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON report object.');
  return value;
}
function list(value) {
  if (!Array.isArray(value)) throw new Error('Expected a report collection.');
  return value;
}
function text(value) {
  if (typeof value !== 'string') throw new Error('Expected a report string.');
  return value;
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Expected a report count.');
  return value;
}
function boolean(value) {
  if (typeof value !== 'boolean') throw new Error('Expected a report boolean.');
  return value;
}
function fields(value, validators) {
  const item = object(value);
  return Object.fromEntries(
    Object.entries(validators).map(([key, validate]) => [key, validate(item[key])]),
  );
}
function optionalText(item, result, keys) {
  for (const key of keys) if (item[key] !== undefined) result[key] = text(item[key]);
  return result;
}
function issue(value) {
  const item = object(value);
  if (!['error', 'warning', 'info'].includes(item.severity))
    throw new Error('Unknown diagnostic severity.');
  const result = optionalText(
    item,
    { severity: item.severity, code: text(item.code), message: text(item.message) },
    ['migration', 'documentPath', 'taskId', 'relatedId'],
  );
  for (const key of ['line', 'column']) if (item[key] !== undefined) result[key] = count(item[key]);
  return result;
}
function integer(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/u.test(value)) throw new Error('Offset/limit must be integers.');
  return count(Number(value));
}

try {
  const [mode, rawOffset, rawLimit, ...extra] = process.argv.slice(2);
  if (!['check', 'verify'].includes(mode) || extra.length)
    throw new Error('Usage: report-summary.mjs check|verify [offset] [limit] < report.json');
  const offset = integer(rawOffset, 0);
  const limit = integer(rawLimit, 5);
  if (limit < 1 || limit > 20) throw new Error('Limit must be between 1 and 20.');
  function page(items) {
    const end = Math.min(items.length, offset + limit);
    return {
      total: items.length,
      offset,
      items: items.slice(offset, end),
      nextOffset: end < items.length ? end : null,
    };
  }
  let input = '';
  let bytes = 0;
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > maxInputBytes) throw new Error('Input exceeds 16 MiB; select fields externally.');
    input += chunk;
  }
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('Invalid JSON report.');
  }
  const report = object(parsed);
  if (report.schemaVersion !== 1) throw new Error('Unsupported report schemaVersion.');
  const issues = list(report.issues).map(issue);
  let result;
  if (mode === 'check') {
    const stats = fields(report.stats, { documents: count, errors: count, warnings: count });
    result = {
      stats,
      diagnosticCounts: {
        error: issues.filter((item) => item.severity === 'error').length,
        warning: issues.filter((item) => item.severity === 'warning').length,
        info: issues.filter((item) => item.severity === 'info').length,
      },
      issues: page(issues),
    };
  } else {
    if (report.kind !== 'task-verify') throw new Error('Expected a task-verify report.');
    const commands = list(report.commands).map((value) => {
      const item = object(value);
      if (item.exitCode !== null && !Number.isSafeInteger(item.exitCode))
        throw new Error('Expected a command exit code.');
      return {
        sequence: count(item.sequence),
        command: text(item.command),
        targets: list(item.targets).map(text),
        status: text(item.status),
        exitCode: item.exitCode,
        durationMillis: count(item.durationMillis),
        stdoutTruncated: boolean(item.stdoutTruncated),
        stderrTruncated: boolean(item.stderrTruncated),
      };
    });
    const task = object(report.task);
    result = {
      task: optionalText(
        task,
        fields(task, {
          id: text,
          title: text,
          document: text,
          status: (value) =>
            fields(value, { kind: text, symbol: text, label: text, recognized: boolean }),
        }),
        ['type'],
      ),
      status: text(report.status),
      mode: text(report.mode),
      fullVerification: boolean(report.fullVerification),
      summary: fields(report.summary, {
        totalCommands: count,
        passedCommands: count,
        failedCommands: count,
        timedOutCommands: count,
        criteriaPassed: count,
        criteriaFailed: count,
      }),
      validationIssues: page(list(report.validationIssues).map(issue)),
      issues: page(issues),
      commands: page(commands),
      criteria: page(
        list(report.criteria).map((value) => {
          const item = object(value);
          return {
            id: text(item.id),
            status: text(item.status),
            documentCompleted: boolean(item.documentCompleted),
          };
        }),
      ),
      targets: page(
        list(report.targets).map((value) => {
          const item = object(value);
          return { target: text(item.target), status: text(item.status) };
        }),
      ),
    };
    optionalText(report, result, ['target']);
  }
  const output = JSON.stringify({ schemaVersion: 1, view: 'summary', ...result }) + '\n';
  if (Buffer.byteLength(output) > maxOutputBytes)
    throw new Error('Summary exceeds 12 KiB; request a smaller page or selected fields.');
  process.stdout.write(output);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Unable to summarize report.'}\n`,
  );
  process.exitCode = 2;
}
