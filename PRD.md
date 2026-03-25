# DO SiteForge — Phase 2.5 PRD: Claude Code CLI Integration

## Project Overview
This patch adds Claude Code CLI as the preferred AI backend for SiteForge's chat sidebar. When Claude Code is installed, SiteForge spawns it as a subprocess and pipes prompts through it — getting OAuth auth, rich project context, and direct file writes for free. When Claude Code isn't available, it falls back to the raw Anthropic API with a user-provided key (the existing Phase 2 implementation).

The chat sidebar UI, context serialization, and conversation flow remain unchanged. This patch only modifies the server-side AI layer and the file change display in the frontend.

Success: With Claude Code installed, open SiteForge, type "add a footer", and see Claude Code write the file directly — no API key needed, no "Apply changes" button, canvas updates via HMR automatically.

## Architecture & Key Decisions
- **Detection**: On startup, check if `claude` CLI exists in PATH via `which claude` (macOS/Linux)
- **Preferred path**: Claude Code CLI via subprocess (stdin/stdout pipe)
- **Fallback path**: Raw Anthropic API (existing Phase 2 implementation, unchanged)
- **Abstraction**: New `AIProvider` interface that both backends implement — server routes don't know which backend is active
- **Claude Code mode**: Spawns `claude` with `--print` flag for non-interactive use, passes the project directory as context
- **File writes**: In Claude Code mode, Claude writes files directly to disk. SiteForge detects the changes via chokidar file watcher and reports them in the chat UI after the fact (instead of before via "Apply changes")
- **No changes to**: editor frontend architecture, chat sidebar UI, bridge/overlay, context serialization

## New Files
```
src/
├── server/
│   ├── providers/
│   │   ├── types.ts           # AIProvider interface definition
│   │   ├── claude-code.ts     # Claude Code CLI subprocess provider
│   │   └── anthropic-api.ts   # Raw API provider (refactored from existing ai.ts)
│   └── watcher.ts             # File change watcher for Claude Code mode
```

## Tasks

### Phase 2.5A: Provider Abstraction

- [x] **Task 1: AIProvider interface and detection**
  - Create `src/server/providers/types.ts` with `AIProvider` interface:
    ```
    interface AIProvider {
      name: string                    // 'claude-code' or 'anthropic-api'
      available: boolean              // is this provider usable?
      supportsDirectFileWrites: boolean  // does it write files itself?
      streamChat(params: ChatParams): AsyncIterable<ChatEvent>
    }
    ```
  - `ChatParams`: `{ message: string, context: PageContext, history: ChatMessage[], projectRoot: string }`
  - `ChatEvent`: `{ type: 'delta' | 'done' | 'error' | 'file_changed', data: any }`
  - Create detection function `detectProviders()` in `src/server/providers/types.ts`:
    - Check for `claude` in PATH using `child_process.execSync('which claude')` wrapped in try/catch
    - Check for API key via existing config loader
    - Return: `{ preferred: AIProvider | null, fallback: AIProvider | null, active: AIProvider }`
    - Priority: Claude Code (if found) > API key (if configured) > null (disabled)
  - Files to create: `src/server/providers/types.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 2: Refactor existing API integration into Anthropic API provider**
  - Move the existing Claude API logic from `src/server/ai.ts` into `src/server/providers/anthropic-api.ts`
  - Implement the `AIProvider` interface: `name: 'anthropic-api'`, `available` based on API key being set, `supportsDirectFileWrites: false`
  - `streamChat()` wraps the existing `streamChat()` function, yielding `ChatEvent` objects from the SSE stream
  - Keep `src/server/ai.ts` as a thin orchestrator that selects the active provider and delegates
  - The system prompt assembly and context formatting stay in `src/server/ai.ts` (shared by both providers)
  - Files to create: `src/server/providers/anthropic-api.ts`
  - Files to modify: `src/server/ai.ts` (refactor to use provider interface)
  - Test: `npx tsc --noEmit` passes. Existing API key flow still works unchanged.

- [x] **Task 3: Claude Code CLI provider**
  - Create `src/server/providers/claude-code.ts` implementing `AIProvider`
  - `name: 'claude-code'`, `available` based on detection, `supportsDirectFileWrites: true`
  - `streamChat()` implementation:
    - Spawn `claude` as a child process with: `claude --print --output-format stream-json` and pipe the assembled prompt to stdin
    - The prompt sent to Claude Code includes: the user's message, the serialized canvas context (same format as API path), and an instruction prefix: "You are inside DO SiteForge editing a website. The user is looking at the canvas and asking for changes. Write files directly to implement the request."
    - Parse Claude Code's stdout as streaming JSON events, yield as `ChatEvent` objects
    - Map Claude Code's output events to `ChatEvent` types: text content → `delta`, completion → `done`, errors → `error`
    - Set `cwd` of the child process to the project root directory so Claude Code has full project context
  - Handle process errors: if `claude` crashes or times out (30s), yield an error event and clean up the subprocess
  - Files to create: `src/server/providers/claude-code.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 4: Provider selection and startup integration**
  - Update `src/server/ai.ts` to use `detectProviders()` on init
  - Log the active provider at startup via chalk: "AI: Claude Code (OAuth)" or "AI: Anthropic API (sk-...xxxx)" or "AI: Disabled (no provider available)"
  - Update `src/server/routes/chat.ts` to use the provider abstraction — it should call `ai.streamChat()` without knowing which provider is active
  - Add `GET /api/ai/status` endpoint that returns: `{ provider: string, available: boolean, supportsDirectWrites: boolean }` — the frontend uses this to adapt the UI
  - Update `src/cli/commands/open.ts` startup message to show which provider is active
  - Files to modify: `src/server/ai.ts`, `src/server/routes/chat.ts`, `src/cli/commands/open.ts`
  - Files to create or modify: `src/server/index.ts` (register status endpoint)
  - Test: `npx tsc --noEmit` passes. With Claude Code installed, startup shows "AI: Claude Code (OAuth)". Without, falls back to API key or disabled.

### Phase 2.5B: File Change Detection for Claude Code Mode

- [x] **Task 5: File watcher for direct writes**
  - Create `src/server/watcher.ts` using chokidar to watch the project directory for file changes
  - Ignore: `node_modules/`, `.git/`, `dist/`, `.next/`, `.siteforge/`
  - When a file change is detected during an active Claude Code chat session: record the change as `{ filepath, type: 'created' | 'modified' | 'deleted', timestamp }`
  - Expose `startWatching()`, `stopWatching()`, `getRecentChanges(since: number): FileChange[]`
  - The watcher is only active during a Claude Code chat response (start when chat begins, stop when response completes) to avoid noise from unrelated file changes
  - Files to create: `src/server/watcher.ts`
  - Files to modify: `src/server/ai.ts` (start/stop watcher around Claude Code sessions)
  - Test: `npx tsc --noEmit` passes

- [x] **Task 6: Report file changes in chat after Claude Code response**
  - When using Claude Code provider and a response completes, query the watcher for file changes that occurred during the session
  - Send file changes to the frontend as `file_changed` events via SSE after the `done` event: `event: files\ndata: {"changes": [{"filepath": "src/components/Footer.tsx", "type": "created"}, ...]}\n\n`
  - The chat sidebar receives these events and displays them as a file change summary below the AI message — same visual treatment as the Phase 2 file change cards, but labeled "Files written by Claude Code" instead of showing an "Apply changes" button
  - Each file change card shows: filename, created/modified badge, and a "View" button that shows the file content in an expandable code block (fetched via `GET /api/files/read`)
  - Files to modify: `src/server/routes/chat.ts` (emit file events), `src/editor/sidebar.ts` (handle `files` SSE event)
  - Test: `npx tsc --noEmit` passes

### Phase 2.5C: Frontend Adaptation

- [x] **Task 7: Adapt chat UI based on active provider**
  - On sidebar initialization, fetch `/api/ai/status` to determine which provider is active
  - If Claude Code provider (`supportsDirectWrites: true`):
    - Hide the "Apply changes" button on AI responses (files are already written)
    - Hide the "Auto-apply" toggle (not needed — writes are automatic)
    - Show a small "Claude Code" badge next to the AI label in chat messages
    - File change cards show "Written" badge instead of code preview + apply button
  - If Anthropic API provider (`supportsDirectWrites: false`):
    - Show "Apply changes" button and "Auto-apply" toggle as designed in Phase 2
    - Show a small "API" badge next to the AI label in chat messages
  - If no provider available:
    - Show the setup guide (already built in Phase 2 Task 18)
    - Add a note: "Install Claude Code for the best experience — no API key needed"
  - Files to modify: `src/editor/sidebar.ts`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 8: Undo support for Claude Code writes**
  - When Claude Code writes files directly, the user should be able to undo those changes
  - Before a Claude Code chat session starts, snapshot the files that might be affected (this is hard to predict — so instead, use git)
  - Check if the project has a git repo. If yes: before each Claude Code session, store the current git HEAD as a restore point. Add an "Undo AI changes" button to the file change card that runs `git checkout -- <filepath>` for each changed file.
  - If no git repo: show a warning "Undo not available — initialize git for undo support" and skip the undo button
  - The git restore triggers HMR reload automatically (file change on disk)
  - Files to modify: `src/server/routes/chat.ts` (add undo endpoint), `src/editor/sidebar.ts` (add undo button to file change cards)
  - Files to create: `src/server/git.ts` (git status check, snapshot, restore helpers)
  - Test: `npx tsc --noEmit` passes

## Testing Strategy
- Primary: `npx tsc --noEmit` (typecheck)
- Final: `npx tsup` builds without errors
- Integration with Claude Code: `node dist/bin/forge.js open ./test/fixtures/static-site/` — verify "AI: Claude Code (OAuth)" in startup, send a chat message, verify response streams and files are written
- Integration without Claude Code: rename/hide `claude` binary temporarily, verify fallback to API key path
- Fallback test: no Claude Code AND no API key → verify disabled state with setup guide

## Out of Scope
- No Gemini integration — Phase 3
- No prompt router — Phase 3
- No source map bridge — Phase 3
- No conversation persistence — Phase 4
- No switching between providers mid-session (restart required)

## Notes for Ralph
- `claude --print --output-format stream-json` is the non-interactive mode for Claude Code. It reads from stdin, streams JSON events to stdout, and exits when done. Test this manually first to confirm the flag names — they may have changed since training data.
- The provider abstraction is intentionally simple — just `streamChat()` returning an async iterable. Don't over-engineer it with middleware, retry logic, or provider chains. Two providers, one interface, pick on startup.
- chokidar is already installed from Phase 1 (used for dev server file watching). No new dependency needed for the watcher.
- The git-based undo is a pragmatic solution, not a perfect one. It restores individual files, not atomic commits. If Claude Code writes 3 files and the user undoes 1, the other 2 stay. This is fine for Phase 2.5 — a more sophisticated undo (shadow copies, virtual filesystem) can come later.
- Claude Code subprocess should be spawned fresh for each chat message, not kept as a persistent process. This keeps the implementation simple and avoids state management issues.
- When piping the prompt to Claude Code's stdin, include the canvas context in the same format as the API path — but you can be less verbose since Claude Code already has project context from the filesystem. Focus the context injection on: what the user is looking at (selected element), what viewport they're on, and what page they're editing.
- The `/api/ai/status` endpoint is called once on sidebar init. Don't poll it — the provider doesn't change during a session.
