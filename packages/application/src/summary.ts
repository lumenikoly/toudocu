import { buildProjectSummary, type CompiledProject } from '@toudocu/core';

const russianTypes: Readonly<Record<string, string>> = {
  architecture: 'Архитектура',
  changelog: 'Журнал изменений проекта',
  contract: 'Контрактный каталог',
  decision: 'Архитектурное решение',
  draft: 'Черновик',
  document: 'Документ',
  flow: 'Процесс',
  guide: 'Руководство',
  ideas: 'Идеи развития',
  module: 'Модуль',
  notes: 'Заметки',
  overview: 'Обзор проекта',
  'quality-index': 'Стандарты качества',
  reference: 'Справочник',
  risks: 'Риски',
  roadmap: 'Дорожная карта',
  runbook: 'Runbook',
  'runbook-index': 'Runbooks',
  screen: 'Экран',
  'screen-index': 'Раздел экранов',
  'screen-map': 'Устаревшая карта экранов',
  standard: 'Стандарт',
  status: 'Текущее состояние',
  'use-case': 'Пользовательский сценарий',
  work: 'Рабочие задачи',
};

/** Localized reader output stays outside the semantic compiler. */
export function buildReaderSummary(
  project: CompiledProject,
  options: { root?: string; requestedTitle?: string; locale?: string } = {},
): ReturnType<typeof buildProjectSummary> {
  const summary = buildProjectSummary(project, options);
  const language = options.locale?.trim().toLowerCase().replaceAll('_', '-').split('-')[0];
  if (language === 'ru')
    for (const item of summary.searchIndex)
      item.typeLabel = russianTypes[item.type] ?? item.typeLabel;
  return summary;
}
