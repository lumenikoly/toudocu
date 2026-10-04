import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { ToudocuError } from '@toudocu/contracts';
import {
  defaultSiteConfig,
  documentationVersion,
  parseSiteConfig,
  sectionTypes,
  type LocaleProfile,
  type SiteConfig,
} from '@toudocu/core';
import { isInside, PathPolicy, resolveForSafety } from './path-policy.js';

export interface LoadedConfig {
  config: SiteConfig;
  repositoryRoot: string;
  localeRoots: ReadonlyMap<string, string>;
  branding: ReadonlyMap<string, string>;
}

function fail(code: string, message: string): never {
  throw new ToudocuError(code, message, { path: '.toudocu/config.yml' });
}

/** Resolve only paths here: loading configuration never reads a translation tree. */
export async function loadSiteConfig(
  repositoryRoot: string,
  signal?: AbortSignal,
): Promise<LoadedConfig> {
  signal?.throwIfAborted();
  const policy = await PathPolicy.create(repositoryRoot, { allowHidden: true });
  signal?.throwIfAborted();
  let config: SiteConfig;
  try {
    const path = await policy.resolveFile('.toudocu/config.yml');
    config = parseSiteConfig(await readFile(path, { encoding: 'utf8', signal }));
  } catch (error) {
    if (!(error instanceof ToudocuError) || error.code !== 'file_not_found') throw error;
    config = defaultSiteConfig();
  }
  const localeRoots = new Map<string, string>();
  for (const [locale, profile] of Object.entries(config.locales)) {
    signal?.throwIfAborted();
    let root: string;
    try {
      root = await policy.resolveDirectory(profile.root, true);
    } catch (error) {
      if (config.documentationVersion !== documentationVersion) continue;
      throw new ToudocuError(
        'LOCALE_PROFILE_INVALID',
        `locales.${locale}.root: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    if (config.documentationVersion === documentationVersion) {
      for (const [otherLocale, otherRoot] of localeRoots) {
        if (isInside(root, otherRoot) || isInside(otherRoot, root))
          fail('LOCALE_ROOT_COLLISION', `locales.${locale} overlaps locales.${otherLocale}`);
      }
      if (Object.keys(profile.sections).length !== sectionTypes.length)
        fail(
          'LOCALE_PROFILE_INCOMPLETE',
          `locales.${locale}.sections must contain every built-in section`,
        );
    }
    localeRoots.set(locale, root);
  }
  const branding = new Map<string, string>();
  for (const [kind, configured] of Object.entries({
    logo: config.site.logo,
    favicon: config.site.favicon,
    hero: config.site.hero.image,
  })) {
    signal?.throwIfAborted();
    if (!configured) continue;
    if (!configured.startsWith('assets/'))
      fail('INVALID_CONFIG', `site.${kind} must be inside .toudocu/assets/`);
    const source = await policy.resolveFile(`.toudocu/${configured}`);
    branding.set(`assets/branding/${kind}${extname(source).toLowerCase() || '.bin'}`, source);
  }
  return { config, repositoryRoot: policy.root, localeRoots, branding };
}

export interface SelectedLocale {
  locale: string;
  profile: LocaleProfile | undefined;
  root: string;
  excludedRoots: readonly string[];
}

/** Select one tree; all peer roots remain excluded from discovery and context. */
export async function selectLocaleProfile(
  loaded: LoadedConfig,
  inputRoot: string,
): Promise<SelectedLocale> {
  const root = await resolveForSafety(inputRoot);
  const selected = [...loaded.localeRoots].find(([, candidate]) => candidate === root);
  if (!selected) {
    if (loaded.config.documentationVersion === documentationVersion)
      fail('LOCALE_ROOT_NOT_CONFIGURED', 'input root must match locales.<locale>.root');
    return {
      locale: '',
      profile: undefined,
      root,
      excludedRoots: [...loaded.localeRoots.values()],
    };
  }
  const [locale] = selected;
  const profile = loaded.config.locales[locale];
  if (!profile || sectionTypes.some((section) => !profile.sections[section]?.trim()))
    fail(
      'LOCALE_PROFILE_INCOMPLETE',
      `locales.${locale}.sections must contain every built-in section with a non-empty title`,
    );
  for (const [otherLocale, otherRoot] of loaded.localeRoots) {
    if (otherLocale !== locale && (isInside(root, otherRoot) || isInside(otherRoot, root)))
      fail('LOCALE_ROOT_COLLISION', `locales.${locale} overlaps locales.${otherLocale}`);
  }
  return {
    locale,
    profile,
    root,
    excludedRoots: [...loaded.localeRoots.values()].filter((candidate) => candidate !== root),
  };
}
