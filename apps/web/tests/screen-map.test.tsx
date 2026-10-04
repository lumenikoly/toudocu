// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageViewV1 } from '@toudocu/contracts';
import { MemoryRouter } from 'react-router';
import { ScreenMap } from '../app/screen-map.js';
import { portalFixture } from './fixture.js';

afterEach(cleanup);

type ScreensPage = Extract<PageViewV1, { kind: 'screens' }>;

describe('ScreenMap', () => {
  it('renders screen identities and directional transition details from the model', () => {
    const snapshot = portalFixture();
    const route = snapshot.pages[0]?.route;
    if (!route) throw new Error('fixture route is missing');
    const screens: ScreensPage['screens'] = [
      {
        id: 'SC-DEMO-START',
        title: 'Start',
        description: 'Entry screen',
        module: 'MOD-DEMO',
        type: 'screen',
        status: 'ready',
        states: [],
        incomingTransitions: [],
        outgoingTransitions: ['TR-DEMO-NEXT'],
        useCases: [],
        workItems: [],
        contracts: [],
        document: 'screens/start.md',
      },
      {
        id: 'SC-DEMO-END',
        title: 'Result',
        description: '',
        module: 'MOD-DEMO',
        type: 'screen',
        status: 'implemented',
        states: [],
        incomingTransitions: ['TR-DEMO-NEXT'],
        outgoingTransitions: [],
        useCases: [],
        workItems: [],
        contracts: [],
        document: 'screens/result.md',
      },
    ];
    const page: ScreensPage = {
      kind: 'screens',
      pageId: 'screens',
      route: { ...route, pageId: 'screens', kind: 'screens' },
      screens,
      transitions: [
        {
          id: 'TR-DEMO-NEXT',
          useCase: 'UC-DEMO-01',
          source: 'SC-DEMO-START',
          target: 'SC-DEMO-END',
          action: 'Open result',
          condition: 'authorized',
          type: 'user',
          document: 'screens/start.md',
          line: 1,
        },
      ],
      playableFlows: [],
      hotspots: [],
      errors: [],
    };

    render(
      <MemoryRouter>
        <ScreenMap page={page} snapshot={snapshot} locale="en" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Screen map' })).toBeTruthy();
    expect(screen.getByLabelText('SC-DEMO-START: Start')).toBeTruthy();
    expect(screen.getByLabelText('SC-DEMO-END: Result')).toBeTruthy();
    expect(screen.getByText('TR-DEMO-NEXT')).toBeTruthy();
    expect(document.querySelector('.screen-map-edge-label')?.textContent).toContain('Open result');
  });
});
