# Checking Docu-docu changes

The manual sets a single local and CI cycle for the code and its own
project documentation.

## Quick check

```bash
gofmt -w .
go vet ./...
go test ./...
go run ./cmd/docu-docu check ./docs --strict --stale-days 0
```

## Full check

```bash
go test -count=1 ./...
go test -count=1 -race ./...
go run ./cmd/docu-docu build ./docs \
  --output ./build/project-docs \
  --repository-root . \
  --clean \
  --strict \
  --stale-days 0
```

To check Windows-specific process management from Unix:

```bash
GOOS=windows GOARCH=amd64 go test -c -o /tmp/docu-docu-windows.test .
GOOS=windows GOARCH=amd64 go build -o /tmp/docu-docu-windows.exe ./cmd/docu-docu
```

## Test rules

- the new validation rule receives a behavioral test;
- a security fix receives a negative test;
- CLI JSON is verified by decoding into a public report type;
- timeout is checked not only by the fake runner, but also by the real child process;
- the test should not execute work item commands through regular `check` or `build`;
- temporary outputs are created via `t.TempDir` or `/tmp`.

## Checking a documentation task

```bash
go run ./cmd/docu-docu task context TASK-DOCS-001 ./docs --format json
go run ./cmd/docu-docu task verify TASK-DOCS-001 ./docs --dry-run --format json
```

`task verify --run` runs commands from the document and should only be used for
trusted task of the current repository.

## Readiness criterion

The change is ready when:

1. formatting does not create diff;
2. vet, regular and race tests are carried out;
3. `docu-docu check ./docs --strict` does not contain warnings and errors;
4. example and minimal project with `index.md` and architecture overview remain
   valid;
5. behavior and public contracts are reflected in the documentation.