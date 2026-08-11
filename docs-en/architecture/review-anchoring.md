# Keeping comments attached to changing files

- Document type: Architecture
- Architectural question: How does a comment remain attached when its file changes?

Toudocu keeps the original anchor for every discussion and recalculates its
current position when the discussion is read. The browser sends only the
anchor kind and one-based Unicode coordinates. The Go process reads the
selected text, nearby context, and content hash from the validated file, so the
browser cannot substitute them.

## Original anchor

For `diff`, `fileRange`, and `file` anchors, Toudocu stores the original path,
the old or new side of the comparison, the range, selected text, up to 2 KiB of
context on each side, the content hash, and the repository version. It also
creates a content-addressed file snapshot. The snapshot is written only after a
comment is saved, is limited to 2 MiB, and lives in user state outside the
repository. A `global` anchor has no file snapshot.

## Finding the current position

After a file changes, the server tries these methods in order:

1. If the content hash is unchanged, keep the original coordinates.
2. If Git identifies an unambiguous rename, update the path and use Git's line
   map to move the range.
3. Look for the selected text within 20 lines of its previous position.
4. If there is no nearby match, accept a single exact match anywhere in the
   file.
5. Next, look for a unique pair of saved context blocks no more than 32 KiB
   apart.
6. Mark an ambiguous or changed anchor as `stale`, and an anchor whose file was
   removed as `deleted`.

The calculated position never replaces the original anchor. It is recalculated
against the current repository state on every read. The `changedPaths` list
returned by an agent is used only for the “View fix” link; Toudocu determines
whether a file actually changed from the current Git diff.

## Related documents

- [MOD-REVIEW](../modules/MOD-REVIEW.md)
- [FLOW-REVIEW-FEEDBACK](../flows/FLOW-REVIEW-FEEDBACK.md)
- [Changes HTTP API](../contracts/changes-http.md)
