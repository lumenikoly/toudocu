import { text } from "../../core/locale";
window.ToudocuInitializePlayableFlow = (scope: any, signal: any) => {
    'use strict';
    scope = scope || document;
    const root: any = scope.querySelector('[data-playable-flow]');
    if (!root)
        return;
    if (root.dataset.pageInitialized === 'true')
        return;
    root.dataset.pageInitialized = 'true';
    const payload: any = JSON.parse(root.querySelector('[data-playable-data]')?.textContent || '{}');
    const model: any = payload.model || {};
    const flow: any = payload.flow || {};
    const screens: any = new Map((model.screens || []).map((screen: any) => [screen.id, screen]));
    const transitions: any = (model.transitions || []).filter((transition: any) => (flow.transitions || []).includes(transition.id));
    const hotspots: any = model.hotspots || [];
    const preview: any = root.querySelector('[data-flow-preview]');
    const actions: any = root.querySelector('[data-flow-actions]');
    const alert: any = root.querySelector('[data-flow-alert]');
    const screenID: any = root.querySelector('[data-flow-screen-id]');
    const screenTitle: any = root.querySelector('[data-flow-screen-title]');
    const stateLabel: any = root.querySelector('[data-flow-state]');
    const step: any = root.querySelector('[data-flow-step]');
    const historyLabel: any = root.querySelector('[data-flow-history-label]');
    const complete: any = root.querySelector('[data-flow-complete]');
    const back: any = root.querySelector('[data-flow-back]');
    const showHotspots: any = root.querySelector('[data-flow-show-hotspots]');
    let current: any = { screen: flow.startScreen, state: 'DEFAULT', transition: '', error: '', message: '' };
    let history: any = [];
    function stateFor(screen: any, id: any) {
        return (screen.states || []).find((state: any) => state.id === id) || (screen.states || [])[0] || { id: 'DEFAULT' };
    }
    function makePreview(screen: any, state: any) {
        const source: any = state.preview || screen.preview;
        const wrap: any = document.createElement('div');
        wrap.className = 'playable-image-frame';
        if (source) {
            const image: any = document.createElement('img');
            image.src = source;
            image.alt = text("features.use-case.playable-flow.001", [screen.title, state.id]);
            wrap.append(image);
        }
        else {
            const placeholder: any = document.createElement('div');
            placeholder.className = 'playable-preview-placeholder';
            const strong: any = document.createElement('strong');
            strong.textContent = screen.id;
            const span: any = document.createElement('span');
            span.textContent = text("features.use-case.playable-flow.002");
            placeholder.append(strong, span);
            wrap.append(placeholder);
        }
        hotspots.filter((hotspot: any) => hotspot.screen === screen.id).forEach((hotspot: any) => {
            const transition: any = transitions.find((item: any) => item.id === hotspot.transition);
            if (!transition)
                return;
            const button: any = document.createElement('button');
            button.type = 'button';
            button.className = 'playable-hotspot';
            button.style.left = `${hotspot.x}%`;
            button.style.top = `${hotspot.y}%`;
            button.style.width = `${hotspot.width}%`;
            button.style.height = `${hotspot.height}%`;
            button.classList.toggle('is-visible', Boolean(showHotspots?.checked));
            button.setAttribute('aria-label', `${transition.action}: ${transition.condition}`);
            button.title = `${transition.action}: ${transition.condition}`;
            button.addEventListener('click', () => activate(transition));
            wrap.append(button);
        });
        return wrap;
    }
    function activate(transition: any) {
        history.push({ ...current });
        current = {
            screen: transition.target,
            state: transition.state || 'DEFAULT',
            transition: transition.id,
            error: transition.error || '',
            message: transition.message || '',
        };
        render();
    }
    function reset() {
        history = [];
        current = { screen: flow.startScreen, state: 'DEFAULT', transition: '', error: '', message: '' };
        render();
    }
    function render() {
        const screen: any = screens.get(current.screen);
        if (!screen)
            return;
        const state: any = stateFor(screen, current.state);
        preview.replaceChildren(makePreview(screen, state));
        screenID.textContent = screen.id;
        screenTitle.textContent = screen.title;
        stateLabel.textContent = text("features.use-case.playable-flow.003", [state.id]);
        step.textContent = String(history.length + 1);
        historyLabel.textContent = current.transition ? text("features.use-case.playable-flow.004", [current.transition]) : text("features.use-case.playable-flow.005");
        back.disabled = history.length === 0;
        alert.replaceChildren();
        if (current.error || current.message) {
            const notice: any = document.createElement('div');
            notice.className = 'playable-alert';
            const strong: any = document.createElement('strong');
            strong.textContent = current.error || text("features.use-case.playable-flow.006");
            const messageText: any = document.createElement('span');
            messageText.textContent = current.message || text("features.use-case.playable-flow.007");
            notice.append(strong, messageText);
            alert.append(notice);
        }
        const terminal: any = (flow.terminalScreens || []).includes(current.screen);
        complete.hidden = !terminal;
        actions.hidden = terminal;
        actions.replaceChildren();
        if (!terminal) {
            transitions.filter((transition: any) => transition.source === current.screen).forEach((transition: any) => {
                const button: any = document.createElement('button');
                button.type = 'button';
                button.className = transition.type === 'error' ? 'playable-action is-error' : 'playable-action';
                const title: any = document.createElement('strong');
                title.textContent = transition.action;
                const detail: any = document.createElement('span');
                detail.textContent = transition.condition;
                const code: any = document.createElement('code');
                code.textContent = transition.id;
                button.append(title, detail, code);
                button.addEventListener('click', () => activate(transition));
                actions.append(button);
            });
            if (!actions.children.length) {
                const message: any = document.createElement('p');
                message.className = 'empty-state';
                message.textContent = text("features.use-case.playable-flow.008");
                actions.append(message);
            }
        }
    }
    back?.addEventListener('click', () => {
        if (!history.length)
            return;
        current = history.pop();
        render();
    });
    root.querySelectorAll('[data-flow-reset]').forEach((button: any) => button.addEventListener('click', reset));
    showHotspots?.addEventListener('change', render);
    render();
};
