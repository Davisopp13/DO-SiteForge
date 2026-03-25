# DO SiteForge — Phase 1 PRD

## Project Overview
DO SiteForge is a local-first visual website builder for vibe coders. It runs as a CLI tool that launches a browser-based canvas where you can select, drag, resize, and inline-edit elements on a live-rendered site. Phase 1 delivers the core visual canvas with a working interaction overlay, element manipulation, and a properties panel — no AI integration yet (that's Phase 2).

Tech stack: Node.js CLI + Express server + Vanilla TypeScript frontend (no framework for the editor UI itself — keeps it fast and dependency-light). The site being edited renders in an iframe from its own dev server.

Success: Run `forge open ./some-project`, see the site in a canvas, click to select elements, drag to reposition, double-click to edit text, toggle between mobile/tablet/desktop viewports, and see properties in a side panel.

## Architecture & Key Decisions
- **Runtime**: Node.js 20+ with TypeScript
- **CLI**: Commander.js for argument parsing
- **Server**: Express serving the editor UI + proxying the target site's dev server
- **Editor frontend**: Vanilla TypeScript, no React/Vue (the editor itself should be lightweight; the site in the iframe can be anything)
- **Iframe rendering**: Target site runs in a sandboxed iframe; SiteForge injects a bridge script via Express middleware
- **Communication**: postMessage API between editor overlay and iframe bridge script
- **Styling**: CSS variables for the editor UI theme (dark/light mode support)
- **Build tool**: tsup for bundling the CLI + editor frontend
- **Package structure**: Monorepo-light — `src/cli/`, `src/server/`, `src/editor/`, `src/bridge/`

## File Structure
```
siteforge/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── bin/
│   └── forge.ts              # CLI entry point
├── src/
│   ├── cli/
│   │   ├── index.ts           # Commander setup
│   │   ├── commands/
│   │   │   ├── open.ts        # forge open <dir>
│   │   │   └── new.ts         # forge new <name> (scaffold)
│   │   └── detect.ts          # Project type detection
│   ├── server/
│   │   ├── index.ts           # Express server
│   │   ├── proxy.ts           # Dev server proxy
│   │   └── inject.ts          # Bridge script injection middleware
│   ├── editor/
│   │   ├── index.html         # Editor shell (served at localhost:3000)
│   │   ├── styles.css         # Editor UI styles with CSS variables
│   │   ├── app.ts             # Main editor application
│   │   ├── canvas.ts          # Canvas/iframe management
│   │   ├── overlay.ts         # Interaction overlay (hover, select, drag)
│   │   ├── toolbar.ts         # Left toolbar (tools: select, move, text, add)
│   │   ├── properties.ts      # Right properties panel
│   │   ├── viewport.ts        # Responsive viewport toggle (mobile/tablet/desktop/custom)
│   │   ├── history.ts         # Undo/redo stack
│   │   └── keyboard.ts        # Keyboard shortcut handler
│   └── bridge/
│       ├── bridge.ts          # Injected into iframe — DOM queries, element info
│       └── protocol.ts        # Shared message types between editor <-> bridge
├── test/
│   └── detect.test.ts         # Project detection tests
└── README.md
```

## Environment & Setup
- Node.js 20+
- No env vars needed for Phase 1
- No database
- No external API keys
- Ralph should run `npm install` first, then work through tasks

## Tasks

### Phase 1A: Project Scaffolding & CLI

- [x] **Task 1: Initialize project and install dependencies**
  - Run `npm init` with name "siteforge", set up `package.json` with type "module"
  - Install dependencies: commander, express, http-proxy-middleware, chokidar, chalk
  - Install dev dependencies: typescript, tsup, @types/node, @types/express, vitest
  - Create `tsconfig.json` targeting ESNext with strict mode
  - Create `tsup.config.ts` with two entry points: `bin/forge.ts` (CLI) and `src/editor/app.ts` (browser bundle)
  - Create the full directory structure from the file tree above (empty files are fine)
  - Test: `npx tsc --noEmit` passes with no errors

- [x] **Task 2: Build the CLI with Commander.js**
  - Create `bin/forge.ts` as the CLI entry with shebang `#!/usr/bin/env node`
  - Create `src/cli/index.ts` with Commander setup: program name "forge", version "0.1.0"
  - Add `open` command in `src/cli/commands/open.ts`: takes a directory argument, validates it exists, prints "Opening project at <dir>"
  - Add `new` command in `src/cli/commands/new.ts`: takes a name argument, prints "Creating new project: <name>" (stub for now)
  - Add `bin` field to package.json pointing `forge` to the built CLI output
  - Test: `npx tsup && node dist/forge.js open ./` prints the expected message without errors

- [ ] **Task 3: Project type detection**
  - Create `src/cli/detect.ts` that scans a directory and returns project info
  - Detect: Next.js (check for next in package.json deps), Vite (check for vite), Astro (check for astro), Static (fallback — has index.html)
  - Return object: `{ type: 'nextjs' | 'vite' | 'astro' | 'static', devCommand: string, port: number, entry: string }`
  - Port assignment: target site gets 4200, SiteForge editor gets 3000
  - Write a vitest test in `test/detect.test.ts` that creates temp directories with mock package.json files and verifies detection
  - Test: `npx vitest run` passes

### Phase 1B: Server & Iframe Rendering

- [ ] **Task 4: Express server with editor shell**
  - Create `src/server/index.ts` — Express server on port 3000
  - Serve `src/editor/index.html` as the root route
  - Create `src/editor/index.html` — minimal HTML shell with: a left toolbar div, a center canvas area div, a right properties panel div, and a script tag loading the bundled editor JS
  - Create `src/editor/styles.css` with CSS custom properties for theming (--sf-bg-primary, --sf-bg-secondary, --sf-border, --sf-text-primary, --sf-text-secondary, --sf-accent for the blue selection color, --sf-green for DO Code Lab brand green #3A7D44)
  - Include both light and dark mode via prefers-color-scheme media query
  - The layout should be: 44px toolbar on left, flexible canvas center, 240px properties panel on right, using CSS grid
  - Test: `npx tsup && node dist/server.js` — opening localhost:3000 shows the three-panel layout

- [ ] **Task 5: Dev server proxy and process management**
  - Create `src/server/proxy.ts` — function that spawns the target project's dev server as a child process on port 4200
  - Use the detected devCommand from Task 3 (e.g., `npx next dev --port 4200`)
  - For static projects, use Express static file serving on port 4200
  - Create `src/server/inject.ts` — Express middleware that intercepts HTML responses from the proxy and injects `<script src="/forge-bridge.js"></script>` before the closing `</body>` tag
  - Set up http-proxy-middleware to proxy `/preview/*` requests to the target dev server on port 4200, with the injection middleware applied
  - Wire this into the Express server from Task 4
  - Test: `npx tsup && node dist/forge.js open ./test-fixtures/static-site/` — create a test fixture with a simple index.html, verify localhost:3000/preview/ shows the site content

- [ ] **Task 6: Bridge script — iframe-to-editor communication**
  - Create `src/bridge/protocol.ts` with TypeScript types for messages: `ElementInfo` (tagName, id, className, computedStyles subset, boundingRect, textContent, xpath), `HoverMessage`, `SelectMessage`, `ElementInfoResponse`, `MoveMessage`, `TextEditMessage`
  - Create `src/bridge/bridge.ts` — the script injected into the iframe
  - Bridge listens for postMessage from the editor overlay
  - Implements: `getElementAtPoint(x, y)` → returns ElementInfo for the DOM element at those coordinates, `getElementByXPath(xpath)` → returns ElementInfo, `getAllEditableElements()` → returns array of ElementInfo for elements that contain text
  - Bridge sends hover/click events up to the parent via postMessage
  - Serve bridge.ts as `/forge-bridge.js` from the Express server (bundled separately by tsup)
  - Test: `npx tsc --noEmit` passes, bridge script loads in iframe without console errors

### Phase 1C: Visual Canvas Interaction

- [ ] **Task 7: Canvas iframe and overlay setup**
  - Create `src/editor/canvas.ts` — manages the iframe element
  - Create an iframe pointing to `/preview/` that fills the canvas area
  - Create `src/editor/overlay.ts` — a transparent div positioned exactly over the iframe using absolute positioning
  - Overlay intercepts all mouse events (mousemove, mousedown, mouseup, click, dblclick)
  - On mousemove: send coordinates to bridge via postMessage, bridge returns element info, overlay draws a hover highlight (1.5px dashed blue border) around the hovered element using a absolutely-positioned div
  - On click: "select" the hovered element — draw a solid 2px blue border with 4 resize handles (8x8px squares at corners)
  - Show the element's tag name in a small tooltip above the selection (dark background, light text, monospace font)
  - Deselect when clicking on empty space
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 8: Element dragging (move mode)**
  - In `src/editor/overlay.ts`, add drag behavior when a selected element is mousedown'd
  - On mousedown on a selected element: capture start position
  - On mousemove while dragging: calculate delta, send `MoveMessage` to bridge with the delta
  - Bridge receives MoveMessage, updates the target element's inline style (transform: translate) for visual feedback
  - On mouseup: finalize position — the bridge reports the final computed position
  - Show a position indicator during drag (x: 120, y: 340 in a small floating label near the cursor)
  - Add "dragging" visual state (slight opacity reduction on the element)
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 9: Inline text editing**
  - In `src/editor/overlay.ts`, add double-click handler
  - On dblclick: send message to bridge to make the target element contentEditable=true and focus it
  - The bridge applies contentEditable, adds a visible focus ring (box-shadow: inset 0 0 0 1px blue)
  - Editor overlay enters "text edit mode" — cursor changes to text, overlay stops intercepting mouse events so the user can interact with the iframe's contentEditable element directly
  - On blur or Escape: bridge removes contentEditable, sends the updated textContent back to the editor
  - Editor records the text change in the history stack
  - Show a "Editing text" indicator in the toolbar or overlay
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 10: Left toolbar with tool switching**
  - Create `src/editor/toolbar.ts` — renders the 44px-wide left toolbar
  - Four tool buttons with SVG icons (simple, hand-drawn SVG paths — no icon library): Select (arrow cursor), Move (four-directional arrows), Text (T character), Add (plus sign)
  - Active tool gets a highlighted background (--sf-accent color at 15% opacity)
  - Keyboard shortcuts: V for select, M for move, T for text, A for add
  - Tool state is shared with overlay.ts — overlay behavior changes based on active tool
  - Add a separator line, then a "mode badge" at the top of the canvas area showing current mode ("Select mode", "Move mode", "Text edit mode")
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 11: Right properties panel**
  - Create `src/editor/properties.ts` — renders the 240px-wide right panel
  - When no element is selected: show "Select an element to see its properties" placeholder
  - When an element is selected, show: Element tag + class name, Position (x, y relative to parent), Size (width x height), Background color (with a small color swatch), Font size and color, Padding and margin values, Border radius
  - Properties update live as the element is dragged or edited
  - Each property row: label (12px, muted) above value (13px, monospace)
  - Add an "Ask AI" button at the bottom (disabled/grayed out for Phase 1 — placeholder for Phase 2)
  - Test: `npx tsc --noEmit` passes

### Phase 1D: History & Polish

- [ ] **Task 12: Undo/redo history**
  - Create `src/editor/history.ts` — manages an operation stack
  - Operations are: Move (element xpath, from position, to position), TextEdit (element xpath, old text, new text)
  - Cmd+Z / Ctrl+Z: undo — send reverse operation to bridge
  - Cmd+Shift+Z / Ctrl+Shift+Z: redo
  - Cap history at 50 operations
  - Show undo/redo availability in the toolbar (subtle indicators)
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 13: Keyboard shortcuts handler**
  - Create `src/editor/keyboard.ts` — centralized keyboard event handler
  - V: select tool, M: move tool, T: text tool, A: add element
  - 1: mobile viewport, 2: tablet viewport, 3: desktop viewport, 4: custom viewport
  - Delete/Backspace: delete selected element (with bridge message to remove from DOM)
  - Escape: deselect current element / exit text edit mode
  - Cmd+Z: undo, Cmd+Shift+Z: redo
  - Arrow keys: nudge selected element by 1px (or 10px with Shift)
  - Prevent shortcuts from firing when in text edit mode (except Escape)
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 14: Add element functionality**
  - When the Add tool is active and user clicks on the canvas, insert a new div element
  - The new div is a simple block: 120px wide, 60px tall, light gray background, rounded corners, centered text "New block"
  - Bridge inserts the element at the click position in the DOM
  - Immediately select the new element after insertion
  - Record the insertion in the history stack so it's undoable
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 15: Wire the full open command end-to-end**
  - Update `src/cli/commands/open.ts` to: detect project type, spawn the target dev server, start the SiteForge Express server, inject the bridge script, open the browser to localhost:3000 automatically (use the `open` npm package)
  - Print a clean startup message in the terminal with chalk: project name, type, ports, and a "Ready" indicator
  - Handle Ctrl+C gracefully — kill the target dev server child process and exit cleanly
  - Create a test fixture at `test/fixtures/static-site/index.html` — a simple HTML page with a hero section, two cards, a CTA, and a footer (styled with inline styles so it works without a build step)
  - Test: `npx tsup && node dist/forge.js open ./test/fixtures/static-site/` opens the browser and shows the site with a working overlay

- [ ] **Task 16: README and developer docs**
  - Write README.md with: project description, installation instructions (`npm install -g siteforge`), usage (`forge open ./my-project`), keyboard shortcuts table, architecture overview (brief), development setup (`npm run dev`)
  - Add npm scripts to package.json: `dev` (tsup --watch), `build` (tsup), `test` (vitest run), `typecheck` (tsc --noEmit)
  - Test: `npm run typecheck && npm run build` both pass

### Phase 1E: Responsive Viewport Toggle

- [ ] **Task 17: Viewport toggle bar UI**
  - Create `src/editor/viewport.ts` — renders a viewport toggle bar at the top of the canvas area (between the toolbar/properties panel header row and the iframe)
  - Four preset buttons with inline SVG icons: Mobile (phone icon, 375px), Tablet (tablet icon, 768px), Desktop (monitor icon, 100% width), Custom (grid icon, shows slider)
  - Active viewport button gets highlighted state (same pattern as toolbar active state)
  - Display current dimensions in monospace to the right of the buttons: "375 x 812", "768 x 1024", "1280 x 800", or custom value
  - Keyboard shortcuts: 1 for mobile, 2 for tablet, 3 for desktop, 4 for custom
  - Add these shortcuts to `src/editor/keyboard.ts` — they should NOT fire during text edit mode
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 18: Iframe viewport resizing**
  - When a viewport preset is selected, animate the iframe container width to the target size using CSS transition (0.4s cubic-bezier ease)
  - Center the iframe horizontally in the canvas area when the viewport is smaller than the available canvas width
  - Mobile viewport: set iframe width to 375px, add a device frame border (3px rounded border with 24px border-radius to simulate phone shape), show a notch indicator at the top center (80px wide, 20px tall, rounded bottom corners)
  - Tablet viewport: set iframe width to 768px, add a subtle device frame (2px border, 16px border-radius)
  - Desktop viewport: set iframe width to 100% of canvas area, standard 8px border-radius, thin border
  - The iframe HEIGHT should always fill the available canvas height — only width changes
  - After resizing, dispatch a custom event `forge:viewport-changed` that the overlay listens for to recalculate element positions
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 19: Custom width slider**
  - When Custom viewport is selected, show a slider bar below the viewport toggle bar
  - Slider range: 320px to 1920px, step of 1px
  - As the slider is dragged, the iframe width updates in real time (no debounce — it should feel continuous)
  - Display the current width value next to the slider in monospace
  - Auto-detect which "category" the current width falls into and apply appropriate device frame: below 640px = mobile frame, 640-1023px = tablet frame, 1024px+ = desktop frame (no frame)
  - The notch indicator should appear/disappear smoothly based on whether the width is in mobile range
  - Update the dimensions display in the viewport bar as the slider moves
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 20: Overlay recalculation on viewport change**
  - When `forge:viewport-changed` fires, the overlay must: deselect any currently selected element (selection rects will be in wrong positions), re-query the bridge for the DOM layout at the new viewport width, redraw any hover highlights at correct positions
  - The bridge script must handle viewport changes gracefully — elements queried via `getElementAtPoint()` must return correct bounding rects relative to the new iframe width
  - If the user re-selects an element after a viewport change, the selection box and resize handles must match the element's new position and size in the reflowed layout
  - Test: `npx tsc --noEmit` passes

## Testing Strategy
- Primary: `npx tsc --noEmit` (typecheck)
- Secondary: `npx vitest run` (unit tests where they exist)
- Final: `npx tsup` builds without errors
- Integration: `node dist/forge.js open ./test/fixtures/static-site/` opens and works

## Out of Scope
- No AI integration (Claude Code, Gemini, chat sidebar) — that's Phase 2
- No source map bridge / code-back writing — Phase 2 (for now, edits are DOM-only and don't persist to source files)
- No multi-page navigation (single page editing only)
- No component library or pre-built sections
- No export functionality
- No Ralph/PRD integration
- No Supabase or any database
- No authentication
- No deployment features

## Notes for Ralph
- The editor UI (toolbar, overlay, properties panel) is vanilla TypeScript — do NOT use React, Vue, or any UI framework for the editor itself. The iframe content can be anything.
- SVG icons for the toolbar should be simple inline SVG strings in the TypeScript — no icon library imports
- Use CSS custom properties extensively for theming — the editor should support both light and dark mode via prefers-color-scheme
- The bridge script must be self-contained with no imports — it's injected into arbitrary pages. Bundle it as a separate tsup entry point.
- postMessage communication between editor and bridge must include an origin check and a message type prefix ("forge:") to avoid conflicts with the target site's own postMessage usage
- DO Code Lab brand green is #3A7D44 — use it as the primary accent for the SiteForge UI. Selection blue is #378ADD.
- All overlay drawings (hover highlight, selection box, resize handles) are absolutely-positioned divs on the overlay layer — NOT SVG and NOT canvas elements. This keeps them simple and performant.
- The overlay must account for iframe scroll position — when the user scrolls inside the iframe, the overlay highlights need to scroll with the content. The bridge should report element positions relative to the iframe viewport and the overlay should adjust.
- The viewport toggle resizes the iframe container, NOT the browser window. The iframe's internal content reflows naturally via its own CSS media queries / Tailwind breakpoints. SiteForge does not inject viewport meta tags or override any CSS — it simply constrains the iframe width and lets the site's responsive styles do their thing.
- When the viewport is narrower than the canvas area, the iframe should be centered horizontally with the device frame visible. The canvas background (--sf-bg-tertiary) should be visible on both sides of the narrowed iframe.
- The custom slider must feel continuous — use `oninput` not `onchange` for real-time updates, and apply the iframe width directly without debouncing. CSS transition on the iframe container should be disabled during slider drag to prevent lag, then re-enabled when the slider is released.
