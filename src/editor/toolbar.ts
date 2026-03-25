// Toolbar — left toolbar with tool switching (Select, Text, Add)

export type ToolType = 'select' | 'text' | 'preview' | 'add';

export interface ToolbarManager {
  activeTool: ToolType;
  setTool(tool: ToolType): void;
}

// SVG icon paths (simple, hand-drawn style)
const ICONS: Record<ToolType, string> = {
  select: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 2 L4 14 L7.5 10.5 L11 15 L13 14 L9.5 9.5 L14 9 Z"/>
  </svg>`,
  text: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4 L14 4"/>
    <path d="M9 4 L9 15"/>
    <path d="M6.5 15 L11.5 15"/>
  </svg>`,
  preview: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7"/>
  </svg>`,
  add: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 4 L9 14"/>
    <path d="M4 9 L14 9"/>
  </svg>`,
};

const TOOL_LABELS: Record<ToolType, string> = {
  select: 'Select',
  text: 'Text',
  preview: 'Preview',
  add: 'Add',
};

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'select',
  t: 'text',
  p: 'preview',
  a: 'add',
};

export function createToolbar(toolbarEl: HTMLElement): ToolbarManager {
  let activeTool: ToolType = 'select';
  const buttons: Map<ToolType, HTMLButtonElement> = new Map();

  // Create tool buttons
  const tools: ToolType[] = ['select', 'text', 'preview', 'add'];
  for (const tool of tools) {
    const btn = document.createElement('button');
    btn.className = 'sf-tool-btn';
    btn.title = `${TOOL_LABELS[tool]} (${Object.entries(TOOL_SHORTCUTS).find(([, t]) => t === tool)?.[0]?.toUpperCase()})`;
    btn.innerHTML = ICONS[tool];
    btn.addEventListener('click', () => setTool(tool));
    toolbarEl.appendChild(btn);
    buttons.set(tool, btn);
  }

  // Separator
  const sep = document.createElement('div');
  sep.className = 'sf-toolbar-sep';
  toolbarEl.appendChild(sep);

  // Set initial active state
  updateActiveButton();

  // Mode badge at top of canvas area
  const modeBadge = createModeBadge();
  // Insert mode badge into the canvas area (parent's next sibling, the canvas div)
  const canvasEl = document.getElementById('sf-canvas');
  if (canvasEl) {
    canvasEl.appendChild(modeBadge);
  }

  function setTool(tool: ToolType) {
    if (tool === activeTool) return;
    activeTool = tool;
    updateActiveButton();
    updateModeBadge();

    // Dispatch event so overlay knows the active tool
    window.dispatchEvent(new CustomEvent('forge:toolChanged', {
      detail: { tool },
    }));
  }

  function updateActiveButton() {
    for (const [tool, btn] of buttons) {
      btn.classList.toggle('active', tool === activeTool);
    }
  }

  function updateModeBadge() {
    modeBadge.textContent = `${TOOL_LABELS[activeTool]} mode`;
    if (activeTool === 'preview') {
      modeBadge.style.background = 'rgba(58, 125, 68, 0.1)';
      modeBadge.style.color = '#3A7D44';
      modeBadge.style.borderColor = 'rgba(58, 125, 68, 0.3)';
    } else {
      modeBadge.style.background = 'var(--sf-bg-secondary)';
      modeBadge.style.color = 'var(--sf-text-secondary)';
      modeBadge.style.borderColor = 'var(--sf-border)';
    }
  }

  // Listen for text edit mode changes to update badge
  window.addEventListener('forge:textEditModeChanged', ((e: CustomEvent) => {
    if (e.detail?.editing) {
      modeBadge.textContent = 'Text edit mode';
      modeBadge.style.background = 'var(--sf-bg-secondary)';
      modeBadge.style.color = 'var(--sf-text-secondary)';
      modeBadge.style.borderColor = 'var(--sf-border)';
    } else {
      updateModeBadge();
    }
  }) as EventListener);

  // Keyboard shortcuts are handled centrally by keyboard.ts

  const manager: ToolbarManager = {
    get activeTool() { return activeTool; },
    setTool,
  };

  return manager;
}

function createModeBadge(): HTMLDivElement {
  const badge = document.createElement('div');
  badge.id = 'sf-mode-badge';
  badge.textContent = 'Select mode';
  badge.style.cssText = `
    position: absolute;
    top: 8px;
    left: 8px;
    background: var(--sf-bg-secondary);
    color: var(--sf-text-secondary);
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 11px;
    line-height: 1;
    padding: 5px 10px;
    border-radius: 4px;
    border: 1px solid var(--sf-border);
    white-space: nowrap;
    pointer-events: none;
    z-index: 16;
    user-select: none;
  `;
  return badge;
}
