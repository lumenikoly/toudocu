import { ServeInstanceIdentityV1Schema, type ProjectWorkspaceV1 } from '@toudocu/contracts';

/** Prove that this client can reach this instance before opening a direct URL.
 * A remote agent's localhost may resolve to an unrelated server on the client.
 */
export async function reachableWorkspace(workspace: ProjectWorkspaceV1): Promise<boolean> {
  try {
    const response = await fetch(new URL('/_toudocu/api/instance', workspace.url), {
      signal: AbortSignal.timeout(1000),
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const identity = ServeInstanceIdentityV1Schema.parse(await response.json());
    return (
      identity.instanceId === workspace.instanceId &&
      identity.projectRoot === workspace.projectRoot &&
      identity.documentationRoot === workspace.documentationRoot
    );
  } catch {
    return false;
  }
}
