BINARY := docgent
CMD := ./cmd/docgent
DIST := dist
DOCGENT := go run $(CMD)
DOCS_DIR := docs
DEMO_DOCS_DIR := example/docs

.PHONY: fmt vet test build docs docs-serve demo demo-serve clean release

fmt:
	gofmt -w .

vet:
	go vet ./...

test: vet
	go test ./...
	go test -race ./...

build:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o $(BINARY) $(CMD)

docs:
	$(DOCGENT) build ./$(DOCS_DIR) --output ./build/project-docs --repository-root . --clean

docs-serve:
	$(DOCGENT) serve ./$(DOCS_DIR)

demo:
	rm -rf example/site
	$(DOCGENT) build ./$(DEMO_DOCS_DIR) --output ./example/site --clean --stale-days 0

demo-serve:
	$(DOCGENT) serve ./$(DEMO_DOCS_DIR)

release: test
	rm -rf $(DIST)
	mkdir -p $(DIST)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docgent-linux-amd64 $(CMD)
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docgent-linux-arm64 $(CMD)
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docgent-darwin-amd64 $(CMD)
	CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docgent-darwin-arm64 $(CMD)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o $(DIST)/docgent-windows-amd64.exe $(CMD)
	cp LICENSE THIRD_PARTY_NOTICES.md $(DIST)/
	cp assets/mermaid.LICENSE.txt $(DIST)/MERMAID-LICENSE.txt
	cd $(DIST) && sha256sum * > checksums.txt

clean:
	rm -rf $(BINARY) $(DIST) example/site
