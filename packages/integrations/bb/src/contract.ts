import { defineRpcContract, type StandardSchemaV1 } from '@get-bb/plugin-sdk';
import {
  ProjectInfoV1Schema,
  ProjectWorkspaceV1Schema,
  SearchReportV1Schema,
  TaskCandidatesReportV1Schema,
  TaskListReportV1Schema,
  TaskContextReportV1Schema,
  TaskReadyReportV1Schema,
  TaskVerifyReportV1Schema,
  ChangeSetReportV1Schema,
  ProjectReportV1Schema,
} from '@toudocu/contracts';
import { reports, taskIdPattern } from './toudocu/client.js';

// Normalize Zod issues to the SDK's strict Standard Schema declaration.
function schema<T>(parser: { parse(value: unknown): T }): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'toudocu',
      validate(value) {
        try {
          return { value: parser.parse(value) };
        } catch (error) {
          return { issues: [{ message: error instanceof Error ? error.message : String(error) }] };
        }
      },
    },
  };
}
const empty = ProjectInfoV1Schema.pick({});
const text = ProjectInfoV1Schema.shape.projectRoot;
export const taskId = text.regex(taskIdPattern);
export const threadInput = empty.extend({ threadId: text });
export const taskInput = threadInput.extend({ taskId });
export const projectInput = empty.extend({ projectId: text });
export const scopeInput = threadInput.or(projectInput);
export type Scope = ReturnType<typeof scopeInput.parse>;
export const scopedTaskInput = taskInput.or(projectInput.extend({ taskId }));
export const bindingSchema = taskInput.extend({ projectId: text });
export type ThreadTaskBinding = ReturnType<typeof bindingSchema.parse>;
const operation = text.refine(
  (value) => Object.hasOwn(reports, value),
  'Unknown Toudocu operation',
);
export const hostContract = defineRpcContract({
  read: {
    input: schema(
      empty.extend({
        cwd: text,
        operation,
        value: text.optional(),
        fresh: TaskReadyReportV1Schema.shape.readyForWork.optional(),
      }),
    ),
    output: schema(
      ProjectInfoV1Schema.or(TaskCandidatesReportV1Schema)
        .or(TaskListReportV1Schema)
        .or(TaskContextReportV1Schema)
        .or(TaskReadyReportV1Schema)
        .or(TaskVerifyReportV1Schema)
        .or(ChangeSetReportV1Schema)
        .or(SearchReportV1Schema)
        .or(ProjectReportV1Schema),
    ),
  },
});
export const panelSchema = empty.extend({
  project: ProjectInfoV1Schema,
  binding: bindingSchema.nullable(),
  tasks: TaskListReportV1Schema.shape.tasks,
});
export const rpcContract = defineRpcContract({
  workspace: { input: schema(scopeInput), output: schema(ProjectWorkspaceV1Schema.nullable()) },
  shareWorkspace: {
    input: schema(
      threadInput
        .extend({ instanceId: ProjectWorkspaceV1Schema.shape.instanceId })
        .or(projectInput.extend({ instanceId: ProjectWorkspaceV1Schema.shape.instanceId })),
    ),
    output: schema(text),
  },
  panel: {
    input: schema(
      threadInput
        .extend({ refresh: TaskReadyReportV1Schema.shape.readyForWork.optional() })
        .or(
          projectInput.extend({ refresh: TaskReadyReportV1Schema.shape.readyForWork.optional() }),
        ),
    ),
    output: schema(panelSchema),
  },
  bind: { input: schema(taskInput), output: schema(bindingSchema) },
  work: { input: schema(scopedTaskInput), output: schema(threadInput) },
  changes: { input: schema(scopedTaskInput), output: schema(ChangeSetReportV1Schema) },
  verify: { input: schema(scopedTaskInput), output: schema(TaskVerifyReportV1Schema) },
});
export type PanelData = ReturnType<typeof panelSchema.parse>;

export type TaskEntry = PanelData['tasks'][number];
