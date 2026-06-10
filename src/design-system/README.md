# tool-kit Design System

Material Design 3–inspired design tokens and components for the tool-kit UI.

## Structure

```
src/design-system/
├── index.css          # Entry point (import this)
├── tokens.css         # Colors, spacing, typography, shape, motion
├── base.css           # Reset & body defaults
├── typography.css     # Text scale & heading utilities
├── layout.css         # App shell, panels, navigation
├── utilities.css      # Stack, cluster, grid, a11y helpers
└── components/
    ├── form.css       # Controls card, inputs, checkboxes
    ├── button.css     # Primary/secondary buttons, spinner
    ├── drop-zone.css  # File upload, chips
    ├── feedback.css   # Status, toast, workflow steps
    ├── output.css     # Preview, code block, stats
    └── editor.css     # Image editor workspace
```

## Spacing Scale (4px grid)

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | 4px | Tight inline gaps |
| `--space-2` | 8px | Chip gaps, button groups |
| `--space-3` | 12px | Form label gaps |
| `--space-4` | 16px | Card padding (sm), page padding (mobile) |
| `--space-5` | 20px | Section gaps, card padding |
| `--space-6` | 24px | Page padding, panel header margin |
| `--space-8` | 32px | Drop zone padding, desktop page padding |
| `--space-12` | 48px | Page bottom padding |

Semantic aliases: `--gap-section`, `--gap-block`, `--gap-inline`, `--padding-page-x`, `--padding-card`.

## Layout Patterns

### Panel structure

```html
<section class="panel panel-active">
  <div class="panel-header">…</div>
  <div class="panel-body">
    <!-- sections with --gap-section between children -->
  </div>
</section>
```

### Stack utility

```html
<div class="stack">           <!-- default: --gap-section -->
<div class="stack stack--tight">  <!-- --gap-tight -->
<div class="stack stack--block">  <!-- --gap-block -->
```

## Color Roles

- **Primary** — actions, active tabs, accents
- **Surface** — backgrounds (dim → container → high)
- **On-surface** — text (default → variant for secondary)
- **Semantic** — success, warning, error

## Typography

| Class | Size | Use |
|-------|------|-----|
| `.text-xs` | 11px | Labels, meta |
| `.text-sm` | 13px | Status, toast |
| `.text-base` | 14px | Body (default) |
| `.text-md` | 16px | Input values |
| `.text-2xl` | 24px | Panel titles |

## Components

| Class | Purpose |
|-------|---------|
| `.controls` | Settings card (form grid) |
| `.drop-zone` | File upload target |
| `.btn-primary` / `.btn-secondary` | Actions |
| `.status` | Inline feedback |
| `.preview-wrap` | Image preview container |
| `.code-block` | Readonly output textarea |
| `.panel-steps` | Workflow step chips |
