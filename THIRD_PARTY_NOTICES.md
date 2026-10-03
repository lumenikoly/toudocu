# Third-party notices

Toudocu is licensed under Apache-2.0. Runtime dependencies retain their own
licenses and copyright notices.

Every release archive contains a generated `THIRD_PARTY_NOTICES.md`. The release
builder derives it from `pnpm-lock.yaml` and the deployed production dependency
graph, then includes the detected upstream license text for each shipped package.
Development-only dependencies are not part of that release inventory.

The authoritative dependency versions are pinned in `pnpm-lock.yaml`. Run the
release packaging command to produce the complete notices for a specific
artifact.
