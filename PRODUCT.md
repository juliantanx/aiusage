# Product

## Register

product

## Users

Individual developers and small teams who use AI coding assistants (Claude Code, Codex, OpenClaw, etc.) and want to understand their usage patterns and costs. They open this dashboard during work hours, glancing at a second monitor to check spending, compare tool efficiency, and track token consumption over time. They are technically literate, data-comfortable, and allergic to visual noise.

## Product Purpose

AIUsage aggregates session logs from multiple AI coding tools into a single dashboard. It tracks token consumption, costs, model usage, tool calls, sessions, and projects. The purpose is clarity: help developers make informed decisions about which AI tools to use, how much they cost, and where tokens are going. Success looks like a user opening the dashboard, getting an answer in under 5 seconds, and closing it.

## Brand Personality

**Precise, quiet, confident.**

The interface should feel like a well-made spreadsheet or a clean accounting tool, not a hacker terminal or a SaaS landing page. It respects the user's intelligence by presenting data without embellishment. No drama, no glow effects, no grain overlays. The data is interesting enough on its own.

## Anti-references

- **Terminal/dev-tool dark mode clichés**: grain textures, scan lines, glow effects, dot grids, monospace-everything. The current design falls into this trap.
- **SaaS dashboard clichés**: hero-metric cards with gradient accents, identical icon-card grids, glassmorphism.
- **Crypto/neon aesthetics**: dark backgrounds with neon accent glows.
- **Over-designed analytics tools**: too many colors, too many animations, too much visual hierarchy competing for attention.

## Design Principles

1. **Data first, chrome second.** Every pixel should help the user understand their data. If a visual element doesn't convey information, remove it.
2. **Boring is good.** Predictable patterns (consistent tables, uniform spacing, standard form controls) reduce cognitive load. Innovation belongs in data parsing, not in UI.
3. **Respect the glance.** The primary use case is a quick check. Key numbers should be readable within 2 seconds of page load.
4. **Earned density.** Pack information tightly where it matters (tables, stats) but breathe where it doesn't (page headers, section breaks).
5. **No false urgency.** No pulsing dots, no glowing numbers, no countdown timers. The data isn't going anywhere.

## Accessibility & Inclusion

- WCAG 2.1 AA compliance for color contrast and interactive elements.
- Support reduced motion preferences (prefers-reduced-motion).
- Maintain readability at 200% zoom.
- Keyboard navigation for all interactive elements.
