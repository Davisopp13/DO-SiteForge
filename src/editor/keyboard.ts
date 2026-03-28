// Keyboard — centralized keyboard shortcut handler
// All keyboard shortcuts are managed here to avoid conflicts and duplication

import type { ToolbarManager, ToolType } from './toolbar.js';
import type { OverlayManager } from './overlay.js';
import type { HistoryManager } from './history.js';
import type { CanvasManager } from './canvas.js';
import type { SidebarManager } from './sidebar.js';

export interface KeyboardManager {
  destroy(): void;
}

interface KeyboardDeps {
  toolbar: ToolbarManager;
  overlay: OverlayManager;
  history: HistoryManager;
  canvas: CanvasManager;
  sidebar?: SidebarManager;
}

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'select',
  m: 'select', // M is an alias for V (select)
  t: 'text',
  p: 'preview',
  a: 'add',
};

const VIEWPORT_SHORTCUTS: Record<string, string> = {
  '1': 'mobile',
  '2': 'tablet',
  '3': 'desktop',
  '4': 'custom',
};

export function createKeyboard(deps: KeyboardDeps): KeyboardManager {
  const { toolbar, overlay, history, canvas, sidebar } = deps;

  function isTextEditing(): boolean {
    return overlay.isTextEditing;
  }

  function isInputFocused(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement;
    return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  }

  function handleKeyDown(e: KeyboardEvent) {
    const isMeta = e.metaKey || e.ctrlKey;

    // --- Escape: always allowed (exits text edit, blurs chat input, or deselects) ---
    if (e.key === 'Escape') {
      // If chat input is focused, blur it and return focus to canvas
      if (sidebar && document.activeElement === sidebar.inputEl) {
        sidebar.inputEl.blur();
        e.preventDefault();
        return;
      }
      if (isTextEditing() && overlay.selectedElement) {
        // Exit text edit mode — send end message to bridge
        canvas.sendToBridge({
          type: 'forge:textEditEnd',
          xpath: overlay.selectedElement.xpath,
        });
      } else if (overlay.selectedElement) {
        // Deselect current element
        window.dispatchEvent(new CustomEvent('forge:requestDeselect'));
      }
      e.preventDefault();
      return;
    }

    // --- All other shortcuts blocked during text edit mode ---
    if (isTextEditing()) return;

    // --- Cmd+K: focus chat input (global, works even from inputs) ---
    if (isMeta && e.key.toLowerCase() === 'k' && sidebar) {
      e.preventDefault();
      sidebar.switchTab('chat');
      sidebar.focusInput();
      return;
    }

    // --- Cmd+L: clear chat history (global, works even from inputs) ---
    if (isMeta && e.key.toLowerCase() === 'l' && sidebar) {
      e.preventDefault();
      sidebar.clearChat();
      return;
    }

    // --- Don't fire if focus is in an input/textarea ---
    if (isInputFocused(e)) return;

    // --- Undo/Redo: Cmd+Z / Cmd+Shift+Z ---
    if (isMeta && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      history.redo();
      return;
    }
    if (isMeta && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      history.undo();
      return;
    }

    // --- Don't process single-key shortcuts if meta is held ---
    if (isMeta) return;

    // --- Tool switching: V, M, T, A ---
    const tool = TOOL_SHORTCUTS[e.key.toLowerCase()];
    if (tool) {
      e.preventDefault();
      toolbar.setTool(tool);
      return;
    }

    // --- Viewport switching: 1, 2, 3, 4 ---
    const viewport = VIEWPORT_SHORTCUTS[e.key];
    if (viewport) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('forge:viewportShortcut', {
        detail: { viewport },
      }));
      return;
    }

    // --- Delete/Backspace: delete selected element ---
    if ((e.key === 'Delete' || e.key === 'Backspace') && overlay.selectedElement) {
      e.preventDefault();
      const elementToDelete = overlay.selectedElement;
      canvas.sendToBridge({
        type: 'forge:deleteElement',
        xpath: elementToDelete.xpath,
      });
      // Write-back to source file for static projects
      sendDeleteEdit(canvas, overlay, elementToDelete.sourceLine, elementToDelete.sourceCol);
      // Deselect after delete
      window.dispatchEvent(new CustomEvent('forge:requestDeselect'));
      return;
    }

    // --- Arrow keys: nudge selected element ---
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && overlay.selectedElement) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      let deltaX = 0;
      let deltaY = 0;

      switch (e.key) {
        case 'ArrowUp': deltaY = -step; break;
        case 'ArrowDown': deltaY = step; break;
        case 'ArrowLeft': deltaX = -step; break;
        case 'ArrowRight': deltaX = step; break;
      }

      canvas.sendToBridge({
        type: 'forge:nudgeElement',
        xpath: overlay.selectedElement.xpath,
        deltaX,
        deltaY,
      });
      return;
    }
  }

  window.addEventListener('keydown', handleKeyDown);

  return {
    destroy() {
      window.removeEventListener('keydown', handleKeyDown);
    },
  };
}

function sendDeleteEdit(canvas: import('./canvas.js').CanvasManager, overlay: import('./overlay.js').OverlayManager, sourceLine: number | undefined, sourceCol: number | undefined) {
  // Only write back for static projects
  const iframeWin = (canvas.iframe.contentWindow as any);
  if (!iframeWin?.__sfIsStaticProject) return;

  // Skip if no source location (framework project or dynamic element)
  if (sourceLine == null || sourceCol == null) return;

  // Skip if write-back is locked (previous write is mid-reload cycle)
  if (overlay.writeBackLocked) return;

  overlay.lockWriteBack();

  fetch('/api/edits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      edit: {
        type: 'delete',
        sourceLine,
        sourceCol,
        filepath: '',
      },
    }),
  }).then(res => {
    if (!res.ok) {
      console.warn('[SiteForge] Delete write-back failed:', res.status, res.statusText);
    }
  }).catch(err => {
    console.warn('[SiteForge] Delete write-back error:', err);
  });
}
