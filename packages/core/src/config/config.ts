import { isAlias, isMap, isNode, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import { ToudocuError } from '@toudocu/contracts';
import { SourcePositionMapper, type SourceRange } from '../markdown/source-position.js';

export const documentationVersion = 3;
export const sectionTypes = [
  'architecture',
  'modules',
  'use-cases',
  'flows',
  'screens',
  'decisions',
  'contracts',
  'quality',
  'runbooks',
  'reference',
  'work',
  'drafts',
  'guides',
] as const;
export type SectionType = (typeof sectionTypes)[number];
export interface LocaleProfile {
  root: string;
  sections: Partial<Record<SectionType, string>>;
}
export interface SiteConfig {
  documentationVersion: number;
  site: {
    title: string;
    logo: string;
    favicon: string;
    theme: string;
    colorScheme: string;
    accent: string;
    density: string;
    contentWidth: string;
    footer: { text: string; url: string; defaultText: boolean };
    hero: { enabled: boolean; image: string };
  };
  changes: {
    defaultBaseRef: string;
    renameSimilarity: number;
    includeTaskArtifacts: boolean;
    includeAssets: boolean;
    semanticDiff: boolean;
    renderedDiff: boolean;
    maxSourceDiffBytes: number;
    maxRenderedFileBytes: number;
    exclude: string[];
  };
  project: { defaultLocale: string };
  locales: Record<string, LocaleProfile>;
}

export function defaultSiteConfig(): SiteConfig {
  return {
    documentationVersion: 1,
    site: {
      title: '',
      logo: '',
      favicon: '',
      theme: 'classic',
      colorScheme: 'system',
      accent: 'indigo',
      density: 'comfortable',
      contentWidth: 'standard',
      footer: { text: '', url: 'https://lumenikoly.github.io/toudocu/', defaultText: true },
      hero: { enabled: true, image: '' },
    },
    changes: {
      defaultBaseRef: '',
      renameSimilarity: 60,
      includeTaskArtifacts: true,
      includeAssets: true,
      semanticDiff: true,
      renderedDiff: true,
      maxSourceDiffBytes: 2 * 1024 * 1024,
      maxRenderedFileBytes: 1024 * 1024,
      exclude: [],
    },
    project: { defaultLocale: '' },
    locales: {},
  };
}

export function normalizeLocale(value: string): string | undefined {
  const parts = value.split('-');
  const language = parts[0];
  if (!language || !/^[a-z]{2,8}$/i.test(language)) return undefined;
  const result = [language.toLowerCase()];
  let index = 1;
  const script = parts[index];
  if (script && /^[a-z]{4}$/i.test(script)) {
    result.push(script[0]?.toUpperCase() + script.slice(1).toLowerCase());
    index++;
  }
  const region = parts[index];
  if (region && /^(?:[a-z]{2}|[0-9]{3})$/i.test(region)) {
    result.push(region.toUpperCase());
    index++;
  }
  for (; index < parts.length; index++) {
    const part = parts[index] ?? '';
    if (!/^(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/i.test(part)) return undefined;
    result.push(part.toLowerCase());
  }
  return result.join('-');
}

type ConfigLocation = { line?: number; range?: SourceRange };
type ScalarValue = {
  value: string;
  quoted: boolean;
  location: ConfigLocation;
  keyLocation?: ConfigLocation;
};
const maps = new Set([
  'site',
  'site.footer',
  'site.hero',
  'changes',
  'changes.exclude',
  'project',
  'locales',
]);
const strings = new Set([
  'site.title',
  'site.logo',
  'site.favicon',
  'site.theme',
  'site.colorScheme',
  'site.accent',
  'site.density',
  'site.contentWidth',
  'site.footer.text',
  'site.footer.url',
  'site.hero.image',
  'changes.defaultBaseRef',
  'project.defaultLocale',
]);
const booleans = new Set([
  'site.hero.enabled',
  'changes.includeTaskArtifacts',
  'changes.includeAssets',
  'changes.semanticDiff',
  'changes.renderedDiff',
]);
const integers = new Set([
  'documentationVersion',
  'changes.renameSimilarity',
  'changes.maxSourceDiffBytes',
  'changes.maxRenderedFileBytes',
]);

function configError(message: string, location?: ConfigLocation): never {
  const line = location?.line;
  const range = location?.range;
  throw new ToudocuError('INVALID_CONFIG', `config.yml${line ? `:${line}` : ''}: ${message}`, {
    path: '.toudocu/config.yml',
    ...(range ? { range } : {}),
  });
}

/** Parse strict configuration syntax without reading files or resolving aliases. */
export function parseSiteConfig(input: string): SiteConfig {
  const source = input.replace(/\r\n/g, '\n');
  const mapper = new SourcePositionMapper(source);
  const locationAt = (offset: number, endOffset = offset): ConfigLocation => {
    const start = mapper.positionAt(offset);
    const end = mapper.positionAt(endOffset);
    return { line: start.line, range: { start, end } };
  };
  const rangeAt = (offset: number, endOffset = offset): ConfigLocation => {
    const start = mapper.positionAt(offset);
    const end = mapper.positionAt(endOffset);
    return { range: { start, end } };
  };
  const rangeOnly = (location?: ConfigLocation): ConfigLocation | undefined => {
    if (!location?.range) return undefined;
    return { range: location.range };
  };
  const locationForLine = (line: number, column = 1): ConfigLocation => {
    const position = mapper.position({ line, column });
    return { line: position.line, range: { start: position, end: position } };
  };
  for (const [index, line] of source.split('\n').entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (line.includes('\t')) {
      configError(
        'tabs are not allowed in indentation',
        locationForLine(index + 1, line.indexOf('\t') + 1),
      );
    }
    const indentation = /^ */.exec(line)?.[0].length ?? 0;
    if (indentation % 2 !== 0 || indentation > 6) {
      configError('invalid indentation', locationForLine(index + 1, indentation + 1));
    }
  }
  const counter = new LineCounter();
  const document = parseDocument(source, {
    schema: 'failsafe',
    uniqueKeys: false,
    lineCounter: counter,
    prettyErrors: false,
    strict: true,
    logLevel: 'silent',
  });
  const syntaxError = document.errors[0];
  if (syntaxError) {
    configError(syntaxError.message, locationAt(syntaxError.pos[0], syntaxError.pos[1]));
  }
  if (!isMap(document.contents) || document.contents.flow) {
    configError('root site map is missing', rangeAt(0));
  }
  const values = new Map<string, ScalarValue>();
  const excludes: string[] = [];
  const locationOf = (node: unknown): ConfigLocation => {
    if (!isNode(node) || !node.range) {
      return locationForLine(1);
    }
    return locationAt(node.range[0], node.range[1]);
  };
  const scalar = (node: unknown): ScalarValue => {
    const location = locationOf(node);
    if (!isScalar(node)) {
      configError('unsupported YAML construct', location);
    }
    if (
      node.anchor ||
      node.tag ||
      node.type === 'BLOCK_FOLDED' ||
      node.type === 'BLOCK_LITERAL' ||
      (node.value !== null && typeof node.value !== 'string')
    ) {
      configError('unsupported YAML construct', location);
    }
    return {
      value: node.value === null ? '' : node.value,
      quoted: node.type === 'QUOTE_DOUBLE' || node.type === 'QUOTE_SINGLE',
      location,
    };
  };
  const visit = (node: unknown, path: string, depth = 0): void => {
    if (!isNode(node) || isAlias(node) || node.tag || ('anchor' in node && node.anchor)) {
      configError('unsupported YAML construct', locationOf(node));
    }
    if (isMap(node)) {
      if (node.flow) {
        configError('unsupported YAML construct', locationOf(node));
      }
      for (const pair of node.items) {
        const key = scalar(pair.key);
        if (isNode(pair.key) && counter.linePos(pair.key.range?.[0] ?? 0).col !== depth * 2 + 1) {
          configError('invalid nesting', key.location);
        }
        if (key.quoted || !key.value || /[ {}\[\]&*!|>'"]/.test(key.value)) {
          configError(`invalid key ${JSON.stringify(key.value)}`, key.location);
        }
        const full = path ? `${path}.${key.value}` : key.value;
        if (values.has(full)) {
          configError(`duplicate key ${JSON.stringify(full)}`, key.location);
        }
        values.set(full, { value: '', quoted: false, location: key.location });
        visit(pair.value, full, depth + 1);
        const value = values.get(full);
        if (value) {
          values.set(full, { ...value, keyLocation: key.location });
        }
      }
    } else if (isSeq(node)) {
      if (path !== 'changes.exclude' || node.flow) {
        configError('unsupported YAML construct', locationOf(node));
      }
      for (const item of node.items) {
        const value = scalar(item);
        if (!value.value) {
          configError('invalid changes.exclude', value.location);
        }
        excludes.push(value.value);
      }
    } else {
      values.set(path, scalar(node));
    }
  };
  visit(document.contents, '');
  const config = defaultSiteConfig();
  const localeKeys = new Map<string, string>();
  for (const [key, value] of values) {
    if (key.startsWith('locales.')) {
      const rawLocale = key.split('.')[1] ?? '';
      const locale = normalizeLocale(rawLocale);
      if (!locale) continue;
      const previous = localeKeys.get(locale);
      if (previous && previous !== rawLocale)
        configError(`duplicate normalized locale ${locale}`, value.keyLocation ?? value.location);
      localeKeys.set(locale, rawLocale);
    }
  }
  for (const [key, scalarValue] of values) {
    const { value, quoted, location } = scalarValue;
    if (maps.has(key) && value === '') continue;
    const localeField = /^locales\.[^.]+\.(?:root|sections\.[^.]+)$/.test(key);
    if (!strings.has(key) && !booleans.has(key) && !integers.has(key) && !localeField) {
      if (key.startsWith('locales.')) continue; // Inactive locale profiles are validated when selected.
      configError(`unknown key ${JSON.stringify(key)}`, scalarValue.keyLocation ?? location);
    }
    if (!booleans.has(key) && !quoted && (value === 'true' || value === 'false'))
      configError(`${key} must be a string`, location);
    if (booleans.has(key) && (quoted || !['true', 'false'].includes(value)))
      configError(`${key} must be a boolean`, location);
    if (integers.has(key)) {
      const number = Number(value);
      const max = key === 'changes.renameSimilarity' ? 100 : Number.MAX_SAFE_INTEGER;
      if (
        !/^\+?[0-9]+$/.test(value) ||
        !Number.isSafeInteger(number) ||
        number < 1 ||
        number > max
      ) {
        configError(
          key === 'documentationVersion'
            ? 'documentationVersion must be a positive integer'
            : key === 'changes.renameSimilarity'
              ? 'changes.renameSimilarity must be between 1 and 100'
              : `${key} must be positive`,
          location,
        );
      }
    }
  }
  const value = (key: string, fallback: string): string => values.get(key)?.value ?? fallback;
  const boolean = (key: string, fallback: boolean): boolean =>
    values.has(key) ? value(key, '') === 'true' : fallback;
  const number = (key: string, fallback: number): number =>
    values.has(key) ? Number(value(key, '')) : fallback;
  config.documentationVersion = number('documentationVersion', 1);
  for (const key of [
    'title',
    'logo',
    'favicon',
    'theme',
    'colorScheme',
    'accent',
    'density',
    'contentWidth',
  ] as const)
    config.site[key] = value(`site.${key}`, config.site[key]);
  config.site.footer.text = value('site.footer.text', '');
  config.site.footer.defaultText = !values.has('site.footer.text');
  config.site.footer.url = value(
    'site.footer.url',
    config.site.footer.defaultText ? config.site.footer.url : '',
  );
  config.site.hero.enabled = boolean('site.hero.enabled', true);
  config.site.hero.image = value('site.hero.image', '');
  config.changes.defaultBaseRef = value('changes.defaultBaseRef', '');
  for (const key of ['renameSimilarity', 'maxSourceDiffBytes', 'maxRenderedFileBytes'] as const)
    config.changes[key] = number(`changes.${key}`, config.changes[key]);
  for (const key of [
    'includeTaskArtifacts',
    'includeAssets',
    'semanticDiff',
    'renderedDiff',
  ] as const)
    config.changes[key] = boolean(`changes.${key}`, config.changes[key]);
  config.changes.exclude = excludes;
  if (values.has('project.defaultLocale')) {
    const locale = normalizeLocale(value('project.defaultLocale', ''));
    if (!locale)
      configError(
        'project.defaultLocale must be a valid BCP-47-style locale',
        values.get('project.defaultLocale')?.location,
      );
    config.project.defaultLocale = locale;
  }
  for (const [locale, rawLocale] of localeKeys) {
    const sections: Partial<Record<SectionType, string>> = {};
    for (const section of sectionTypes) {
      const title = values.get(`locales.${rawLocale}.sections.${section}`);
      if (title) sections[section] = title.value;
    }
    if (
      sections.drafts === undefined &&
      sectionTypes.every((section) => section === 'drafts' || sections[section]?.trim())
    )
      sections.drafts = locale.split('-')[0] === 'ru' ? 'Черновики' : 'Drafts';
    config.locales[locale] = { root: value(`locales.${rawLocale}.root`, ''), sections };
  }
  if (config.documentationVersion === documentationVersion) {
    for (const [key, scalarValue] of values) {
      const parts = key.split('.');
      if (parts[0] === 'locales' && parts[1] && !normalizeLocale(parts[1]))
        configError(
          `locale key ${JSON.stringify(parts[1])} must be a valid BCP-47-style locale`,
          scalarValue.keyLocation ?? scalarValue.location,
        );
    }
    if (!config.project.defaultLocale) configError('project.defaultLocale is required');
    if (!config.locales[config.project.defaultLocale])
      configError(
        'project.defaultLocale must reference a configured locale',
        rangeOnly(values.get('project.defaultLocale')?.location),
      );
  }
  const enums = {
    theme: ['classic', 'paper', 'terminal'],
    colorScheme: ['light', 'dark', 'system'],
    accent: ['indigo', 'blue', 'teal', 'green', 'amber', 'rose', 'violet'],
    density: ['compact', 'comfortable'],
    contentWidth: ['narrow', 'standard', 'wide'],
  };
  for (const key of Object.keys(enums) as (keyof typeof enums)[]) {
    if (!enums[key].includes(config.site[key]))
      configError(
        `invalid site.${key} value ${JSON.stringify(config.site[key])} (allowed: ${enums[key].join(', ')})`,
        rangeOnly(values.get(`site.${key}`)?.location),
      );
  }
  if (config.site.footer.url) {
    let safe = false;
    try {
      const url = new URL(config.site.footer.url);
      safe =
        url.protocol === 'https:' &&
        !!url.host &&
        !url.username &&
        !url.password &&
        !/[\r\n\t <>"']/.test(config.site.footer.url);
    } catch {
      /* Rejected below. */
    }
    if (!safe)
      configError(
        'site.footer.url must be a safe HTTPS URL',
        rangeOnly(values.get('site.footer.url')?.location),
      );
  }
  if (
    !['site', 'changes', 'documentationVersion', 'project', 'locales'].some((key) =>
      values.has(key),
    )
  )
    configError('root site map is missing', rangeAt(0));
  return config;
}

export function documentationVersionDiagnostic(
  config: SiteConfig,
): { code: string; message: string; migration?: string } | undefined {
  const version = config.documentationVersion;
  if (version < documentationVersion)
    return {
      code: 'DOCS_MIGRATION_REQUIRED',
      message: `Documentation version ${version} must be migrated to version ${documentationVersion}.`,
      migration: version === 2 ? 'v2-to-v3' : 'v1-to-v2',
    };
  if (version > documentationVersion)
    return {
      code: 'DOCUMENTATION_VERSION_UNSUPPORTED',
      message: `Documentation version ${version} is newer than supported version ${documentationVersion}; update Toudocu.`,
    };
  return undefined;
}
