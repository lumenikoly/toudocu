import { statusFor, type Document, type DocumentStatus } from '../documents/document.js';
import { canonicalText } from '../documents/project.js';
import type { CompiledProject } from './compile.js';
import type { RoadmapItem } from './roadmap.js';

export interface ProjectInfo {
  title: string;
  description: string;
  status: DocumentStatus;
  stage: string;
  updated: string;
  summary: string;
  overviewDocument?: Document;
  statusDocument?: Document;
}

export interface CurrentWorkItem {
  id: string;
  title: string;
  status: DocumentStatus;
  moduleId: string;
  document: string;
  anchor: string;
}

export interface CurrentBlocker {
  taskId: string;
  text: string;
  document: string;
  anchor: string;
}

export interface CurrentStatus {
  activeWork: CurrentWorkItem[];
  blockers: CurrentBlocker[];
  nextResult?: RoadmapItem;
}

export interface ProjectStats {
  documents: number;
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  taskProgress: number | null;
  documentsComplete: number;
  documentsInProgress: number;
  documentsNotStarted: number;
  documentsWithoutTasks: number;
  staleDocuments: number;
  documentsWithoutDescription: number;
  documentsWithoutStatus: number;
  brokenLinks: number;
  warnings: number;
  errors: number;
  modules: number;
  moduleStatuses: Record<string, number>;
  useCases: number;
  useCaseStatuses: Record<string, number>;
  screens: number;
  screensDone: number;
  screensInProgress: number;
  screensPlanned: number;
  screensUnreachable: number;
  risks: number;
  openRisks: number;
  decisions: number;
  openBugs: number;
  criticalBugs: number;
  highSeverityBugs: number;
  regressionBugs: number;
  unreproducedBugs: number;
  blockedBugs: number;
  runbooksTotal: number;
  runbooksRecent: number;
  runbooksReviewRequired: number;
  runbooksOverdue: number;
}

export interface SearchItem {
  title: string;
  path: string;
  url: string;
  type: string;
  typeLabel: string;
  status: string;
  archived: boolean;
  archiveYear: string;
  description: string;
  text: string;
}

export interface ProjectSummary {
  projectInfo: ProjectInfo;
  currentStatus: CurrentStatus;
  stats: ProjectStats;
  searchIndex: SearchItem[];
}

export interface ProjectSummaryOptions {
  requestedTitle?: string;
  root?: string;
}

function countStatuses(items: readonly { status: DocumentStatus }[]): Record<string, number> {
  const result: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const item of items) result[item.status.kind] = (result[item.status.kind] ?? 0) + 1;
  return result;
}

function archiveInfo(sourcePath: string): { archived: boolean; year: string } {
  const parts = sourcePath.replaceAll('\\', '/').replace(/^\.\//u, '').split('/');
  const archived = parts[0] === 'work' && parts[1] === 'archive';
  const valid =
    archived &&
    parts.length === 4 &&
    /^\d{4}$/u.test(parts[2] ?? '') &&
    parts[3]?.toLowerCase().endsWith('.md');
  return { archived, year: valid ? (parts[2] ?? '') : '' };
}

function truncate(value: string, maxLength: number): string {
  const text = value.trim();
  if (maxLength <= 0 || Array.from(text).length <= maxLength) return text;
  if (maxLength === 1) return '…';
  return `${Array.from(text)
    .slice(0, maxLength - 1)
    .join('')
    .trimEnd()}…`;
}

function projectRootName(root: string): string {
  const normalized = root.replaceAll('\\', '/').replace(/\/+$/u, '');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function buildProjectInfo(project: CompiledProject, options: ProjectSummaryOptions): ProjectInfo {
  const overview = project.index.byPath.get('index.md');
  const statusDocument = project.index.byPath.get('status.md');
  const merged: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const document of [overview, statusDocument])
    for (const [key, value] of Object.entries(document?.metadata ?? {})) merged[key] = value;
  const title = options.requestedTitle || overview?.title || projectRootName(options.root ?? '');
  const summary =
    statusDocument?.sections
      .find((section) => section.heading.level === 2 && section.kind === 'summary')
      ?.text.trim() ||
    statusDocument?.description ||
    '';
  const updated =
    merged.updated ||
    statusDocument?.updatedAt.toISOString().slice(0, 10) ||
    overview?.updatedAt.toISOString().slice(0, 10) ||
    '';
  return {
    title,
    description: overview?.description ?? '',
    status: statusFor(merged.status ?? ''),
    stage: merged.stage ?? '',
    updated,
    summary,
    ...(overview ? { overviewDocument: overview } : {}),
    ...(statusDocument ? { statusDocument } : {}),
  };
}

function buildCurrentStatus(project: CompiledProject): CurrentStatus {
  const activeWork: CurrentWorkItem[] = [],
    blockers: CurrentBlocker[] = [];
  for (const item of project.knowledge.workItems) {
    if (!['planned', 'in-progress', 'blocked'].includes(item.status.kind)) continue;
    activeWork.push({
      id: item.id,
      title: item.title,
      status: item.status,
      moduleId: item.moduleId,
      document: item.document,
      anchor: item.anchor,
    });
    if (item.status.kind === 'blocked')
      blockers.push({
        taskId: item.id,
        text: item.blocker,
        document: item.document,
        anchor: item.anchor,
      });
  }
  let nextResult: RoadmapItem | undefined;
  for (const stage of project.roadmapStages) {
    const next = stage.items.find((item) => !item.effectiveCompleted);
    if (next) {
      nextResult = { ...next };
      break;
    }
  }
  return { activeWork, blockers, ...(nextResult ? { nextResult } : {}) };
}

function buildStats(project: CompiledProject): ProjectStats {
  let totalTasks = 0,
    completedTasks = 0;
  for (const stage of project.roadmapStages) {
    totalTasks += stage.taskStats.total;
    completedTasks += stage.taskStats.completed;
  }
  const stats: ProjectStats = {
    documents: project.index.documents.length,
    totalTasks,
    completedTasks,
    remainingTasks: totalTasks - completedTasks,
    taskProgress: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : null,
    documentsComplete: 0,
    documentsInProgress: 0,
    documentsNotStarted: 0,
    documentsWithoutTasks: 0,
    staleDocuments: 0,
    documentsWithoutDescription: 0,
    documentsWithoutStatus: 0,
    brokenLinks: 0,
    warnings: 0,
    errors: 0,
    modules: project.knowledge.modules.length,
    moduleStatuses: countStatuses(project.knowledge.modules),
    useCases: project.knowledge.useCases.length,
    useCaseStatuses: countStatuses(project.knowledge.useCases),
    screens: project.knowledge.screens.length,
    screensDone: 0,
    screensInProgress: 0,
    screensPlanned: 0,
    screensUnreachable: 0,
    risks: project.risks.length,
    openRisks: 0,
    decisions: project.index.documents.filter((document) => document.type === 'decision').length,
    openBugs: 0,
    criticalBugs: 0,
    highSeverityBugs: 0,
    regressionBugs: 0,
    unreproducedBugs: 0,
    blockedBugs: 0,
    runbooksTotal: project.knowledge.runbooks.length,
    runbooksRecent: 0,
    runbooksReviewRequired: 0,
    runbooksOverdue: 0,
  };
  for (const screen of project.knowledge.screens) {
    if (screen.status.kind === 'done') stats.screensDone++;
    if (screen.status.kind === 'in-progress') stats.screensInProgress++;
    if (screen.status.kind === 'planned') stats.screensPlanned++;
    if (!screen.reachable) stats.screensUnreachable++;
  }
  for (const document of project.index.documents) {
    if (document.taskStats.total === 0) stats.documentsWithoutTasks++;
    else if (document.taskStats.remaining === 0) stats.documentsComplete++;
    else if (document.taskStats.completed === 0) stats.documentsNotStarted++;
    else stats.documentsInProgress++;
    if (document.stale) stats.staleDocuments++;
    if (!document.description) stats.documentsWithoutDescription++;
    if (
      ['status', 'module', 'use-case', 'decision'].includes(document.type) &&
      !document.metadata.status
    )
      stats.documentsWithoutStatus++;
  }
  for (const current of project.issues) {
    if (current.severity === 'error') stats.errors++;
    else stats.warnings++;
    if (current.code === 'broken-link') stats.brokenLinks++;
  }
  for (const risk of project.risks)
    if (!['done', 'accepted', 'risk-accepted'].includes(risk.status.kind)) stats.openRisks++;
  for (const runbook of project.knowledge.runbooks) {
    if (runbook.freshness === 'recent') stats.runbooksRecent++;
    if (runbook.freshness === 'review-required') stats.runbooksReviewRequired++;
    if (runbook.freshness === 'overdue') stats.runbooksOverdue++;
  }
  for (const item of project.knowledge.workItems) {
    if (item.type !== 'bug' || item.archived) continue;
    if (!['done', 'cancelled'].includes(item.status.label)) stats.openBugs++;
    if (item.severity === 'critical') stats.criticalBugs++;
    if (item.severity === 'high') stats.highSeverityBugs++;
    if (item.regression === 'true') stats.regressionBugs++;
    if (['not-reproduced', 'unknown'].includes(item.reproducibility)) stats.unreproducedBugs++;
    if (item.status.label === 'blocked') stats.blockedBugs++;
  }
  return stats;
}

function buildSearchIndex(project: CompiledProject): SearchItem[] {
  return project.index.documents.map((document) => {
    const archive = archiveInfo(document.sourcePath);
    const headings = document.headings.map((heading) => heading.title).join(' ');
    const tasks = document.tasks.map((task) => task.text).join(' ');
    const stableId = document.metadata.id?.trim() ?? '';
    const text = canonicalText(
      [stableId, document.title, document.sourcePath, headings, tasks, document.plainText].join(
        ' ',
      ),
    );
    return {
      title: document.title,
      path: document.sourcePath,
      url: document.outputPath,
      type: document.type,
      typeLabel: document.typeLabel,
      status: document.metadata.status ?? '',
      archived: archive.archived,
      archiveYear: archive.year,
      description: truncate(document.description || document.plainText, 220),
      text,
    };
  });
}

/** Build the reader-facing project summaries from an already compiled project. */
export function buildProjectSummary(
  project: CompiledProject,
  options: ProjectSummaryOptions = {},
): ProjectSummary {
  return {
    projectInfo: buildProjectInfo(project, options),
    currentStatus: buildCurrentStatus(project),
    stats: buildStats(project),
    searchIndex: buildSearchIndex(project),
  };
}

export { buildCurrentStatus, buildProjectInfo, buildSearchIndex, buildStats };
