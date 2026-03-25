# DO SiteForge — Phase 2 PRD: AI Chat Sidebar

## Project Overview
Phase 2 adds an AI chat sidebar to SiteForge powered by the Claude API. The sidebar lets you describe changes in natural language ("add a testimonials section below the hero", "make this button green") and Claude generates the code, which is applied to your project and reflected on the canvas via HMR. The sidebar is context-aware — it knows what element you have selected, what page you're on, and what viewport you're using.

This builds on the working Phase 1 canvas (select, drag, edit, viewport toggle, preview mode, undo/redo). No Gemini integration yet — that's Phase 3.

Tech additions: Anthropic Claude API (Messages API with streaming), server-side API proxy route, markdown rendering for chat responses.

Success: Select an element, type "make this bigger and change the color to green" in the sidebar, and see the change reflected on the canvas within seconds.

## Architecture & Key Decisions
- **AI provider**: Claude API via Anthropic Messages endpoint (server-side proxy — API key stays on the server)
- **Model**: claude-sonnet-4-20250514 for fast responses (user can configure to opus via `siteforge.config.json`)
- **Streaming**: Server-Sent Events (SSE) from Express to the editor frontend for streaming responses
- **Context serialization**: Canvas state serialized to a compact page description (not raw HTML — too noisy)
- **Chat storage**: In-memory on the server for the current session. No persistence between sessions (Phase 4).
- **Right panel**: Tabbed interface — "Properties" tab (existing) and "AI Chat" tab (new). Chat is the default active tab.
- **API key**: Read from `ANTHROPIC_API_KEY` environment variable or `siteforge.config.json`
- **No framework**: Chat UI is still vanilla TypeScript, consistent with Phase 1 editor architecture

## New Files
```
src/
├── server/
│   ├── ai.ts              # Claude API integration — messages, streaming, context assembly
│   └── routes/
│       └── chat.ts         # POST /api/chat — accepts message, returns SSE stream
├── editor/
│   ├── sidebar.ts          # Chat sidebar UI — message list, input, tabs
│   ├── context.ts          # Serializes canvas state into AI-readable context
│   └── markdown.ts         # Lightweight markdown-to-HTML renderer for chat responses
└── siteforge.config.json   # (user-created) Optional config: API key, model preference
```

## Environment & Setup
- `ANTHROPIC_API_KEY` environment variable must be set (or in `siteforge.config.json`)
- No new database
- New dependency: `marked` (markdown parsing) or build a minimal renderer
- New dependency: `eventsource-parser` (SSE parsing on client) — or use native EventSource

## Tasks

### Phase 2A: Server-Side AI Integration

- [x] **Task 1: Config and API key management**
  - Create config loader in `src/server/config.ts` that reads from: (1) environment variables, (2) `siteforge.config.json` in the project root, (3) `~/.siteforge/config.json` for global defaults
  - Config schema: `{ anthropicApiKey?: string, model?: string, maxTokens?: number }`
  - Priority: env var > project config > global config
  - On startup, if no API key is found, print a clear chalk warning: "No ANTHROPIC_API_KEY found. AI features will be disabled. Set it in your environment or in siteforge.config.json"
  - AI sidebar should show a disabled state with setup instructions if no key is configured
  - Files to create: `src/server/config.ts`
  - Files to modify: `src/server/index.ts` (load config on startup)
  - Test: `npx tsc --noEmit` passes

- [x] **Task 2: Claude API integration module**
  - Create `src/server/ai.ts` with a `streamChat()` function
  - Takes: messages array (role/content pairs), system prompt string, model string, maxTokens number
  - Calls Anthropic Messages API at `https://api.anthropic.com/v1/messages` with streaming enabled
  - Returns a ReadableStream of parsed SSE events (text deltas)
  - System prompt template built in: instructs Claude that it's a web development assistant inside SiteForge, should respond with code changes when asked, use the project's detected framework and styling approach, and reference specific files
  - Handle API errors gracefully: rate limits (429), auth errors (401), server errors (500) — return structured error objects, not raw exceptions
  - Files to create: `src/server/ai.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 3: Chat API route with SSE streaming**
  - Create `src/server/routes/chat.ts` with `POST /api/chat` endpoint
  - Request body: `{ message: string, context: PageContext, history: ChatMessage[] }`
  - Assembles the full prompt: system prompt + page context (injected into system prompt) + conversation history + new user message
  - Pipes Claude's streaming response as SSE events to the client: `event: delta\ndata: {"text": "..."}\n\n` for content, `event: done\ndata: {}\n\n` for completion, `event: error\ndata: {"message": "..."}\n\n` for errors
  - Content-Type: `text/event-stream` with `Cache-Control: no-cache` and `Connection: keep-alive`
  - Register route in `src/server/index.ts`
  - Files to create: `src/server/routes/chat.ts`
  - Files to modify: `src/server/index.ts` (register route, pass config)
  - Test: `npx tsc --noEmit` passes. `curl -X POST localhost:3000/api/chat -H "Content-Type: application/json" -d '{"message":"hello","context":{},"history":[]}' ` returns SSE stream (or error if no API key)

- [x] **Task 4: System prompt and context formatting**
  - In `src/server/ai.ts`, build a detailed system prompt that tells Claude:
    - It's inside DO SiteForge, a visual website builder
    - The current project type (Next.js, Vite, static, etc.) and root directory
    - When the user references "this element" or "the selected element", it refers to the element described in the context
    - It should respond with specific file changes when asked to modify the site
    - It should use the project's existing patterns (Tailwind if Tailwind is detected, CSS modules if those exist, etc.)
    - File changes should be formatted in markdown code blocks with the filename as the language identifier: ````src/components/Hero.tsx`
    - It should be concise — code first, brief explanation after
  - Context formatting: take the `PageContext` object (current page URL, selected element info, viewport width, page section summary) and serialize it into a readable string block injected into the system prompt
  - Files to modify: `src/server/ai.ts`
  - Test: `npx tsc --noEmit` passes

### Phase 2B: Canvas Context Serialization

- [x] **Task 5: Page context serializer**
  - Create `src/editor/context.ts` with `getPageContext()` function
  - Queries the bridge for a page summary: ordered list of top-level sections with tag, class, approximate role (hero, nav, card, footer, etc.), and text preview (first 50 chars)
  - Add `forge:getPageSummary` message to protocol.ts
  - Bridge handler walks the top-level children of `<body>`, returns array of `{ tag, className, id, role, textPreview, childCount, boundingRect }`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 6: Selected element context**
  - Extend `src/editor/context.ts` with `getSelectionContext()` function
  - When an element is selected, builds a context object: element tag, classes, id, xpath, text content (truncated to 200 chars), computed styles (font-size, color, background, padding, margin, border-radius, display, flex properties), parent element info (tag, class), sibling count, child count
  - When no element is selected, returns null
  - Combine with page context into a single `CanvasContext` object: `{ page: PageSummary, selection: SelectionContext | null, viewport: { width: number, mode: string }, projectType: string }`
  - Files to modify: `src/editor/context.ts`, `src/bridge/protocol.ts`, `src/bridge/bridge.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 7: Project file context**
  - Extend the server-side context with basic project awareness
  - On startup, scan the project directory for key files: `package.json` (deps), `tailwind.config.*` (Tailwind present?), `tsconfig.json` (TypeScript?), `src/` or `app/` directory listing (top-level files only)
  - Store as `ProjectContext`: `{ type, framework, hasTailwind, hasTypeScript, mainFiles: string[] }`
  - Include in the system prompt so Claude knows what tools/frameworks are available
  - Files to create: `src/server/project.ts`
  - Files to modify: `src/server/ai.ts` (include project context in system prompt)
  - Test: `npx tsc --noEmit` passes

### Phase 2C: Chat Sidebar UI

- [x] **Task 8: Tabbed right panel — Properties + AI Chat**
  - Refactor the right panel area to support tabs
  - Two tabs at the top of the right panel: "Properties" and "AI Chat"
  - "AI Chat" is the default active tab
  - Clicking "Properties" shows the existing properties panel content
  - Clicking "AI Chat" shows the chat interface (built in subsequent tasks)
  - When an element is selected, show a brief context indicator at the top of the chat: "Context: <button> .cta-btn" — so the user knows the AI will reference this element
  - Tab styling: simple underline on active tab, 13px text, muted inactive
  - Auto-switch to Properties tab when an element is selected (then user can switch back to Chat)
  - Files to create: `src/editor/sidebar.ts`
  - Files to modify: `src/editor/app.ts` (replace direct properties init with sidebar init), `src/editor/properties.ts` (export render function that sidebar calls)
  - Test: `npx tsc --noEmit` passes

- [x] **Task 9: Chat message list**
  - In `src/editor/sidebar.ts`, build the chat message area
  - Scrollable message container that takes up all space between the tab bar and input area
  - User messages: right-aligned, background uses `--sf-accent` at 10% opacity, 12px text, 12px rounded corners (rounded bottom-right is 4px)
  - AI messages: left-aligned, no background, 13px text
  - AI messages support rendered markdown: headings, bold, italic, code blocks (with monospace font and subtle background), inline code, lists
  - Code blocks in AI responses get a filename header if one is present (parsed from the markdown fence language), and a small "Copy" button
  - Auto-scroll to bottom on new messages
  - Loading indicator: three animated dots when waiting for AI response
  - Files to modify: `src/editor/sidebar.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 10: Markdown renderer**
  - Create `src/editor/markdown.ts` — lightweight markdown-to-HTML converter
  - Support: headings (##), bold (**), italic (*), inline code (`), fenced code blocks (``` with language), unordered lists (-), ordered lists (1.), links, paragraphs
  - Code blocks: wrap in `<pre><code>` with syntax highlighting class based on language fence
  - Sanitize output: strip any `<script>` tags or event handlers from the rendered HTML to prevent XSS
  - Do NOT use an external markdown library — keep it self-contained to avoid adding dependencies. A simple regex-based parser is fine for chat output.
  - Files to create: `src/editor/markdown.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 11: Chat input and send**
  - Add input area at the bottom of the chat panel
  - Textarea (not input) that auto-grows up to 4 lines, then scrolls internally
  - Send button to the right of the textarea (green arrow icon, uses --sf-green)
  - Enter to send, Shift+Enter for newline
  - Disable send while AI is responding (button grayed out, textarea shows "Waiting for response...")
  - On send: collect current message text, get canvas context from `context.ts`, get conversation history from sidebar state, POST to `/api/chat`
  - Clear textarea after send, add user message to chat immediately (optimistic UI)
  - Files to modify: `src/editor/sidebar.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 12: SSE stream handling and response rendering**
  - In `src/editor/sidebar.ts`, implement SSE client for streaming AI responses
  - On send: open a fetch request to `/api/chat` and read the response body as a stream
  - Parse SSE events: `delta` events append text to the current AI message, `done` event finalizes the message, `error` event shows error in chat
  - AI message content renders progressively — markdown is re-rendered on each delta (debounced to every 50ms to avoid excessive DOM updates)
  - When response is complete: scroll to bottom, re-enable input, add response to conversation history
  - Handle network errors: show "Connection error — try again" message in chat with a retry button
  - Files to modify: `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes

### Phase 2D: File Change Detection & Display

- [ ] **Task 13: Parse file changes from AI responses**
  - Create `src/editor/filechanges.ts` — parses Claude's responses for file change blocks
  - Detect markdown code fences with file paths as the language: ````src/components/Hero.tsx` → file change for `src/components/Hero.tsx`
  - Extract: filename, language (inferred from extension), and the code content
  - Return array of `FileChange` objects: `{ filepath: string, language: string, content: string, isNew: boolean }`
  - `isNew` is true if the file doesn't exist in the project yet (checked via a `/api/files/exists` endpoint — Task 14)
  - Files to create: `src/editor/filechanges.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 14: File operations API**
  - Create `src/server/routes/files.ts` with endpoints:
    - `GET /api/files/exists?path=<filepath>` — returns `{ exists: boolean }`
    - `POST /api/files/write` — body `{ filepath: string, content: string }` — writes file to the project directory
    - `GET /api/files/read?path=<filepath>` — returns file content (for future use)
  - Security: validate that all file paths resolve within the project root (prevent path traversal with `../`)
  - File writes trigger the dev server's HMR automatically (chokidar/Vite/Next.js watch the filesystem)
  - Register routes in `src/server/index.ts`
  - Files to create: `src/server/routes/files.ts`
  - Files to modify: `src/server/index.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 15: Apply changes button in chat**
  - When an AI response contains file changes (detected by `filechanges.ts`), render them as collapsible file change cards below the message
  - Each card shows: filename, "new file" or "modified" badge, syntax-highlighted code preview (collapsed by default, expandable)
  - An "Apply changes" button appears below the file change cards
  - Clicking "Apply changes": POSTs each file change to `/api/files/write`, shows a progress indicator, then shows "Changes applied — X files updated" confirmation
  - After applying: the dev server HMR picks up the file changes and the canvas iframe reloads the affected components automatically
  - If apply fails (write error), show the error inline with a retry option
  - Files to modify: `src/editor/sidebar.ts`, `src/editor/filechanges.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 16: Auto-apply toggle**
  - Add a small toggle in the chat input area: "Auto-apply" with a switch
  - When enabled: file changes from AI responses are written immediately without requiring the "Apply changes" button click
  - When disabled (default): user must click "Apply changes" to write files
  - Show a brief "Applied 2 files" toast notification when auto-apply writes files
  - Store the toggle state in memory (resets each session)
  - Files to modify: `src/editor/sidebar.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

### Phase 2E: Suggestion Chips & Polish

- [ ] **Task 17: Context-aware suggestion chips**
  - After each AI response, show 2-3 clickable suggestion chips below the response
  - Chips are generated based on the current context: what element is selected, what the AI just did, and what viewport is active
  - Hardcoded suggestion logic (not AI-generated — keep it fast):
    - After a component is created: "Add more content", "Style this differently", "Make it responsive"
    - When an element is selected: "Make this bigger", "Change the color", "Add animation"
    - When on mobile viewport: "Optimize for mobile", "Fix mobile layout", "Add hamburger menu"
    - Default (no special context): "Add a new section", "Improve the design", "Review the page"
  - Clicking a chip inserts the text into the chat input and auto-sends it
  - Files to modify: `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 18: No-API-key disabled state**
  - When no API key is configured, the chat tab should show a friendly setup guide
  - Display: SiteForge icon, "Set up AI to get started" heading, step-by-step instructions to set the API key (env var or config file), a text input where the user can paste their key and a "Save" button that writes it to `~/.siteforge/config.json`
  - After saving the key, the chat should immediately become active without restarting the server (POST to `/api/config/set-key` endpoint)
  - Properties tab should still work normally regardless of API key status
  - Files to modify: `src/editor/sidebar.ts`, `src/server/routes/chat.ts` (add `/api/config/set-key` endpoint), `src/server/config.ts` (add `setApiKey()` function)
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 19: Chat keyboard shortcuts and UX polish**
  - Cmd+K or Ctrl+K: focus the chat input from anywhere (global shortcut)
  - Cmd+L or Ctrl+L: clear chat history and start fresh
  - Escape while chat input is focused: blur the input and return focus to canvas
  - Add these to `src/editor/keyboard.ts`
  - Chat input should show a placeholder that changes based on context: "Describe a change..." (default), "Describe a change to <button>..." (when element selected), "AI features disabled — set API key" (no key)
  - Smooth scroll animations on new messages (not instant jump)
  - Files to modify: `src/editor/keyboard.ts`, `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 20: Wire everything end-to-end and update README**
  - Verify the full flow works: select element → open chat → type message → context is sent → Claude responds with code → file changes displayed → apply changes → canvas updates via HMR
  - Update `src/cli/commands/open.ts` startup message to show AI status: "AI: Ready (claude-sonnet-4-20250514)" or "AI: Disabled (no API key)"
  - Update README.md with: AI chat usage instructions, API key setup, keyboard shortcuts for chat, example conversations
  - Update test fixture if needed to demonstrate AI-driven changes
  - Files to modify: `src/cli/commands/open.ts`, `README.md`
  - Test: `npm run typecheck && npm run build` both pass

## Testing Strategy
- Primary: `npx tsc --noEmit` (typecheck)
- Secondary: `npx vitest run` (unit tests where they exist)
- Final: `npx tsup` builds without errors
- Integration: `ANTHROPIC_API_KEY=sk-xxx node dist/bin/forge.js open ./test/fixtures/static-site/` — open chat, send a message, verify response streams in
- No-key test: `node dist/bin/forge.js open ./test/fixtures/static-site/` — verify disabled state shows setup instructions

## Out of Scope
- No Gemini integration — Phase 3
- No screenshot-to-code — Phase 3 (requires Gemini)
- No prompt router — Phase 3 (only one model in Phase 2)
- No source map bridge / write-back from visual edits — Phase 3
- No viewport-aware editing (breakpoint-specific changes) — Phase 3
- No conversation persistence between sessions — Phase 4
- No Ralph/PRD integration from within SiteForge — Phase 4
- No component library — Phase 4
- No rate/time tracking — future consideration

## Notes for Ralph
- The chat sidebar is vanilla TypeScript — same as the rest of the editor. No React, no chat UI libraries.
- The Claude API call happens server-side in Express. The editor frontend NEVER sees the API key. Communication is via `/api/chat` with SSE streaming.
- The markdown renderer should be self-contained (no external library). It only needs to handle the subset of markdown that Claude typically uses in code-related responses: headings, bold, code blocks, inline code, lists, paragraphs. Don't over-engineer it.
- SSE parsing on the client: use `fetch()` with `response.body.getReader()` and manually parse the SSE text format. Do NOT use the EventSource API (it doesn't support POST requests).
- The system prompt is critical for response quality. It should tell Claude about the project type, the current page structure, and the selected element. But keep it under ~800 tokens — context injection should be compact, not a dump of the entire DOM.
- File change detection parses Claude's markdown response looking for fenced code blocks where the language/info string is a file path (contains `/` or `.`). This is a convention Claude already follows when asked to write code — no special prompting needed.
- When writing files via `/api/files/write`, the HMR reload happens automatically because Vite/Next.js/etc. watch the filesystem. SiteForge does NOT need to trigger a reload manually — the dev server handles it.
- The "Apply changes" flow is explicit by default (user clicks a button). The auto-apply toggle is opt-in. This prevents the AI from making unwanted changes to the user's codebase.
- The right panel should be resizable (or at minimum, wider than the Phase 1 properties panel — 320px instead of 240px) to accommodate chat content. A drag handle on the left edge of the panel would be ideal but is not required for Phase 2.
- All chat messages are stored in memory in the sidebar module. No server-side session storage, no database. Refreshing the page clears the chat. This is fine for Phase 2.
