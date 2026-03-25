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

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `V` | Select tool |
| `M` | Move tool |
| `T` | Text tool |
| `A` | Add element tool |
| `1` | Mobile viewport (375px) |
| `2` | Tablet viewport (768px) |
| `3` | Desktop viewport (100%) |
| `4` | Custom viewport |
| `Delete` / `Backspace` | Delete selected element |
| `Escape` | Deselect / exit text edit |
| `Cmd+Z` / `Ctrl+Z` | Undo |
| `Cmd+Shift+Z` / `Ctrl+Shift+Z` | Redo |
| `Arrow keys` | Nudge element 1px |
| `Shift + Arrow keys` | Nudge element 10px |

## Architecture

```
siteforge/
├── bin/forge.ts              # CLI entry point
├── src/
│   ├── cli/                  # Commander.js CLI setup
│   │   ├── commands/         # open, new commands
│   │   └── detect.ts         # Project type detection
│   ├── server/               # Express server
│   │   ├── proxy.ts          # Dev server proxy + process management
│   │   └── inject.ts         # Bridge script injection middleware
│   ├── editor/               # Browser-based editor UI (vanilla TypeScript)
│   │   ├── index.html        # Editor shell (three-panel layout)
│   │   ├── styles.css        # CSS variables for light/dark theming
│   │   ├── app.ts            # Main editor application
│   │   ├── canvas.ts         # Iframe management
│   │   ├── overlay.ts        # Interaction overlay (hover, select, drag)
│   │   ├── toolbar.ts        # Left toolbar (tool switching)
│   │   ├── properties.ts     # Right properties panel
│   │   ├── viewport.ts       # Responsive viewport toggle
│   │   ├── history.ts        # Undo/redo stack
│   │   └── keyboard.ts       # Centralized keyboard shortcuts
│   └── bridge/               # Injected into the target site's iframe
│       ├── bridge.ts         # DOM queries, element manipulation
│       └── protocol.ts       # Shared message types (editor <-> bridge)
└── test/
    └── detect.test.ts        # Project detection tests
```

The editor UI is vanilla TypeScript with no framework dependencies. The target site renders in a sandboxed iframe, and SiteForge communicates with it via `postMessage` through an injected bridge script.

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
