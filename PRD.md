# DO SiteForge — Phase 1 Patch PRD

## Overview
Three refinements discovered during hands-on testing of the Phase 1 build. These fix UX issues and add a missing interaction mode.

## Tasks

- [x] **Patch 1: Merge Select and Move into one tool**
  - In `src/editor/toolbar.ts`: remove the Move tool button entirely. Keep Select, Text, Add.
  - In `src/editor/overlay.ts`: when `activeTool === 'select'`, allow both click-to-select AND drag-to-move. Current drag logic already works — just remove the tool gate if one exists. Mousedown starts a potential drag, mouseup without movement = select, mouseup after movement = finish drag.
  - In `src/editor/keyboard.ts`: remove the M shortcut for move tool. Keep V=select, T=text, A=add. Make M an alias for V (dispatches same `forge:toolChanged` event with tool='select').
  - Cursor behavior in select mode: default pointer on canvas, `grab` when hovering a selected element, `grabbing` during drag.
  - Update the mode badge to never show "Move mode" — it should show "Select mode" when select is active.
  - Files to modify: `src/editor/toolbar.ts`, `src/editor/overlay.ts`, `src/editor/keyboard.ts`
  - Test: `npx tsc --noEmit` passes. Click selects, drag moves, no separate move tool in toolbar.

- [x] **Patch 2: Add Preview mode**
  - In `src/editor/toolbar.ts`: add a Preview tool button between Text and Add, with an eye icon SVG (simple: `<circle cx="12" cy="12" r="3"/><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7"/>`)
  - Keyboard shortcut: P for preview. Add to `src/editor/keyboard.ts`.
  - In `src/editor/overlay.ts`: when `activeTool === 'preview'`, set `overlay.style.pointerEvents = 'none'` so all mouse events pass through to the iframe. The user can click links, trigger hover states, navigate, fill forms, test buttons — the site behaves like a normal webpage.
  - While in preview mode: hide the selection box, resize handles, hover highlight, and tag tooltip. Clear any current selection.
  - Mode badge should show "Preview mode" with a slightly different style — use `--sf-green` (#3A7D44) background at 10% opacity instead of the default, to visually signal that editing is paused.
  - When switching OUT of preview mode (pressing V, T, or A): restore `overlay.style.pointerEvents = 'auto'`, re-enable hover highlights and selection.
  - Properties panel should show "Preview mode — interactions disabled" placeholder text while preview is active.
  - Files to modify: `src/editor/toolbar.ts`, `src/editor/overlay.ts`, `src/editor/keyboard.ts`, `src/editor/properties.ts`
  - Test: `npx tsc --noEmit` passes. In preview mode, clicking a link in the iframe navigates. Pressing V returns to select mode with overlay working.

- [ ] **Patch 3: Fix mode badge overlapping viewport bar**
  - Current issue: the mode badge is positioned at the top-left of the canvas area and overlaps with the viewport toggle bar buttons.
  - Fix: move the mode badge INTO the viewport bar, positioned on the left side before the device preset buttons. It should be a small pill-shaped label (e.g., `Select mode` in 11px text) sitting inline with the viewport controls.
  - Layout in the viewport bar should be: `[mode badge] — [spacer] — [Mobile] [Tablet] [Desktop] [Custom] — [dimensions]`
  - Use the same styling as the viewport buttons but non-interactive (no hover state, no cursor pointer). Background uses the current tool's accent color at 10% opacity.
  - Remove the old absolutely-positioned mode badge from the canvas area.
  - Files to modify: `src/editor/viewport.ts` (add badge to viewport bar), `src/editor/canvas.ts` or `src/editor/app.ts` (remove old badge), `src/editor/styles.css` (badge-in-bar styles)
  - Test: `npx tsc --noEmit` passes. Mode badge sits cleanly in the viewport bar with no overlap.

## Testing Strategy
- Primary: `npx tsc --noEmit`
- Visual: `node dist/bin/forge.js open ./test/fixtures/static-site/` — verify all three patches visually

## Notes
- These patches should not break any existing functionality — undo/redo, text editing, viewport toggle, keyboard shortcuts, and properties panel should all continue working.
- The `forge:toolChanged` event should now emit tools: 'select', 'text', 'preview', 'add' (no more 'move').
- Preview mode reuses the same `pointerEvents = 'none'` pattern already used during text editing — the overlay knows how to toggle this.
