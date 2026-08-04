(() => {
  'use strict';

  const workspace = document.querySelector('[data-screen-map]');
  if (!workspace) return;
  const data = JSON.parse(workspace.querySelector('[data-screen-map-data]')?.textContent || '{}');
  const screens = data.screens || [];
  const transitions = data.transitions || [];
  const flows = data.flows || [];
  const CARD_WIDTH = 278;
  const MIN_CARD_HEIGHT = 248;
  const MODULE_COLUMN_GAP = 144;
  const MODULE_ROW_GAP = 112;
  const MODULE_GROUP_GAP = 96;
  const FLOW_COLUMN_GAP = 180;
  const FLOW_ROW_GAP = 120;
  const SITEMAP_COLUMN_GAP = 120;
  const SITEMAP_ROW_GAP = 160;
  const NODE_CLEARANCE = 18;
  const LABEL_CLEARANCE = 10;
  const ROUTE_CORNER_RADIUS = 14;
  const ROUTE_LANE_OFFSET = 12;
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const nodeById = new Map([...workspace.querySelectorAll('[data-screen-node]')].map((node) => [node.dataset.screenNode, node]));
  const stage = workspace.querySelector('[data-map-stage]');
  const viewport = workspace.querySelector('[data-map-viewport]');
  const groupsLayer = workspace.querySelector('[data-map-groups]');
  const nodesLayer = workspace.querySelector('[data-map-nodes]');
  const edgeLayer = workspace.querySelector('[data-map-edges]');
  const labelsLayer = workspace.querySelector('[data-map-labels]');
  const inspector = workspace.querySelector('[data-map-inspector]');
  const empty = workspace.querySelector('[data-map-empty]');
  const status = workspace.querySelector('[data-map-summary]');
  const moduleSelect = workspace.querySelector('[data-map-module]');
  const useCaseSelect = workspace.querySelector('[data-map-usecase]');
  const statusSelect = workspace.querySelector('[data-map-status]');
  const search = workspace.querySelector('[data-map-search]');
  const initialUseCase = workspace.dataset.mapInitialUsecase || '';
  let mode = initialUseCase ? 'usecase' : 'all';
  let selected = '';
  let selectedTransition = '';
  let scale = 1;
  let panX = 24;
  let panY = 24;
  let dragging = false;
  let dragStart = null;
  let visible = new Set(screens.map((screen) => screen.id));
  let activeEdges = transitions;
  const positions = new Map();
  let groupBounds = [];
  let cardHeight = MIN_CARD_HEIGHT;
  let canvasBounds = { width: 900, height: 620 };

  function selectedFlow() {
    return flows.find((flow) => flow.useCase === useCaseSelect?.value);
  }

  function computeVisible() {
    const query = (search?.value || '').trim().toLocaleLowerCase();
    let values = screens;
    if (mode === 'module' && moduleSelect?.value) values = values.filter((screen) => screen.module === moduleSelect.value);
    if (mode === 'usecase' && selectedFlow()) {
      const allowed = new Set(selectedFlow().reachableScreens || []);
      values = values.filter((screen) => allowed.has(screen.id));
    }
    if (mode === 'unfinished') values = values.filter((screen) => ['in-progress', 'planned', 'blocked'].includes(screen.status?.kind));
    if (statusSelect?.value) values = values.filter((screen) => screen.status?.kind === statusSelect.value);
    if (query) {
      values = values.filter((screen) => [screen.id, screen.title, screen.route, screen.module].join(' ').toLocaleLowerCase().includes(query));
    }
    visible = new Set(values.map((screen) => screen.id));
    if (mode === 'sitemap') {
      activeEdges = screens.filter((screen) => screen.parent && visible.has(screen.parent) && visible.has(screen.id))
        .map((screen) => ({ id: `parent-${screen.id}`, source: screen.parent, target: screen.id, action: 'Содержит', condition: '', type: 'navigation' }));
    } else {
      activeEdges = transitions.filter((transition) => visible.has(transition.source) && visible.has(transition.target));
      if (mode === 'usecase' && useCaseSelect?.value) {
        activeEdges = activeEdges.filter((transition) => !transition.useCase || transition.useCase === useCaseSelect.value);
      }
    }
  }

  function layout() {
    positions.clear();
    groupBounds = [];
    const ids = [...visible].sort();
    if (mode === 'all' || mode === 'module' || mode === 'unfinished') {
      const groups = new Map();
      ids.forEach((id) => {
        const module = byId.get(id)?.module || 'Без модуля';
        if (!groups.has(module)) groups.set(module, []);
        groups.get(module).push(id);
      });
      let cursorX = 48;
      [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).forEach(([module, members]) => {
        members.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const columns = Math.min(2, members.length);
        const rows = Math.ceil(members.length / columns);
        const width = 64 + columns * CARD_WIDTH + Math.max(0, columns - 1) * MODULE_COLUMN_GAP;
        const height = 96 + rows * cardHeight + Math.max(0, rows - 1) * MODULE_ROW_GAP;
        members.forEach((id, index) => {
          positions.set(id, {
            x: cursorX + 32 + (index % columns) * (CARD_WIDTH + MODULE_COLUMN_GAP),
            y: 96 + Math.floor(index / columns) * (cardHeight + MODULE_ROW_GAP),
          });
        });
        groupBounds.push({ module, x: cursorX, y: 32, width, height });
        cursorX += width + MODULE_GROUP_GAP;
      });
      canvasBounds = {
        width: Math.max(900, cursorX),
        height: Math.max(620, ...groupBounds.map((group) => group.y + group.height + 128)),
      };
      return;
    }
    const incoming = new Map(ids.map((id) => [id, 0]));
    const adjacency = new Map(ids.map((id) => [id, []]));
    activeEdges.forEach((edge) => {
      if (!visible.has(edge.source) || !visible.has(edge.target) || edge.source === edge.target) return;
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
      adjacency.get(edge.source)?.push(edge.target);
    });
    const roots = ids.filter((id) => (incoming.get(id) || 0) === 0);
    if (!roots.length && ids.length) roots.push(ids[0]);
    const levels = new Map();
    const queue = roots.map((id) => [id, 0]);
    while (queue.length) {
      const [id, depth] = queue.shift();
      if ((levels.get(id) ?? -1) >= depth) continue;
      levels.set(id, depth);
      (adjacency.get(id) || []).forEach((target) => queue.push([target, Math.min(depth + 1, ids.length)]));
    }
    ids.forEach((id) => {
      if (!levels.has(id)) levels.set(id, 0);
    });
    const groups = new Map();
    ids.forEach((id) => {
      const level = levels.get(id);
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level).push(id);
    });
    const vertical = mode === 'sitemap';
    [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([level, members]) => {
      members.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      members.forEach((id, row) => {
        positions.set(id, vertical
          ? {
              x: 48 + row * (CARD_WIDTH + SITEMAP_COLUMN_GAP),
              y: 56 + level * (cardHeight + SITEMAP_ROW_GAP),
            }
          : {
              x: 48 + level * (CARD_WIDTH + FLOW_COLUMN_GAP),
              y: 56 + row * (cardHeight + FLOW_ROW_GAP),
            });
      });
    });
    canvasBounds = {
      width: Math.max(900, ...[...positions.values()].map((position) => position.x + CARD_WIDTH + 128)),
      height: Math.max(620, ...[...positions.values()].map((position) => position.y + cardHeight + 128)),
    };
  }

  function setCanvasSize(width, height) {
    nodesLayer.style.width = `${width}px`;
    nodesLayer.style.height = `${height}px`;
    groupsLayer.style.width = `${width}px`;
    groupsLayer.style.height = `${height}px`;
    labelsLayer.style.width = `${width}px`;
    labelsLayer.style.height = `${height}px`;
    edgeLayer.setAttribute('width', width);
    edgeLayer.setAttribute('height', height);
    viewport.style.width = `${width}px`;
    viewport.style.height = `${height}px`;
  }

  function drawGroups() {
    groupsLayer.replaceChildren();
    groupBounds.forEach((group) => {
      const element = document.createElement('div');
      element.className = 'screen-module-group';
      element.style.transform = `translate(${group.x}px, ${group.y}px)`;
      element.style.width = `${group.width}px`;
      element.style.height = `${group.height}px`;
      const label = document.createElement('strong');
      label.textContent = group.module;
      element.append(label);
      groupsLayer.append(element);
    });
  }

  function screenRect(id, padding = 0) {
    const position = positions.get(id);
    if (!position) return null;
    return {
      id,
      left: position.x - padding,
      top: position.y - padding,
      right: position.x + CARD_WIDTH + padding,
      bottom: position.y + cardHeight + padding,
    };
  }

  function rectsOverlap(first, second, padding = 0) {
    return first.left < second.right + padding
      && first.right > second.left - padding
      && first.top < second.bottom + padding
      && first.bottom > second.top - padding;
  }

  function segmentIntersectsRect(first, second, rect) {
    const epsilon = .1;
    if (Math.abs(first.x - second.x) < epsilon) {
      const low = Math.min(first.y, second.y);
      const high = Math.max(first.y, second.y);
      return first.x > rect.left + epsilon && first.x < rect.right - epsilon
        && high > rect.top + epsilon && low < rect.bottom - epsilon;
    }
    if (Math.abs(first.y - second.y) < epsilon) {
      const low = Math.min(first.x, second.x);
      const high = Math.max(first.x, second.x);
      return first.y > rect.top + epsilon && first.y < rect.bottom - epsilon
        && high > rect.left + epsilon && low < rect.right - epsilon;
    }
    return true;
  }

  function simplifyRoute(points) {
    const result = [];
    points.forEach((point) => {
      const previous = result[result.length - 1];
      if (!previous || previous.x !== point.x || previous.y !== point.y) result.push(point);
      while (result.length >= 3) {
        const first = result[result.length - 3];
        const middle = result[result.length - 2];
        const last = result[result.length - 1];
        if ((first.x === middle.x && middle.x === last.x) || (first.y === middle.y && middle.y === last.y)) {
          result.splice(result.length - 2, 1);
        } else break;
      }
    });
    return result;
  }

  function routeSegments(points) {
    return points.slice(1).map((point, index) => ({ first: points[index], second: point }));
  }

  function routeLength(points) {
    return routeSegments(points).reduce((total, segment) => total
      + Math.abs(segment.second.x - segment.first.x)
      + Math.abs(segment.second.y - segment.first.y), 0);
  }

  function roundedRoute(points) {
    if (points.length < 2) return '';
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length - 1; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      const incoming = Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
      const outgoing = Math.abs(next.x - current.x) + Math.abs(next.y - current.y);
      const radius = Math.min(ROUTE_CORNER_RADIUS, incoming / 2, outgoing / 2);
      const before = {
        x: current.x + Math.sign(previous.x - current.x) * radius,
        y: current.y + Math.sign(previous.y - current.y) * radius,
      };
      const after = {
        x: current.x + Math.sign(next.x - current.x) * radius,
        y: current.y + Math.sign(next.y - current.y) * radius,
      };
      path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y}, ${after.x} ${after.y}`;
    }
    const last = points[points.length - 1];
    return `${path} L ${last.x} ${last.y}`;
  }

  function portFor(rect, side) {
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const values = {
      left: { actual: { x: rect.left, y: centerY }, outside: { x: rect.left - NODE_CLEARANCE, y: centerY }, axis: 'horizontal', direction: -1 },
      right: { actual: { x: rect.right, y: centerY }, outside: { x: rect.right + NODE_CLEARANCE, y: centerY }, axis: 'horizontal', direction: 1 },
      top: { actual: { x: centerX, y: rect.top }, outside: { x: centerX, y: rect.top - NODE_CLEARANCE }, axis: 'vertical', direction: -1 },
      bottom: { actual: { x: centerX, y: rect.bottom }, outside: { x: centerX, y: rect.bottom + NODE_CLEARANCE }, axis: 'vertical', direction: 1 },
    };
    return values[side];
  }

  function routeObstacleHits(points, obstacles, sourceID, targetID) {
    const hits = new Set();
    routeSegments(points).forEach((segment, segmentIndex, segments) => obstacles.forEach((obstacle) => {
      if (obstacle.id === sourceID && segmentIndex === 0) return;
      if (obstacle.id === targetID && segmentIndex === segments.length - 1) return;
      if (segmentIntersectsRect(segment.first, segment.second, obstacle)) hits.add(obstacle.id);
    }));
    return hits.size;
  }

  function guideValues(obstacles, axis, middle, outerLow, outerHigh) {
    const values = new Set([middle, outerLow, outerHigh]);
    const boundaries = [];
    obstacles.forEach((rect) => {
      const low = axis === 'x' ? rect.left : rect.top;
      const high = axis === 'x' ? rect.right : rect.bottom;
      values.add(low);
      values.add(high);
      boundaries.push(low, high);
    });
    boundaries.sort((first, second) => first - second);
    for (let index = 1; index < boundaries.length; index += 1) {
      if (boundaries[index] - boundaries[index - 1] > NODE_CLEARANCE) {
        values.add((boundaries[index] + boundaries[index - 1]) / 2);
      }
    }
    const ranked = [...values].sort((first, second) => Math.abs(first - middle) - Math.abs(second - middle) || first - second);
    return [...new Set([...ranked.slice(0, 16), outerLow, outerHigh])];
  }

  function routeConflictCost(points, usedSegments) {
    let cost = 0;
    routeSegments(points).forEach((candidate) => {
      usedSegments.forEach((used) => {
        const candidateHorizontal = candidate.first.y === candidate.second.y;
        const usedHorizontal = used.first.y === used.second.y;
        if (candidateHorizontal === usedHorizontal) {
          const sameLane = candidateHorizontal
            ? Math.abs(candidate.first.y - used.first.y) < 1
            : Math.abs(candidate.first.x - used.first.x) < 1;
          if (!sameLane) return;
          const candidateLow = candidateHorizontal ? Math.min(candidate.first.x, candidate.second.x) : Math.min(candidate.first.y, candidate.second.y);
          const candidateHigh = candidateHorizontal ? Math.max(candidate.first.x, candidate.second.x) : Math.max(candidate.first.y, candidate.second.y);
          const usedLow = usedHorizontal ? Math.min(used.first.x, used.second.x) : Math.min(used.first.y, used.second.y);
          const usedHigh = usedHorizontal ? Math.max(used.first.x, used.second.x) : Math.max(used.first.y, used.second.y);
          cost += Math.max(0, Math.min(candidateHigh, usedHigh) - Math.max(candidateLow, usedLow)) * 1.5;
          return;
        }
        const horizontal = candidateHorizontal ? candidate : used;
        const vertical = candidateHorizontal ? used : candidate;
        const horizontalLow = Math.min(horizontal.first.x, horizontal.second.x);
        const horizontalHigh = Math.max(horizontal.first.x, horizontal.second.x);
        const verticalLow = Math.min(vertical.first.y, vertical.second.y);
        const verticalHigh = Math.max(vertical.first.y, vertical.second.y);
        if (vertical.first.x > horizontalLow && vertical.first.x < horizontalHigh
          && horizontal.first.y > verticalLow && horizontal.first.y < verticalHigh) cost += 24;
      });
    });
    return cost;
  }

  function routeAroundObstacles(edge, obstacles, usedSegments, laneOffset = 0) {
    const sourceRect = screenRect(edge.source);
    const targetRect = screenRect(edge.target);
    if (!sourceRect || !targetRect) return [];
    const allLeft = Math.min(...obstacles.map((rect) => rect.left));
    const allRight = Math.max(...obstacles.map((rect) => rect.right));
    const allTop = Math.min(...obstacles.map((rect) => rect.top));
    const allBottom = Math.max(...obstacles.map((rect) => rect.bottom));
    const outerLeft = Math.max(16, allLeft - 64);
    const outerRight = Math.max(canvasBounds.width - 32, allRight + 64);
    const outerTop = Math.max(16, allTop - 64);
    const outerBottom = Math.max(canvasBounds.height - 32, allBottom + 64);
    const sourceCenter = { x: (sourceRect.left + sourceRect.right) / 2, y: (sourceRect.top + sourceRect.bottom) / 2 };
    const targetCenter = { x: (targetRect.left + targetRect.right) / 2, y: (targetRect.top + targetRect.bottom) / 2 };
    const preferredAxis = mode === 'sitemap' || Math.abs(targetCenter.y - sourceCenter.y) > Math.abs(targetCenter.x - sourceCenter.x)
      ? 'vertical' : 'horizontal';
    const xGuides = guideValues(obstacles, 'x', (sourceCenter.x + targetCenter.x) / 2, outerLeft, outerRight);
    const yGuides = guideValues(obstacles, 'y', (sourceCenter.y + targetCenter.y) / 2, outerTop, outerBottom);
    const candidates = [];
    const blockedCandidates = [];
    const addCandidate = (points, axis, outer = false) => {
      const simplified = simplifyRoute(points);
      let preference = axis === preferredAxis ? 0 : 120;
      if (edge.type === 'return') preference += outer ? -100 : 180;
      else if (outer) preference += 120;
      const obstacleHits = routeObstacleHits(simplified, obstacles, edge.source, edge.target);
      const candidate = {
        points: simplified,
        score: routeLength(simplified) + Math.max(0, simplified.length - 2) * 36 + preference
          + routeConflictCost(simplified, usedSegments) + obstacleHits * 10_000,
      };
      if (obstacleHits) blockedCandidates.push(candidate);
      else candidates.push(candidate);
    };
    const horizontalPairs = [['right', 'left'], ['left', 'right'], ['right', 'right'], ['left', 'left']];
    horizontalPairs.forEach(([sourceSide, targetSide]) => {
      const source = portFor(sourceRect, sourceSide);
      const target = portFor(targetRect, targetSide);
      if (source.outside.y === target.outside.y && Math.sign(target.outside.x - source.outside.x) === source.direction
        && Math.sign(source.outside.x - target.outside.x) === target.direction) {
        addCandidate([source.actual, source.outside, target.outside, target.actual], 'horizontal');
      }
      xGuides.forEach((guide) => {
        const lane = guide + laneOffset;
        if (Math.sign(lane - source.outside.x) !== source.direction || Math.sign(lane - target.outside.x) !== target.direction) return;
        addCandidate(
          [source.actual, source.outside, { x: lane, y: source.outside.y }, { x: lane, y: target.outside.y }, target.outside, target.actual],
          'horizontal', guide === outerLeft || guide === outerRight,
        );
      });
    });
    const verticalPairs = [['bottom', 'top'], ['top', 'bottom'], ['bottom', 'bottom'], ['top', 'top']];
    verticalPairs.forEach(([sourceSide, targetSide]) => {
      const source = portFor(sourceRect, sourceSide);
      const target = portFor(targetRect, targetSide);
      if (source.outside.x === target.outside.x && Math.sign(target.outside.y - source.outside.y) === source.direction
        && Math.sign(source.outside.y - target.outside.y) === target.direction) {
        addCandidate([source.actual, source.outside, target.outside, target.actual], 'vertical');
      }
      yGuides.forEach((guide) => {
        const lane = guide + laneOffset;
        if (Math.sign(lane - source.outside.y) !== source.direction || Math.sign(lane - target.outside.y) !== target.direction) return;
        addCandidate(
          [source.actual, source.outside, { x: source.outside.x, y: lane }, { x: target.outside.x, y: lane }, target.outside, target.actual],
          'vertical', guide === outerTop || guide === outerBottom,
        );
      });
    });
    return (candidates.length ? candidates : blockedCandidates)
      .sort((first, second) => first.score - second.score || roundedRoute(first.points).localeCompare(roundedRoute(second.points)));
  }

  function selfRouteCandidates(edge, obstacles, usedSegments, laneOffset = 0) {
    const rect = screenRect(edge.source);
    if (!rect) return [];
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const distance = 84 + Math.abs(laneOffset);
    const candidates = [
      [{ x: rect.right, y: centerY - 42 }, { x: rect.right + NODE_CLEARANCE, y: centerY - 42 }, { x: rect.right + distance, y: centerY - 42 }, { x: rect.right + distance, y: centerY + 42 }, { x: rect.right + NODE_CLEARANCE, y: centerY + 42 }, { x: rect.right, y: centerY + 42 }],
      [{ x: centerX - 54, y: rect.bottom }, { x: centerX - 54, y: rect.bottom + NODE_CLEARANCE }, { x: centerX - 54, y: rect.bottom + distance }, { x: centerX + 54, y: rect.bottom + distance }, { x: centerX + 54, y: rect.bottom + NODE_CLEARANCE }, { x: centerX + 54, y: rect.bottom }],
      [{ x: rect.left, y: centerY + 42 }, { x: rect.left - NODE_CLEARANCE, y: centerY + 42 }, { x: rect.left - distance, y: centerY + 42 }, { x: rect.left - distance, y: centerY - 42 }, { x: rect.left - NODE_CLEARANCE, y: centerY - 42 }, { x: rect.left, y: centerY - 42 }],
      [{ x: centerX + 54, y: rect.top }, { x: centerX + 54, y: rect.top - NODE_CLEARANCE }, { x: centerX + 54, y: rect.top - distance }, { x: centerX - 54, y: rect.top - distance }, { x: centerX - 54, y: rect.top - NODE_CLEARANCE }, { x: centerX - 54, y: rect.top }],
    ];
    const ranked = candidates
      .map(simplifyRoute)
      .filter((points) => points.every((point) => point.x >= 16 && point.y >= 16))
      .map((points) => {
        const obstacleHits = routeObstacleHits(points, obstacles, edge.source, edge.target);
        return {
          points,
          obstacleHits,
          score: routeLength(points) + routeConflictCost(points, usedSegments) + obstacleHits * 10_000,
        };
      })
      .sort((first, second) => first.score - second.score);
    const clear = ranked.filter((candidate) => candidate.obstacleHits === 0);
    return clear.length ? clear : ranked;
  }

  function labelRectangle(center, size) {
    return {
      left: center.x - size.width / 2,
      top: center.y - size.height / 2,
      right: center.x + size.width / 2,
      bottom: center.y + size.height / 2,
    };
  }

  function labelCandidates(points, size) {
    const candidates = [];
    routeSegments(points)
      .map((segment) => ({ ...segment, length: Math.abs(segment.second.x - segment.first.x) + Math.abs(segment.second.y - segment.first.y) }))
      .sort((first, second) => second.length - first.length)
      .forEach((segment) => {
        [.5, .34, .66].forEach((ratio) => {
          const point = {
            x: segment.first.x + (segment.second.x - segment.first.x) * ratio,
            y: segment.first.y + (segment.second.y - segment.first.y) * ratio,
          };
          if (segment.first.y === segment.second.y) {
            candidates.push({ x: point.x, y: point.y - size.height / 2 - LABEL_CLEARANCE });
            candidates.push({ x: point.x, y: point.y + size.height / 2 + LABEL_CLEARANCE });
          } else {
            candidates.push({ x: point.x + size.width / 2 + LABEL_CLEARANCE, y: point.y });
            candidates.push({ x: point.x - size.width / 2 - LABEL_CLEARANCE, y: point.y });
          }
        });
      });
    return candidates;
  }

  function findLabelPlacement(points, size, nodeRects, occupiedLabels) {
    return labelCandidates(points, size).find((center) => {
      const rect = labelRectangle(center, size);
      if (rect.left < 16 || rect.top < 16) return false;
      if (nodeRects.some((node) => rectsOverlap(rect, node, LABEL_CLEARANCE))) return false;
      return !occupiedLabels.some((label) => rectsOverlap(rect, label, 6));
    });
  }

  function createTransitionLabel(edge) {
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'screen-edge-label';
    label.dataset.transitionLabel = edge.id;
    label.dataset.transitionId = edge.id;
    label.setAttribute('aria-label', `${edge.id}: ${edge.action}${edge.condition ? `, условие: ${edge.condition}` : ''}`);
    label.title = `${edge.id} · ${edge.action}${edge.condition ? ` · ${edge.condition}` : ''}`;
    const action = document.createElement('span');
    action.className = 'screen-edge-label-action';
    action.textContent = edge.action;
    label.append(action);
    if (edge.condition) {
      label.classList.add('has-condition');
      const condition = document.createElement('span');
      condition.className = 'screen-edge-label-condition';
      condition.textContent = edge.condition;
      label.append(condition);
    }
    label.addEventListener('click', (event) => {
      event.stopPropagation();
      selectTransition(edge.id);
    });
    labelsLayer.append(label);
    return label;
  }

  function routeLaneOffsets(edges) {
    const groups = new Map();
    edges.forEach((edge) => {
      const key = `${edge.source}\u0000${edge.target}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge.id);
    });
    const offsets = new Map();
    groups.forEach((ids) => {
      ids.sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
      ids.forEach((id, index) => offsets.set(id, (index - (ids.length - 1) / 2) * ROUTE_LANE_OFFSET));
    });
    return offsets;
  }

  function drawEdges() {
    edgeLayer.innerHTML = `<defs><marker id="screen-map-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"></path></marker></defs>`;
    labelsLayer.replaceChildren();
    const edges = [...activeEdges].sort((first, second) => first.id.localeCompare(second.id, undefined, { numeric: true }));
    const obstacles = [...visible].map((id) => screenRect(id, NODE_CLEARANCE)).filter(Boolean);
    const nodeRects = [...visible].map((id) => screenRect(id)).filter(Boolean);
    const occupiedLabels = [];
    const usedSegments = [];
    const offsets = routeLaneOffsets(edges);
    let fallbackIndex = 0;
    let requiredWidth = canvasBounds.width;
    let requiredHeight = canvasBounds.height;

    edges.forEach((edge) => {
      const label = createTransitionLabel(edge);
      const labelSize = { width: label.offsetWidth, height: label.offsetHeight };
      const routeOptions = edge.source === edge.target
        ? selfRouteCandidates(edge, obstacles, usedSegments, offsets.get(edge.id) || 0)
        : routeAroundObstacles(edge, obstacles, usedSegments, offsets.get(edge.id) || 0);
      if (!routeOptions.length) {
        label.remove();
        return;
      }
      let chosenRoute = routeOptions[0];
      let labelCenter = null;
      for (const candidate of routeOptions) {
        const placement = findLabelPlacement(candidate.points, labelSize, nodeRects, occupiedLabels);
        if (placement) {
          chosenRoute = candidate;
          labelCenter = placement;
          break;
        }
      }
      let leader = null;
      if (!labelCenter) {
        fallbackIndex += 1;
        const anchor = chosenRoute.points[Math.floor(chosenRoute.points.length / 2)];
        labelCenter = {
          x: Math.max(canvasBounds.width, ...nodeRects.map((rect) => rect.right)) + 48 + labelSize.width / 2,
          y: 48 + fallbackIndex * (labelSize.height + 16),
        };
        leader = { first: anchor, second: { x: labelCenter.x - labelSize.width / 2, y: labelCenter.y } };
      }
      const labelRect = labelRectangle(labelCenter, labelSize);
      occupiedLabels.push(labelRect);
      routeSegments(chosenRoute.points).forEach((segment) => usedSegments.push(segment));
      requiredWidth = Math.max(requiredWidth, labelRect.right + 48, ...chosenRoute.points.map((point) => point.x + 48));
      requiredHeight = Math.max(requiredHeight, labelRect.bottom + 48, ...chosenRoute.points.map((point) => point.y + 48));

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('screen-edge', `screen-edge-${edge.type || 'navigation'}`);
      group.dataset.transitionId = edge.id;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('screen-edge-path');
      path.setAttribute('d', roundedRoute(chosenRoute.points));
      path.setAttribute('marker-end', 'url(#screen-map-arrow)');
      if (edge.type === 'external') {
        const outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        outerPath.classList.add('screen-edge-path', 'screen-edge-external-outer');
        outerPath.setAttribute('d', path.getAttribute('d'));
        path.classList.add('screen-edge-external-inner');
        group.append(outerPath);
      }
      if (leader) {
        const leaderPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        leaderPath.classList.add('screen-edge-leader');
        leaderPath.setAttribute('d', `M ${leader.first.x} ${leader.first.y} L ${leader.second.x} ${leader.second.y}`);
        group.append(leaderPath);
      }
      group.append(path);
      group.addEventListener('click', (event) => {
        event.stopPropagation();
        selectTransition(edge.id);
      });
      edgeLayer.append(group);
      label.style.left = `${labelCenter.x}px`;
      label.style.top = `${labelCenter.y}px`;
    });
    setCanvasSize(Math.ceil(requiredWidth), Math.ceil(requiredHeight));
    applySelectionStyles();
  }

  function applyTransform() {
    viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (status) status.textContent = `${visible.size} экранов · ${activeEdges.length} переходов · ${Math.round(scale * 100)}%`;
  }

  function renderInspector(id) {
    const screen = byId.get(id);
    if (!screen) {
      inspector.innerHTML = `<div class="screen-inspector-empty"><strong>Выберите экран</strong><span>Здесь появятся состояния, связи и затронутые документы.</span></div>`;
      return;
    }
    const incomingRows = transitions.filter((transition) => transition.target === id)
      .map((transition) => `<li><code>${escapeText(transition.id)}</code><span>${escapeText(transition.source)} · ${escapeText(transition.action)} · ${escapeText(transition.condition)}</span></li>`).join('');
    const outgoingRows = transitions.filter((transition) => transition.source === id)
      .map((transition) => `<li><code>${escapeText(transition.id)}</code><span>${escapeText(transition.action)} · ${escapeText(transition.condition)} → ${escapeText(transition.target)}${transition.state ? ` @${escapeText(transition.state)}` : ''}${transition.error ? ` · ${escapeText(transition.error)}` : ''}${transition.useCase ? ` · ${escapeText(transition.useCase)}` : ''}</span></li>`).join('');
    const states = (screen.states || []).map((state) => `<span class="screen-state-chip">${escapeText(state.id)}</span>`).join('');
    const preview = screen.preview
      ? `<img class="screen-inspector-preview" src="${escapeAttribute(screen.preview)}" alt="Превью ${escapeAttribute(screen.title)}">`
      : `<div class="screen-inspector-preview screen-preview-placeholder"><strong>${escapeText(screen.id)}</strong><span>Превью отсутствует</span></div>`;
    inspector.innerHTML = `<div class="screen-inspector-head"><span>${escapeText(screen.module)}</span><button type="button" data-inspector-close aria-label="Закрыть">×</button></div>
      <p class="screen-eyebrow">${escapeText(screen.id)}</p><h2>${escapeText(screen.title)}</h2>${preview}<p>${escapeText(screen.description || '')}</p>
      <dl><div><dt>Статус</dt><dd>${escapeText(screen.status?.label || '')}</dd></div><div><dt>Маршрут</dt><dd><code>${escapeText(screen.route || '—')}</code></dd></div>
      <div><dt>Владелец</dt><dd>${escapeText(screen.owner || '—')}</dd></div><div><dt>Компонент</dt><dd><code>${escapeText(screen.component || '—')}</code></dd></div></dl>
      <div class="screen-inspector-states">${states}</div>
      <h3>Сценарии и задачи</h3><p>${escapeText([...(screen.useCases || []), ...(screen.workItems || [])].join(' · ') || 'Связей нет')}</p>
      <h3>Контракты</h3><p>${escapeText((screen.contracts || []).join(' · ') || 'Связей нет')}</p>
      <h3>Исходящие переходы</h3><ul>${outgoingRows || '<li>Нет переходов</li>'}</ul>
      <h3>Входящие переходы</h3><ul>${incomingRows || '<li>Нет переходов</li>'}</ul>
      <a class="primary-link" href="${escapeAttribute(data.screenUrls?.[id] || '#')}">Открыть документ →</a>`;
    inspector.querySelector('[data-inspector-close]')?.addEventListener('click', () => selectScreen(''));
  }

  function escapeText(value) {
    const element = document.createElement('span');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
  }

  function escapeAttribute(value) {
    return escapeText(value).replaceAll('"', '&quot;');
  }

  function transitionByID(id) {
    return activeEdges.find((item) => item.id === id) || transitions.find((item) => item.id === id);
  }

  function applySelectionStyles() {
    nodeById.forEach((node, nodeId) => {
      const transition = transitionByID(selectedTransition);
      node.classList.toggle('is-selected', nodeId === selected || Boolean(transition && (nodeId === transition.source || nodeId === transition.target)));
    });
    [...edgeLayer.querySelectorAll('.screen-edge'), ...labelsLayer.querySelectorAll('.screen-edge-label')].forEach((element) => {
      const transition = transitionByID(element.dataset.transitionId);
      const relatedToScreen = Boolean(selected && transition && (transition.source === selected || transition.target === selected));
      const relatedToTransition = Boolean(selectedTransition && element.dataset.transitionId === selectedTransition);
      element.classList.toggle('is-related', relatedToScreen || relatedToTransition);
      element.classList.toggle('is-muted', Boolean(
        (selected && !relatedToScreen) || (selectedTransition && !relatedToTransition),
      ));
    });
  }

  function selectScreen(id) {
    selected = id;
    selectedTransition = '';
    applySelectionStyles();
    renderInspector(id);
  }

  function selectTransition(id) {
    const transition = transitionByID(id);
    if (!transition) return;
    selected = '';
    selectedTransition = id;
    applySelectionStyles();
    inspector.innerHTML = `<div class="screen-inspector-head"><span>${escapeText(transition.type || 'navigation')}</span><button type="button" data-inspector-close aria-label="Закрыть">×</button></div>
      <p class="screen-eyebrow">${escapeText(transition.id)}</p><h2>${escapeText(transition.action)}</h2>
      <dl><div><dt>Условие</dt><dd>${escapeText(transition.condition)}</dd></div><div><dt>Откуда</dt><dd><code>${escapeText(transition.source)}</code></dd></div>
      <div><dt>Куда</dt><dd><code>${escapeText(transition.target)}</code></dd></div><div><dt>Сценарий</dt><dd>${escapeText(transition.useCase || 'Глобальный')}</dd></div>
      <div><dt>Состояние</dt><dd>${escapeText(transition.state || 'DEFAULT')}</dd></div><div><dt>Ошибка</dt><dd>${escapeText(transition.error || '—')}</dd></div></dl>
      ${transition.message ? `<div class="screen-transition-message"><strong>${escapeText(transition.error || 'Сообщение')}</strong><span>${escapeText(transition.message)}</span></div>` : ''}`;
    inspector.querySelector('[data-inspector-close]')?.addEventListener('click', () => selectScreen(''));
  }

  function measureVisibleCards() {
    nodeById.forEach((node, id) => {
      node.hidden = !visible.has(id);
      node.style.height = '';
    });
    cardHeight = Math.max(
      MIN_CARD_HEIGHT,
      ...[...nodeById.entries()]
        .filter(([id]) => visible.has(id))
        .map(([, node]) => node.offsetHeight),
    );
    nodeById.forEach((node, id) => {
      if (visible.has(id)) node.style.height = `${cardHeight}px`;
    });
  }

  function render({ fit = false } = {}) {
    computeVisible();
    measureVisibleCards();
    layout();
    nodeById.forEach((node, id) => {
      const position = positions.get(id);
      if (position) node.style.transform = `translate(${position.x}px, ${position.y}px)`;
    });
    drawGroups();
    drawEdges();
    empty.hidden = visible.size > 0;
    if (selected && !visible.has(selected)) selectScreen('');
    if (selectedTransition && !activeEdges.some((edge) => edge.id === selectedTransition)) selectScreen('');
    if (fit) fitToStage();
    else applyTransform();
  }

  function fitToStage() {
    const width = parseFloat(viewport.style.width) || 900;
    const height = parseFloat(viewport.style.height) || 620;
    scale = Math.min(1, Math.max(.2, Math.min((stage.clientWidth - 48) / width, (stage.clientHeight - 48) / height)));
    panX = Math.max(24, (stage.clientWidth - width * scale) / 2);
    panY = Math.max(24, (stage.clientHeight - height * scale) / 2);
    applyTransform();
  }

  function setScale(next, originX = stage.clientWidth / 2, originY = stage.clientHeight / 2) {
    const previous = scale;
    scale = Math.min(2.4, Math.max(.2, next));
    panX = originX - (originX - panX) * (scale / previous);
    panY = originY - (originY - panY) * (scale / previous);
    applyTransform();
  }

  nodeById.forEach((node, id) => {
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      selectScreen(id);
    });
    node.addEventListener('dblclick', () => {
      if (data.screenUrls?.[id]) window.location.href = data.screenUrls[id];
    });
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (selected === id && data.screenUrls?.[id]) window.location.href = data.screenUrls[id];
        else selectScreen(id);
      }
    });
  });
  stage.addEventListener('click', (event) => {
    if (event.target === stage || event.target === viewport || event.target === nodesLayer) selectScreen('');
  });
  stage.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const box = stage.getBoundingClientRect();
    setScale(scale * (event.deltaY > 0 ? .9 : 1.1), event.clientX - box.left, event.clientY - box.top);
  }, { passive: false });
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-screen-node], [data-transition-label]')) return;
    dragging = true;
    dragStart = { x: event.clientX, y: event.clientY, panX, panY };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    panX = dragStart.panX + event.clientX - dragStart.x;
    panY = dragStart.panY + event.clientY - dragStart.y;
    applyTransform();
  });
  stage.addEventListener('pointerup', () => {
    dragging = false;
    stage.classList.remove('is-panning');
  });
  stage.addEventListener('keydown', (event) => {
    if (event.target.matches('input,select')) return;
    if (event.key === '+' || event.key === '=') setScale(scale * 1.1);
    if (event.key === '-') setScale(scale * .9);
    if (event.key === '0') fitToStage();
    if (event.key === 'Escape') selectScreen('');
  });
  workspace.querySelectorAll('[data-map-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mapMode;
    workspace.querySelectorAll('[data-map-mode]').forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle('is-active', active);
      candidate.setAttribute('aria-pressed', String(active));
    });
    moduleSelect.hidden = mode !== 'module';
    useCaseSelect.hidden = mode !== 'usecase';
    render({ fit: true });
  }));
  moduleSelect?.addEventListener('change', () => render({ fit: true }));
  useCaseSelect?.addEventListener('change', () => render({ fit: true }));
  statusSelect?.addEventListener('change', () => render({ fit: true }));
  search?.addEventListener('input', () => render({ fit: true }));
  workspace.querySelector('[data-map-zoom-in]')?.addEventListener('click', () => setScale(scale * 1.1));
  workspace.querySelector('[data-map-zoom-out]')?.addEventListener('click', () => setScale(scale * .9));
  workspace.querySelector('[data-map-fit]')?.addEventListener('click', fitToStage);
  workspace.querySelector('[data-map-reset]')?.addEventListener('click', () => {
    scale = 1; panX = 24; panY = 24; applyTransform();
  });
  workspace.querySelector('[data-map-fullscreen]')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stage.requestFullscreen?.();
  });
  document.addEventListener('docgent:panelshown', (event) => {
    if (event.target?.contains(workspace)) {
      window.requestAnimationFrame(() => render({ fit: true }));
    }
  });

  if (initialUseCase && useCaseSelect) {
    useCaseSelect.value = initialUseCase;
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (!initialUseCase && hash.get('usecase')) {
    mode = 'usecase';
    useCaseSelect.value = hash.get('usecase');
    useCaseSelect.hidden = false;
    workspace.querySelectorAll('[data-map-mode]').forEach((button) => {
      const active = button.dataset.mapMode === 'usecase';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  render({ fit: true });
  if (hash.get('screen')) selectScreen(hash.get('screen'));
})();
