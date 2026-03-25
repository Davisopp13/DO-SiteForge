// History — undo/redo operation stack for move and text edit operations

import type { CanvasManager } from './canvas.js';

const MAX_HISTORY = 50;

export type OperationType = 'move' | 'textEdit' | 'insert';

export interface MoveOperation {
  type: 'move';
  xpath: string;
  fromDeltaX: number;
  fromDeltaY: number;
  toDeltaX: number;
  toDeltaY: number;
}

export interface TextEditOperation {
  type: 'textEdit';
  xpath: string;
  oldText: string;
  newText: string;
}

export interface InsertOperation {
  type: 'insert';
  xpath: string;
  parentXPath: string;
  childIndex: number;
  html: string;
}

export type Operation = MoveOperation | TextEditOperation | InsertOperation;

export interface HistoryManager {
  push(op: Operation): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

export function createHistory(canvas: CanvasManager): HistoryManager {
  const undoStack: Operation[] = [];
  const redoStack: Operation[] = [];

  // Undo/redo indicator elements in toolbar
  let undoBtn: HTMLButtonElement | null = null;
  let redoBtn: HTMLButtonElement | null = null;

  // Create undo/redo buttons in the toolbar (after the separator)
  createUndoRedoButtons();

  function push(op: Operation) {
    undoStack.push(op);
    // Cap history
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    // Clear redo stack on new operation
    redoStack.length = 0;
    updateIndicators();
  }

  function undo() {
    const op = undoStack.pop();
    if (!op) return;

    if (op.type === 'insert') {
      // Undo insert = remove the element
      canvas.sendToBridge({
        type: 'forge:removeElement',
        xpath: op.xpath,
      });
    } else {
      const reverse = reverseOperation(op);
      applyOperation(reverse);
    }
    redoStack.push(op);
    updateIndicators();
  }

  function redo() {
    const op = redoStack.pop();
    if (!op) return;

    if (op.type === 'insert') {
      // Redo insert = re-insert the element
      canvas.sendToBridge({
        type: 'forge:reinsertElement',
        parentXPath: op.parentXPath,
        childIndex: op.childIndex,
        html: op.html,
      });
    } else {
      applyOperation(op);
    }
    undoStack.push(op);
    updateIndicators();
  }

  function reverseOperation(op: Operation): Operation {
    switch (op.type) {
      case 'move':
        return {
          type: 'move',
          xpath: op.xpath,
          fromDeltaX: op.toDeltaX,
          fromDeltaY: op.toDeltaY,
          toDeltaX: op.fromDeltaX,
          toDeltaY: op.fromDeltaY,
        };
      case 'textEdit':
        return {
          type: 'textEdit',
          xpath: op.xpath,
          oldText: op.newText,
          newText: op.oldText,
        };
      case 'insert':
        // Handled directly in undo/redo functions
        return op;
    }
  }

  function applyOperation(op: Operation) {
    switch (op.type) {
      case 'move': {
        // Apply the move delta via bridge
        canvas.sendToBridge({
          type: 'forge:undoRedoMove',
          xpath: op.xpath,
          deltaX: op.toDeltaX,
          deltaY: op.toDeltaY,
        });
        break;
      }
      case 'textEdit': {
        // Apply text change via bridge
        canvas.sendToBridge({
          type: 'forge:undoRedoText',
          xpath: op.xpath,
          text: op.newText,
        });
        break;
      }
    }
  }

  function updateIndicators() {
    if (undoBtn) {
      undoBtn.style.opacity = undoStack.length > 0 ? '1' : '0.3';
      undoBtn.disabled = undoStack.length === 0;
      undoBtn.title = undoStack.length > 0
        ? `Undo (${undoStack.length}) — Cmd+Z`
        : 'Nothing to undo';
    }
    if (redoBtn) {
      redoBtn.style.opacity = redoStack.length > 0 ? '1' : '0.3';
      redoBtn.disabled = redoStack.length === 0;
      redoBtn.title = redoStack.length > 0
        ? `Redo (${redoStack.length}) — Cmd+Shift+Z`
        : 'Nothing to redo';
    }
  }

  function createUndoRedoButtons() {
    const toolbarEl = document.getElementById('sf-toolbar');
    if (!toolbarEl) return;

    // Undo button
    undoBtn = document.createElement('button');
    undoBtn.className = 'sf-tool-btn';
    undoBtn.innerHTML = `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 8 L2 6 L4 4"/>
      <path d="M2 6 L10 6 Q14 6 14 10 Q14 14 10 14 L7 14"/>
    </svg>`;
    undoBtn.title = 'Nothing to undo';
    undoBtn.style.opacity = '0.3';
    undoBtn.disabled = true;
    undoBtn.addEventListener('click', () => undo());
    toolbarEl.appendChild(undoBtn);

    // Redo button
    redoBtn = document.createElement('button');
    redoBtn.className = 'sf-tool-btn';
    redoBtn.innerHTML = `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 8 L16 6 L14 4"/>
      <path d="M16 6 L8 6 Q4 6 4 10 Q4 14 8 14 L11 14"/>
    </svg>`;
    redoBtn.title = 'Nothing to redo';
    redoBtn.style.opacity = '0.3';
    redoBtn.disabled = true;
    redoBtn.addEventListener('click', () => redo());
    toolbarEl.appendChild(redoBtn);
  }

  // Keyboard shortcuts are handled centrally by keyboard.ts

  const manager: HistoryManager = {
    push,
    undo,
    redo,
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
  };

  return manager;
}
