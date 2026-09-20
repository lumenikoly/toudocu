import { z } from 'zod';
import { GeneratorSchema, StatusSchema, TaskStatsSchema } from './common.js';
import { IssueSchema } from './issue.js';

const text = z.string();
const optionalText = text.exactOptional();
const strings = z.array(text);
const count = z.int().nonnegative();
const entity = { id: text, title: text, status: StatusSchema, document: text };
export const ModuleSchema = z.strictObject({
  ...entity,
  repositoryPaths: strings,
  useCaseIds: strings,
  screenIds: strings,
  businessRuleIds: strings,
});
export const UseCaseSchema = z.strictObject({
  id: text,
  title: text,
  status: StatusSchema,
  moduleId: optionalText,
  document: text,
  repositoryPaths: strings,
  businessRuleIds: strings,
  flowIds: strings,
  screenIds: strings,
  startScreen: optionalText,
  terminalScreens: strings,
  allowCycle: z.boolean(),
});
export const FlowSchema = z.strictObject({
  id: text,
  title: text,
  moduleId: optionalText,
  useCaseIds: strings,
  document: text,
});
export const StandardSchema = z.strictObject({
  id: text,
  title: text,
  status: StatusSchema,
  scope: optionalText,
  updated: optionalText,
  supersededBy: optionalText,
  rules: optionalText,
  automaticChecks: optionalText,
  document: text,
});
export const RunbookSchema = z.strictObject({
  id: text,
  title: text,
  status: StatusSchema,
  environment: optionalText,
  risk: optionalText,
  lastVerified: optionalText,
  freshness: text,
  document: text,
});
export const BusinessRuleSchema = z.strictObject({
  id: text,
  title: text,
  moduleId: optionalText,
  document: text,
  anchor: text,
  line: count,
});
export const ChecklistTaskSchema = z.strictObject({
  line: count,
  indent: count,
  completed: z.boolean(),
  text,
  headingId: optionalText,
  headingTitle: optionalText,
});
export const CriterionVerificationSchema = z.strictObject({
  criterionId: text,
  criterion: text,
  completed: z.boolean(),
  commands: strings,
  transitions: strings,
  verificationReferences: strings,
});
export const VerificationCheckSchema = z.strictObject({
  target: text,
  commands: strings,
  line: count,
});
export const WorkItemSchema = z.strictObject({
  id: text,
  title: text,
  status: StatusSchema,
  type: optionalText,
  archived: z.boolean(),
  archiveYear: optionalText,
  priority: optionalText,
  severity: optionalText,
  reproducibility: optionalText,
  regression: optionalText,
  updated: optionalText,
  moduleId: optionalText,
  useCaseId: optionalText,
  flowId: optionalText,
  screenIds: strings,
  transitionIds: strings,
  standardIds: strings,
  runbookIds: strings,
  dependsOn: strings,
  parentId: text.nullable(),
  childIds: strings,
  document: text,
  anchor: text,
  criteria: z.array(ChecklistTaskSchema),
  verificationMatrix: z.array(CriterionVerificationSchema),
  checks: z.array(VerificationCheckSchema),
  repositoryPaths: strings,
  result: optionalText,
  behaviorChange: optionalText,
  before: optionalText,
  after: optionalText,
  outOfScope: optionalText,
  plan: optionalText,
  documentationImpact: optionalText,
  documentationPaths: strings,
  blocker: optionalText,
});
export const ScreenStateSchema = z.strictObject({
  id: text,
  title: optionalText,
  preview: optionalText,
});
export const ReportScreenSchema = z.strictObject({
  id: text,
  title: text,
  description: optionalText,
  module: text,
  type: text,
  status: text,
  route: optionalText,
  preview: optionalText,
  component: optionalText,
  updated: optionalText,
  parent: optionalText,
  states: z.array(ScreenStateSchema),
  incomingTransitions: strings,
  outgoingTransitions: strings,
  useCases: strings,
  workItems: strings,
  contracts: strings,
  document: text,
});
export const ScreenTransitionSchema = z.strictObject({
  id: text,
  useCase: optionalText,
  source: text,
  target: text,
  action: text,
  condition: text,
  state: optionalText,
  error: optionalText,
  message: optionalText,
  contract: optionalText,
  type: text,
  document: text,
  line: count,
});
export const PlayableFlowSchema = z.strictObject({
  useCase: text,
  startScreen: text,
  reachableScreens: strings,
  terminalScreens: strings,
  transitions: strings,
  result: optionalText,
  valid: z.boolean(),
  issueCodes: strings,
});
export const HotspotSchema = z.strictObject({
  screen: text,
  transition: text,
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  allowDuplicate: z.boolean().exactOptional(),
});
export const ErrorDefinitionSchema = z.strictObject({
  id: text,
  message: text,
  document: text,
  line: count,
});
export const TraceabilitySchema = z.strictObject({
  useCase: optionalText,
  screen: text,
  transition: text,
  task: text,
  criterion: text,
  verification: text,
});
export const RoadmapItemSchema = z.strictObject({
  id: text,
  text,
  kind: text,
  declaredCompleted: z.boolean(),
  effectiveCompleted: z.boolean(),
  completionSource: text,
  targetDocument: optionalText,
  targetStatus: StatusSchema.exactOptional(),
  document: text,
  line: count,
});
export const ProjectStatsSchema = z.strictObject({
  documents: count,
  totalTasks: count,
  completedTasks: count,
  remainingTasks: count,
  taskProgress: z.number().min(0).max(100).nullable(),
  documentsComplete: count,
  documentsInProgress: count,
  documentsNotStarted: count,
  documentsWithoutTasks: count,
  staleDocuments: count,
  documentsWithoutDescription: count,
  documentsWithoutStatus: count,
  brokenLinks: count,
  warnings: count,
  errors: count,
  modules: count,
  moduleStatuses: z.record(text, count),
  useCases: count,
  useCaseStatuses: z.record(text, count),
  screens: count,
  screensDone: count,
  screensInProgress: count,
  screensPlanned: count,
  screensUnreachable: count,
  risks: count,
  openRisks: count,
  decisions: count,
  openBugs: count,
  criticalBugs: count,
  highSeverityBugs: count,
  regressionBugs: count,
  unreproducedBugs: count,
  blockedBugs: count,
  runbooksTotal: count,
  runbooksRecent: count,
  runbooksReviewRequired: count,
  runbooksOverdue: count,
});
export const CurrentStatusSchema = z.strictObject({
  activeWork: z
    .array(
      z.strictObject({
        id: text,
        title: text,
        status: StatusSchema,
        moduleId: optionalText,
        document: text,
        anchor: text,
      }),
    )
    .nullable(),
  blockers: z
    .array(z.strictObject({ taskId: text, text, document: text, anchor: text }))
    .nullable(),
  nextResult: RoadmapItemSchema.exactOptional(),
});
export const ReportDocumentSchema = z.strictObject({
  id: text,
  sourcePath: text,
  outputPath: text,
  type: text,
  sectionType: optionalText,
  title: text,
  description: text,
  metadata: z.record(text, text),
  status: StatusSchema,
  taskStats: TaskStatsSchema,
  updatedAt: z.iso.datetime({ offset: true }),
  stale: z.boolean(),
  warnings: count,
  errors: count,
  links: z.array(
    z.strictObject({
      destination: text,
      broken: z.boolean(),
      blocked: z.boolean(),
      targetKind: text,
      target: text,
      href: text,
    }),
  ),
  backlinks: strings,
  relatedDocuments: strings,
});
export const RoadmapStageSchema = z.strictObject({
  title: text,
  status: StatusSchema,
  plannedDate: text,
  taskStats: TaskStatsSchema,
  items: z.array(RoadmapItemSchema),
  document: text,
  anchor: text,
});

export const RiskSchema = z.strictObject({
  id: text,
  title: text,
  status: StatusSchema,
  probability: text,
  impact: text,
  taskStats: TaskStatsSchema,
  document: text,
  anchor: text,
});

export const ProjectReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  generator: GeneratorSchema,
  generatedAt: z.iso.datetime({ offset: true }),
  sourceDirectory: text,
  staleDays: z.int(),
  project: z.strictObject({
    title: text,
    description: text,
    status: StatusSchema,
    stage: text,
    updated: text,
    summary: text,
  }),
  currentStatus: CurrentStatusSchema,
  stats: ProjectStatsSchema,
  documents: z.array(ReportDocumentSchema),
  roadmap: z.array(RoadmapStageSchema),
  risks: z.array(RiskSchema),
  knowledge: z.strictObject({
    modules: z.array(ModuleSchema).nullable(),
    useCases: z.array(UseCaseSchema).nullable(),
    flows: z.array(FlowSchema).nullable(),
    standards: z.array(StandardSchema).nullable(),
    runbooks: z.array(RunbookSchema).nullable(),
    businessRules: z.array(BusinessRuleSchema).nullable(),
    workItems: z.array(WorkItemSchema).nullable(),
  }),
  screens: z.array(ReportScreenSchema),
  transitions: z.array(ScreenTransitionSchema).nullable(),
  playableFlows: z.array(PlayableFlowSchema).nullable(),
  hotspots: z.array(HotspotSchema).nullable(),
  errorDefinitions: z.array(ErrorDefinitionSchema).nullable(),
  traceability: z.array(TraceabilitySchema).nullable(),
  issues: z.array(IssueSchema),
});
export type ProjectReportV1 = z.infer<typeof ProjectReportV1Schema>;
