import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { chmod, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import {
  AgentRequestSchema,
  AgentResponseAckSchema,
  AgentResponseSchema,
  CreateDiscussionRequestSchema,
  CreateReviewMessageRequestSchema,
  ReviewStateSchema,
  ReviewMutationGuardSchema,
  ToudocuError,
  UpdateDiscussionRequestSchema,
  UpdateReviewMessageRequestSchema,
  type AgentResponse,
  type AgentRequest,
  type AgentResponseAck,
  type CreateDiscussionRequest,
  type CreateReviewMessageRequest,
  type ReviewState,
  type UpdateDiscussionRequest,
} from '@toudocu/contracts';
import { openGitRepository } from './git/repository.js';
import { isMissing, isInside, PathPolicy } from './filesystem/path-policy.js';
import { tryLockReviewFile, unlockReviewFile, type NativeLock } from './native-helper.js';

const claimLeaseMillis = 30 * 60 * 1000;
const responseLimit = 64 * 1024;
const messageLimit = 64 * 1024;
const pathLimit = 256;

export interface AgentReviewOptions {
  repositoryRoot?: string;
  documentationRoot?: string;
  stateHome?: string;
}

interface ReviewStore {
  root: string;
  directory: string;
  statePath: string;
  lockPath: string;
}

function agentError(code: string, message: string, exitCode = 1): ToudocuError {
  return new ToudocuError(code, message, { exitCode });
}

function digest(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function timestamp(value = new Date()): string {
  return value.toISOString().replace(/\.?0+Z$/u, 'Z');
}

function goJSON(value: unknown, pretty = false): string {
  const result = JSON.stringify(value, null, pretty ? 2 : undefined);
  return (result ?? 'null').replace(/[<>&\u2028\u2029]/gu, (character) => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });
}

function userStateHome(options: AgentReviewOptions): string {
  if (options.stateHome?.trim()) {
    return resolve(options.stateHome);
  }
  if (process.env.TOUDOCU_STATE_HOME?.trim()) {
    return resolve(process.env.TOUDOCU_STATE_HOME);
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA?.trim()) {
    return resolve(process.env.LOCALAPPDATA);
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support');
  }
  return resolve(process.env.XDG_STATE_HOME?.trim() || join(homedir(), '.local', 'state'));
}

async function createStore(root: string, options: AgentReviewOptions): Promise<ReviewStore> {
  const directory = join(userStateHome(options), 'toudocu', 'agent-feedback', digest(root));
  return {
    root,
    directory,
    statePath: join(directory, 'state.json'),
    lockPath: join(directory, 'state.lock'),
  };
}

function emptyState(): ReviewState {
  const state = {
    schemaVersion: 1 as const,
    storeVersion: 1 as const,
    revision: 0,
    stateDigest: '',
    deliveries: [],
  } satisfies ReviewState;
  state.stateDigest = stateDigest(state);
  return state;
}

function stateDigest(state: ReviewState): string {
  const copy = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  copy.stateDigest = '';
  delete copy.repositoryRevision;
  return digest(goJSON(copy));
}

function normalizeState(state: ReviewState): ReviewState {
  if (!state.deliveries) {
    state.deliveries = [];
  }
  for (const delivery of state.deliveries) {
    if (!delivery.messageIds) {
      delivery.messageIds = [];
    }
  }
  if (state.session) {
    if (!state.session.discussions) {
      state.session.discussions = [];
    }
    for (const discussion of state.session.discussions) {
      if (!discussion.messages) {
        discussion.messages = [];
      }
      for (const message of discussion.messages) {
        if (message.intent === 'change') message.intent = 'change_request';
        if (!message.evidence) {
          message.evidence = [];
        }
        if (!message.changedPaths) {
          message.changedPaths = [];
        }
      }
    }
  }
  return state;
}

async function loadState(store: ReviewStore): Promise<ReviewState> {
  let data: string;
  try {
    data = await readFile(store.statePath, 'utf8');
  } catch (error) {
    if (isMissing(error)) {
      return emptyState();
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    throw agentError('AGENT_STATE_CORRUPTED', 'agent feedback state is not valid JSON');
  }
  let state: ReviewState;
  try {
    state = ReviewStateSchema.parse(parsed);
  } catch (error) {
    throw agentError('AGENT_STATE_CORRUPTED', 'agent feedback state has an invalid schema');
  }
  if (!state.stateDigest || stateDigest(state) !== state.stateDigest) {
    throw agentError('AGENT_STATE_CORRUPTED', 'agent feedback state digest or version is invalid');
  }
  validateStoredState(state);
  return normalizeState(state);
}

function validateStoredState(state: ReviewState): void {
  const discussions = new Set<string>();
  const messages = new Set<string>();
  for (const discussion of state.session?.discussions ?? []) {
    if (!discussion.id || discussions.has(discussion.id)) {
      throw agentError(
        'AGENT_STATE_CORRUPTED',
        `agent feedback discussion is invalid: ${discussion.id}`,
      );
    }
    discussions.add(discussion.id);
    for (const message of discussion.messages) {
      if (!message.id || messages.has(message.id)) {
        throw agentError(
          'AGENT_STATE_CORRUPTED',
          `agent feedback message is invalid: ${message.id}`,
        );
      }
      if (message.author !== 'human' && message.author !== 'agent') {
        throw agentError(
          'AGENT_STATE_CORRUPTED',
          `agent feedback message is invalid: ${message.id}`,
        );
      }
      messages.add(message.id);
    }
  }
  const deliveries = new Set<string>();
  for (const delivery of state.deliveries) {
    if (!delivery.id || deliveries.has(delivery.id) || !discussions.has(delivery.discussionId)) {
      throw agentError('AGENT_STATE_CORRUPTED', `agent delivery is invalid: ${delivery.id}`);
    }
    deliveries.add(delivery.id);
    for (const messageID of delivery.messageIds) {
      if (!messageID || !messages.has(messageID)) {
        throw agentError(
          'AGENT_STATE_CORRUPTED',
          `agent delivery references an unknown message: ${delivery.id}`,
        );
      }
    }
  }
}

async function writeState(store: ReviewStore, state: ReviewState): Promise<void> {
  await ensureStoreDirectory(store);
  const canonical = normalizeState(ReviewStateSchema.parse(state));
  delete canonical.repositoryRevision;
  canonical.stateDigest = stateDigest(canonical);
  state.stateDigest = canonical.stateDigest;
  const data = `${goJSON(canonical, true)}\n`;
  const temporary = join(store.directory, `.state-${randomUUID()}.tmp`);
  const temporaryHandle = await open(temporary, 'wx', 0o600);
  try {
    await temporaryHandle.writeFile(data);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    await rename(temporary, store.statePath);
    await chmod(store.statePath, 0o600);
  } finally {
    await temporaryHandle.close().catch(() => undefined);
    await rm(temporary, { force: true });
  }
}

async function ensureStoreDirectory(store: ReviewStore): Promise<void> {
  await mkdir(store.directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(store.directory);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw agentError('AGENT_INVALID_PATH', 'agent feedback state directory is unsafe');
  }
  await chmod(store.directory, 0o700);
  for (const path of [store.statePath, store.lockPath]) {
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile()) {
        throw agentError('AGENT_INVALID_PATH', 'agent feedback state file is unsafe');
      }
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }
}

async function withStoreLock<T>(store: ReviewStore, operation: () => Promise<T>): Promise<T> {
  await ensureStoreDirectory(store);
  const deadline = Date.now() + 750;
  let lock: NativeLock | undefined;
  for (;;) {
    lock = tryLockReviewFile(store.lockPath);
    if (lock) {
      break;
    }
    if (Date.now() >= deadline) {
      throw agentError('AGENT_INBOX_BUSY', 'agent feedback state is locked by another process');
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  try {
    return await operation();
  } finally {
    unlockReviewFile(lock);
  }
}

async function repositoryStore(options: AgentReviewOptions): Promise<ReviewStore> {
  const requested = options.repositoryRoot?.trim() || process.cwd();
  let repository;
  try {
    repository = await openGitRepository(requested);
  } catch (error) {
    throw new ToudocuError(
      'AGENT_INVALID_PATH',
      'current directory is not inside an available Git repository',
      {
        exitCode: 1,
        cause: error,
      },
    );
  }
  return createStore(repository.root, options);
}

function unfinished(state: ReviewState) {
  return state.deliveries
    .filter((delivery) => delivery.state !== 'responded')
    .sort((left, right) => left.sequence - right.sequence);
}

function discussionByID(state: ReviewState, id: string) {
  return state.session?.discussions.find((discussion) => discussion.id === id);
}

function messageByID(
  discussion: NonNullable<ReviewState['session']>['discussions'][number],
  id: string,
) {
  return discussion.messages.find((message) => message.id === id);
}

async function gitHead(root: string): Promise<string> {
  try {
    const repository = await openGitRepository(root);
    return await repository.resolveCommit('HEAD');
  } catch {
    return '';
  }
}

function assertGuard(
  state: ReviewState,
  guard: { expectedRevision: number; expectedStateDigest: string },
): void {
  if (
    state.revision !== guard.expectedRevision ||
    state.stateDigest !== guard.expectedStateDigest
  ) {
    throw agentError('AGENT_REVISION_CONFLICT', 'discussion state changed since it was read');
  }
}

function reviewID(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function presentation(store: ReviewStore, state: ReviewState): Promise<ReviewState> {
  for (const discussion of state.session?.discussions ?? [])
    await reanchorDiscussion(store.root, discussion);
  state.session?.discussions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  state.repositoryRevision = await gitHead(store.root);
  return ReviewStateSchema.parse(state);
}

async function documentationRoot(store: ReviewStore, options: AgentReviewOptions): Promise<string> {
  const requested = resolve(options.documentationRoot ?? join(store.root, 'docs'));
  const policy = await PathPolicy.create(store.root, { allowHidden: true });
  const path = relative(store.root, requested).replaceAll('\\', '/');
  if (!path || path.startsWith('../') || !isInside(store.root, requested)) {
    throw agentError(
      'AGENT_INVALID_PATH',
      'canonical documentation root must stay inside the repository',
    );
  }
  return policy.resolveDirectory(path);
}

function offsetAt(content: string, position: { line: number; column: number }): number {
  const lines = content.split('\n');
  const line = lines[position.line - 1];
  if (line === undefined || position.column > Array.from(line).length + 1) {
    throw agentError('AGENT_INVALID_TARGET', 'discussion range is outside the source');
  }
  const prefix = `${lines.slice(0, position.line - 1).join('\n')}${position.line > 1 ? '\n' : ''}`;
  return Buffer.byteLength(
    prefix +
      Array.from(line)
        .slice(0, position.column - 1)
        .join(''),
  );
}

async function captureAnchor(
  store: ReviewStore,
  options: AgentReviewOptions,
  request: CreateDiscussionRequest,
) {
  const path = reviewPath(store.root, request.target.path);
  const absolute = await PathPolicy.create(store.root, { allowHidden: true }).then((policy) =>
    policy.resolveFile(path),
  );
  const docsRoot = await documentationRoot(store, options);
  if (request.target.kind !== 'file' && !isInside(docsRoot, absolute)) {
    throw agentError(
      'AGENT_INVALID_TARGET',
      'document discussions must target canonical documentation',
    );
  }
  const content = await readFile(absolute);
  if (content.length > 2 * 1024 * 1024 || content.includes(0)) {
    throw agentError(
      'AGENT_INVALID_TARGET',
      'discussion target must be a UTF-8 text file up to 2 MiB',
    );
  }
  let start = 0;
  let end = 0;
  let range = request.target.range ?? undefined;
  if (range) {
    const source = content.toString('utf8');
    start = offsetAt(source, range.start);
    end = offsetAt(source, range.end);
    if (end < start) throw agentError('AGENT_INVALID_TARGET', 'discussion range is invalid');
  } else if (request.selection?.selectedText) {
    const needle = Buffer.from(request.selection.selectedText);
    const offsets = byteMatches(content, needle);
    const selected = offsets[request.selection.occurrence ?? 0];
    if (selected === undefined)
      throw agentError('AGENT_INVALID_TARGET', 'selected text was not found');
    start = selected;
    end = selected + needle.length;
    range = { start: reviewPosition(content, start), end: reviewPosition(content, end) };
  }
  const anchor = {
    kind: request.target.kind,
    path,
    ...(request.target.documentId ? { documentId: request.target.documentId } : {}),
    sourceDigest: `sha256:${digest(content)}`,
    ...(range ? { range } : {}),
    ...(range ? { selectedText: content.subarray(start, end).toString('utf8') } : {}),
    ...(range
      ? { contextBefore: content.subarray(Math.max(0, start - 2048), start).toString('utf8') }
      : {}),
    ...(range
      ? {
          contextAfter: content
            .subarray(end, Math.min(content.length, end + 2048))
            .toString('utf8'),
        }
      : {}),
  };
  return { path, anchor, placement: { status: 'current', path, ...(range ? { range } : {}) } };
}

export async function loadReviewState(options: AgentReviewOptions = {}): Promise<ReviewState> {
  const store = await repositoryStore(options);
  return presentation(store, await loadState(store));
}

export async function createReviewDiscussion(
  value: unknown,
  options: AgentReviewOptions = {},
): Promise<ReviewState> {
  const request = CreateDiscussionRequestSchema.parse(value);
  validateHumanText(request.text);
  const store = await repositoryStore(options);
  const captured = await captureAnchor(store, options, request);
  return withStoreLock(store, async () => {
    const state = await loadState(store);
    assertGuard(state, request);
    const now = timestamp();
    const discussionID = reviewID('DISC');
    const messageID = reviewID('MSG');
    const deliveryID = reviewID('DEL');
    state.session ??= { id: reviewID('SESS'), createdAt: now, discussions: [] };
    state.docsPath = relative(store.root, await documentationRoot(store, options)).replaceAll(
      '\\',
      '/',
    );
    state.nextSequence = (state.nextSequence ?? 0) + 1;
    state.session.discussions.push({
      id: discussionID,
      state: 'open',
      target: { ...request.target, path: captured.path },
      anchor: captured.anchor,
      placement: captured.placement,
      messages: [
        {
          id: messageID,
          author: 'human',
          intent: request.intent,
          state: 'submitted',
          text: request.text.trim(),
          deliveryId: deliveryID,
          evidence: [],
          changedPaths: [],
          createdAt: now,
          submittedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    state.deliveries.push({
      schemaVersion: 1,
      id: deliveryID,
      sequence: state.nextSequence,
      state: 'pending',
      discussionId: discussionID,
      messageIds: [messageID],
      createdAt: now,
    });
    state.revision += 1;
    await writeState(store, state);
    return presentation(store, state);
  });
}

export async function createReviewMessage(
  discussionID: string,
  value: unknown,
  options: AgentReviewOptions = {},
): Promise<ReviewState> {
  const request: CreateReviewMessageRequest = CreateReviewMessageRequestSchema.parse(value);
  validateHumanText(request.text);
  const store = await repositoryStore(options);
  return withStoreLock(store, async () => {
    const state = await loadState(store);
    assertGuard(state, request);
    const discussion = discussionByID(state, discussionID);
    if (!discussion) throw agentError('AGENT_DISCUSSION_NOT_FOUND', 'discussion not found');
    if (discussion.state !== 'open')
      throw agentError('AGENT_INVALID_MESSAGE', 'discussion is resolved');
    if (unfinished(state).some((delivery) => delivery.discussionId === discussionID)) {
      throw agentError('AGENT_INBOX_BUSY', 'this discussion already has an unfinished delivery');
    }
    const now = timestamp();
    const messageID = reviewID('MSG');
    const deliveryID = reviewID('DEL');
    state.nextSequence = (state.nextSequence ?? 0) + 1;
    discussion.messages.push({
      id: messageID,
      author: 'human',
      intent: request.intent,
      state: 'submitted',
      text: request.text.trim(),
      deliveryId: deliveryID,
      evidence: [],
      changedPaths: [],
      createdAt: now,
      submittedAt: now,
    });
    discussion.updatedAt = now;
    state.deliveries.push({
      schemaVersion: 1,
      id: deliveryID,
      sequence: state.nextSequence,
      state: 'pending',
      discussionId: discussionID,
      messageIds: [messageID],
      createdAt: now,
    });
    state.revision += 1;
    await writeState(store, state);
    return presentation(store, state);
  });
}

export async function updateReviewDiscussion(
  discussionID: string,
  value: unknown,
  options: AgentReviewOptions = {},
): Promise<ReviewState> {
  const request: UpdateDiscussionRequest = UpdateDiscussionRequestSchema.parse(value);
  const store = await repositoryStore(options);
  return withStoreLock(store, async () => {
    const state = await loadState(store);
    assertGuard(state, request);
    const discussion = discussionByID(state, discussionID);
    if (!discussion) throw agentError('AGENT_DISCUSSION_NOT_FOUND', 'discussion not found');
    discussion.state = request.state;
    discussion.updatedAt = timestamp();
    state.revision += 1;
    await writeState(store, state);
    return presentation(store, state);
  });
}

function validateHumanText(text: string): void {
  if (!text.trim()) throw agentError('AGENT_INVALID_MESSAGE', 'message must not be empty');
  if (Buffer.byteLength(text.trim(), 'utf8') > messageLimit) {
    throw agentError('AGENT_PAYLOAD_TOO_LARGE', 'human message exceeds 64 KiB');
  }
}

function editableMessage(
  state: ReviewState,
  discussion: NonNullable<ReviewState['session']>['discussions'][number],
  id: string,
) {
  const message = messageByID(discussion, id);
  if (
    message?.author !== 'human' ||
    !(
      (message.state === 'draft' && !message.deliveryId) ||
      state.deliveries.some(
        (delivery) => delivery.id === message.deliveryId && delivery.state === 'pending',
      )
    )
  ) {
    throw agentError(
      'AGENT_INVALID_MESSAGE',
      'a human message can be changed only before an agent claims it',
    );
  }
  return message;
}

export async function updateReviewMessage(
  discussionID: string,
  messageID: string,
  value: unknown,
  options: AgentReviewOptions = {},
): Promise<ReviewState> {
  const request = UpdateReviewMessageRequestSchema.parse(value);
  validateHumanText(request.text);
  const store = await repositoryStore(options);
  return withStoreLock(store, async () => {
    const state = await loadState(store);
    assertGuard(state, request);
    const discussion = discussionByID(state, discussionID);
    if (!discussion) throw agentError('AGENT_DISCUSSION_NOT_FOUND', 'discussion not found');
    const message = editableMessage(state, discussion, messageID);
    const now = timestamp();
    if (message.state === 'draft') {
      if (discussion.state !== 'open')
        throw agentError('AGENT_INVALID_MESSAGE', 'discussion is resolved');
      if (unfinished(state).some((delivery) => delivery.discussionId === discussionID)) {
        throw agentError('AGENT_INBOX_BUSY', 'this discussion already has an unfinished delivery');
      }
      await reanchorDiscussion(store.root, discussion);
      if (discussion.placement.status === 'deleted' && discussion.target.kind !== 'file') {
        throw agentError('AGENT_INVALID_TARGET', 'the selected document or fragment was deleted');
      }
      if (discussion.placement.range) discussion.target.range = discussion.placement.range;
      try {
        const captured = await captureAnchor(store, options, {
          ...request,
          target: discussion.target,
        });
        if (!captured.anchor.range && discussion.anchor?.selectedText) {
          captured.anchor.selectedText = discussion.anchor.selectedText;
        }
        discussion.anchor = captured.anchor;
      } catch {
        // Keep the historical anchor when the current source cannot be captured.
      }
      message.state = 'submitted';
      message.deliveryId = reviewID('DEL');
      message.submittedAt = now;
      state.nextSequence = (state.nextSequence ?? 0) + 1;
      state.deliveries.push({
        schemaVersion: 1,
        id: message.deliveryId,
        sequence: state.nextSequence,
        state: 'pending',
        discussionId: discussionID,
        messageIds: [messageID],
        createdAt: now,
      });
    }
    message.intent = request.intent;
    message.text = request.text.trim();
    message.editedAt = now;
    discussion.updatedAt = now;
    state.revision += 1;
    await writeState(store, state);
    return presentation(store, state);
  });
}

export async function deleteReviewMessage(
  discussionID: string,
  messageID: string,
  value: unknown,
  options: AgentReviewOptions = {},
): Promise<ReviewState> {
  const guard = ReviewMutationGuardSchema.parse(value);
  const store = await repositoryStore(options);
  return withStoreLock(store, async () => {
    const state = await loadState(store);
    assertGuard(state, guard);
    const discussion = discussionByID(state, discussionID);
    if (!discussion) throw agentError('AGENT_DISCUSSION_NOT_FOUND', 'discussion not found');
    const message = editableMessage(state, discussion, messageID);
    discussion.messages = discussion.messages.filter((item) => item.id !== messageID);
    state.deliveries = state.deliveries.filter((delivery) => delivery.id !== message.deliveryId);
    if (discussion.messages.length === 0 && state.session) {
      state.session.discussions = state.session.discussions.filter(
        (item) => item.id !== discussionID,
      );
    } else {
      discussion.updatedAt = timestamp();
    }
    state.revision += 1;
    await writeState(store, state);
    return presentation(store, state);
  });
}

export async function deleteReviewDiscussion(
  discussionID: string,
  value: unknown,
  options: AgentReviewOptions = {},
): Promise<ReviewState> {
  const guard = ReviewMutationGuardSchema.parse(value);
  const store = await repositoryStore(options);
  return withStoreLock(store, async () => {
    const state = await loadState(store);
    assertGuard(state, guard);
    if (!discussionByID(state, discussionID) || !state.session) {
      throw agentError('AGENT_DISCUSSION_NOT_FOUND', 'discussion not found');
    }
    state.session.discussions = state.session.discussions.filter(
      (item) => item.id !== discussionID,
    );
    state.deliveries = state.deliveries.filter(
      (delivery) => delivery.discussionId !== discussionID,
    );
    state.revision += 1;
    await writeState(store, state);
    return presentation(store, state);
  });
}

function byteMatches(content: Uint8Array, needle: Uint8Array): number[] {
  if (needle.length === 0) {
    return [];
  }
  const result: number[] = [];
  for (let offset = 0; offset <= content.length - needle.length;) {
    const index = Buffer.from(content).indexOf(needle, offset);
    if (index < 0) {
      break;
    }
    result.push(index);
    offset = index + 1;
  }
  return result;
}

function uniqueContextPair(
  content: Uint8Array,
  before: Uint8Array,
  after: Uint8Array,
): [number, number] | undefined {
  if (before.length === 0 || after.length === 0) {
    return undefined;
  }
  const pairs: Array<[number, number]> = [];
  for (const beforeOffset of byteMatches(content, before)) {
    const from = beforeOffset + before.length;
    for (const afterOffset of byteMatches(content.subarray(from), after)) {
      const to = from + afterOffset;
      if (to - from <= 32 * 1024) {
        pairs.push([from, to]);
      }
    }
  }
  return pairs.length === 1 ? pairs[0] : undefined;
}

function reviewPosition(content: Uint8Array, offset: number) {
  const prefix = Buffer.from(content.subarray(0, offset)).toString('utf8');
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return {
    line: 1 + [...prefix].filter((character) => character === '\n').length,
    column: 1 + [...prefix.slice(lineStart)].length,
  };
}

function movedPlacement(
  content: Uint8Array,
  path: string,
  start: number,
  end: number,
  status: string,
  reason: string,
) {
  return {
    status,
    path,
    range: { start: reviewPosition(content, start), end: reviewPosition(content, end) },
    reason,
  };
}

async function reanchorDiscussion(
  root: string,
  discussion: NonNullable<ReviewState['session']>['discussions'][number],
): Promise<void> {
  const anchor = discussion.anchor;
  if (!anchor) {
    discussion.placement = {
      status: 'stale',
      path: discussion.target.path,
      reason: 'anchor is missing',
    };
    return;
  }
  let content: Buffer;
  try {
    const policy = await PathPolicy.create(root, { allowHidden: true });
    content = await readFile(await policy.resolveFile(anchor.path));
  } catch {
    discussion.placement = {
      status: 'deleted',
      path: anchor.path,
      reason: 'target file is unavailable',
    };
    return;
  }
  if (!anchor.range) {
    discussion.placement = { status: 'current', path: anchor.path };
    return;
  }
  if (`sha256:${digest(content)}` === anchor.sourceDigest) {
    discussion.placement = { status: 'current', path: anchor.path, range: anchor.range };
    return;
  }
  const selected = Buffer.from(anchor.selectedText ?? '', 'utf8');
  const matches = byteMatches(content, selected);
  if (matches.length > 1) {
    const nearby = matches.filter((offset) => {
      const line = reviewPosition(content, offset).line;
      return Math.abs(line - anchor.range!.start.line) <= 20;
    });
    if (nearby.length === 1) {
      const start = nearby[0] ?? 0;
      discussion.placement = movedPlacement(
        content,
        anchor.path,
        start,
        start + selected.length,
        'moved',
        'exact text found near the original range',
      );
      return;
    }
  }
  if (matches.length === 1) {
    const start = matches[0] ?? 0;
    discussion.placement = movedPlacement(
      content,
      anchor.path,
      start,
      start + selected.length,
      'moved',
      'unique exact text',
    );
    return;
  }
  const contextPair = uniqueContextPair(
    content,
    Buffer.from(anchor.contextBefore ?? '', 'utf8'),
    Buffer.from(anchor.contextAfter ?? '', 'utf8'),
  );
  if (contextPair) {
    const [from, to] = contextPair;
    discussion.placement = movedPlacement(
      content,
      anchor.path,
      from,
      to,
      from === to ? 'deleted' : 'moved',
      from === to ? 'selected fragment was deleted' : 'unique surrounding context',
    );
    return;
  }
  discussion.placement = {
    status: 'stale',
    path: anchor.path,
    reason: 'anchor cannot be matched unambiguously',
  };
}

function requestFor(
  delivery: ReviewState['deliveries'][number],
  discussion: NonNullable<ReviewState['session']>['discussions'][number],
  head: string,
  pendingCount: number,
): AgentRequest {
  const placement = discussion.placement;
  const target: Record<string, unknown> = {
    kind: discussion.target.kind,
    path: placement.path,
    anchorState: placement.status,
  };
  if (discussion.target.documentId) {
    target.documentId = discussion.target.documentId;
  }
  if (placement.range) {
    target.range = placement.range;
  }
  if (discussion.anchor?.selectedText) {
    target.selectedText = discussion.anchor.selectedText;
  }
  return AgentRequestSchema.parse({
    schemaVersion: 1,
    pending: true,
    deliveryId: delivery.id,
    discussion,
    target,
    repository: { head },
    pendingCount,
    ...(pendingCount > 1 ? { hasMore: true } : {}),
  });
}

export async function claimAgentDelivery(options: AgentReviewOptions = {}): Promise<AgentRequest> {
  const store = await repositoryStore(options);
  return withStoreLock(store, async () => {
    const state = await loadState(store);
    const pending = unfinished(state);
    if (pending.length === 0) {
      return AgentRequestSchema.parse({ schemaVersion: 1, pending: false });
    }
    const delivery = pending[0];
    if (!delivery) {
      throw agentError('AGENT_STATE_CORRUPTED', 'the pending delivery is missing');
    }
    const now = new Date();
    if (delivery.state === 'claimed' && delivery.leaseExpiresAt) {
      const lease = Date.parse(delivery.leaseExpiresAt);
      if (Number.isFinite(lease) && lease > now.getTime()) {
        throw agentError('AGENT_INBOX_BUSY', 'the oldest delivery is claimed by another consumer');
      }
    }
    const discussion = discussionByID(state, delivery.discussionId);
    if (!discussion) {
      throw agentError('AGENT_STATE_CORRUPTED', 'the oldest delivery has no discussion');
    }
    await reanchorDiscussion(store.root, discussion);
    const claimedAt = timestamp(now);
    delivery.state = 'claimed';
    delivery.claimedAt = claimedAt;
    delivery.leaseExpiresAt = timestamp(new Date(now.getTime() + claimLeaseMillis));
    state.revision += 1;
    await writeState(store, state);
    return requestFor(delivery, discussion, await gitHead(store.root), pending.length);
  });
}

type NormalizedAgentResponse = Omit<AgentResponse, 'evidence' | 'changedPaths'> & {
  evidence: NonNullable<AgentResponse['evidence']>;
  changedPaths: NonNullable<AgentResponse['changedPaths']>;
};

function normalizedResponse(value: AgentResponse): NormalizedAgentResponse {
  return {
    schemaVersion: 1,
    deliveryId: value.deliveryId,
    discussionId: value.discussionId,
    outcome: value.outcome,
    message: value.message.trim(),
    evidence: value.evidence ?? [],
    changedPaths: value.changedPaths ?? [],
  };
}

function responseSize(response: AgentResponse): number {
  return Buffer.byteLength(goJSON(response), 'utf8');
}

function reviewPath(root: string, requested: string): string {
  const path = requested.trim();
  const clean = path.split('/').filter(Boolean).join('/');
  if (
    !path ||
    path !== clean ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('%') ||
    path.includes('\0') ||
    path === '..' ||
    path.startsWith('../') ||
    path.includes('/../') ||
    path === '.git' ||
    path.startsWith('.git/')
  ) {
    throw agentError('AGENT_INVALID_PATH', 'unsafe repository-relative path');
  }
  const absolute = resolve(root, path);
  if (!isInside(root, absolute)) {
    throw agentError('AGENT_PATH_OUTSIDE_ROOT', 'path escapes the repository root');
  }
  return path;
}

async function validateChangedPath(root: string, requested: string): Promise<string> {
  const path = reviewPath(root, requested);
  const policy = await PathPolicy.create(root, { allowHidden: true });
  policy.validate(path);
  let current = root;
  const parts = path.split('/');
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw agentError('AGENT_INVALID_PATH', 'symbolic-link or reparse changedPath is forbidden');
      }
      if (index === parts.length - 1 && !info.isFile()) {
        throw agentError(
          'AGENT_INVALID_PATH',
          'changedPath must be a regular file or a deleted path',
        );
      }
    } catch (error) {
      if (isMissing(error)) {
        return path;
      }
      throw error;
    }
  }
  return path;
}

async function validateResponsePaths(
  store: ReviewStore,
  state: ReviewState,
  discussion: NonNullable<ReviewState['session']>['discussions'][number],
  response: NormalizedAgentResponse,
): Promise<void> {
  const docsPath = state.docsPath ? reviewPath(store.root, state.docsPath) : 'docs';
  const docsRoot = resolve(store.root, docsPath);
  for (const evidence of response.evidence) {
    if (
      evidence.startLine !== undefined &&
      evidence.endLine !== undefined &&
      evidence.endLine < evidence.startLine
    ) {
      throw agentError('AGENT_INVALID_MESSAGE', 'evidence line range is invalid');
    }
    await validateChangedPath(store.root, evidence.path);
  }
  for (const changedPath of response.changedPaths) {
    const path = await validateChangedPath(store.root, changedPath);
    if (discussion.target.kind === 'document') {
      const absolute = resolve(store.root, path);
      if (!isInside(docsRoot, absolute) || !path.toLowerCase().endsWith('.md')) {
        throw agentError(
          'AGENT_INVALID_PATH',
          'path must be a Markdown file inside the canonical documentation root',
        );
      }
    }
  }
}

export async function respondAgentDelivery(
  value: unknown,
  options: AgentReviewOptions = {},
): Promise<AgentResponseAck> {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    throw agentError('AGENT_INVALID_MESSAGE', 'agent response is incomplete or invalid');
  }
  let response: NormalizedAgentResponse;
  try {
    response = normalizedResponse(AgentResponseSchema.parse(value));
  } catch (error) {
    throw agentError('AGENT_INVALID_MESSAGE', 'invalid response JSON');
  }
  if (!response.deliveryId || !response.discussionId || !response.message) {
    throw agentError('AGENT_INVALID_MESSAGE', 'agent response is incomplete or invalid');
  }
  if (
    Buffer.byteLength(response.message, 'utf8') > messageLimit ||
    responseSize(response) > responseLimit
  ) {
    throw agentError('AGENT_PAYLOAD_TOO_LARGE', 'agent response exceeds 64 KiB');
  }
  if (response.evidence.length > pathLimit || response.changedPaths.length > pathLimit) {
    throw agentError('AGENT_PAYLOAD_TOO_LARGE', 'agent response contains too many paths');
  }
  const store = await repositoryStore(options);
  return withStoreLock(store, async () => {
    const state = await loadState(store);
    const delivery = state.deliveries.find((item) => item.id === response.deliveryId);
    if (!delivery) {
      throw agentError('AGENT_DELIVERY_NOT_FOUND', 'delivery not found');
    }
    if (delivery.discussionId !== response.discussionId) {
      throw agentError('AGENT_INVALID_MESSAGE', 'discussionId does not match delivery');
    }
    const responseDigest = digest(goJSON(response));
    if (delivery.state === 'responded') {
      if (delivery.responseDigest === responseDigest) {
        return AgentResponseAckSchema.parse({
          schemaVersion: 1,
          accepted: true,
          revision: state.revision,
          stateDigest: state.stateDigest,
        });
      }
      throw agentError('AGENT_RESPONSE_CONFLICT', 'the delivery already has a different response');
    }
    const first = unfinished(state)[0];
    if (!first || first.id !== delivery.id) {
      throw agentError('AGENT_INBOX_BUSY', 'response must complete the oldest delivery');
    }
    const discussion = discussionByID(state, delivery.discussionId);
    if (!discussion) {
      throw agentError('AGENT_STATE_CORRUPTED', 'delivery discussion disappeared');
    }
    const human = messageByID(discussion, delivery.messageIds[0] ?? '');
    if (!human) {
      throw agentError('AGENT_STATE_CORRUPTED', 'delivery message disappeared');
    }
    if (
      human.intent === 'question' &&
      (response.outcome === 'changed' || response.changedPaths.length > 0)
    ) {
      throw agentError('AGENT_INVALID_MESSAGE', 'a question cannot report a repository change');
    }
    if (response.outcome === 'changed' && response.changedPaths.length === 0) {
      throw agentError('AGENT_INVALID_MESSAGE', 'changed requires at least one changedPaths entry');
    }
    await validateResponsePaths(store, state, discussion, response);
    const now = timestamp();
    discussion.messages.push({
      id: `MSG-${randomUUID()}`,
      author: 'agent',
      text: response.message,
      deliveryId: delivery.id,
      outcome: response.outcome,
      evidence: response.evidence,
      changedPaths: response.changedPaths,
      createdAt: now,
    });
    discussion.updatedAt = now;
    delivery.state = 'responded';
    delivery.respondedAt = now;
    delete delivery.leaseExpiresAt;
    delivery.responseDigest = responseDigest;
    state.revision += 1;
    await writeState(store, state);
    return AgentResponseAckSchema.parse({
      schemaVersion: 1,
      accepted: true,
      revision: state.revision,
      stateDigest: state.stateDigest,
    });
  });
}
