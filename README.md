# SiteForge

A local-first visual website builder for vibe coders. SiteForge runs as a CLI tool that launches a browser-based canvas where you can select, drag, resize, and inline-edit elements on a live-rendered site.

## Installation

```bash
npm install -g siteforge
```

Or run directly from the repo:

```bash
npm install
npm run build
```

## Usage

```bash
forge open ./my-project
```

This will:
1. Detect your project type (Next.js, Vite, Astro, or static HTML)
2. Start your project's dev server on port 4200
3. Launch the SiteForge editor at `http://localhost:3000`
4. Open your browser automatically

### Supported Project Types

| Type | Detection | Dev Command | Visual Edit Write-back |
|------|-----------|-------------|------------------------|
| Next.js | `next` in package.json dependencies | `npx next dev --port 4200` | AI sidebar only |
| Vite | `vite` in package.json dependencies | `npx vite --port 4200` | AI sidebar only |
| Astro | `astro` in package.json dependencies | `npx astro dev --port 4200` | AI sidebar only |
| Static | Has `index.html` (fallback) | Express static server | Full write-back |

### Scaffold a New Project

```bash
forge new my-site
```

## Visual Edit Write-back (Source Map Bridge)

For **static HTML projects**, visual edits are written directly back to the source file on disk. When you drag, edit, delete, or add an element, the change is applied to the HTML file immediately — no manual code editing required.

### How It Works

1. When serving a static HTML file, SiteForge annotates each element with `data-sf-line` and `data-sf-col` attributes indicating its source position (line and column number in the file). These annotations are injected at serve time and never written to the source file.
2. When you make a visual edit on the canvas, the overlay reads the element's `data-sf-line`/`data-sf-col` and sends a `POST /api/edits` request to the server.
3. The server's source patcher locates the element in the HTML file by line/column, applies the targeted change, and writes the file back.
4. The live reload system detects the file change and refreshes the canvas. The refreshed page is re-annotated with updated line numbers, so subsequent edits are always accurate.

### Supported Visual Edit Operations

| Operation | What writes to disk |
|-----------|-------------------|
| Drag element | Adds/updates `style="position: relative; left: Xpx; top: Ypx;"` on the tag |
| Edit text (double-click) | Replaces the text node content between opening and closing tags |
| Delete element (`Delete` key) | Removes the element and its children from the source |
| Add element (`A` tool) | Inserts the new element's HTML after the target element |

### Framework Project Limitations

For **Next.js, Vite, and Astro projects**, visual edits are **preview-only** — they update the live DOM but do not write back to the source files. This is because framework components use JSX/TSX and build tooling that requires AST-level edits, not raw HTML patching.

For framework projects, use the **AI Chat** sidebar to describe the change you want — the AI generates the correct component code and you can apply it directly.

A banner is shown the first time you make a visual edit on a framework project as a reminder.

## AI Chat

SiteForge includes an AI chat sidebar powered by Claude. Describe changes in natural language and the AI generates code that can be applied to your project.

### Setup

Set your Anthropic API key via one of:

```bash
# Environment variable (recommended)
export ANTHROPIC_API_KEY=sk-ant-...

# Or project config
echo '{ "anthropicApiKey": "sk-ant-..." }' > siteforge.config.json

# Or global config
mkdir -p ~/.siteforge
echo '{ "anthropicApiKey": "sk-ant-..." }' > ~/.siteforge/config.json
```

You can also paste your key directly in the setup guide shown in the AI Chat tab when no key is configured.

### Using AI Chat

1. Open the **AI Chat** tab in the right panel
2. Select an element on the canvas (optional — gives the AI context)
3. Type a request like "make this button green" or "add a testimonials section below the hero"
4. The AI responds with code changes shown as collapsible file cards
5. Click **Apply changes** to write the files — your dev server's HMR updates the canvas automatically

**Auto-apply**: Toggle on to skip the manual apply step and write changes immediately.

### Example Conversations

- "Add a testimonials section with 3 cards below the hero"
- "Make this button larger and change the color to green"
- "Add a hamburger menu for mobile"
- "Improve the overall design of this page"

### Configuration

In `siteforge.config.json` or `~/.siteforge/config.json`:

```json
{
  "anthropicApiKey": "sk-ant-...",
  "model": "claude-sonnet-4-20250514",
  "maxTokens": 4096
}
```

## Keyboard Shortcuts

### Canvas

| Shortcut | Action |
|----------|--------|
| `V` / `M` | Select tool |
| `T` | Text tool |
| `P` | Preview mode |
| `A` | Add element tool |
| `1` | Mobile viewport (375px) |
| `2` | Tablet viewport (768px) |
| `3` | Desktop viewport (100%) |
| `4` | Custom viewport |
| `Delete` / `Backspace` | Delete selected element |
| `Escape` | Deselect / exit text edit / blur chat input |
| `Cmd+Z` / `Ctrl+Z` | Undo |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | Redo |
| `Arrow keys` | Nudge element 1px |
| `Shift + Arrow keys` | Nudge element 10px |

### AI Chat

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Focus chat input |
| `Cmd+L` / `Ctrl+L` | Clear chat history |
| `Enter` | Send message |
| `Shift+Enter` | New line in chat input |
| `Escape` | Blur chat input |

## Architecture

```
siteforge/
├── bin/forge.ts              # CLI entry point
├── src/
│   ├── cli/                  # Commander.js CLI setup
│   │   ├── commands/         # open, new commands
│   │   └── detect.ts         # Project type detection
│   ├── server/               # Express server
│   │   ├── ai.ts             # Claude API integration (streaming, system prompt)
│   │   ├── config.ts         # Config loader (env vars, project/global config)
│   │   ├── project.ts        # Project scanner (framework, deps, file list)
│   │   ├── proxy.ts          # Dev server proxy + process management
│   │   ├── inject.ts         # Bridge script injection + HTML annotation
│   │   ├── sourcemap/
│   │   │   ├── annotator.ts  # Adds data-sf-line/col to HTML at serve time
│   │   │   ├── patcher.ts    # Applies visual edits to HTML source files
│   │   │   └── types.ts      # VisualEdit union type (move, text, delete, insert)
│   │   └── routes/
│   │       ├── chat.ts       # POST /api/chat — SSE streaming AI responses
│   │       ├── edits.ts      # POST /api/edits — visual edit write-back
│   │       └── files.ts      # File operations (exists, read, write)
│   ├── editor/               # Browser-based editor UI (vanilla TypeScript)
│   │   ├── index.html        # Editor shell (three-panel layout)
│   │   ├── styles.css        # CSS variables for light/dark theming
│   │   ├── app.ts            # Main editor application
│   │   ├── canvas.ts         # Iframe management
│   │   ├── overlay.ts        # Interaction overlay (hover, select, drag)
│   │   ├── toolbar.ts        # Left toolbar (tool switching)
│   │   ├── sidebar.ts        # Tabbed right panel (AI Chat + Properties)
│   │   ├── properties.ts     # Element properties panel
│   │   ├── context.ts        # Canvas state serializer for AI context
│   │   ├── markdown.ts       # Lightweight markdown-to-HTML renderer
│   │   ├── filechanges.ts    # Parse and apply file changes from AI responses
│   │   ├── viewport.ts       # Responsive viewport toggle
│   │   ├── history.ts        # Undo/redo stack
│   │   └── keyboard.ts       # Centralized keyboard shortcuts
│   └── bridge/               # Injected into the target site's iframe
│       ├── bridge.ts         # DOM queries, element manipulation
│       └── protocol.ts       # Shared message types (editor <-> bridge)
└── test/
    └── detect.test.ts        # Project detection tests
```

The editor UI is vanilla TypeScript with no framework dependencies. The target site renders in a sandboxed iframe, and SiteForge communicates with it via `postMessage` through an injected bridge script. AI chat communicates with Claude via a server-side proxy (`/api/chat`) — the API key never reaches the browser.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

## Tech Stack

- **Runtime**: Node.js 20+
- **CLI**: Commander.js
- **Server**: Express 5
- **Bundler**: tsup
- **Editor UI**: Vanilla TypeScript (no framework)
- **Communication**: postMessage API between editor overlay and iframe bridge
- **Testing**: Vitest

## License

ISC
