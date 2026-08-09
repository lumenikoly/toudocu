# Checking Toudocu changes

This guide defines a single local and CI cycle for the project's code and its
own documentation.

## Quick check

```bash
gofmt -w .
go vet ./...
go test ./...
go run ./cmd/toudocu check ./docs --strict --stale-days 0
```

## Full check

```bash
go test -count=1 ./...
go test -count=1 -race ./...
cd web
npm ci
npm run typecheck
npm test
npm run build
npm run test:browser
cd ..
go run ./cmd/toudocu build ./docs \
  --output ./build/project-docs \
  --repository-root . \
  --clean \
  --strict \
  --stale-days 0
```

To check Windows-specific process management from Unix:

```bash
GOOS=windows GOARCH=amd64 go test -c -o /tmp/toudocu-windows.test .
GOOS=windows GOARCH=amd64 go build -o /tmp/toudocu-windows.exe ./cmd/toudocu
```

## Test rules

- every new validation rule gets a behavioral test;
- every security fix gets a negative test;
- CLI JSON is checked by decoding it into the public report type;
- timeout behavior is checked with both a fake runner and a real child process;
- tests must not execute work-item commands through ordinary `check` or
  `build` operations;
- temporary outputs are created with `t.TempDir` or under `/tmp`;
- static browser smoke tests run over HTTP, including under a nested URL path;
  opening HTML directly from disk is not a test contract;
- CI rebuilds `internal/site/assets/generated/` and rejects any diff.

## Checking a documentation task

```bash
go run ./cmd/toudocu task context TASK-DOCS-001 ./docs --format json
go run ./cmd/toudocu task verify TASK-DOCS-001 ./docs --dry-run --format json
```

`task verify --run` executes commands from the document and must be used only
for a trusted task in the current repository.

## Readiness criterion

A change is ready when:

1. formatting produces no diff;
2. vet, ordinary tests, and race tests pass;
3. `toudocu check ./docs --strict` contains no warnings or errors;
4. the example and a minimal project with `index.md` and an architecture
   overview remain valid;
5. behavior and public contracts are reflected in the documentation.
