# SPDX-FileCopyrightText: Copyright Logically Magic Inc. <hello@logicallymagic.com>
# SPDX-FileCopyrightText: Copyright Hamid Jahanzad <Hamid@Jahanzad.com>
# SPDX-FileCopyrightText: Copyright Contributors to the Sentin8:Site-engine
# SPDX-License-Identifier: Apache-2.0

# Makefile — sentin8-site-engine (npm lib repo, RS §4.5)
#
# The docs-site engine shared by every vertical's *-site repo
# (@sentin8/site-engine: harvest.mjs, new-site.mjs, og-images.mjs,
# openapi-api-docs.mjs). Source-only pipeline code + its node test
# suite; no build artifacts beyond the scratch dirs.

SHELL := /bin/bash

.PHONY: help install test clean

help: ## Show this help
	@echo "sentin8-site-engine (@sentin8/site-engine npm lib)"
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## npm install
	@npm install

test: ## node --test suite
	@npm test

clean: ## Remove scratch/run dirs (.run .run/logs .tmp) — engine is source-only
	@rm -rf .run .run/logs .tmp