# Project Skills Orchestrator Project Guide

Generated from a complete repository scan. This guide describes the project in which the generator runs.

## Purpose

Turn any repository into a governed GitHub Copilot workspace: agent instructions, scoped standards, reusable prompts, specialist agents, and 43 governed skills — installed consistently, verified after every run, and safe to rerun.

## Architecture

- **.azure**: Top-level project boundary containing 1 scanned files.
- **.github**: Top-level project boundary containing 62 scanned files.
- **.vscode**: Top-level project boundary containing 2 scanned files.
- **Demo**: Top-level project boundary containing 3 scanned files.
- **config**: Top-level project boundary containing 3 scanned files.
- **docs**: Top-level project boundary containing 4 scanned files.
- **release**: Top-level project boundary containing 1 scanned files.
- **reports**: Top-level project boundary containing 54 scanned files.
- **schemas**: Top-level project boundary containing 37 scanned files.
- **scripts**: Top-level project boundary containing 10 scanned files.
- **templates**: Top-level project boundary containing 34 scanned files.
- **tests**: Top-level project boundary containing 9 scanned files.

## Technology

- **.md**: 97 scanned files use this extension.
- **.json**: 70 scanned files use this extension.
- **.mjs**: 23 scanned files use this extension.
- **.mp3**: 11 scanned files use this extension.
- **.ps1**: 9 scanned files use this extension.
- **.svg**: 8 scanned files use this extension.
- **.yml**: 3 scanned files use this extension.
- **.yaml**: 2 scanned files use this extension.
- **.html**: 2 scanned files use this extension.
- **.bicep**: 1 scanned files use this extension.

## Setup And Usage

- **npm run check**: node --check pso.mjs && npm run security && npm run release && npm run release:verify:candidate && node --test tests/skill-contracts.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs && node pso.mjs verify
- **npm run evidence:adoption**: node scripts/adoption-evidence.mjs
- **npm run inventory**: node pso.mjs inventory --root .
- **npm run release**: node scripts/build-release.mjs
- **npm run release:status**: node scripts/release-status.mjs
- **npm run release:verify**: node scripts/verify-release.mjs
- **npm run release:verify:candidate**: node scripts/verify-release.mjs --candidate
- **npm run security**: node scripts/security-check.mjs
- **npm run test**: node --test tests/skill-contracts.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs
- **npm run verify**: node pso.mjs verify

## Capabilities

- **Governed skill workflows**: 42 installed skills provide bounded project actions.
- **Reusable prompt workflows**: 10 prompt files provide user-invoked workflows.
- **Machine-readable contracts**: Schemas validate governed plans, reports, and runtime evidence.
- **Automated validation**: Repository tests protect contracts and implementation behavior.

## Validation

- **npm run check**: node --check pso.mjs && npm run security && npm run release && npm run release:verify:candidate && node --test tests/skill-contracts.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs && node pso.mjs verify
- **npm run release:verify**: node scripts/verify-release.mjs
- **npm run release:verify:candidate**: node scripts/verify-release.mjs --candidate
- **npm run security**: node scripts/security-check.mjs
- **npm run test**: node --test tests/skill-contracts.test.mjs tests/adoption-rerun.test.mjs tests/security-fuzz.test.mjs tests/production-gates.test.mjs tests/package-install.test.mjs tests/project-understanding.test.mjs tests/documentation-builder.test.mjs tests/project-status.test.mjs tests/project-video.test.mjs
- **npm run verify**: node pso.mjs verify

## Limitations

- No explicit limitations were discovered by Project Understanding.

## Evidence

The companion report at `reports/project-guide.json` contains 42 claims bound to the Project Understanding digests used for this guide.
