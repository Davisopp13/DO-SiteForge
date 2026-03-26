# DO SiteForge — Sidebar UX Refinement Patch

## Overview
Two issues to fix: (1) Claude Code isn't writing files because it lacks permissions in --print mode, and (2) the sidebar panel layout needs a professional polish pass. Fast iteration — fix and ship.

## Tasks

### Fix 1: Claude Code file write permissions

- [x] **Patch A: Enable Claude Code tool permissions**
  - In `src/server/providers/claude-code.ts`, update the spawn arguments
  - Add `--dangerously-skip-permissions` flag to the args array so Claude Code can write files directly without asking
  - The full args should be: `['--print', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions']`
  - Also update the prompt instruction prefix in `assemblePrompt()` to be more direct: remove any language about "asking permission" and instead say: "You have full write access to the project. Make the requested changes by editing files directly. Do not ask for permission — just make the changes."
  - Increase the timeout from 30s (or whatever it currently is) to 120s — Claude Code needs time to read files, plan, and write
  - Test: `npx tsc --noEmit` passes. Send "change the hero background to blue" in chat — Claude Code should write the file directly and the canvas should update via HMR

### Fix 2: Stop auto-switching to Properties tab on element select

- [x] **Patch B: Remove auto-tab-switch on selection**
  - In `src/editor/sidebar.ts`, find the `forge:selectionChanged` event listener that auto-switches to the Properties tab when an element is selected
  - Remove the tab switch behavior entirely. Selecting an element should update the context indicator at the top of the chat tab (showing the element's tag and class) and update the properties panel content in the background — but it should NOT change which tab is active
  - The user controls which tab they're on. If they're in AI Chat, they stay in AI Chat. If they want Properties, they click the tab themselves.
  - The context indicator in the chat tab already tells the user which element is selected — that's enough visual feedback
  - Files to modify: `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes. Select elements on canvas while chat tab is open — chat tab stays active, context indicator updates.

### Fix 3: Sidebar layout and visual polish

- [x] **Patch C: Tab bar refinement**
  - Clean up the tab bar at the top of the right panel
  - Tabs should be: full-width, evenly split, 40px tall, 13px font weight 500
  - Active tab: text color --sf-green (#3A7D44), 2px solid bottom border in --sf-green
  - Inactive tab: text color --sf-text-secondary, no bottom border, hover shows light background
  - Remove any extra padding or margin that makes the tabs feel cramped
  - The context indicator below the tabs should have: 8px vertical padding, subtle background (--sf-bg-secondary), 11px monospace font, left-aligned
  - Files to modify: `src/editor/styles.css`, `src/editor/sidebar.ts` (if DOM structure needs adjusting)
  - Test: `npx tsc --noEmit` passes

- [x] **Patch D: Chat message styling**
  - User messages: 13px font size (not 12), 10px 14px padding, max-width 85% of panel, border-radius 12px 12px 4px 12px, background --sf-green at 8% opacity, text color --sf-text-primary (not accent)
  - AI messages: 13px font size, 0 padding (content flows naturally), full width, 16px margin-bottom between messages
  - AI "Claude Code" badge: smaller (9px font), pill shape, subtle blue-tinted background, aligned to top-left of message — should feel like a tag, not a block
  - Message spacing: 12px gap between messages, 20px gap between user→AI message pairs
  - Code blocks in AI responses: 12px font, --sf-bg-secondary background, 8px 12px padding, 6px border-radius, 0.5px border
  - Inline code: 12px font, 2px 5px padding, --sf-bg-secondary background, 4px border-radius
  - Files to modify: `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [ ] **Patch E: Suggestion chips cleanup**
  - Chips should be: 11px font, 5px 12px padding, border-radius 99px (full pill), 0.5px border --sf-border-tertiary, background transparent
  - Hover: background --sf-bg-secondary, border color --sf-border-secondary
  - Layout: flex-wrap, 6px gap, left-aligned (not centered), 8px margin-top from the AI message
  - Maximum 3 chips per response — if more are generated, truncate
  - Chips should feel like gentle suggestions, not prominent buttons
  - Files to modify: `src/editor/styles.css`, `src/editor/sidebar.ts` (if chip count needs limiting)
  - Test: `npx tsc --noEmit` passes

- [ ] **Patch F: Chat input area refinement**
  - Input area container: 12px padding all around, border-top 0.5px solid --sf-border-tertiary, clean background (--sf-bg-primary)
  - Textarea: 13px font, 8px 12px padding, border-radius 8px, 0.5px border, min-height 36px, max-height 100px (roughly 4 lines), smooth auto-grow transition
  - Send button: 32px x 32px circle, --sf-green background, white arrow icon, 6px border-radius to make it a circle, vertically centered with textarea
  - Send button disabled state: opacity 0.4, cursor not-allowed
  - Auto-apply toggle (if visible): 10px font, muted color, positioned above the input row with 6px margin-bottom, should feel secondary/optional
  - Placeholder text: 13px, --sf-text-tertiary color, should say "Describe a change..." (short and clean)
  - Files to modify: `src/editor/styles.css`, `src/editor/sidebar.ts` (if DOM structure needs adjusting)
  - Test: `npx tsc --noEmit` passes

- [ ] **Patch G: Overall panel dimensions and spacing**
  - Right panel width: 340px (slight increase from 320px for breathing room)
  - Panel internal spacing: 0 horizontal padding on the panel itself (content items handle their own padding)
  - Chat messages area: 12px horizontal padding, scroll with 60px bottom padding so last message isn't flush against input
  - Properties tab content: 14px horizontal padding, consistent with current design
  - Ensure the panel doesn't have double borders (panel border + tab bar border stacking)
  - All transitions: 150ms ease for hover states on buttons, tabs, chips
  - Files to modify: `src/editor/styles.css`, `src/editor/canvas.ts` or `src/editor/app.ts` (if panel width is set in JS)
  - Test: `npx tsc --noEmit` passes

## Testing Strategy
- Primary: `npx tsc --noEmit`
- Visual: rebuild and check each patch visually in the browser
- Integration: after Patch A, send a chat message and verify files are written + canvas updates

## Notes
- Patches A and B are the functional fixes — do these first. Patches C-G are visual polish and can be done in any order.
- For the CSS patches, use the existing --sf- CSS custom properties wherever possible for consistency.
- The sidebar should feel like it belongs in a professional tool — think VS Code sidebar or Figma inspector. Clean, quiet, information-dense without being cramped.
- Avoid any decorative elements — no shadows, no gradients, no colored backgrounds on the panel. Let whitespace and typography do the work.
