# DO SiteForge — Sidebar Fix-It-All Patch PRD

## Overview
The AI chat sidebar has all the pieces built but seven critical issues prevent it from being usable in a real workflow. This PRD fixes every one of them in dependency order. After this patch, the full loop should work: select element → describe a change → AI writes code → canvas updates → you see what changed → you can undo it.

## Priority Order
Fixes are ordered by dependency — later fixes assume earlier ones work.

1. Canvas auto-refresh (everything depends on seeing changes)
2. Selection context reaching Claude Code (AI needs to know what you're looking at)
3. Response time / timeout (AI needs to actually finish responding)
4. File change visibility (you need to see what the AI did)
5. Undo for AI changes (you need to be able to revert)
6. Chat UI polish (make it feel professional)
7. Suggestion chips (make them actually useful)

## Tasks

### Fix 1: Canvas auto-refresh when files change

- [x] **Task 1: Live reload for static sites via bridge**
  - The core problem: when Claude Code writes files to a static HTML project, the iframe doesn't refresh because there's no HMR. Framework projects (Next.js, Vite) handle this via their built-in HMR, but static sites need manual reload.
  - Create `src/server/livereload.ts` — a WebSocket server that runs alongside Express on the same port
  - Use the `ws` npm package (install it: `npm install ws` + `npm install -D @types/ws`)
  - The WebSocket server accepts connections from the bridge script
  - When chokidar detects a file change in the project directory (reuse the existing watcher or create a persistent one for static projects), send a `{ type: "reload" }` message to all connected WebSocket clients
  - Ignore changes to: `node_modules/`, `.git/`, `dist/`, `.siteforge/`
  - Files to create: `src/server/livereload.ts`
  - Files to modify: `src/server/index.ts` (start WebSocket server alongside Express)
  - Test: `npx tsc --noEmit` passes

- [x] **Task 2: Bridge listens for reload messages**
  - In `src/bridge/bridge.ts`, add a WebSocket client connection to the SiteForge server
  - On page load, connect to `ws://localhost:3000/livereload` (or whatever port the editor is on)
  - When a `{ type: "reload" }` message is received, call `location.reload()` to refresh the iframe
  - Add reconnection logic: if the WebSocket disconnects, retry every 2 seconds (max 10 retries)
  - Only activate for static projects — for framework projects (Next.js, Vite), their HMR handles reloads already. The server should include a `projectType` in the WebSocket handshake or in the bridge injection so the bridge knows whether to connect.
  - Files to modify: `src/bridge/bridge.ts`, `src/server/inject.ts` (pass project type to bridge)
  - Test: `npx tsc --noEmit` passes. Edit `test/fixtures/static-site/index.html` manually while SiteForge is running — iframe should refresh within 500ms.

- [x] **Task 3: Debounce reload to avoid flicker**
  - Claude Code often writes multiple files in rapid succession (e.g., a component file + a page file + a CSS file)
  - Debounce the reload message: collect file changes for 300ms after the first change, then send one reload message
  - This prevents the iframe from flickering through multiple reloads during a single AI response
  - Files to modify: `src/server/livereload.ts`
  - Test: `npx tsc --noEmit` passes

### Fix 2: Selection context reaching Claude Code

- [x] **Task 4: Debug and fix context serialization pipeline**
  - The problem: the chat sidebar shows "Context: .hero" in the UI but Claude Code's responses say "No selected element context was provided." The context is being displayed but not sent in the API payload.
  - Trace the full pipeline and fix the break:
    1. `src/editor/context.ts` — `getSelectionContext()` should return the selected element's full info. Add `console.log('Selection context:', result)` temporarily to verify it returns data.
    2. `src/editor/sidebar.ts` — the `contextProvider` callback (set via `setContextProvider()`) should call `getCanvasContext()` which calls `getSelectionContext()`. Verify the provider is wired correctly in `app.ts`.
    3. `src/editor/sidebar.ts` — in `sendMessage()`, the context is fetched and included in the POST body to `/api/chat`. Verify `context.selection` is not null when an element is selected.
    4. `src/server/routes/chat.ts` — the route receives the context and passes it to the AI provider. Verify it's being included in the system prompt assembly.
    5. `src/server/ai.ts` — `buildSystemPrompt()` should include the selection context in the prompt text. Verify the selection section is present when context.selection is not null.
  - The most likely break: `getCanvasContext()` is being called but `getSelectionContext()` is returning null because it can't access the overlay's `selectedElement`. Fix: ensure `getSelectionContext()` reads from the overlay's current selection state (via a getter function or custom event data, not a stale reference).
  - After fixing, the system prompt sent to Claude Code should include a section like: "The user has selected a <section> element with class 'hero'. It has styles: background: #3A7D44, padding: 80px 60px, font-size: 48px heading..."
  - Files to modify: `src/editor/context.ts`, `src/editor/sidebar.ts`, `src/editor/app.ts` (verify wiring), potentially `src/server/ai.ts`
  - Test: `npx tsc --noEmit` passes. Select the hero section, type "make this blue" in chat — Claude Code's response should reference the hero element specifically, not guess.

- [x] **Task 5: Pass viewport state in context**
  - The canvas context should include the current viewport mode and width so Claude Code knows if you're editing at mobile, tablet, or desktop
  - In `getCanvasContext()`, read the current viewport from the viewport module — check for `.sf-viewport-btn.active` or dispatch/listen for a `forge:viewportState` event
  - Include in the context: `viewport: { mode: 'mobile' | 'tablet' | 'desktop' | 'custom', width: 375 }`
  - Update `buildSystemPrompt()` to include viewport info: "The user is viewing the site at mobile width (375px)."
  - Files to modify: `src/editor/context.ts`, `src/server/ai.ts`
  - Test: `npx tsc --noEmit` passes

### Fix 3: Response time and timeouts

- [ ] **Task 6: Increase Claude Code timeout and add progress indicators**
  - In `src/server/providers/claude-code.ts`: increase timeout from current value to 180 seconds (3 minutes). Claude Code sometimes needs to read multiple files, plan, and write — 30s or even 120s isn't always enough for complex changes.
  - In `src/editor/sidebar.ts`: improve the loading state during AI responses:
    - Show elapsed time next to the loading dots: "Thinking... 5s", "Thinking... 12s", "Writing files... 28s"
    - After 15 seconds, show a reassurance message below the dots: "Claude Code is reading your project files..."
    - After 45 seconds: "This is taking longer than usual. Complex changes may take up to 2 minutes."
    - After 120 seconds: "Still working. If this doesn't complete, try a simpler request."
  - In the Claude Code provider: if partial text has been streamed before timeout, don't discard it — show whatever was received with a "(response truncated — timed out)" note appended
  - Files to modify: `src/server/providers/claude-code.ts`, `src/editor/sidebar.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 7: Optimize Claude Code prompt for faster responses**
  - The current prompt sent to Claude Code may be too verbose, causing it to read too many files or over-think before responding
  - In `src/server/providers/claude-code.ts`, update `assemblePrompt()`:
    - Lead with the user's request, not the context: "USER REQUEST: Change the hero background to blue.\n\nCONTEXT: The user has selected..."
    - Add an instruction: "Respond concisely. Make the change directly — do not explain what you plan to do first. Read only the files you need to modify."
    - Keep total prompt under 500 tokens (excluding conversation history)
    - Remove any boilerplate like "You are inside DO SiteForge..." — Claude Code already knows it's a coding tool
  - In the system prompt, add: "For static HTML projects, the main file is usually index.html in the project root. Check there first."
  - Files to modify: `src/server/providers/claude-code.ts`
  - Test: `npx tsc --noEmit` passes. Responses should start within 5-10 seconds for simple changes.

### Fix 4: File change visibility

- [ ] **Task 8: Always show file changes after AI responses**
  - The problem: when Claude Code writes files directly, the user can't tell what changed. The file watcher detects changes but they're not always displayed clearly.
  - After every AI response completes (both Claude Code and API modes), always show a file changes section:
    - Claude Code mode: query the file watcher for changes during the session, display as "Files modified" cards with filepath, change type (created/modified), and a "View diff" button
    - API mode: parse code blocks from the response (existing logic), show file change cards with "Apply" button
  - If no file changes were detected/parsed: show nothing (don't show an empty "No files changed" message)
  - Each file card should show: filepath in monospace, a colored badge (green "new" or blue "modified"), and the file content in a collapsible code block
  - The "View diff" button for Claude Code mode: fetch the file content via `GET /api/files/read` and display it. In a future phase this could show an actual git diff, but for now just showing the current file content is enough.
  - Files to modify: `src/editor/sidebar.ts`, `src/editor/filechanges.ts`
  - Test: `npx tsc --noEmit` passes. After AI writes a file, the file change card should appear below the response.

- [ ] **Task 9: File change notification toast**
  - When files are written (either by Claude Code directly or via "Apply changes"), show a brief toast notification at the bottom of the canvas area (not the sidebar)
  - Toast content: "2 files updated" with a green check icon
  - Toast appears for 3 seconds, then fades out
  - If the canvas auto-refreshed (static site reload), add "Canvas refreshed" to the toast
  - Toast should not overlap with any interactive elements
  - Files to modify: `src/editor/sidebar.ts` or `src/editor/app.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

### Fix 5: Undo for AI changes

- [ ] **Task 10: Verify and fix git-based undo**
  - The git-based undo from Phase 2.5 may not be working end-to-end. Trace and fix the full flow:
    1. Before a Claude Code chat session starts, `src/server/routes/chat.ts` should capture the current git HEAD ref via `getHeadRef()` from `src/server/git.ts`
    2. After the response completes, the git ref should be included in the SSE `files` event sent to the frontend
    3. The sidebar should render an "Undo AI changes" button on the file changes card when a git ref is available
    4. Clicking "Undo" should POST to `/api/chat/undo` which calls `restoreFiles()` from `git.ts`
    5. After restore, the canvas should refresh (trigger reload via WebSocket for static, HMR handles frameworks)
  - If the project is NOT a git repo: show a one-time dismissable info note in the chat: "Tip: Initialize a git repo (git init && git add -A && git commit -m 'initial') to enable undo for AI changes."
  - Undo button states: "Undo AI changes" → "Undoing..." (spinner) → "Changes reverted" (success, green) or error message (red)
  - Files to modify: `src/server/routes/chat.ts`, `src/server/git.ts`, `src/editor/sidebar.ts`, `src/editor/filechanges.ts`
  - Test: `npx tsc --noEmit` passes. In a git-initialized project, make an AI change, click Undo, verify files revert and canvas updates.

### Fix 6: Chat UI polish

- [ ] **Task 11: Message layout and typography**
  - User messages: 13px font, max-width 85%, right-aligned, padding 10px 14px, border-radius 14px 14px 4px 14px, background --sf-green at 8% opacity, color --sf-text-primary
  - AI messages: 13px font, full width, no background, 0 horizontal padding, 16px margin-bottom
  - AI "Claude Code" badge: 9px font, pill shape (99px border-radius), padding 2px 8px, background #E6F1FB, color #185FA5, display inline-block, margin-bottom 6px above the message text — should feel like a subtle tag, not a header
  - Space between messages: 14px between same-sender messages, 20px between user→AI pairs
  - Code blocks in responses: 12px monospace font, background --sf-bg-secondary, padding 10px 12px, border-radius 6px, 0.5px border, overflow-x auto for long lines
  - Inline code: 12px monospace, 2px 6px padding, --sf-bg-secondary background, 4px border-radius
  - Files to modify: `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 12: Tab bar and context indicator**
  - Tab bar: full-width, two tabs evenly split, 40px height, 13px font weight 500
  - Active tab: --sf-green text color, 2px solid bottom border in --sf-green
  - Inactive tab: --sf-text-secondary color, transparent bottom border, hover shows --sf-bg-secondary background
  - Context indicator: below tab bar, 8px vertical padding, 12px horizontal padding, --sf-bg-secondary background, 11px monospace font for the element tag/class, left-aligned
  - When no element selected: context indicator hidden (not "No element selected" — just hidden)
  - Smooth transition on tab switch (opacity fade, 150ms)
  - Files to modify: `src/editor/styles.css`, `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 13: Input area cleanup**
  - Input container: 12px padding, border-top 0.5px solid --sf-border-tertiary, --sf-bg-primary background
  - Textarea: 13px font, 10px 12px padding, 8px border-radius, 0.5px border --sf-border-tertiary, min-height 38px, max-height 120px (smooth auto-grow), focus ring 2px --sf-green at 30% opacity
  - Send button: 34px diameter circle, --sf-green background, white arrow icon centered, disabled state opacity 0.35
  - Placeholder: 13px, --sf-text-tertiary, "Describe a change..." (default), "Describe a change to <tag>..." (when element selected)
  - Auto-apply toggle: if kept, make it 10px font, --sf-text-tertiary, positioned above textarea row with 4px margin-bottom. If this toggle isn't being used, consider removing it entirely to reduce clutter.
  - Enter sends, Shift+Enter for newline — make sure this works reliably (some implementations break when textarea auto-grows)
  - Files to modify: `src/editor/styles.css`, `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 14: Empty state and loading states**
  - Empty chat state (no messages yet): centered vertically in the chat area, show a minimal prompt — SiteForge anvil icon (small, 24px, muted), "Ask AI to build or edit your site" in 13px --sf-text-secondary, and 2-3 example prompts below in 12px --sf-text-tertiary as clickable text (clicking one sends it as a message)
  - Example prompts for empty state: "Add a contact form section", "Improve the page typography", "Make the hero full-width"
  - Loading state (waiting for AI): three dots animation (existing), but add the elapsed time counter from Task 6
  - Error state: red-tinted message with error icon, "Retry" button that resends the last message
  - Files to modify: `src/editor/sidebar.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

### Fix 7: Suggestion chips

- [ ] **Task 15: Smarter, context-aware suggestion chips**
  - Remove the current hardcoded suggestion logic entirely
  - New chip logic based on actual context, max 3 chips per response:
    - **After a component was created/modified** (file changes detected): "Adjust the styling", "Add responsive breakpoints", "Add another section"
    - **When viewing at mobile viewport** (width < 640px): "Fix mobile layout", "Stack elements vertically", "Reduce font sizes"
    - **When an element is selected**: "Edit this [element tag]", "Delete this element", "Duplicate this section"
    - **After an error response**: "Try again", "Simplify the request"
    - **Default** (no special context): "Add a new section", "Review the page layout", "Improve accessibility"
  - Chip styling: 11px font, 5px 12px padding, border-radius 99px (pill), 0.5px border --sf-border-tertiary, background transparent, hover: --sf-bg-secondary background with --sf-border-secondary border
  - Layout: flex-wrap, left-aligned, 6px gap, 10px margin-top from the message
  - Clicking a chip: remove all chips from that response, send the chip text as a new message
  - Files to modify: `src/editor/sidebar.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

## Testing Strategy
- Primary: `npx tsc --noEmit` (typecheck)
- Build: `npx tsup` completes without errors
- Integration test sequence:
  1. `forge open ./test/fixtures/static-site/` — editor opens
  2. Select the hero section — context indicator shows ".hero"
  3. Type "change the background to blue" — Claude Code responds, writes file
  4. Canvas auto-refreshes — hero is now blue
  5. File changes card appears below AI response showing which files changed
  6. Toast notification appears briefly on canvas: "1 file updated, canvas refreshed"
  7. Click "Undo AI changes" — hero reverts to green, canvas refreshes
  8. Switch to mobile viewport (press 1), type "make the heading smaller" — Claude Code references mobile context
  9. Response completes within 30 seconds, suggestion chips appear

## Dependencies
- New npm package: `ws` (WebSocket server for live reload)
- New dev dependency: `@types/ws`

## Notes for Ralph
- Tasks 1-3 (live reload) are the foundation — everything else feels broken without them because changes are invisible
- Task 4 (context fix) is the most important debugging task. The pipeline has 5 links and any one could be broken. Use console.log liberally to find the break, then remove the logs after fixing.
- Task 7 (prompt optimization) matters more than you'd think. The difference between "Let me check the project structure first..." (slow, verbose) and immediately writing the file (fast, direct) comes down to how the prompt is structured. Lead with the action, not the context.
- For static sites, the live reload WebSocket should use the same port as the Express server (3000) via the `ws` library's ability to share an HTTP server. Do NOT start a separate WebSocket server on a different port.
- The toast notification should be on the canvas area, not inside the sidebar. Use a fixed-position div inside the canvas container (not position:fixed on the body — that would escape the editor layout).
- All CSS changes should use existing --sf- custom properties. Don't introduce new color values — use the existing palette.
- The auto-apply toggle can be removed if it adds clutter. In Claude Code mode it's irrelevant (files are written automatically), and in API mode the "Apply changes" button is explicit enough. If you keep it, make it visually minimal.
