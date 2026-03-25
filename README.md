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

| Type | Detection | Dev Command |
|------|-----------|-------------|
| Next.js | `next` in package.json dependencies | `npx next dev --port 4200` |
| Vite | `vite` in package.json dependencies | `npx vite --port 4200` |
| Astro | `astro` in package.json dependencies | `npx astro dev --port 4200` |
| Static | Has `index.html` (fallback) | Express static server |

### Scaffold a New Project

```bash
forge new my-site
```

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
│   │   ├── inject.ts         # Bridge script injection middleware
│   │   └── routes/
│   │       ├── chat.ts       # POST /api/chat — SSE streaming AI responses
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
