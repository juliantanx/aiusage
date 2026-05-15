# README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `README.md` so new users quickly understand aiusage, can get started in seconds, and see one current dashboard screenshot filtered to This Week on the Overview page.

**Architecture:** This change is a docs-and-assets update centered on `README.md` plus one screenshot asset stored in the repository. The implementation should preserve factual accuracy by verifying the running dashboard state before capture, then rewrite the README top-to-bottom with a clearer information hierarchy while keeping advanced sync and Docker sections intact.

**Tech Stack:** Markdown, GitHub-flavored Markdown, local aiusage web dashboard at `http://localhost:3847/`, repository assets, browser automation or screenshot tooling available in the session.

---

## File Structure

- Modify: `README.md` — rewrite the English README structure, top copy, quick start, screenshot section, and command presentation.
- Create: `docs/assets/readme/weekly-overview.png` — stable screenshot asset for the English README.
- Check for reference only: `README_zh.md` — do not modify in this plan.
- Check for reference only: `.gitignore` — only update if a temporary screenshot workflow creates a project-local transient directory that must be ignored.

---

### Task 1: Verify current README claims against the codebase

**Files:**
- Modify: none
- Check: `README.md`
- Check: `package.json`
- Check: `packages/cli/package.json`
- Check: `packages/cli/src`
- Check: `packages/web`

- [ ] **Step 1: Read the current README and list the sections that will be kept, condensed, or moved**

Capture notes for these areas:

```text
Keep and tighten:
- project intro
- quick start
- common CLI commands
- dashboard overview
- multi-machine sync
- Docker deployment

Condense:
- repeated serve/open instructions
- long explanatory text above onboarding
- overly detailed command descriptions near the top

Move lower in document:
- advanced scheduling details
- deep sync mechanics
- extended Docker operational notes
```

- [ ] **Step 2: Verify package name and install command still match published intent**

Run:

```bash
node -p "require('./packages/cli/package.json').name"
node -p "require('./packages/cli/package.json').version"
```

Expected:

```text
@juliantanx/aiusage
<current version string>
```

- [ ] **Step 3: Verify the CLI commands documented in README still exist**

Run:

```bash
node -e "const fs=require('fs'); const s=fs.readFileSync('./README.md','utf8'); console.log(s.includes('aiusage parse')); console.log(s.includes('aiusage serve')); console.log(s.includes('aiusage sync'));"
pnpm --filter @juliantanx/aiusage build
node ./packages/cli/dist/index.js --help
```

Expected:
- build succeeds
- help output includes the command set referenced by the README
- no command named in the rewritten top sections is missing from the CLI

- [ ] **Step 4: Record any factual corrections needed before rewriting**

Use a short checklist like this in your working notes:

```text
- install command confirmed
- serve URL confirmed
- parse/summary/status/serve/sync/export/clean/recalc/init confirmed
- no undocumented renamed commands discovered
```

- [ ] **Step 5: Commit the factual-verification checkpoint**

```bash
git add README.md docs/superpowers/plans/2026-05-16-readme-refresh.md
git commit -m "docs: capture readme refresh plan context"
```

If there are no staged changes because this plan file is not meant to be committed yet in your flow, skip the commit and continue. Do not create an empty commit.

---

### Task 2: Capture a clean weekly overview screenshot

**Files:**
- Create: `docs/assets/readme/weekly-overview.png`
- Check: `README.md`
- Check: running app at `http://localhost:3847/`

- [ ] **Step 1: Create the target asset directory if it does not exist**

Run:

```bash
mkdir -p ./docs/assets/readme
```

Expected:
- directory exists at `docs/assets/readme`

- [ ] **Step 2: Open the local dashboard and navigate to the Overview page**

Use browser automation to load:

```text
http://localhost:3847/
```

Expected visible state:

```text
- app loads successfully
- Overview page is selected
- summary cards and charts are visible
```

- [ ] **Step 3: Apply the time filter for This Week and wait for the dashboard to settle**

Use the UI filter controls only. Do not edit app code.

Expected visible state:

```text
- time range shows This Week
- Overview content updates to the filtered range
- no loading spinner or partial render remains
```

- [ ] **Step 4: Capture the screenshot into the repository asset path**

Save the screenshot exactly as:

```text
docs/assets/readme/weekly-overview.png
```

Expected result:
- one PNG file exists at that path
- the image is readable and clearly shows the Overview page with This Week selected

- [ ] **Step 5: Verify the asset file exists and looks reasonable**

Run:

```bash
ls -lh ./docs/assets/readme/weekly-overview.png
```

Expected:
- file exists
- file size is non-zero
- image dimensions are suitable for README display when previewed locally

- [ ] **Step 6: Commit the screenshot asset**

```bash
git add docs/assets/readme/weekly-overview.png
git commit -m "docs: add weekly dashboard screenshot"
```

If the screenshot needed to be re-captured, replace the file and then commit only the final image.

---

### Task 3: Rewrite the README top section and onboarding flow with TDD-style verification

**Files:**
- Modify: `README.md`
- Test: `README.md` preview and grep-based content verification

- [ ] **Step 1: Write the failing content expectations before editing**

Create a temporary checklist in your working notes with the required headings and order:

```text
Expected top order:
1. Title
2. One-sentence positioning
3. Language links
4. Core value section
5. Quick Start
6. Screenshot section
7. Common commands
```

Expected top messaging:
- mention tokens, cost, tool calls
- mention Claude Code, Codex, OpenClaw, OpenCode
- keep tone developer-facing and direct
```

This is the “failing test” for a docs task: define the exact structure before changing the file.

- [ ] **Step 2: Verify the current README does not yet satisfy the new top structure**

Run:

```bash
python - <<'PY'
from pathlib import Path
text = Path('README.md').read_text()
checks = [
    '## Why aiusage',
    '## Quick Start',
    '## Screenshot',
    '## Common Commands',
]
for item in checks:
    print(item, item in text)
PY
```

Expected:
- at least one of the required headings is missing or named differently
- this confirms the current README needs rewriting

- [ ] **Step 3: Rewrite the top half of `README.md` with the new structure**

Replace the top portion so it follows this content model:

```md
# aiusage

Track AI coding assistant usage, token consumption, cost, and tool calls in one place across Claude Code, Codex, OpenClaw, and OpenCode.

English | [中文](./README_zh.md)

## Why aiusage

- Aggregate local session logs from multiple AI coding assistants into one view.
- Analyze token usage, cost, model mix, and tool call activity.
- Explore the data through a local dashboard with weekly and monthly views.
- Sync usage data across multiple machines with GitHub, S3, or R2.

## Quick Start

**Prerequisites:** Node.js >= 18

```bash
npm install -g @juliantanx/aiusage
aiusage parse
aiusage serve
# Open http://localhost:3847
```

## Screenshot

![Weekly overview dashboard](./docs/assets/readme/weekly-overview.png)

Weekly overview of cost, tokens, active days, and tool usage across assistants.

## Common Commands
```

Continue the rest of the README with tighter wording while preserving accurate sync and Docker guidance.

- [ ] **Step 4: Run content verification against the edited README**

Run:

```bash
python - <<'PY'
from pathlib import Path
text = Path('README.md').read_text()
checks = {
    'Why section': '## Why aiusage' in text,
    'Quick Start': '## Quick Start' in text,
    'Screenshot section': '## Screenshot' in text,
    'Common Commands': '## Common Commands' in text,
    'Image reference': './docs/assets/readme/weekly-overview.png' in text,
    'Claude Code': 'Claude Code' in text,
    'Codex': 'Codex' in text,
    'OpenClaw': 'OpenClaw' in text,
    'OpenCode': 'OpenCode' in text,
}
for name, ok in checks.items():
    print(f'{name}: {ok}')
PY
```

Expected:
- every line prints `True`

- [ ] **Step 5: Commit the README structure rewrite**

```bash
git add README.md
git commit -m "docs: refresh readme structure and onboarding"
```

---

### Task 4: Tighten command, dashboard, sync, and Docker sections without changing product behavior

**Files:**
- Modify: `README.md`
- Check: `docs/sync-and-database.md`
- Check: `Dockerfile`

- [ ] **Step 1: Verify deployment and sync wording against current repo facts**

Run:

```bash
test -f ./Dockerfile && echo Dockerfile-present
test -f ./docs/sync-and-database.md && echo sync-doc-present
```

Expected:

```text
Dockerfile-present
sync-doc-present
```

- [ ] **Step 2: Rewrite the command section for scanability**

Use a concise table or grouped bullets that keep these commands visible near the top:

```md
| Command | Purpose |
| --- | --- |
| `aiusage parse` | Import newly appended local session data |
| `aiusage serve` | Start the local dashboard |
| `aiusage summary` | Print a usage summary in the terminal |
| `aiusage sync` | Push and pull data with a configured remote backend |
```

Then keep the broader command coverage below it if needed.

- [ ] **Step 3: Tighten the dashboard summary section without losing accuracy**

Use compact bullets like:

```md
- **Overview** — weekly or monthly totals, cost, active days, and per-tool breakdowns.
- **Tokens** — token usage trends over time.
- **Cost** — cost trends with by-tool and by-model breakdowns.
- **Models** — model share and distribution.
- **Tool Calls** — tool call frequency and ranking.
- **Sessions** — session browsing with filters and pagination.
```

- [ ] **Step 4: Keep sync and Docker sections, but move long operational details lower and reduce repetition**

Apply these constraints while editing:

```text
- preserve GitHub/S3/R2 options
- preserve device-partitioned file explanation if still accurate
- preserve Docker volume warning
- remove repeated “open http://localhost:3847” wording where it is redundant
- do not add any new product claims
```

- [ ] **Step 5: Verify important sections still exist after condensation**

Run:

```bash
python - <<'PY'
from pathlib import Path
text = Path('README.md').read_text()
checks = [
    '## Common Commands',
    '## Web Dashboard',
    '## Multi-Machine Sync',
    '## Docker Deployment',
]
for item in checks:
    print(item, item in text)
PY
```

Expected:
- all lines print `True`

- [ ] **Step 6: Commit the deeper README cleanup**

```bash
git add README.md
git commit -m "docs: tighten readme product details"
```

---

### Task 5: Final verification of markdown rendering and asset references

**Files:**
- Modify: `README.md` only if verification reveals issues
- Check: `docs/assets/readme/weekly-overview.png`

- [ ] **Step 1: Run a final structural verification pass**

Run:

```bash
python - <<'PY'
from pathlib import Path
text = Path('README.md').read_text()
required = [
    '# aiusage',
    '## Why aiusage',
    '## Quick Start',
    '## Screenshot',
    '## Common Commands',
    '## Web Dashboard',
    '## Multi-Machine Sync',
    '## Docker Deployment',
    './docs/assets/readme/weekly-overview.png',
]
missing = [item for item in required if item not in text]
print('MISSING:', missing)
PY
```

Expected:

```text
MISSING: []
```

- [ ] **Step 2: Verify the image path resolves from the repository root**

Run:

```bash
test -f ./docs/assets/readme/weekly-overview.png && echo image-present
```

Expected:

```text
image-present
```

- [ ] **Step 3: Preview the README locally and inspect for layout issues**

Use your available local preview path or GitHub preview equivalent. At minimum, inspect for:

```text
- image renders
- heading order is correct
- code fences are balanced
- no broken markdown tables
- no duplicated sections accidentally left behind
```

- [ ] **Step 4: Fix any preview issues and rerun the verification commands**

If fixes are needed, rerun:

```bash
python - <<'PY'
from pathlib import Path
text = Path('README.md').read_text()
print(text.count('```') % 2 == 0)
PY
```

Expected:

```text
True
```

- [ ] **Step 5: Commit the verified final README polish**

```bash
git add README.md docs/assets/readme/weekly-overview.png
git commit -m "docs: finalize readme refresh"
```

---

## Self-Review

### Spec coverage
- full README refresh: covered by Tasks 3, 4, and 5
- balanced presentation style: covered by Task 3 structure and Task 4 tightening
- one screenshot from local app: covered by Task 2
- screenshot filtered to This Week: covered by Task 2 Step 3
- screenshot focused on Overview page: covered by Task 2 Steps 2-4
- preserve advanced sync and Docker guidance lower in doc: covered by Task 4

### Placeholder scan
- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Commands, paths, headings, and asset location are explicit.
- Verification commands are concrete.

### Type consistency
- Asset path is consistently `docs/assets/readme/weekly-overview.png`.
- Section names are consistently `Why aiusage`, `Quick Start`, `Screenshot`, `Common Commands`, `Web Dashboard`, `Multi-Machine Sync`, and `Docker Deployment`.

### Gap check
- No uncovered spec items found.
