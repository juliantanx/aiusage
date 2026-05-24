# README Conversion Optimization Design for aiusage

Date: 2026-05-25

## Goal

Improve the repository homepage conversion rate from visitor to star/user by restructuring `README.md` and `README_zh.md` so they read like a strong developer-tool landing page rather than a long reference document.

The redesign should keep the project technically credible and local-first in tone, while making value, compatibility, and quick-start payoff easier to understand in the first screen and first scroll.

## Scope

In scope:
- Reorganize the top and middle sections of `README.md`
- Mirror the same structure and messaging in `README_zh.md`
- Strengthen value proposition, onboarding flow, and star conversion
- Add concise conversion-focused sections before the deep reference material

Out of scope:
- New product features
- README GIF generation
- Benchmark claims or unverified comparison claims
- Marketing-heavy copy that feels non-technical
- Commit/push/release strategy changes beyond documenting and committing current work

## Recommended Approach

Use a balanced README redesign:
- More structured than the current README
- More conversion-oriented than pure docs
- Less aggressive than a marketing landing page

This is the best fit because `aiusage` is a developer tool. Developer audiences respond well to clarity, fast proof of value, compatibility, and strong onboarding, but can be turned off by exaggerated marketing language.

## Alternatives Considered

### Option A: Minimal top-of-page polish
Only improve title, subtitle, install command, and star CTA.

Pros:
- Low risk
- Very fast to implement

Cons:
- Leaves the rest of the README doc-heavy
- Limited impact on conversion once users scroll

### Option B: Medium-depth information architecture redesign
Restructure README into landing-page-style sections before the long technical reference.

Pros:
- Strong conversion improvement
- Keeps technical credibility
- Works well for both GitHub visitors and real users

Cons:
- Moderate rewrite effort
- Requires carefully mirroring Chinese README

### Option C: Full growth-style README
Add comparisons, stronger CTAs, persuasive framing, and more sales-like structure.

Pros:
- Highest possible conversion upside

Cons:
- Higher risk of sounding over-marketed
- Less aligned with open-source developer tooling tone

## Decision

Adopt Option B.

## Design Principles

1. **Value first** — users should understand what the tool does within seconds.
2. **Proof early** — supported tools, screenshots, and workflow should appear before long technical reference sections.
3. **Fast onboarding** — installation and 3-step usage should be visually obvious.
4. **Technical credibility** — stay specific, avoid hype, avoid unverifiable claims.
5. **Local-first trust** — preserve privacy/local-first framing because that is part of the product’s differentiation.
6. **Bilingual consistency** — English and Chinese README structure should stay aligned.

## Target README Structure

### 1. Hero / first screen
Contents:
- Existing badges
- Project title
- Sharper one-sentence value proposition
- Short supporting paragraph
- Install command block
- 2-command or 3-step quick-start snippet
- Small star CTA line

Purpose:
- Convert a visitor who lands from GitHub search, social shares, or topic pages
- Reduce the time needed to understand why this repo matters

### 2. Why aiusage
Rewrite the current section so it emphasizes pains solved, not just capabilities.

Key points:
- AI coding assistant usage is fragmented across tools and machines
- Cost/token visibility is poor by default
- `aiusage` gives one local dashboard for usage, cost, model mix, and tool activity
- Sync is optional, not required

### 3. Who it’s for
Add a small audience-fit section.

Examples:
- Developers using Claude Code or Codex daily
- Multi-tool AI coding assistant users
- People who want to track cost/token usage over time
- Teams or individuals working across multiple machines

Purpose:
- Helps visitors self-qualify quickly
- Increases the chance they star because they immediately recognize themselves

### 4. Supported tools
Promote compatibility into its own section near the top.

List:
- Claude Code
- Codex
- OpenClaw
- OpenCode
- Hermes
- Qoder

Purpose:
- Compatibility is one of the repo’s strongest discovery hooks
- Visitors should not need to scan paragraphs to confirm support

### 5. 3-step quick start
Refactor onboarding into a stronger section.

Recommended flow:
1. Install
2. Parse local session logs
3. Start the dashboard

Purpose:
- Make first value obvious
- Reduce friction for trial

### 6. Screenshots / demo
Keep screenshots high in the document.

Later enhancement path:
- Leave room for a GIF/demo section, but do not fabricate one now

Purpose:
- Visual proof increases trust and helps GitHub visitors understand the dashboard instantly

### 7. Key use cases
Add concise use cases before the long CLI reference.

Examples:
- Track token and cost trends
- Compare model usage across assistants
- Inspect tool-call activity
- Aggregate data across multiple devices
- Run a persistent dashboard via Docker

Purpose:
- Connect features to real outcomes

### 8. Deep technical sections
Keep and largely preserve:
- CLI Reference
- Web Dashboard
- Deployment
- Data Storage
- Database Visualization
- Tech Stack
- Project Structure

But these should appear after the conversion-oriented sections.

### 9. FAQ
Add a compact FAQ before Contributing/License.

Candidate questions:
- Does aiusage upload my data?
- Can I use it on multiple machines?
- Does it support automatic syncing?
- Which assistants are supported?
- Can I inspect the SQLite database directly?

Purpose:
- Remove trust/friction blockers
- Reduce the need to search the long document for common answers

### 10. Footer sections
Keep:
- Friends
- Star History
- Contributing
- License

## Copy Strategy

### Tone
- Professional
- Concrete
- Technical
- Concise
- Trustworthy

### Avoid
- Empty marketing language
- “Best”, “ultimate”, or unverifiable superiority claims
- Artificial urgency
- Excessive CTA repetition

### Use
- Specific nouns and outcomes
- Clear verbs like track, analyze, inspect, sync, aggregate
- Short paragraphs and scannable bullets

## Chinese README Strategy

`README_zh.md` should mirror the English README structure closely rather than drifting into a different information architecture.

Requirements:
- Match section order where possible
- Preserve meaning, not word-for-word phrasing
- Keep onboarding and trust messaging equivalent

## Risks and Mitigations

### Risk: README becomes too long at the top
Mitigation:
- Keep early sections concise
- Use small bullets instead of large paragraphs
- Push deeper reference content below the conversion sections

### Risk: README feels too sales-like
Mitigation:
- Keep all claims factual
- Preserve technical specificity
- Avoid comparison tables unless explicitly grounded in real evidence

### Risk: English and Chinese versions drift
Mitigation:
- Update both in the same pass
- Use the same heading structure

## Testing / Validation

Validation after implementation should check:
- First screen clearly explains value within seconds
- Supported tools are easy to find
- Quick-start commands are prominent and accurate
- Deep reference sections remain intact
- English and Chinese structures remain aligned
- README still reads like open-source developer docs, not ad copy

## Success Criteria

The redesign is successful if:
- A GitHub visitor can understand the project’s value proposition from the first screen
- Compatibility and quick start are obvious without scrolling far
- The README feels easier to skim
- The project looks more mature and trustworthy to potential users/stargazers
- The technical reference remains complete and usable

## Planned Implementation Boundaries

When editing the README files, do not:
- Introduce unsupported claims
- Remove important technical content from the lower sections
- Add fake metrics, testimonials, or comparisons
- Change product behavior to fit copy
