# Design

## Theme

Light. A developer at their desk on a Tuesday afternoon, glancing at their second monitor to check Claude Code spending this week. Standard office lighting. Light theme provides better contrast for dense numerical data during daytime use.

Dark theme exists as a secondary option but is not the default.

## Color

**Strategy:** Restrained. Tinted neutrals + one accent used sparingly.

### OKLCH Palette

**Accent:** oklch(0.55 0.12 175) — a teal that reads as "interactive" without being SaaS blue.

**Neutrals** (tinted toward the accent hue, chroma ~0.008):
- --color-bg: oklch(0.985 0.004 175)
- --color-surface: oklch(0.995 0.003 175)
- --color-raised: oklch(0.97 0.006 175)
- --color-hover: oklch(0.955 0.008 175)
- --color-border-subtle: oklch(0.92 0.008 175)
- --color-border-medium: oklch(0.87 0.01 175)
- --color-text: oklch(0.18 0.012 175)
- --color-text-secondary: oklch(0.42 0.015 175)
- --color-text-muted: oklch(0.6 0.012 175)

**Semantic:**
- --color-success: oklch(0.62 0.17 155)
- --color-error: oklch(0.58 0.2 25)
- --color-info: oklch(0.55 0.14 250)

**Chart palette** (for data visualization, full palette strategy):
- Input: oklch(0.65 0.14 175)
- Output: oklch(0.6 0.15 250)
- Cache Read: oklch(0.7 0.1 65)
- Cache Write: oklch(0.65 0.12 310)
- Thinking: oklch(0.6 0.16 300)

## Typography

**UI font:** Inter (Google Fonts). Wide apertures, excellent readability at all sizes. Used for all interface text.

**Mono font:** Geist Mono (Vercel, open source). Used for numbers, data values, code, and technical labels. Excellent tabular figure support.

**Base size:** html font-size 18px (1rem = 18px). Optimized for comfortable reading.

**Scale:**
- Display: 2rem / 700 weight / -0.02em tracking
- H1: 1.375rem / 600 weight / -0.01em tracking
- H2: 1rem / 600 weight
- Body: 0.875rem / 400 weight / 1.5 line-height
- Small: 0.8125rem / 400 weight
- Label: 0.75rem / 550 weight / 0.04em tracking / uppercase
- Micro: 0.6875rem / 550 weight / 0.06em tracking / uppercase

**Data values:** Geist Mono, tabular-nums, 0.8125rem base.

## Layout

**Sidebar:** 240px fixed, collapsible to 56px. White background, no border-right (use shadow on main area instead for depth separation).

**Content area:** padding 2rem 2.5rem. Max-width not enforced (the data needs space).

**Spacing scale:** 4px base unit. Use 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.

**Cards:** No borders. Use background color difference (--color-raised) and border-radius 8px for visual separation. No hover border transitions.

**Tables:** Compact (8px 12px cell padding). Header row uses label typography. Alternating row backgrounds are lazy; use hover-only highlight.

## Motion

- Page transitions: fade only, 200ms, ease-out-quart. No translate.
- Data loading: no skeleton screens, no spinners with glow. Simple opacity transition.
- Chart bars: height transition 400ms, ease-out-quart. Stagger by 30ms per bar.
- Prefers-reduced-motion: disable all transitions and animations.

## Elevation

No box-shadows on cards. Use background color hierarchy:
- Page background: --color-bg
- Cards/panels: --color-surface
- Raised elements (dropdowns, popovers): --color-raised with shadow: 0 1px 3px oklch(0 0 0 / 0.08), 0 4px 12px oklch(0 0 0 / 0.04)
- Modal overlay: oklch(0 0 0 / 0.3)

## Components

**Inputs:** 32px height, 1px border (--color-border-subtle), 6px radius. Focus: accent border, no box-shadow ring.

**Buttons:**
- Primary: accent bg, white text, 6px radius, 32px height.
- Secondary: transparent bg, accent border, accent text.
- Ghost: transparent, text-secondary color, hover adds raised bg.

**Selects:** Same as inputs. Use native appearance.

**Badges:** Small, inline, rounded. Use semantic color backgrounds at low opacity.

**Navigation items:** No side-stripe borders. Active state uses background tint only.
