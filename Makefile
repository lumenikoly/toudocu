BINARY := docu-docu
CMD := ./cmd/docu-docu
DIST := dist
DOCU_DOCU := go run $(CMD)
DOCS_DIR := docs
DEMO_DOCS_DIR := example/docs

.PHONY: fmt fmt-check vet test check build docs docs-serve demo demo-serve clean release

fmt:
	gofmt -w .

fmt-check:
	test -z "$$(gofmt -l .)"

vet:
	go vet ./...

test: vet
	go test ./...
	go test -race ./...

check: fmt-check test
	go mod verify
	$(DOCU_DOCU) check ./$(DOCS_DIR) --repository-root . --strict --stale-days 0
	$(DOCU_DOCU) check ./$(DEMO_DOCS_DIR) --repository-root ./example --strict --stale-days 0

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o $(BINARY) $(CMD)

docs:
	$(DOCU_DOCU) build ./$(DOCS_DIR) --output ./build/project-docs --repository-root . --clean

docs-serve:
	$(DOCU_DOCU) serve ./$(DOCS_DIR)

demo:
	rm -rf example/site
	$(DOCU_DOCU) build ./$(DEMO_DOCS_DIR) --output ./example/site --clean --stale-days 0

demo-serve:
	$(DOCU_DOCU) serve ./$(DEMO_DOCS_DIR)

release: check
	rm -rf $(DIST)
	mkdir -p $(DIST)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docu-docu-linux-amd64 $(CMD)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docu-docu-linux-arm64 $(CMD)
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docu-docu-darwin-amd64 $(CMD)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docu-docu-darwin-arm64 $(CMD)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docu-docu-windows-amd64.exe $(CMD)
	cp LICENSE $(DIST)/
	{ cat THIRD_PARTY_NOTICES.md; printf '\n\n# Embedded browser asset notices\n'; cat internal/app/assets/mermaid.LICENSE.txt; printf '\n\n'; cat internal/app/assets/codemirror.LICENSE.txt; } > $(DIST)/THIRD_PARTY_NOTICES.md
	cp internal/app/assets/codemirror.checksums.txt $(DIST)/CODEMIRROR-CHECKSUMS.txt
	cd $(DIST) && sha256sum * > checksums.txt

clean:
	rm -rf $(BINARY) $(DIST) example/site
