import type { CompiledProject, SiteConfig } from '@toudocu/core';
import { PortalAppearanceV1Schema, type PortalAppearanceV1 } from '@toudocu/contracts';
import { buildPortalSnapshot, type PortalMapperOptions } from '@toudocu/portal';

const defaultAppearance: PortalAppearanceV1 = {
  theme: 'classic',
  colorScheme: 'system',
  accent: 'indigo',
  density: 'comfortable',
  logo: '',
  artwork: '',
};

function siteAppearance(site: SiteConfig['site'], assets: readonly string[]): PortalAppearanceV1 {
  return PortalAppearanceV1Schema.parse({
    theme: site.theme || defaultAppearance.theme,
    colorScheme: site.colorScheme || defaultAppearance.colorScheme,
    accent: site.accent || defaultAppearance.accent,
    density: site.density || defaultAppearance.density,
    logo: assets.find((path) => path.startsWith('assets/branding/logo.')) ?? defaultAppearance.logo,
    artwork:
      site.hero.enabled && assets.find((path) => path.startsWith('assets/branding/hero.'))
        ? assets.find((path) => path.startsWith('assets/branding/hero.'))
        : defaultAppearance.artwork,
  });
}

export function createPortalSnapshot(
  project: CompiledProject & { config?: SiteConfig; branding?: ReadonlyMap<string, string> },
  options: PortalMapperOptions,
) {
  const site = project.config?.site;
  const assets = [...(project.branding?.keys() ?? [])];
  return buildPortalSnapshot(project, {
    ...(site
      ? {
          title: site.title,
          appearance: siteAppearance(site, assets),
        }
      : {}),
    ...options,
  });
}
