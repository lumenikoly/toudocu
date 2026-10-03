import { z } from 'zod';
import { GeneratorSchema, StatusSchema, TaskStatsSchema } from './common.js';
import {
  BusinessRuleSchema,
  CurrentStatusSchema,
  ErrorDefinitionSchema,
  FlowSchema,
  HotspotSchema,
  ModuleSchema,
  PlayableFlowSchema,
  ProjectStatsSchema,
  ReportDocumentSchema,
  ReportScreenSchema,
  RiskSchema,
  RoadmapStageSchema,
  RunbookSchema,
  ScreenTransitionSchema,
  StandardSchema,
  TraceabilitySchema,
  UseCaseSchema,
  WorkItemSchema,
} from './project.js';
import { IssueSchema } from './issue.js';
import { TaskDescendantsSummarySchema } from './tasks.js';

const text = z.string();
const optionalText = text.exactOptional();

const portalTaskStateSchema = z.strictObject({
  status: text,
  workState: text,
  contractComplete: z.boolean(),
  dependenciesSatisfied: z.boolean(),
  readyForWork: z.boolean(),
  canComplete: z.boolean(),
  issues: z.array(IssueSchema),
  descendants: TaskDescendantsSummarySchema,
});

const portalWorkItemSchema = WorkItemSchema.extend({ workspace: portalTaskStateSchema });

export const PortalPageKindSchema = z.enum([
  'home',
  'document',
  'task',
  'catalog',
  'processes',
  'screens',
  'screen-map',
  'traceability',
  'health',
  'search',
  'roadmap',
  'changelog',
  'task-workspace',
  'not-found',
  'report',
  'editor',
  'changes',
  'discussions',
  'api-docs',
]);

export const PortalAppearanceV1Schema = z.strictObject({
  theme: z.enum(['classic', 'paper', 'terminal']),
  colorScheme: z.enum(['light', 'dark', 'system']),
  accent: z.enum(['indigo', 'blue', 'teal', 'green', 'amber', 'rose', 'violet']),
  density: z.enum(['compact', 'comfortable']),
  logo: text,
  artwork: text,
});
export type PortalAppearanceV1 = z.infer<typeof PortalAppearanceV1Schema>;

export const PortalRouteSchema = z.strictObject({
  pageId: text,
  href: text.min(1),
  outputPath: text.min(1),
  kind: PortalPageKindSchema,
  availability: z.enum(['static', 'serve', 'both']),
  serveOnly: z.boolean(),
});
export type PortalRoute = z.infer<typeof PortalRouteSchema>;

export const RuntimeCapabilitiesV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.enum(['static', 'serve']),
  editing: z.boolean(),
  changes: z.boolean(),
  discussions: z.boolean(),
  agentConsole: z.boolean(),
  terminal: z.boolean(),
  taskActions: z.boolean(),
  rebuild: z.boolean(),
});
export type RuntimeCapabilitiesV1 = z.infer<typeof RuntimeCapabilitiesV1Schema>;

export const NavigationItemSchema: z.ZodType<{
  id: string;
  title: string;
  pageId: string;
  href: string;
  kind: string;
  status?: z.infer<typeof StatusSchema>;
  children: NavigationItem[];
}> = z.lazy(() =>
  z.strictObject({
    id: text,
    title: text,
    pageId: text,
    href: text,
    kind: text,
    status: StatusSchema.exactOptional(),
    children: z.array(NavigationItemSchema),
  }),
);
export type NavigationItem = z.infer<typeof NavigationItemSchema>;

export const NavigationViewV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  items: z.array(NavigationItemSchema),
});
export type NavigationViewV1 = z.infer<typeof NavigationViewV1Schema>;

export const PortalSectionViewSchema = z.strictObject({
  id: text,
  title: text,
  level: z.int().positive(),
  kind: optionalText,
  markdown: text,
  line: z.int().nonnegative(),
});

export const PortalDocumentViewSchema = ReportDocumentSchema.extend({
  content: text,
  html: text,
  sections: z.array(PortalSectionViewSchema),
});

const projectSchema = z.strictObject({
  title: text,
  description: text,
  status: StatusSchema,
  stage: text,
  updated: text,
  summary: text,
});

const catalogDataSchema = z.strictObject({
  section: text,
  title: text,
  documents: z.array(PortalDocumentViewSchema),
  entities: z.array(
    z.union([
      ModuleSchema,
      UseCaseSchema,
      FlowSchema,
      StandardSchema,
      RunbookSchema,
      BusinessRuleSchema,
      WorkItemSchema,
    ]),
  ),
});

export const PortalSearchEntrySchema = z.strictObject({
  title: text,
  path: text,
  url: text,
  type: text,
  typeLabel: text,
  status: text,
  archived: z.boolean(),
  archiveYear: text,
  description: text,
  text,
});
export const TaskHierarchyNodeSchema: z.ZodType<{
  id: string;
  title: string;
  status: z.infer<typeof StatusSchema>;
  children: TaskHierarchyNode[];
}> = z.lazy(() =>
  z.strictObject({
    id: text,
    title: text,
    status: StatusSchema,
    children: z.array(TaskHierarchyNodeSchema),
  }),
);
export type TaskHierarchyNode = z.infer<typeof TaskHierarchyNodeSchema>;

const homePageSchema = z.strictObject({
  kind: z.literal('home'),
  pageId: text,
  route: PortalRouteSchema,
  project: projectSchema,
  currentStatus: CurrentStatusSchema,
  stats: ProjectStatsSchema,
  search: z.array(PortalSearchEntrySchema),
  document: PortalDocumentViewSchema.nullable(),
});
const documentPageSchema = z.strictObject({
  kind: z.literal('document'),
  pageId: text,
  route: PortalRouteSchema,
  document: PortalDocumentViewSchema,
  relations: z.strictObject({ related: z.array(text), backlinks: z.array(text) }),
});
const taskPageSchema = z.strictObject({
  kind: z.literal('task'),
  pageId: text,
  route: PortalRouteSchema,
  document: PortalDocumentViewSchema,
  workItem: portalWorkItemSchema,
  hierarchy: z.array(TaskHierarchyNodeSchema),
  relations: z.strictObject({ related: z.array(text), backlinks: z.array(text) }),
});
const catalogPageSchema = z.strictObject({
  kind: z.literal('catalog'),
  pageId: text,
  route: PortalRouteSchema,
  data: catalogDataSchema,
});
const processesPageSchema = z.strictObject({
  kind: z.literal('processes'),
  pageId: text,
  route: PortalRouteSchema,
  useCases: z.array(UseCaseSchema),
  flows: z.array(FlowSchema),
});
const screensPageSchema = z.strictObject({
  kind: z.literal('screens'),
  pageId: text,
  route: PortalRouteSchema,
  screens: z.array(ReportScreenSchema),
  transitions: z.array(ScreenTransitionSchema),
  playableFlows: z.array(PlayableFlowSchema),
  hotspots: z.array(HotspotSchema),
  errors: z.array(ErrorDefinitionSchema),
});
const traceabilityPageSchema = z.strictObject({
  kind: z.literal('traceability'),
  pageId: text,
  route: PortalRouteSchema,
  rows: z.array(TraceabilitySchema),
});
const healthPageSchema = z.strictObject({
  kind: z.literal('health'),
  pageId: text,
  route: PortalRouteSchema,
  stats: ProjectStatsSchema,
  issues: z.array(IssueSchema),
  reportRoute: PortalRouteSchema,
});
const searchPageSchema = z.strictObject({
  kind: z.literal('search'),
  pageId: text,
  route: PortalRouteSchema,
  entries: z.array(PortalSearchEntrySchema),
});
const roadmapPageSchema = z.strictObject({
  kind: z.literal('roadmap'),
  pageId: text,
  route: PortalRouteSchema,
  stages: z.array(RoadmapStageSchema),
  risks: z.array(RiskSchema),
});
const changelogPageSchema = z.strictObject({
  kind: z.literal('changelog'),
  pageId: text,
  route: PortalRouteSchema,
  document: PortalDocumentViewSchema,
});
const taskWorkspacePageSchema = z.strictObject({
  kind: z.literal('task-workspace'),
  pageId: text,
  route: PortalRouteSchema,
  workItems: z.array(portalWorkItemSchema),
  hierarchy: z.array(TaskHierarchyNodeSchema),
});
const serveSurfacePageSchema = z.strictObject({
  kind: z.enum(['editor', 'changes', 'discussions']),
  pageId: text,
  route: PortalRouteSchema,
});
const apiDocsPageSchema = z.strictObject({
  kind: z.literal('api-docs'),
  pageId: text,
  route: PortalRouteSchema,
  specs: z.array(z.strictObject({ path: text, title: text, version: text })),
});
const notFoundPageSchema = z.strictObject({
  kind: z.literal('not-found'),
  pageId: text,
  route: PortalRouteSchema,
});

export const PageViewV1Schema = z.discriminatedUnion('kind', [
  homePageSchema,
  documentPageSchema,
  taskPageSchema,
  catalogPageSchema,
  processesPageSchema,
  screensPageSchema,
  traceabilityPageSchema,
  healthPageSchema,
  searchPageSchema,
  roadmapPageSchema,
  changelogPageSchema,
  taskWorkspacePageSchema,
  notFoundPageSchema,
  serveSurfacePageSchema,
  apiDocsPageSchema,
]);
export type PageViewV1 = z.infer<typeof PageViewV1Schema>;

export const PortalSnapshotV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('portal'),
  generator: GeneratorSchema,
  capabilities: RuntimeCapabilitiesV1Schema,
  project: projectSchema,
  appearance: PortalAppearanceV1Schema.exactOptional(),
  navigation: NavigationViewV1Schema,
  routes: z.array(PortalRouteSchema),
  pages: z.array(PageViewV1Schema),
  stats: ProjectStatsSchema,
  issues: z.array(IssueSchema),
  taskStats: TaskStatsSchema,
  relations: z.array(
    z.strictObject({
      id: text,
      useCases: z.array(text),
      screens: z.array(text),
      rules: z.array(text),
    }),
  ),
  knowledge: z.strictObject({
    modules: z.array(ModuleSchema),
    useCases: z.array(UseCaseSchema),
    flows: z.array(FlowSchema),
    standards: z.array(StandardSchema),
    runbooks: z.array(RunbookSchema),
    businessRules: z.array(BusinessRuleSchema),
  }),
});
export type PortalSnapshotV1 = z.infer<typeof PortalSnapshotV1Schema>;
