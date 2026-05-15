# README Refresh Design

Date: 2026-05-16
Project: aiusage
Scope: Refresh the English README to improve first-visit clarity, tighten the top-level narrative, and add a current product screenshot captured from the local dashboard.

## Goal

Update `README.md` so a new visitor can understand what aiusage does, install it quickly, and immediately see the value of the dashboard.

This refresh should:
- explain the project value earlier and more clearly
- keep the shortest path to first use highly visible
- add one polished screenshot from the dashboard using the **This Week** filter
- retain advanced operational guidance for sync and Docker without overwhelming the top of the page

## Non-Goals

This work does not include:
- changing product behavior
- redesigning the web app UI
- adding new CLI commands
- rewriting `README_zh.md` as part of the same change unless explicitly requested later
- changing deployment or sync mechanics

## User Intent

The user wants a full README refresh, not a minimal patch. They specifically want:
- the README structure and copy improved end-to-end
- the presentation style to be balanced, not overly marketing-heavy and not purely reference-doc style
- one application screenshot taken from `http://localhost:3847/`
- that screenshot to show the dashboard filtered to **This Week**
- the screenshot to emphasize the **Overview** page

## Current State Summary

The existing `README.md` already contains strong factual content, including:
- supported tools
- quick start commands
- dashboard sections
- multi-machine sync setup
- Docker deployment details

However, the current structure is documentation-first and places a large amount of operational detail early. This makes the page informative but less effective as a landing page for new visitors.

## Recommended Approach

Adopt a balanced landing-page-plus-docs structure:
1. explain value immediately
2. preserve a very short quick-start path
3. show a current screenshot as proof of usefulness
4. keep detailed CLI, sync, and deployment guidance below the fold

This approach is preferred over a minimal screenshot-only patch because the user asked for a complete README refresh.

## Alternatives Considered

### Option A — Minimal patch
Only add a screenshot and lightly edit copy.

Why not chosen:
- does not satisfy the user’s request for a full README cleanup
- preserves the current information hierarchy issues

### Option B — Balanced refresh (recommended)
Reorganize top-level sections, tighten wording, and add one screenshot.

Why chosen:
- improves first impression without sacrificing technical clarity
- fits a hybrid CLI + dashboard project
- keeps advanced docs available without front-loading them

### Option C — Product-style landing page
Heavily emphasize polished presentation, visual hierarchy, and use cases while reducing reference content.

Why not chosen:
- makes command discovery worse for developers
- does not match the user’s requested tone

## Information Architecture

The refreshed English README should use this order:

1. **Title + one-sentence positioning**
   - State that aiusage tracks AI coding assistant usage, tokens, cost, and tool calls in one place.
   - Explicitly mention support for Claude Code, Codex, OpenClaw, and OpenCode.

2. **Core value / why aiusage**
   - A short bullet list explaining why someone would use it.
   - Focus on unified ingestion, cost visibility, usage breakdowns, and multi-device aggregation.

3. **Quick Start**
   - Keep this short and runnable.
   - Include install, parse, serve, and the dashboard URL.

4. **Screenshot**
   - Insert one image showing the dashboard with the **This Week** filter applied.
   - Prefer the **Overview** view.
   - Add a short caption describing what the screenshot illustrates.

5. **Common commands**
   - Present the most important commands first.
   - Optimize for scanning rather than exhaustive explanation at the top.

6. **Dashboard overview**
   - Summarize what each dashboard section is for.
   - Keep it concise.

7. **Multi-machine sync**
   - Preserve the setup steps and architecture explanation.
   - Keep it below the basic onboarding sections.

8. **Docker deployment**
   - Preserve container usage and persistent volume guidance.

9. **Deeper operational details**
   - Keep advanced scheduling and sync behavior explanations where useful, but avoid pushing them above first-use content.

## Copy Style

The README should use a restrained developer-facing tone:
- clear and direct
- no exaggerated marketing language
- short paragraphs and scan-friendly bullets
- lead with practical value, not slogans

The top positioning copy should communicate:
- what the tool tracks
- that it works across multiple assistants
- that it combines CLI ingestion with a local dashboard

## Screenshot Design Requirements

The screenshot must:
- come from the local app at `http://localhost:3847/`
- use the dashboard filtered to **This Week**
- prioritize the **Overview** page
- look clean enough for README display
- be saved into the repository in a stable assets location appropriate for README image references

The screenshot should visually support these points:
- aiusage provides an at-a-glance weekly summary
- multiple dimensions are visible in one place, such as cost, tokens, activity, and tool distribution
- the product is already real and usable, not conceptual

## Asset Placement

Store the screenshot in a repository asset path that is suitable for Markdown references and future additions, such as a dedicated README assets folder if one already exists or a new small, focused asset directory if needed.

The path should be chosen to keep README media organized and stable.

## Detailed Content Changes

### Top section
Replace the current intro block with:
- a clearer one-line positioning statement
- a shorter, sharper feature/value summary
- better spacing between value explanation and setup

### Features / core value
Refocus feature bullets around outcomes:
- unified tracking across assistants
- token and cost analysis
- tool usage insights
- local dashboard exploration
- optional multi-device sync

### Quick Start
Keep the current basic command flow, but simplify surrounding wording so the install-to-dashboard path is obvious.

### Commands section
Convert the command documentation into a more readable hierarchy:
- common commands first
- full command coverage still available, but visually less dominant than onboarding

### Web dashboard section
Keep the existing explanation of the first-load refresh behavior if it remains accurate, but make it shorter and easier to scan.

### Deployment sections
Preserve the factual detail in the sync and Docker sections because they are valuable and already substantially complete. Reorder and lightly edit for clarity rather than rewriting from scratch.

## Error Handling and Validation

Because this is a documentation update, the main correctness requirement is factual accuracy.

Before finalizing implementation:
- verify that every command shown still exists
- verify that the local dashboard screenshot matches the documented URL and visible filters
- avoid documenting behaviors that are not present in the current product

## Testing and Verification

Implementation will be considered complete only after:
- `README.md` renders correctly as Markdown
- image paths resolve correctly from the repository root
- the screenshot is present at the referenced location
- commands and section names match the current product
- copy stays consistent with the real behavior of parse, serve, sync, and dashboard navigation

## Scope Boundaries

This is a content-and-assets change focused on `README.md` and the associated screenshot.

It may involve creating one image asset file and possibly one small asset directory if the repository does not already have an appropriate location.

It should not trigger unrelated refactors or product changes.

## Open Decisions Resolved

The following choices have already been confirmed with the user:
- update scope: full README refresh
- style: balanced between product presentation and developer documentation
- screenshot count: one screenshot
- screenshot time filter: This Week
- screenshot focus: Overview page

## Implementation Readiness

This design is specific enough to move into implementation planning next. The next phase should break the work into:
1. capturing the screenshot from the running local dashboard
2. deciding the final asset path
3. rewriting the README top section and overall structure
4. verifying Markdown rendering and factual accuracy
