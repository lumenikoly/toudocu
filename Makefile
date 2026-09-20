PNPM ?= pnpm
NODE ?= node
BINARY := toudocu
INSTALL_DIR ?= $(HOME)/.local/bin
TOUDOCU := $(NODE) apps/cli/dist/main.js
TOUDOCU_ENTRYPOINT := $(abspath apps/cli/dist/main.js)

.PHONY: install dev fmt format lint typecheck test browser-test check build update-local docs docs-serve clean

install:
	CI=true $(PNPM) install --frozen-lockfile

dev fmt format lint typecheck test browser-test check build: install

dev:
	$(PNPM) dev

fmt format:
	$(PNPM) format

lint:
	$(PNPM) lint

typecheck:
	$(PNPM) typecheck

test:
	$(PNPM) test

browser-test:
	$(PNPM) test:browser

check:
	$(PNPM) check

build:
	$(PNPM) build

update-local: build
	install -d "$(INSTALL_DIR)"
	printf '%s\n' '#!/bin/sh' 'exec $(NODE) "$(TOUDOCU_ENTRYPOINT)" "$$@"' > "$(INSTALL_DIR)/.$(BINARY).new"
	chmod 755 "$(INSTALL_DIR)/.$(BINARY).new"
	mv -f "$(INSTALL_DIR)/.$(BINARY).new" "$(INSTALL_DIR)/$(BINARY)"
	"$(INSTALL_DIR)/$(BINARY)" version

docs: build
	$(TOUDOCU) build ./docs --output ./build/project-docs --repository-root . --clean

docs-serve: build
	$(TOUDOCU) serve ./docs --repository-root . --no-open

clean:
	rm -rf ./build ./dist ./apps/cli/dist ./apps/web/dist ./packages/*/dist
