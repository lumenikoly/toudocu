import type { CompiledProject } from '@toudocu/core';
import { buildPortalSnapshot, type PortalMapperOptions } from '@toudocu/portal';

export function createPortalSnapshot(project: CompiledProject, options: PortalMapperOptions) {
  return buildPortalSnapshot(project, options);
}
