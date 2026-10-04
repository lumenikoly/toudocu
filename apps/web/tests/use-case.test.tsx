// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageViewV1, PortalSnapshotV1 } from '@toudocu/contracts';
import { UseCaseModes } from '../app/use-case.js';
import { MemoryRouter } from 'react-router';
import { portalFixture } from './fixture.js';

afterEach(cleanup);

type ScreensPage = Extract<PageViewV1, { kind: 'screens' }>;

function fixture(valid = true): {
  snapshot: PortalSnapshotV1;
  page: Extract<PageViewV1, { kind: 'document' }>;
} {
  const snapshot: PortalSnapshotV1 = portalFixture();
  const base = snapshot.pages.find(
    (item): item is Extract<PageViewV1, { kind: 'document' }> => item.kind === 'document',
  );
  if (!base) throw new Error('document fixture is missing');

  const useCaseId = 'UC-DEMO-01';
  const screen = (id: string, title: string): ScreensPage['screens'][number] => ({
    id,
    title,
    description: '',
    module: 'MOD-DEMO',
    type: 'screen',
    status: 'done',
    states: [],
    incomingTransitions: [],
    outgoingTransitions: [],
    useCases: [useCaseId],
    workItems: [],
    contracts: [],
    document: `screens/${id}.md`,
  });
  const transition = {
    id: 'TR-DEMO-NEXT',
    useCase: useCaseId,
    source: 'SC-DEMO-START',
    target: 'SC-DEMO-END',
    action: 'Open result',
    condition: 'authorized',
    type: 'user',
    document: 'screens/SC-DEMO-START.md',
    line: 1,
  } satisfies ScreensPage['transitions'][number];
  const unrelated = {
    ...transition,
    id: 'TR-DEMO-UNRELATED',
    useCase: 'UC-OTHER-01',
    target: 'SC-DEMO-END',
    action: 'Should stay hidden',
  } satisfies ScreensPage['transitions'][number];
  const screensPage: ScreensPage = {
    kind: 'screens',
    pageId: 'screens',
    route: {
      ...base.route,
      pageId: 'screens',
      href: 'screens.html',
      outputPath: 'screens.html',
      kind: 'screens',
    },
    screens: [screen('SC-DEMO-START', 'Start'), screen('SC-DEMO-END', 'End')],
    transitions: [transition, unrelated],
    playableFlows: [
      {
        useCase: useCaseId,
        startScreen: 'SC-DEMO-START',
        reachableScreens: ['SC-DEMO-START', 'SC-DEMO-END'],
        terminalScreens: ['SC-DEMO-END'],
        transitions: [transition.id],
        result: 'Flow completed',
        valid,
        issueCodes: valid ? [] : ['invalid-flow'],
      },
    ],
    hotspots: [],
    errors: [],
  };
  snapshot.pages.push(screensPage);
  snapshot.pages.push(
    ...screensPage.screens.map((item) => ({
      ...base,
      pageId: `document:${item.id}`,
      route: {
        ...base.route,
        pageId: `document:${item.id}`,
        href: `${item.id}.html`,
        outputPath: `${item.id}.html`,
        kind: 'document' as const,
      },
      document: {
        ...base.document,
        id: item.id,
        sourcePath: item.document,
        outputPath: `${item.id}.html`,
        title: `${item.id}: ${item.title}`,
      },
      relations: { related: [], backlinks: [] },
    })),
  );
  snapshot.knowledge.useCases.push({
    id: useCaseId,
    title: 'Demo use case',
    status: { kind: 'ready', symbol: '', label: 'Ready', recognized: true },
    document: 'use-cases/UC-DEMO-01.md',
    repositoryPaths: [],
    businessRuleIds: [],
    flowIds: ['FLOW-DEMO-01'],
    screenIds: ['SC-DEMO-START', 'SC-DEMO-END'],
    startScreen: 'SC-DEMO-START',
    terminalScreens: ['SC-DEMO-END'],
    allowCycle: false,
  });
  snapshot.knowledge.flows.push({
    id: 'FLOW-DEMO-01',
    title: 'Demo flow',
    useCaseIds: [useCaseId],
    document: 'flows/FLOW-DEMO-01.md',
  });

  const page = {
    ...base,
    pageId: `document:${useCaseId}`,
    route: { ...base.route, pageId: `document:${useCaseId}` },
    document: {
      ...base.document,
      id: useCaseId,
      sourcePath: 'use-cases/UC-DEMO-01.md',
      title: 'Demo use case',
    },
    relations: { related: [], backlinks: [] },
  };
  return { snapshot, page };
}

describe('UseCaseModes', () => {
  it('plays only declared transitions and resets through history', async () => {
    const user = userEvent.setup();
    const data = fixture();
    render(
      <MemoryRouter>
        <UseCaseModes page={data.page} snapshot={data.snapshot} locale="en">
          <p>Overview body</p>
        </UseCaseModes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Overview body')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByRole('heading', { name: 'Screen map' })).toBeTruthy();
    expect(screen.getByLabelText('SC-DEMO-START: Start')).toBeTruthy();
    expect(screen.getByLabelText('SC-DEMO-END: End')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('link', { name: /SC-DEMO-START/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /TR-DEMO-NEXT/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /TR-DEMO-UNRELATED/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: /TR-DEMO-NEXT/ }));
    expect(screen.getByRole('link', { name: /SC-DEMO-END/ })).toBeTruthy();
    expect(screen.getByText('Flow completed')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('link', { name: /SC-DEMO-START/ })).toBeTruthy();
    expect(screen.queryByText('Flow completed')).toBeNull();

    await user.click(screen.getByRole('button', { name: /TR-DEMO-NEXT/ }));
    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByRole('link', { name: /SC-DEMO-START/ })).toBeTruthy();

    cleanup();
    const invalid = fixture(false);
    render(
      <MemoryRouter>
        <UseCaseModes page={invalid.page} snapshot={invalid.snapshot} locale="en">
          <p>Overview body</p>
        </UseCaseModes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });
});
