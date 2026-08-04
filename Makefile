BINARY := docgent
CMD := ./cmd/docgent
DIST := dist

.PHONY: fmt vet test build docs demo clean release

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
	go run $(CMD) build ./docs --output ./build/project-docs --repository-root . --clean

demo:
	rm -rf example/site
	go run $(CMD) build example/docs --output example/site --clean --stale-days 0

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
