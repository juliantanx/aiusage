# Changelog

## [1.2.1] - 2026-05-22

- Add Node.js 18–24 compatibility and multi-version CI testing
- Add `pnpm rebuild:sqlite` script for native module recompile after switching Node versions
- Sync README (EN/ZH): Node version notes, rebuild docs, Hermes support
- Add automated Star History daily refresh workflow
- Add Release Patch workflow for one-click patch releases

---


## [1.1.1] - 2026-05-21

### Fixed
- UI layout no longer constrained to 1100px max-width, fixing empty right-side space on high-resolution/widescreen displays
- Docs page text constrained to 72ch max-width for readability on wide viewports
- `serve` command now handles occupied dev ports gracefully

### Changed
- CI npm auth rewritten to write token directly to `~/.npmrc` instead of relying on `setup-node` registry-url

---

## [1.1.0] - 2026-05-21

### Added
- Collapsible sidebar navigation with grouped sections (Analytics, Data, Manage) and icons
- In-app documentation page (`/docs`) with CLI reference and feature guides
- Token chart breakdown/total mode toggle — switch between per-type bars and a single combined bar
- Thinking tokens column added to the tokens detail table

### Fixed
- Nav active state now updates correctly on route change (replaced function call with direct `$page.url.pathname` binding)
- `thinkingTokens` null-guard to prevent NaN in token totals when field is absent
- Docs page TOC sticky offset on 701–800px viewports to clear the mobile header
- Docs page responsive breakpoint aligned to 800px (matched layout breakpoint)
- Sidebar collapse button tooltip now uses i18n (`nav.expand` / `nav.collapse`)

### Changed
- Nav home label renamed: Dashboard → Home / 仪表盘 → 首页
- README screenshots updated (dashboard, overview, token pages)

---

## [1.0.6] - 2026-05-17

### Changed
- Added package metadata (homepage, repository, keywords, license) to CLI package
- README screenshot served via jsDelivr CDN for access in China

---

## [1.0.5] - 2026-05-17

### Changed
- README screenshot compressed and re-exported as clean PNG
- README added to npm package files

---
