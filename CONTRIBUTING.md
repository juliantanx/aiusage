# Contributing to aiusage

Thanks for your interest in contributing! This document explains how to get involved.

## Getting Started

```bash
git clone https://github.com/juliantanx/aiusage.git
cd aiusage
pnpm install
pnpm build
```

## Development

```bash
# Start in dev mode (builds core + web, then runs CLI dev server)
pnpm dev

# Run tests
pnpm test

# Lint
pnpm lint
```

## Project Structure

```text
packages/
  core/     - Shared types, database schema, pricing data
  cli/      - CLI tool for parsing logs, querying data, sync
  web/      - SvelteKit web dashboard (SPA)
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `pnpm test`
5. Commit with a clear message following [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add new feature
   fix: resolve bug
   docs: update documentation
   ```
6. Push to your fork and open a Pull Request

## Reporting Bugs

Use the [Bug Report](https://github.com/juliantanx/aiusage/issues/new?template=bug_report.md) template. Include:

- Steps to reproduce
- Expected vs actual behavior
- OS, Node.js version, aiusage version (`aiusage status`)

## Feature Requests

Use the [Feature Request](https://github.com/juliantanx/aiusage/issues/new?template=feature_request.md) template. Describe the use case and why it matters.

## Questions?

Open a [Discussion](https://github.com/juliantanx/aiusage/discussions) or check the existing issues.
