# DO SiteForge — Phase 3A PRD: Source Map Bridge (Static HTML)

## Project Overview
Phase 3A adds the source map bridge for static HTML projects. When you visually edit an element on the canvas — drag it, edit text, delete it, add a new one — the change writes back to the actual HTML source file on disk. The canvas then refreshes via the existing live reload system. This closes the loop: visual edits become real code changes.

This phase targets static HTML projects only. Framework support (Next.js, Vite, Astro) will use the AI sidebar for code changes until a future phase extends the bridge with source map parsing.

Success: Open a static HTML site in SiteForge, drag an element, and see the corresponding HTML file updated on disk with the new inline style. Double-click text, edit it, and see the source file update. All changes visible in git diff.

## Architecture & Key Decisions
- **Line annotation**: During bridge injection, parse the HTML and annotate each element with `data-sf-line="N"` and `data-sf-col="N"` attributes indicating source position
- **Edit operations**: Move (adds/updates inline style), text edit (replaces text node content), delete (removes element from source), add (inserts element HTML at target position)
- **Source patching**: Server-side module that reads the HTML file, applies a targeted patch at the specified line/column, and writes back
- **Framework fallback**: For non-static projects, visual edits remain DOM-only (no write-back). The AI sidebar is the code change path for frameworks until Level 2/3.
- **Preserve formatting**: Patches should maintain the existing indentation and formatting of the HTML file — no reformatting the entire file on each edit
- **Atomic writes**: Each visual edit writes to the file immediately. The live reload system (Phase 2 fix-it patch) handles refreshing the canvas.

## New Files
```
src/
├── server/
│   ├── sourcemap/
│   │   ├── annotator.ts      # Parses HTML, adds data-sf-line/col attributes
│   │   ├── patcher.ts        # Applies visual edits to HTML source files
│   │   └── types.ts          # VisualEdit types (move, text, delete, insert)
│   └── routes/
│       └── edits.ts          # POST /api/edits — receives visual edits, applies patches
```

## Tasks

### Phase 3A-1: HTML Annotation

- [x] **Task 1: HTML line/column annotator**
  - Create `src/server/sourcemap/annotator.ts` with `annotateHtml(html: string): string`
  - Parse the HTML string and add `data-sf-line` and `data-sf-col` attributes to every element tag
  - `data-sf-line` = the 1-indexed line number where the opening tag starts in the source
  - `data-sf-col` = the 1-indexed column number where the `<` of the opening tag starts
  - Do NOT use a full DOM parser (like jsdom) — it would reformat the HTML. Use a lightweight regex or streaming parser that tracks line/column position while scanning for opening tags
  - Self-closing tags (`<br>`, `<img>`, `<hr>`, `<input>`) should be annotated too
  - Do NOT annotate `<html>`, `<head>`, `<body>`, `<script>`, `<style>`, `<link>`, `<meta>` tags — only visible content elements
  - Preserve all original whitespace, indentation, and formatting — the only modification is inserting the two data attributes into existing tags
  - Example: `<div class="hero">` on line 15, column 5 becomes `<div data-sf-line="15" data-sf-col="5" class="hero">`
  - Files to create: `src/server/sourcemap/annotator.ts`
  - Test: `npx tsc --noEmit` passes. Write a vitest test that annotates a sample HTML string and verifies line/col attributes are correct.

- [x] **Task 2: Inject annotations during static file serving**
  - Update `src/server/inject.ts`: when serving static HTML files, run the HTML through `annotateHtml()` before injecting the bridge script
  - The annotation happens in the `createStaticWithInjection()` function — annotate first, then inject bridge script
  - Annotations are added at serve time, NOT written to the source file — the source file stays clean
  - The bridge script can now read `data-sf-line` and `data-sf-col` from any element it queries
  - Files to modify: `src/server/inject.ts`
  - Test: `npx tsc --noEmit` passes. Open the static test fixture, inspect an element in browser devtools — it should have `data-sf-line` and `data-sf-col` attributes.

- [x] **Task 3: Bridge reports source location with element info**
  - Update `src/bridge/bridge.ts`: when `getElementInfo()` builds an `ElementInfo` object, include `sourceLine` and `sourceCol` fields read from `data-sf-line` and `data-sf-col`
  - If the attributes don't exist (framework project, or a dynamically inserted element), `sourceLine` and `sourceCol` are `null`
  - Update `ElementInfo` type in `src/bridge/protocol.ts` to include `sourceLine?: number` and `sourceCol?: number`
  - Files to modify: `src/bridge/bridge.ts`, `src/bridge/protocol.ts`
  - Test: `npx tsc --noEmit` passes

### Phase 3A-2: Source Patcher

- [x] **Task 4: Visual edit types**
  - Create `src/server/sourcemap/types.ts` with the `VisualEdit` union type:
    - `MoveEdit`: `{ type: 'move', sourceLine: number, sourceCol: number, filepath: string, deltaX: number, deltaY: number }` — element was dragged
    - `TextEdit`: `{ type: 'text', sourceLine: number, sourceCol: number, filepath: string, oldText: string, newText: string }` — text content was changed
    - `DeleteEdit`: `{ type: 'delete', sourceLine: number, sourceCol: number, filepath: string }` — element was removed
    - `InsertEdit`: `{ type: 'insert', targetLine: number, targetCol: number, filepath: string, html: string }` — new element added near target
    - `StyleEdit`: `{ type: 'style', sourceLine: number, sourceCol: number, filepath: string, property: string, value: string }` — a CSS property was changed (from properties panel, future use)
  - Also export `PatchResult`: `{ success: boolean, filepath: string, linesBefore: number, linesAfter: number, error?: string }`
  - Files to create: `src/server/sourcemap/types.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 5: HTML source patcher — move edits**
  - Create `src/server/sourcemap/patcher.ts` with `applyEdit(edit: VisualEdit, projectDir: string): PatchResult`
  - For `MoveEdit`:
    - Read the source file
    - Find the element at the specified line/col
    - Check if the element already has a `style` attribute
    - If yes: parse the existing style, update or add `position: relative`, `left: Xpx`, `top: Ypx` based on the delta values
    - If no: add a `style="position: relative; left: Xpx; top: Ypx;"` attribute to the tag
    - Write the file back
    - Handle edge case: if deltaX and deltaY are both 0, skip the write
  - Use string manipulation, not DOM parsing — find the tag by line/col, modify the attribute, write back. This preserves formatting.
  - Files to modify: `src/server/sourcemap/patcher.ts`
  - Test: `npx tsc --noEmit` passes. Vitest test: apply a MoveEdit to sample HTML, verify the style attribute is added/updated correctly.

- [x] **Task 6: HTML source patcher — text edits**
  - Extend `patcher.ts` with text edit handling
  - For `TextEdit`:
    - Read the source file
    - Find the element at the specified line/col
    - Locate the text content between the opening and closing tags
    - Replace `oldText` with `newText` in the element's text content
    - If the element contains mixed content (text + child elements), only replace the text node that matches `oldText`
    - Write the file back
  - Handle multi-line text: the text content may span multiple lines in the source file
  - Files to modify: `src/server/sourcemap/patcher.ts`
  - Test: `npx tsc --noEmit` passes. Vitest test: apply a TextEdit, verify text is replaced without affecting surrounding HTML.

- [x] **Task 7: HTML source patcher — delete edits**
  - Extend `patcher.ts` with delete edit handling
  - For `DeleteEdit`:
    - Read the source file
    - Find the element at the specified line/col
    - Find the matching closing tag (handle nested elements of the same type correctly)
    - Remove everything from the opening tag to the closing tag (inclusive)
    - Clean up empty lines left behind (remove lines that are now whitespace-only if they weren't before)
    - Write the file back
  - Safety: refuse to delete `<body>`, `<html>`, `<head>` elements. Return error in PatchResult.
  - Files to modify: `src/server/sourcemap/patcher.ts`
  - Test: `npx tsc --noEmit` passes. Vitest test: apply a DeleteEdit, verify element is removed and surrounding structure is intact.

- [x] **Task 8: HTML source patcher — insert edits**
  - Extend `patcher.ts` with insert edit handling
  - For `InsertEdit`:
    - Read the source file
    - Find the target element at the specified line/col
    - Insert the new HTML after the target element's closing tag
    - Auto-indent the inserted HTML to match the target element's indentation level
    - Write the file back
  - The `html` string in InsertEdit comes from the bridge (the outerHTML of the element that was added on the canvas)
  - Files to modify: `src/server/sourcemap/patcher.ts`
  - Test: `npx tsc --noEmit` passes. Vitest test: apply an InsertEdit, verify new element appears in correct position with proper indentation.

### Phase 3A-3: Edit API Route

- [x] **Task 9: Visual edit API endpoint**
  - Create `src/server/routes/edits.ts` with `POST /api/edits` endpoint
  - Request body: `{ edit: VisualEdit }` — a single visual edit operation
  - Calls `applyEdit()` from patcher.ts, returns the `PatchResult`
  - Validate: `sourceLine` and `sourceCol` must be present and positive integers
  - Validate: `filepath` must resolve within the project directory (reuse `resolveAndValidate` from files.ts)
  - For static projects, the filepath is typically `index.html` or whichever HTML file is being edited
  - Register route in `src/server/index.ts`
  - Files to create: `src/server/routes/edits.ts`
  - Files to modify: `src/server/index.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 10: Determine which file is being edited**
  - The bridge knows the source line/col of an element, but doesn't know which file it came from (a static site could have multiple HTML files)
  - In `src/server/index.ts` or `src/server/proxy.ts`: track which HTML file is currently being served to the iframe. Store it as `app.locals.sfCurrentFile`
  - When the static server serves an HTML file via `createStaticWithInjection()`, record the file path
  - The `/api/edits` endpoint reads `app.locals.sfCurrentFile` and uses it as the default filepath if none is provided in the edit
  - Files to modify: `src/server/proxy.ts` or `src/server/inject.ts`, `src/server/index.ts`, `src/server/routes/edits.ts`
  - Test: `npx tsc --noEmit` passes

### Phase 3A-4: Wire Overlay to Source Patcher

- [x] **Task 11: Overlay sends visual edits to server on drag finish**
  - In `src/editor/overlay.ts`: after a drag operation finishes (mouseup), if the selected element has `sourceLine` and `sourceCol`, POST a `MoveEdit` to `/api/edits`
  - Read `sourceLine` and `sourceCol` from the selected element's `ElementInfo`
  - Calculate deltaX and deltaY from the drag operation
  - Send the edit asynchronously — don't block the UI. If the write fails, log a warning to console but don't revert the visual change (the user can Cmd+Z)
  - Only send the edit for static projects (check a flag like `window.__sfIsStaticProject` or a config value)
  - If `sourceLine` is null (framework project or dynamic element), skip the write-back entirely
  - Files to modify: `src/editor/overlay.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 12: Overlay sends visual edits on text edit finish**
  - In `src/editor/overlay.ts`: after inline text editing completes (blur/escape), if the element has source location, POST a `TextEdit` to `/api/edits`
  - `oldText` comes from the original element info captured before editing started
  - `newText` comes from the updated element info after editing finishes
  - Same async fire-and-forget pattern as move edits
  - Files to modify: `src/editor/overlay.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 13: Overlay sends visual edits on delete**
  - In `src/editor/keyboard.ts` or `src/editor/overlay.ts`: when an element is deleted (Delete/Backspace key), if it has source location, POST a `DeleteEdit` to `/api/edits`
  - Same pattern: async, static-only, skip if no sourceLine
  - Files to modify: `src/editor/keyboard.ts` or `src/editor/overlay.ts`
  - Test: `npx tsc --noEmit` passes

- [x] **Task 14: Overlay sends visual edits on add element**
  - In `src/editor/overlay.ts`: when a new element is inserted (Add tool click), POST an `InsertEdit` to `/api/edits`
  - The `html` field is the outerHTML of the new element as created by the bridge
  - `targetLine` and `targetCol` come from the element that was clicked on (the insertion point)
  - Same pattern: async, static-only
  - Files to modify: `src/editor/overlay.ts`
  - Test: `npx tsc --noEmit` passes

### Phase 3A-5: Annotation Refresh and Polish

- [ ] **Task 15: Re-annotate after source file changes**
  - After a visual edit writes to the source file, the line numbers change. The next visual edit would use stale `data-sf-line` values.
  - Solution: after the live reload triggers (the iframe refreshes), the newly served HTML goes through `annotateHtml()` again automatically — because annotation happens at serve time. The refreshed page has correct line numbers.
  - Verify this works end-to-end: make a visual edit → file writes → live reload fires → page refreshes → new annotations are correct → next visual edit works.
  - If there's a timing issue (visual edit sent before reload completes), add a brief lock: disable visual edit write-back for 500ms after a write, then re-enable after the page has reloaded and re-annotated.
  - Files to modify: `src/editor/overlay.ts` (add write-back lock), potentially `src/editor/canvas.ts` (detect iframe reload)
  - Test: `npx tsc --noEmit` passes. Make two consecutive drag edits — both should write correctly to the source file.

- [ ] **Task 16: Visual edit indicator**
  - When a visual edit is successfully written to the source file, show a brief indicator on the canvas
  - Small toast/badge near the edited element: "Saved to index.html:15" in 10px monospace, fades after 2 seconds
  - If the write fails, show a subtle red indicator: "Write failed" that fades after 3 seconds
  - This gives the user confidence that their visual edits are persisting, not just modifying the DOM
  - Files to modify: `src/editor/overlay.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 17: Framework project indicator**
  - For non-static projects, show a subtle indicator when the user makes a visual edit: "Visual edits are preview-only for Next.js projects. Use the AI sidebar to make code changes."
  - Show this once per session on the first visual edit, as a dismissable info bar at the top of the canvas area
  - After dismissal, don't show it again for the rest of the session
  - Files to modify: `src/editor/overlay.ts` or `src/editor/canvas.ts`, `src/editor/styles.css`
  - Test: `npx tsc --noEmit` passes

- [ ] **Task 18: Update README and test**
  - Update README.md with: source map bridge explanation, which project types support visual edit write-back, limitations for framework projects
  - Verify full end-to-end: `forge open ./test/fixtures/static-site/` → drag element → check file on disk → text edit → check file → delete → check file → add → check file → git diff shows all changes
  - Test: `npm run typecheck && npm run build` both pass
  - Files to modify: `README.md`

## Testing Strategy
- Primary: `npx tsc --noEmit`
- Unit tests: vitest tests for annotator.ts (correct line/col) and patcher.ts (correct HTML modifications for each edit type)
- Build: `npx tsup` completes
- Integration: open static test fixture, make visual edits, verify source file changes on disk via `cat` or `git diff`

## Out of Scope
- No framework/React/Next.js source map support (Level 2/3 — future phase)
- No Tailwind class mapping (future phase)
- No CSS file editing (only inline styles for move edits)
- No Gemini integration (Phase 3B)
- No viewport-aware editing / responsive breakpoints (Phase 3C)
- No multi-file editing (one HTML file at a time)

## Notes for Ralph
- The annotator is the most critical piece to get right. It must track line/column positions accurately while scanning the HTML. A single off-by-one error means every visual edit writes to the wrong line. Write thorough vitest tests for this.
- Use a character-by-character scanner for the annotator, not regex. Regex can't reliably track line/column positions across multi-line attributes and nested quotes. Track `currentLine` (increment on `\n`) and `currentCol` (increment on each char, reset on `\n`).
- The patcher should read the file, apply the change, and write back — three steps. Don't try to stream or do incremental edits. The files are small (static HTML pages are rarely > 500 lines). Read-modify-write is fine.
- For move edits, `position: relative; left: Xpx; top: Ypx` is the simplest approach. Don't try to modify margin/padding — that requires understanding the CSS context. Relative positioning with offsets is always safe and predictable.
- For text edits, the old/new text comparison should be exact string matching within the element's content area. Don't use fuzzy matching — if the text can't be found exactly, return an error in PatchResult rather than modifying the wrong text.
- The write-back lock (Task 15) is important for avoiding race conditions. After writing, the live reload triggers an iframe refresh which re-annotates the HTML. Until that refresh completes, the old `data-sf-line` values in the DOM are stale. A 500ms lock is conservative but safe.
- For the test fixture, consider adding some multi-line elements, nested structures, and inline styles to test edge cases in the patcher.
- All visual edit write-backs are fire-and-forget from the frontend. The overlay sends the edit and doesn't wait for confirmation. The toast indicator (Task 16) provides feedback, but the user shouldn't be blocked from continuing to edit while a write is in progress.
