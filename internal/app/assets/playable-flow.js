(() => {
  'use strict';

  const root = document.querySelector('[data-playable-flow]');
  if (!root) return;
  const payload = JSON.parse(root.querySelector('[data-playable-data]')?.textContent || '{}');
  const model = payload.model || {};
  const flow = payload.flow || {};
  const screens = new Map((model.screens || []).map((screen) => [screen.id, screen]));
  const transitions = (model.transitions || []).filter((transition) => (flow.transitions || []).includes(transition.id));
  const hotspots = model.hotspots || [];
  const preview = root.querySelector('[data-flow-preview]');
  const actions = root.querySelector('[data-flow-actions]');
  const alert = root.querySelector('[data-flow-alert]');
  const screenID = root.querySelector('[data-flow-screen-id]');
  const screenTitle = root.querySelector('[data-flow-screen-title]');
  const stateLabel = root.querySelector('[data-flow-state]');
  const step = root.querySelector('[data-flow-step]');
  const historyLabel = root.querySelector('[data-flow-history-label]');
  const complete = root.querySelector('[data-flow-complete]');
  const back = root.querySelector('[data-flow-back]');
  const showHotspots = root.querySelector('[data-flow-show-hotspots]');
  let current = { screen: flow.startScreen, state: 'DEFAULT', transition: '', error: '', message: '' };
  let history = [];

  function stateFor(screen, id) {
    return (screen.states || []).find((state) => state.id === id) || (screen.states || [])[0] || { id: 'DEFAULT' };
  }

  function makePreview(screen, state) {
    const source = state.preview || screen.preview;
    const wrap = document.createElement('div');
    wrap.className = 'playable-image-frame';
    if (source) {
      const image = document.createElement('img');
      image.src = source;
      image.alt = `Превью ${screen.title}, состояние ${state.id}`;
      wrap.append(image);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'playable-preview-placeholder';
      const strong = document.createElement('strong');
      strong.textContent = screen.id;
      const span = document.createElement('span');
      span.textContent = 'Превью отсутствует';
      placeholder.append(strong, span);
      wrap.append(placeholder);
    }
    hotspots.filter((hotspot) => hotspot.screen === screen.id).forEach((hotspot) => {
      const transition = transitions.find((item) => item.id === hotspot.transition);
      if (!transition) return;
      const button = document.createElement('button');
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

  function activate(transition) {
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
    const screen = screens.get(current.screen);
    if (!screen) return;
    const state = stateFor(screen, current.state);
    preview.replaceChildren(makePreview(screen, state));
    screenID.textContent = screen.id;
    screenTitle.textContent = screen.title;
    stateLabel.textContent = `Состояние: ${state.id}`;
    step.textContent = String(history.length + 1);
    historyLabel.textContent = current.transition ? `Переход ${current.transition}` : 'Начало сценария';
    back.disabled = history.length === 0;
    alert.replaceChildren();
    if (current.error || current.message) {
      const notice = document.createElement('div');
      notice.className = 'playable-alert';
      const strong = document.createElement('strong');
      strong.textContent = current.error || 'Сообщение';
      const text = document.createElement('span');
      text.textContent = current.message || 'Переход завершился ошибкой.';
      notice.append(strong, text);
      alert.append(notice);
    }
    const terminal = (flow.terminalScreens || []).includes(current.screen);
    complete.hidden = !terminal;
    actions.hidden = terminal;
    actions.replaceChildren();
    if (!terminal) {
      transitions.filter((transition) => transition.source === current.screen).forEach((transition) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = transition.type === 'error' ? 'playable-action is-error' : 'playable-action';
        const title = document.createElement('strong');
        title.textContent = transition.action;
        const detail = document.createElement('span');
        detail.textContent = transition.condition;
        const code = document.createElement('code');
        code.textContent = transition.id;
        button.append(title, detail, code);
        button.addEventListener('click', () => activate(transition));
        actions.append(button);
      });
      if (!actions.children.length) {
        const message = document.createElement('p');
        message.className = 'empty-state';
        message.textContent = 'Для этого экрана нет доступных действий.';
        actions.append(message);
      }
    }
  }

  back?.addEventListener('click', () => {
    if (!history.length) return;
    current = history.pop();
    render();
  });
  root.querySelectorAll('[data-flow-reset]').forEach((button) => button.addEventListener('click', reset));
  showHotspots?.addEventListener('change', render);
  render();
})();
