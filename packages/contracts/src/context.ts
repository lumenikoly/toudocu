import { z } from 'zod';
import { GeneratorSchema, StatusSchema } from './common.js';
import { IssueSchema } from './issue.js';
import { TaskDescendantsSummarySchema } from './tasks.js';
import {
  WorkItemSchema,
  ModuleSchema,
  UseCaseSchema,
  FlowSchema,
  StandardSchema,
  RunbookSchema,
  ReportScreenSchema,
  ScreenTransitionSchema,
  BusinessRuleSchema,
} from './project.js';

export const TaskHierarchyRefSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  workState: z.string(),
  hasBlocker: z.boolean(),
});
export const TaskHierarchySchema = z.strictObject({
  parent: TaskHierarchyRefSchema.nullable(),
  ancestors: z.array(TaskHierarchyRefSchema),
  children: z.array(TaskHierarchyRefSchema),
  descendants: TaskDescendantsSummarySchema,
});
const screen = ReportScreenSchema.shape;
export const KnowledgeScreenSchema = z.strictObject({
  id: screen.id,
  title: screen.title,
  description: screen.description,
  module: screen.module,
  type: screen.type,
  route: screen.route,
  status: StatusSchema,
  preview: screen.preview,
  component: screen.component,
  updated: screen.updated,
  parent: screen.parent,
  states: screen.states,
  document: screen.document,
  useCases: screen.useCases,
  workItems: screen.workItems,
  contracts: screen.contracts,
  incomingTransitions: screen.incomingTransitions,
  outgoingTransitions: screen.outgoingTransitions,
  reachable: z.boolean(),
  line: z.int().nonnegative(),
});
export const TaskContextDocumentSchema = z.strictObject({
  id: z.string().exactOptional(),
  path: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  status: StatusSchema,
  sections: z.array(z.strictObject({ title: z.string(), markdown: z.string() })),
});
export const TaskContextReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('task-context'),
  generator: GeneratorSchema,
  task: WorkItemSchema,
  hierarchy: TaskHierarchySchema,
  fullVerification: z.boolean(),
  module: ModuleSchema.exactOptional(),
  useCase: UseCaseSchema.exactOptional(),
  flow: FlowSchema.exactOptional(),
  standards: z.array(StandardSchema),
  runbooks: z.array(RunbookSchema),
  screens: z.array(KnowledgeScreenSchema),
  screenTransitions: z.array(ScreenTransitionSchema),
  businessRules: z.array(BusinessRuleSchema),
  dependencies: z.array(WorkItemSchema),
  dependents: z.array(WorkItemSchema),
  documents: z.array(TaskContextDocumentSchema),
  issues: z.array(IssueSchema),
  requiredReads: z.array(z.string()),
});
export type TaskContextReportV1 = z.infer<typeof TaskContextReportV1Schema>;
