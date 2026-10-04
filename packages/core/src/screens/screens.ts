import type { Issue } from '@toudocu/contracts';
import type { Document, DocumentStatus } from '../documents/document.js';
import type { Section, Table } from '../markdown/model.js';
import { normalizeTableCell } from '../markdown/table-cell.js';

export type ScreenKind = 'screen' | 'page' | 'modal' | 'panel' | 'external' | 'system';
export type TransitionKind = 'navigation' | 'redirect' | 'return' | 'external' | 'error';

export interface ScreenState {
  id: string;
  title: string;
  preview: string;
}
export interface Screen {
  id: string;
  title: string;
  description: string;
  moduleID: string;
  kind: string;
  route: string;
  status: DocumentStatus;
  preview: string;
  component: string;
  updated: string;
  parentID: string;
  states: ScreenState[];
  document: string;
  useCaseIDs: string[];
  workItemIDs: string[];
  contractDocuments: string[];
  incomingTransitionIDs: string[];
  outgoingTransitionIDs: string[];
  reachable: boolean;
  line: number;
}
export interface ScreenTransition {
  id: string;
  useCaseID: string;
  fromID: string;
  toID: string;
  action: string;
  condition: string;
  stateID: string;
  errorID: string;
  message: string;
  contract: string;
  kind: string;
  document: string;
  line: number;
}
export interface PlayableFlow {
  useCaseID: string;
  startScreenID: string;
  reachableScreens: string[];
  terminalScreens: string[];
  transitionIDs: string[];
  result: string;
  valid: boolean;
  issueCodes: string[];
}
export interface Hotspot {
  screenID: string;
  transitionID: string;
  x: number;
  y: number;
  width: number;
  height: number;
  allowDuplicate: boolean;
}
export interface ErrorDefinition {
  id: string;
  message: string;
  document: string;
  line: number;
}
export interface TraceabilityRow {
  useCaseID: string;
  screenID: string;
  transitionID: string;
  taskID: string;
  criterionID: string;
  verification: string;
}

export interface ScreenModuleRecord {
  id: string;
  title: string;
  status: DocumentStatus;
  document: string;
}
export interface ScreenUseCaseRecord {
  id: string;
  title: string;
  document: string;
  startScreenID: string;
  terminalScreens: string[];
  screenIDs: string[];
  allowCycle: boolean;
}
export interface ScreenCriterionVerification {
  criterionID: string;
  transitions: string[];
  references: string[];
}
export interface ScreenWorkItemRecord {
  id: string;
  document: string;
  line: number;
  screenIDs: string[];
  transitionIDs: string[];
  verification: ScreenCriterionVerification[];
}
export interface ScreenContractRecord {
  id: string;
  document: string;
}
/** A link resolved by the platform adapter; core does not inspect the filesystem. */
export interface ScreenResolvedLink {
  destination: string;
  label?: string;
  targetDocumentPath?: string;
}
export interface ScreenPreviewAsset {
  status: 'found' | 'missing' | 'symlink' | 'outside';
  outputPath?: string;
  extension?: string;
}
export interface ScreenAssetInfo {
  previews?: ReadonlyMap<string, ScreenPreviewAsset> | Readonly<Record<string, ScreenPreviewAsset>>;
  components?:
    | ReadonlyMap<string, 'found' | 'missing' | 'outside'>
    | Readonly<Record<string, 'found' | 'missing' | 'outside'>>;
}
export interface HotspotInput {
  screen: string;
  transition: string;
  x: number;
  y: number;
  width: number;
  height: number;
  allowDuplicate?: boolean;
}
export interface ScreenCompileOptions {
  modules?: readonly ScreenModuleRecord[];
  useCases?: readonly ScreenUseCaseRecord[];
  workItems?: readonly ScreenWorkItemRecord[];
  contracts?: readonly ScreenContractRecord[];
  contractLinks?: ReadonlyMap<string, readonly ScreenResolvedLink[]>;
  assets?: ScreenAssetInfo;
  hotspots?: readonly HotspotInput[];
}
export interface ScreenCompileResult {
  screens: Screen[];
  transitions: ScreenTransition[];
  playableFlows: PlayableFlow[];
  errors: ErrorDefinition[];
  hotspots: Hotspot[];
  traceability: TraceabilityRow[];
  issues: Issue[];
}

const screenID = /^SC-[A-Z0-9]+(?:-[A-Z0-9]+)+$/u;
const transitionID = /^TR-[A-Z0-9]+-[0-9]{3,}$/u;
const stateID = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const errorID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const safePreviewExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const screenKinds = new Set<ScreenKind>(['screen', 'page', 'modal', 'panel', 'external', 'system']);
const transitionKinds = new Set<TransitionKind>([
  'navigation',
  'redirect',
  'return',
  'external',
  'error',
]);

/** Build screen entities, transitions, flows and traceability from already loaded semantic documents. */
export function compileScreens(
  documents: readonly Document[],
  options: ScreenCompileOptions = {},
): ScreenCompileResult {
  const issues: Issue[] = [];
  const screenDocuments = documents.filter((document) => document.type === 'screen');
  const useCases = options.useCases ? [...options.useCases] : deriveUseCases(documents);
  const workItems = options.workItems ? [...options.workItems] : deriveWorkItems(documents);
  const modules = options.modules ? [...options.modules] : deriveModules(documents);
  const contracts = options.contracts ? [...options.contracts] : deriveContracts(documents);
  const docsByPath = new Map(documents.map((document) => [document.sourcePath, document]));
  const errors = parseErrorDefinitions(documents, issues);
  const errorsByID = new Map(errors.map((error) => [error.id, error]));
  const screens: Screen[] = [];
  const screensByID = new Map<string, Screen>();
  const routes = new Map<string, string>();
  const assets: Record<string, string> = {};

  for (const document of screenDocuments) {
    const screen = parseScreenDocument(document, options.assets, assets, issues);
    const previous = screen.id ? screensByID.get(screen.id) : undefined;
    if (previous)
      addIssue(
        issues,
        'error',
        `Screen ${screen.id} is already declared in ${previous.document}.`,
        document.sourcePath,
        0,
        'duplicate-screen-id',
      );
    screens.push(screen);
    if (screen.id) screensByID.set(screen.id, screen);
    if (screen.route) {
      const priorRoute = routes.get(screen.route);
      if (priorRoute)
        addIssue(
          issues,
          'error',
          `Route ${screen.route} is already used by screen ${priorRoute}.`,
          document.sourcePath,
          0,
          'duplicate-screen-route',
        );
      routes.set(screen.route, screen.id);
    }
  }
  const modulesByID = new Map(
    modules.filter((module) => module.id).map((module) => [module.id, module]),
  );
  for (const screen of screens) {
    if (!modulesByID.has(screen.moduleID))
      addIssue(
        issues,
        'error',
        `Screen ${screen.id} references unknown module ${screen.moduleID}.`,
        screen.document,
        0,
        'dangling-module-reference',
      );
  }
  validateScreenParents(screens, screensByID, issues, docsByPath);
  const transitions: ScreenTransition[] = [];
  const transitionsByID = new Map<string, ScreenTransition>();
  const useCaseIDs = new Set(useCases.map((useCase) => useCase.id));
  const contractsByID = new Map(contracts.map((contract) => [contract.id, contract.document]));
  for (const screen of screens) {
    const document = docsByPath.get(screen.document);
    if (!document) continue;
    for (const transition of parseTransitions(
      document,
      screen,
      screensByID,
      errorsByID,
      contractsByID,
      options.contractLinks,
      issues,
    )) {
      const previous = transition.id ? transitionsByID.get(transition.id) : undefined;
      if (previous)
        addIssue(
          issues,
          'error',
          `Transition ${transition.id} is already declared in ${previous.document}.`,
          document.sourcePath,
          transition.line,
          'duplicate-transition-id',
        );
      if (transition.useCaseID && !useCaseIDs.has(transition.useCaseID))
        addIssue(
          issues,
          'error',
          `The transition references unknown use case ${transition.useCaseID}.`,
          document.sourcePath,
          transition.line,
          'dangling-use-case-reference',
        );
      transitions.push(transition);
      if (transition.id) transitionsByID.set(transition.id, transition);
    }
  }
  for (const transition of transitions) {
    const source = screensByID.get(transition.fromID);
    const target = screensByID.get(transition.toID);
    if (source) {
      source.outgoingTransitionIDs.push(transition.id);
      if (transition.contract) source.contractDocuments.push(transition.contract);
      const definition = errorsByID.get(transition.errorID);
      if (definition) source.contractDocuments.push(definition.document);
    }
    if (target) target.incomingTransitionIDs.push(transition.id);
  }
  const playableFlows = buildPlayableFlows(useCases, screensByID, transitions, issues, docsByPath);
  const traceability = buildTraceability(workItems, transitionsByID, screensByID, issues);
  const hotspots = validateHotspots(options.hotspots ?? [], transitionsByID, screensByID, issues);
  const hasReferences =
    useCases.some(
      (useCase) =>
        useCase.startScreenID || useCase.terminalScreens.length || useCase.screenIDs.length,
    ) || workItems.some((item) => item.screenIDs.length || item.transitionIDs.length);
  if (screenDocuments.length === 0 && hasReferences)
    addIssue(
      issues,
      'error',
      'Screen references require screens/SC-*.md documents.',
      undefined,
      0,
      'missing-screen-documents',
    );
  if (documents.some((document) => document.type === 'screen-map'))
    addIssue(
      issues,
      'error',
      'screens/map.md is no longer supported; move screens and transitions into SC-*.md.',
      'screens/map.md',
      0,
      'legacy-screen-map-not-supported',
    );
  for (const screen of screens) {
    if (screen.incomingTransitionIDs.length === 0 && screen.outgoingTransitionIDs.length === 0)
      addIssue(
        issues,
        'warning',
        `Screen ${screen.id} is isolated from the map.`,
        screen.document,
        0,
        'isolated-screen',
      );
    if (playableFlows.length > 0 && !screen.reachable)
      addIssue(
        issues,
        'warning',
        `Screen ${screen.id} is unreachable in every playable flow.`,
        screen.document,
        0,
        'unreachable-screen',
      );
    screen.useCaseIDs = uniqueSorted(screen.useCaseIDs);
    screen.workItemIDs = uniqueSorted(screen.workItemIDs);
    screen.contractDocuments = uniqueSorted(screen.contractDocuments);
    screen.incomingTransitionIDs = uniqueSorted(screen.incomingTransitionIDs);
    screen.outgoingTransitionIDs = uniqueSorted(screen.outgoingTransitionIDs);
  }
  return { screens, transitions, playableFlows, errors, hotspots, traceability, issues };
}

function parseScreenDocument(
  document: Document,
  assets: ScreenAssetInfo | undefined,
  registeredAssets: Record<string, string>,
  issues: Issue[],
): Screen {
  const id = trim(document.metadata.id);
  const kind = trim(document.metadata.screenKind);
  const status = document.status;
  const validID = screenID.test(id);
  if (!validID)
    addIssue(
      issues,
      'error',
      'The screen identifier must match SC-<AREA>-<NAME>.',
      document.sourcePath,
      0,
      'invalid-screen-id',
    );
  for (const key of ['id', 'screenKind', 'module', 'status'])
    if (!trim(document.metadata[key]))
      addIssue(
        issues,
        'error',
        `The screen requires field ${key}.`,
        document.sourcePath,
        0,
        'missing-screen-field',
      );
  if (!screenKinds.has(kind as ScreenKind))
    addIssue(
      issues,
      'error',
      'Invalid screen kind.',
      document.sourcePath,
      0,
      'invalid-screen-kind',
    );
  const allowedStatuses = new Set(['done', 'in-progress', 'planned', 'blocked', 'obsolete']);
  if (!status.recognized || !allowedStatuses.has(status.kind))
    addIssue(
      issues,
      'error',
      `Invalid screen status ${document.metadata.status ?? ''}.`,
      document.sourcePath,
      0,
      'invalid-screen-status',
    );
  const preview = resolvePreview(
    document,
    document.metadata.preview ?? '',
    assets,
    registeredAssets,
    issues,
    0,
  );
  const states = parseStates(document, preview, assets, registeredAssets, issues);
  const route = trim(document.metadata.route).replace(/^`|`$/gu, '');
  if (kind === 'external') {
    if (!/^https?:\/\//iu.test(route))
      addIssue(
        issues,
        'error',
        'An external page requires an HTTP(S) route.',
        document.sourcePath,
        0,
        'invalid-external-screen-route',
      );
  } else if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(route))
    addIssue(
      issues,
      'error',
      'A local screen cannot use an external URL as its route.',
      document.sourcePath,
      0,
      'invalid-screen-route',
    );
  const component = trim(document.metadata.component).replace(/^`|`$/gu, '');
  if (component) validateComponent(component, assets, issues, document.sourcePath);
  return {
    id,
    title: screenTitle(document.title, id),
    description: document.description,
    moduleID: trim(document.metadata.module),
    kind,
    route,
    status,
    preview,
    component,
    updated: trim(document.metadata.updated),
    parentID: trim(document.metadata.parentScreen),
    states,
    document: document.sourcePath,
    useCaseIDs: [],
    workItemIDs: [],
    contractDocuments: [],
    incomingTransitionIDs: [],
    outgoingTransitionIDs: [],
    reachable: false,
    line: 0,
  };
}

function parseStates(
  document: Document,
  defaultPreview: string,
  assets: ScreenAssetInfo | undefined,
  registeredAssets: Record<string, string>,
  issues: Issue[],
): ScreenState[] {
  const states: ScreenState[] = [{ id: 'DEFAULT', title: '', preview: defaultPreview }];
  const table = semanticTable(document, 'states');
  if (!table) return states;
  const columns = screenTableColumns(document, table, ['id', 'title', 'preview'], issues);
  if (!columns) return states;
  const seen = new Map([['DEFAULT', 0]]);
  for (const row of table.rows) {
    const id = tableCell(row, columns, 'id').toUpperCase();
    if (!stateID.test(id)) {
      addIssue(
        issues,
        'error',
        `Invalid state identifier ${fallback(id)}.`,
        document.sourcePath,
        row.line,
        'invalid-screen-state-id',
      );
      continue;
    }
    const preview = resolvePreview(
      document,
      tableCell(row, columns, 'preview'),
      assets,
      registeredAssets,
      issues,
      row.line,
    );
    const old = seen.get(id);
    if (old !== undefined) {
      if (id === 'DEFAULT' && old === 0) {
        if (defaultPreview && preview && defaultPreview !== preview)
          addIssue(
            issues,
            'error',
            'The screen preview and DEFAULT state preview must match.',
            document.sourcePath,
            row.line,
            'screen-default-preview-mismatch',
          );
        states[0] = {
          id: 'DEFAULT',
          title: tableCell(row, columns, 'title'),
          preview: preview || defaultPreview,
        };
        seen.set(id, row.line);
      } else
        addIssue(
          issues,
          'error',
          `State ${id} is declared more than once.`,
          document.sourcePath,
          row.line,
          'duplicate-screen-state-id',
        );
      continue;
    }
    seen.set(id, row.line);
    states.push({ id, title: tableCell(row, columns, 'title'), preview });
  }
  return states;
}

function parseTransitions(
  document: Document,
  screen: Screen,
  screens: ReadonlyMap<string, Screen>,
  errors: ReadonlyMap<string, ErrorDefinition>,
  contracts: ReadonlyMap<string, string>,
  contractLinks: ReadonlyMap<string, readonly ScreenResolvedLink[]> | undefined,
  issues: Issue[],
): ScreenTransition[] {
  const table = semanticTable(document, 'transitions');
  if (!table) return [];
  const columns = screenTableColumns(
    document,
    table,
    ['id', 'useCase', 'action', 'condition', 'target', 'kind'],
    issues,
  );
  if (!columns) return [];
  const result: ScreenTransition[] = [];
  const states = new Set(screen.states.map((state) => state.id));
  for (const row of table.rows) {
    const id = tableCell(row, columns, 'id').toUpperCase();
    const useCaseID = tableCell(row, columns, 'useCase').toUpperCase();
    const targetID = tableCell(row, columns, 'target').toUpperCase();
    const stateID = tableCell(row, columns, 'state').toUpperCase();
    const errorIDValue = tableCell(row, columns, 'error').toUpperCase();
    const action = tableCell(row, columns, 'action');
    const condition = tableCell(row, columns, 'condition');
    let message = tableCell(row, columns, 'message');
    let contract = resolveContract(
      tableCell(row, columns, 'contract'),
      contracts,
      contractLinks,
      document,
      issues,
      row.line,
    );
    if (!transitionID.test(id))
      addIssue(
        issues,
        'error',
        'The transition identifier must match TR-<AREA>-<NUMBER>.',
        document.sourcePath,
        row.line,
        'invalid-transition-id',
      );
    if (!action || !condition || !targetID)
      addIssue(
        issues,
        'error',
        'A transition requires ID, action, condition, and target.',
        document.sourcePath,
        row.line,
        'incomplete-screen-transition',
      );
    if (!useCaseID)
      addIssue(
        issues,
        'error',
        `Transition ${fallback(id)} has no use case.`,
        document.sourcePath,
        row.line,
        'transition-without-use-case',
      );
    const target = screens.get(targetID);
    if (!target)
      addIssue(
        issues,
        'error',
        `The transition references unknown screen ${fallback(targetID)}.`,
        document.sourcePath,
        row.line,
        'dangling-screen-reference',
      );
    if (stateID && (!target || !target.states.some((state) => state.id === stateID)))
      addIssue(
        issues,
        'error',
        `The transition references unknown state ${stateID} on the target screen.`,
        document.sourcePath,
        row.line,
        'unknown-screen-state',
      );
    if (errorIDValue) {
      if (!errorID.test(errorIDValue))
        addIssue(
          issues,
          'error',
          `Invalid error code ${errorIDValue}.`,
          document.sourcePath,
          row.line,
          'invalid-error-id',
        );
      else if (!errors.has(errorIDValue))
        addIssue(
          issues,
          'error',
          `Error ${errorIDValue} is not declared in contracts.`,
          document.sourcePath,
          row.line,
          'unknown-transition-error',
        );
      else if (!message) message = errors.get(errorIDValue)?.message ?? '';
    }
    const kind = tableCell(row, columns, 'kind');
    if (!transitionKinds.has(kind as TransitionKind))
      addIssue(
        issues,
        'error',
        'Invalid transition kind.',
        document.sourcePath,
        row.line,
        'invalid-screen-transition-kind',
      );
    if (targetID === screen.id && !stateID && !errorIDValue && !message)
      addIssue(
        issues,
        'error',
        'A transition to the same screen requires a state, error, or message.',
        document.sourcePath,
        row.line,
        'unexplained-self-transition',
      );
    result.push({
      id,
      useCaseID,
      fromID: screen.id,
      toID: targetID,
      action,
      condition,
      stateID,
      errorID: errorIDValue,
      message,
      contract,
      kind,
      document: document.sourcePath,
      line: row.line,
    });
  }
  return result;
}

function parseErrorDefinitions(documents: readonly Document[], issues: Issue[]): ErrorDefinition[] {
  const result: ErrorDefinition[] = [];
  const seen = new Map<string, ErrorDefinition>();
  for (const document of documents.filter((candidate) => candidate.type === 'contract')) {
    const table = semanticTable(document, 'errors');
    if (!table) continue;
    const columns = screenTableColumns(document, table, ['id', 'message'], issues);
    if (!columns) continue;
    for (const row of table.rows) {
      const id = tableCell(row, columns, 'id').toUpperCase();
      const message = tableCell(row, columns, 'message');
      if (!errorID.test(id)) {
        addIssue(
          issues,
          'error',
          `Invalid error code ${fallback(id)}.`,
          document.sourcePath,
          row.line,
          'invalid-error-id',
        );
        continue;
      }
      if (!message)
        addIssue(
          issues,
          'error',
          `Error ${id} has no message.`,
          document.sourcePath,
          row.line,
          'missing-error-message',
        );
      const previous = seen.get(id);
      if (previous) {
        addIssue(
          issues,
          'error',
          `Error ${id} is already declared in ${previous.document}.`,
          document.sourcePath,
          row.line,
          'duplicate-error-id',
        );
        continue;
      }
      const definition = { id, message, document: document.sourcePath, line: row.line };
      seen.set(id, definition);
      result.push(definition);
    }
  }
  return result;
}

function validateScreenParents(
  screens: readonly Screen[],
  byID: ReadonlyMap<string, Screen>,
  issues: Issue[],
  docs: ReadonlyMap<string, Document>,
): void {
  for (const screen of screens)
    if (screen.parentID && (screen.parentID === screen.id || !byID.has(screen.parentID)))
      addIssue(
        issues,
        'error',
        `Parent screen ${screen.parentID} does not exist or is the screen itself.`,
        screen.document,
        undefined,
        'invalid-screen-parent',
      );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, stack: string[]): void => {
    if (visiting.has(id)) {
      const screen = byID.get(id);
      if (screen)
        addIssue(
          issues,
          'error',
          `Sitemap cycle: ${[...stack, id].join(' → ')}.`,
          screen.document,
          undefined,
          'screen-parent-cycle',
        );
      return;
    }
    if (visited.has(id) || !byID.has(id)) return;
    visiting.add(id);
    const parent = byID.get(id)?.parentID;
    if (parent) visit(parent, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const screen of screens) visit(screen.id, []);
  void docs;
}

function buildPlayableFlows(
  useCases: readonly ScreenUseCaseRecord[],
  screens: Map<string, Screen>,
  transitions: readonly ScreenTransition[],
  issues: Issue[],
  docs: ReadonlyMap<string, Document>,
): PlayableFlow[] {
  const result: PlayableFlow[] = [];
  for (const useCase of useCases) {
    const flowTransitions = transitions.filter(
      (transition) => !transition.useCaseID || transition.useCaseID === useCase.id,
    );
    const hasTransitions = transitions.some((transition) => transition.useCaseID === useCase.id);
    if (!useCase.startScreenID && useCase.terminalScreens.length === 0 && !hasTransitions) continue;
    const issueCodes = unique(
      issues
        .filter(
          (issue) =>
            issue.severity === 'error' &&
            issue.documentPath?.startsWith('screens/') &&
            issue.documentPath !== 'screens/hotspots.json',
        )
        .map((issue) => issue.code),
    );
    const addFlowError = (code: string, message: string): void => {
      addIssue(issues, 'error', message, useCase.document, undefined, code);
      issueCodes.push(code);
    };
    if (!screens.has(useCase.startScreenID))
      addFlowError('missing-flow-start-screen', 'The use case has no existing start screen.');
    if (!useCase.terminalScreens.length)
      addFlowError('missing-flow-terminal-screen', 'The use case has no terminal screens.');
    for (const id of useCase.terminalScreens)
      if (!screens.has(id))
        addFlowError(
          'unknown-flow-terminal-screen',
          `The use case references unknown terminal screen ${id}.`,
        );
    const reachable = screens.has(useCase.startScreenID)
      ? reachableFrom(useCase.startScreenID, flowTransitions)
      : new Set<string>();
    if (reachable.size && !useCase.terminalScreens.some((id) => reachable.has(id)))
      addFlowError(
        'unreachable-flow-terminal',
        'No terminal screen is reachable from the start screen.',
      );
    for (const id of useCase.screenIDs) {
      if (!screens.has(id))
        addFlowError('dangling-screen-reference', `The use case references unknown screen ${id}.`);
      else if (!reachable.has(id))
        addFlowError('unreachable-use-case-screen', `Screen ${id} is unreachable in the use case.`);
    }
    const outgoing = new Map<string, ScreenTransition[]>();
    const branchLabels = new Map<string, Set<string>>();
    for (const transition of flowTransitions)
      if (reachable.has(transition.fromID) && reachable.has(transition.toID)) {
        const list = outgoing.get(transition.fromID) ?? [];
        list.push(transition);
        outgoing.set(transition.fromID, list);
        const labels = branchLabels.get(transition.fromID) ?? new Set<string>();
        const label = canonical(transition.action + ' ' + transition.condition);
        if (labels.has(label))
          addFlowError(
            'duplicate-flow-branch-label',
            `Screen ${transition.fromID} repeats branch label ${transition.action} · ${transition.condition}.`,
          );
        labels.add(label);
        branchLabels.set(transition.fromID, labels);
      }
    const terminals = new Set(useCase.terminalScreens);
    for (const id of reachable)
      if (!terminals.has(id) && (outgoing.get(id)?.length ?? 0) === 0)
        addFlowError('flow-dead-end', `Non-terminal screen ${id} has no outgoing transition.`);
    const cyclic = cycleNodes(flowTransitions);
    if (cyclic.size && !useCase.allowCycle)
      addFlowError(
        'forbidden-flow-cycle',
        'The use case contains a cycle without Allow cycle set to Yes.',
      );
    const reversed = flowTransitions.map((transition) => ({
      ...transition,
      fromID: transition.toID,
      toID: transition.fromID,
    }));
    const canReachTerminal = reachableFromMany(useCase.terminalScreens, reversed);
    for (const id of cyclic)
      if (reachable.has(id) && !canReachTerminal.has(id))
        addFlowError(
          'flow-cycle-without-exit',
          `The cycle containing screen ${id} has no path to a terminal screen.`,
        );
    for (const transition of flowTransitions)
      if (reachable.has(transition.fromID) && transition.errorID) {
        let hasExit = terminals.has(transition.toID);
        for (const candidate of outgoing.get(transition.toID) ?? [])
          if (candidate.id !== transition.id && candidate.errorID !== transition.errorID)
            hasExit = true;
        if (!hasExit)
          addFlowError(
            'error-state-without-exit',
            `Error ${transition.errorID} on screen ${transition.toID} has no exit.`,
          );
      }
    const reachableScreens = uniqueSorted([...reachable]);
    for (const id of reachableScreens) {
      const screen = screens.get(id);
      if (screen) {
        screen.useCaseIDs.push(useCase.id);
        screen.reachable = true;
      }
    }
    const transitionIDs = flowTransitions
      .filter((transition) => reachable.has(transition.fromID) && reachable.has(transition.toID))
      .map((transition) => transition.id);
    result.push({
      useCaseID: useCase.id,
      startScreenID: useCase.startScreenID,
      reachableScreens,
      terminalScreens: [...useCase.terminalScreens],
      transitionIDs,
      result: flowResult(docs.get(useCase.document)),
      valid: issueCodes.length === 0,
      issueCodes: unique(issueCodes),
    });
  }
  return result;
}

function buildTraceability(
  workItems: readonly ScreenWorkItemRecord[],
  transitions: ReadonlyMap<string, ScreenTransition>,
  screens: ReadonlyMap<string, Screen>,
  issues: Issue[],
): TraceabilityRow[] {
  const rows: TraceabilityRow[] = [];
  for (const item of workItems) {
    const declared = new Set(item.transitionIDs);
    const traced = new Set<string>();
    for (const transitionID of item.transitionIDs)
      if (!transitions.has(transitionID))
        addIssue(
          issues,
          'error',
          `Task ${item.id} references unknown transition ${transitionID}.`,
          item.document,
          item.line,
          'dangling-transition-reference',
        );
    for (const criterion of item.verification)
      for (const [index, transitionID] of criterion.transitions.entries()) {
        const transition = transitions.get(transitionID);
        if (!transition) {
          addIssue(
            issues,
            'error',
            `Criterion ${criterion.criterionID} references unknown transition ${transitionID}.`,
            item.document,
            item.line,
            'unknown-criterion-transition',
          );
          continue;
        }
        if (!declared.has(transitionID))
          addIssue(
            issues,
            'error',
            `Transition ${transitionID} from traceability is not declared in task metadata.`,
            item.document,
            item.line,
            'undeclared-task-transition',
          );
        const reference = criterion.references[index] ?? criterion.references[0] ?? '';
        if (!reference)
          addIssue(
            issues,
            'error',
            `No verification is defined for ${criterion.criterionID} and ${transitionID}.`,
            item.document,
            item.line,
            'missing-traceability-verification',
          );
        traced.add(transitionID);
        rows.push({
          useCaseID: transition.useCaseID,
          screenID: transition.fromID,
          transitionID,
          taskID: item.id,
          criterionID: criterion.criterionID,
          verification: reference,
        });
      }
    for (const transitionID of declared)
      if (transitions.has(transitionID) && !traced.has(transitionID))
        addIssue(
          issues,
          'error',
          `Transition ${transitionID} is not linked to an acceptance criterion.`,
          item.document,
          item.line,
          'task-transition-without-criterion',
        );
    for (const screenID of item.screenIDs) {
      const screen = screens.get(screenID);
      if (!screen)
        addIssue(
          issues,
          'error',
          `Task ${item.id} references unknown screen ${screenID}.`,
          item.document,
          item.line,
          'dangling-screen-reference',
        );
      else screen.workItemIDs.push(item.id);
    }
  }
  return rows;
}

function validateHotspots(
  items: readonly HotspotInput[],
  transitions: ReadonlyMap<string, ScreenTransition>,
  screens: ReadonlyMap<string, Screen>,
  issues: Issue[],
): Hotspot[] {
  const result: Hotspot[] = [];
  const seen = new Map<string, Set<string>>();
  for (const item of items) {
    if (!screens.has(item.screen)) {
      addIssue(
        issues,
        'error',
        `Hotspot references unknown screen ${item.screen}.`,
        'screens/hotspots.json',
        0,
        'unknown-hotspot-screen',
      );
      continue;
    }
    const transition = transitions.get(item.transition);
    let valid = true;
    if (!screens.has(item.screen) || !transition || transition.fromID !== item.screen) {
      addIssue(
        issues,
        'error',
        `Hotspot references unknown transition or a transition from another screen: ${item.transition}.`,
        'screens/hotspots.json',
        0,
        'unknown-hotspot-transition',
      );
      valid = false;
    }
    if (
      item.x < 0 ||
      item.y < 0 ||
      item.width <= 0 ||
      item.height <= 0 ||
      item.x + item.width > 100 ||
      item.y + item.height > 100
    ) {
      addIssue(
        issues,
        'error',
        'Hotspot coordinates must remain within 0–100.',
        'screens/hotspots.json',
        0,
        'invalid-hotspot-bounds',
      );
      valid = false;
    }
    const screenSeen = seen.get(item.screen) ?? new Set<string>();
    if (screenSeen.has(item.transition) && !item.allowDuplicate) {
      addIssue(
        issues,
        'error',
        `Hotspot for transition ${item.transition} is repeated without allowDuplicate.`,
        'screens/hotspots.json',
        0,
        'duplicate-hotspot-transition',
      );
      valid = false;
    }
    screenSeen.add(item.transition);
    seen.set(item.screen, screenSeen);
    if (valid)
      result.push({
        screenID: item.screen,
        transitionID: item.transition,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        allowDuplicate: item.allowDuplicate ?? false,
      });
  }
  return result;
}

function deriveModules(documents: readonly Document[]): ScreenModuleRecord[] {
  return documents
    .filter((document) => document.type === 'module')
    .map((document) => ({
      id: trim(document.metadata.id),
      title: document.title,
      status: document.status,
      document: document.sourcePath,
    }));
}
function deriveUseCases(documents: readonly Document[]): ScreenUseCaseRecord[] {
  return documents
    .filter((document) => document.type === 'use-case')
    .map((document) => ({
      id: trim(document.metadata.id),
      title: document.title,
      document: document.sourcePath,
      startScreenID: trim(document.metadata.startScreen).toUpperCase(),
      terminalScreens: splitReferences(document.metadata.terminalScreens).map((value) =>
        value.toUpperCase(),
      ),
      screenIDs: splitReferences(document.metadata.screens).map((value) => value.toUpperCase()),
      allowCycle: trim(document.metadata.allowCycle) === 'true',
    }));
}
function deriveWorkItems(documents: readonly Document[]): ScreenWorkItemRecord[] {
  return documents
    .filter((document) => document.type === 'work')
    .map((document) => ({
      id: trim(document.metadata.id),
      document: document.sourcePath,
      line: document.headings.find((heading) => heading.level === 1)?.range.start.line ?? 1,
      screenIDs: splitReferences(document.metadata.screens).map((value) => value.toUpperCase()),
      transitionIDs: splitReferences(document.metadata.transitions).map((value) =>
        value.toUpperCase(),
      ),
      verification: [],
    }));
}
function deriveContracts(documents: readonly Document[]): ScreenContractRecord[] {
  return documents
    .filter((document) => document.type === 'contract' && document.metadata.id)
    .map((document) => ({ id: trim(document.metadata.id), document: document.sourcePath }));
}

interface TableRow {
  cells: string[];
  line: number;
}
interface TableView {
  kind: string;
  columns: string[];
  headers: string[];
  rows: TableRow[];
  line: number;
}
function semanticTable(document: Document, kind: string): TableView | undefined {
  const table = document.tables.find((candidate) => candidate.kind === kind);
  return table
    ? {
        kind: table.kind,
        columns: table.columns,
        headers: table.headers,
        rows: table.rows.map((row) => ({ cells: row.cells, line: row.range.start.line })),
        line: table.range.start.line,
      }
    : undefined;
}
function screenTableColumns(
  document: Document,
  table: TableView,
  required: readonly string[],
  issues: Issue[],
): Record<string, number> | undefined {
  const columns: Record<string, number> = {};
  let valid = table.columns.length === table.headers.length;
  for (const [index, key] of table.columns.entries()) {
    if (Object.hasOwn(columns, key)) valid = false;
    else columns[key] = index;
  }
  for (const key of required)
    if (!Object.hasOwn(columns, key)) {
      addIssue(
        issues,
        'error',
        `The table is missing required column ${key}.`,
        document.sourcePath,
        table.line,
        'invalid-table-columns',
      );
      valid = false;
    }
  if (!valid)
    addIssue(
      issues,
      'error',
      'The semantic table columns must be unique and match the visible column count.',
      document.sourcePath,
      table.line,
      'invalid-table-columns',
    );
  return valid ? columns : undefined;
}
function tableCell(row: TableRow, columns: Record<string, number>, key: string): string {
  return normalizeTableCell(row.cells, columns[key]);
}
function resolvePreview(
  document: Document,
  value: string,
  assets: ScreenAssetInfo | undefined,
  registered: Record<string, string>,
  issues: Issue[],
  line: number,
): string {
  const clean = trim(value).replace(/^`|`$/gu, '');
  if (!clean || clean === '—') return '';
  if (isUnsafePath(clean)) {
    addIssue(
      issues,
      'error',
      'Preview must be a local relative path.',
      document.sourcePath,
      line,
      'unsafe-screen-preview',
    );
    return '';
  }
  const extension = extensionOf(clean);
  if (!safePreviewExtensions.has(extension)) {
    addIssue(
      issues,
      'error',
      `Unsupported preview format: ${fallback(extension)}.`,
      document.sourcePath,
      line,
      'unsafe-screen-preview-format',
    );
    return '';
  }
  const info =
    lookupPreview(assets?.previews, `${document.sourcePath}\0${clean}`) ??
    lookupPreview(assets?.previews, clean);
  if (!info) return clean;
  if (info.status === 'missing') {
    addIssue(
      issues,
      'warning',
      `Preview file not found: ${clean}.`,
      document.sourcePath,
      line,
      'missing-screen-preview',
    );
    return '';
  }
  if (info.status !== 'found') {
    addIssue(
      issues,
      'error',
      info.status === 'symlink'
        ? 'Preview must not be a symbolic link.'
        : 'Preview escapes the repository root.',
      document.sourcePath,
      line,
      'unsafe-screen-preview',
    );
    return '';
  }
  const output = info.outputPath ?? clean;
  registered[output] = info.outputPath ?? clean;
  return output;
}
function validateComponent(
  value: string,
  assets: ScreenAssetInfo | undefined,
  issues: Issue[],
  documentPath: string,
): void {
  if (isUnsafePath(value)) {
    addIssue(
      issues,
      'error',
      'Component path must be relative to the repository root.',
      documentPath,
      0,
      'unsafe-screen-component',
    );
    return;
  }
  const state = lookupComponent(assets?.components, value);
  if (state === 'missing')
    addIssue(
      issues,
      'warning',
      `Component path does not exist: ${value}.`,
      documentPath,
      0,
      'missing-screen-component',
    );
  else if (state === 'outside')
    addIssue(
      issues,
      'error',
      'Component path escapes the repository root.',
      documentPath,
      0,
      'unsafe-screen-component',
    );
}
function lookupPreview(
  source: ScreenAssetInfo['previews'],
  key: string,
): ScreenPreviewAsset | undefined {
  if (!source) return undefined;
  const map = source as ReadonlyMap<string, ScreenPreviewAsset>;
  if (typeof map.get === 'function') return map.get(key);
  return (source as Readonly<Record<string, ScreenPreviewAsset>>)[key];
}
function lookupComponent(
  source: ScreenAssetInfo['components'],
  key: string,
): 'found' | 'missing' | 'outside' | undefined {
  if (!source) return undefined;
  const map = source as ReadonlyMap<string, 'found' | 'missing' | 'outside'>;
  if (typeof map.get === 'function') return map.get(key);
  return (source as Readonly<Record<string, 'found' | 'missing' | 'outside'>>)[key];
}
function isUnsafePath(value: string): boolean {
  return (
    value.replaceAll('\\', '/').startsWith('/') ||
    /^\/?[A-Za-z]:[\\/]/u.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) ||
    /[?#\r\n]/u.test(value)
  );
}
function extensionOf(value: string): string {
  const match = /\.[^.\/]+$/u.exec(value);
  return match?.[0]?.toLowerCase() ?? '';
}
function resolveContract(
  value: string,
  contracts: ReadonlyMap<string, string>,
  contractLinks: ReadonlyMap<string, readonly ScreenResolvedLink[]> | undefined,
  document: Document,
  issues: Issue[],
  line: number,
): string {
  const clean = trim(value).replace(/^`|`$/gu, '');
  if (!clean) return '';
  if (clean.startsWith('CON-')) {
    const target = contracts.get(clean);
    if (target) return target;
    addIssue(
      issues,
      'error',
      `The transition references unknown contract ${clean}.`,
      document.sourcePath,
      line,
      'unknown-transition-contract',
    );
    return '';
  }
  const linkDestination = /^\[[^\]]*\]\(([^)]+)\)$/u.exec(clean)?.[1] ?? clean;
  const target = contractLinks
    ?.get(document.sourcePath)
    ?.find(
      (candidate) =>
        (candidate.destination === linkDestination || candidate.label === clean) &&
        candidate.targetDocumentPath !== undefined &&
        [...contracts.values()].includes(candidate.targetDocumentPath),
    )?.targetDocumentPath;
  if (target) return target;
  addIssue(
    issues,
    'error',
    'A transition contract must be a CON-* identifier or a link to a contract document.',
    document.sourcePath,
    line,
    'unknown-transition-contract',
  );
  return '';
}
function flowResult(document: Document | undefined): string {
  return document?.sections.find((section) => section.kind === 'postconditions')?.text.trim() ?? '';
}

function reachableFrom(
  start: string,
  transitions: readonly Pick<ScreenTransition, 'fromID' | 'toID'>[],
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const transition of transitions)
    adjacency.set(transition.fromID, [
      ...(adjacency.get(transition.fromID) ?? []),
      transition.toID,
    ]);
  const result = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    if (!id || result.has(id)) continue;
    result.add(id);
    queue.push(...(adjacency.get(id) ?? []));
  }
  return result;
}
function reachableFromMany(
  starts: readonly string[],
  transitions: readonly Pick<ScreenTransition, 'fromID' | 'toID'>[],
): Set<string> {
  const result = new Set<string>();
  for (const start of starts) for (const id of reachableFrom(start, transitions)) result.add(id);
  return result;
}
function cycleNodes(
  transitions: readonly Pick<ScreenTransition, 'fromID' | 'toID'>[],
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const transition of transitions)
    adjacency.set(transition.fromID, [
      ...(adjacency.get(transition.fromID) ?? []),
      transition.toID,
    ]);
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cyclic = new Set<string>();
  const connect = (id: string): void => {
    indices.set(id, ++index);
    low.set(id, index);
    stack.push(id);
    onStack.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!indices.has(next)) {
        connect(next);
        low.set(id, Math.min(low.get(id) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) low.set(id, Math.min(low.get(id) ?? 0, indices.get(next) ?? 0));
    }
    if (low.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let node = '';
    do {
      node = stack.pop() ?? '';
      onStack.delete(node);
      component.push(node);
    } while (node !== id);
    if (component.length > 1 || (adjacency.get(id) ?? []).includes(id))
      component.forEach((value) => cyclic.add(value));
  };
  for (const id of adjacency.keys()) if (!indices.has(id)) connect(id);
  return cyclic;
}

function addIssue(
  issues: Issue[],
  severity: Issue['severity'],
  message: string,
  documentPath?: string,
  line?: number,
  code = message,
): void {
  const issue: Issue = { severity, code, message };
  if (documentPath !== undefined) issue.documentPath = documentPath;
  if (line !== undefined) issue.line = line;
  issues.push(issue);
}
function trim(value: string | undefined): string {
  return value?.trim() ?? '';
}
function fallback(value: string): string {
  return value || '—';
}
function splitReferences(value: string | undefined): string[] {
  return unique(
    trim(value)
      .split(/[,;\s]+/u)
      .filter(Boolean),
  );
}
function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
function canonical(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{Nd}]+/gu, ' ')
    .trim();
}
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
}
function uniqueSorted(values: readonly string[]): string[] {
  return unique(values).sort(naturalCompare);
}
function screenTitle(title: string, id: string): string {
  let result = title.trim();
  for (const separator of [':', '—'])
    if (result.startsWith(id + separator)) result = result.slice((id + separator).length).trim();
  return result;
}
