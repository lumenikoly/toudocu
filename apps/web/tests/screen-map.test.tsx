// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageViewV1 } from '@toudocu/contracts';
import { MemoryRouter } from 'react-router';
import { ScreenMap } from '../app/screen-map.js';
import { portalFixture } from './fixture.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    const { rerender } = render(
      <MemoryRouter>
        <ScreenMap page={page} snapshot={snapshot} locale="en" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Screen map' })).toBeTruthy();
    expect(screen.getByLabelText('SC-DEMO-START: Start')).toBeTruthy();
    expect(screen.getByLabelText('SC-DEMO-END: Result')).toBeTruthy();
    expect(screen.getByText('TR-DEMO-NEXT')).toBeTruthy();
    expect(document.querySelector('.screen-map-edge-label')?.textContent).toContain('Open result');
    expect(screen.getByRole('button', { name: '85%' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fit diagram' }));
    expect(screen.queryByRole('button', { name: '85%' })).toBeNull();

    rerender(
      <MemoryRouter>
        <ScreenMap page={page} snapshot={snapshot} locale="ru" />
      </MemoryRouter>,
    );
    const option = screen.getByRole('option', { name: 'Реализовано' }) as HTMLOptionElement;
    expect(option.value).toBe('implemented');
    fireEvent.change(screen.getByRole('combobox', { name: 'Статус' }), {
      target: { value: 'implemented' },
    });
    expect(screen.queryByLabelText('SC-DEMO-START: Start')).toBeNull();
    expect(screen.getByLabelText('SC-DEMO-END: Result')).toBeTruthy();
    expect(screen.getByRole('button', { name: '85%' })).toBeTruthy();
  });
});
