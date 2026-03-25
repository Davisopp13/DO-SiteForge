// SiteForge Editor — Main Application Entry

import { createCanvas } from './canvas.js';
import { createOverlay } from './overlay.js';
import { createToolbar } from './toolbar.js';
import { createProperties } from './properties.js';
import { createHistory } from './history.js';

function init() {
  const toolbarEl = document.getElementById('sf-toolbar');
  const canvasEl = document.getElementById('sf-canvas');
  const propertiesEl = document.getElementById('sf-properties');

  if (!toolbarEl || !canvasEl || !propertiesEl) {
    console.error('SiteForge: Missing required DOM elements');
    return;
  }

  // Initialize toolbar (must be before overlay so mode badge is in the DOM)
  const toolbar = createToolbar(toolbarEl);

  // Initialize canvas with iframe
  const canvas = createCanvas(canvasEl);

  // Initialize overlay for element interaction
  const overlay = createOverlay(canvasEl, canvas);

  // Initialize properties panel
  const properties = createProperties(propertiesEl);

  // Initialize history (undo/redo)
  const history = createHistory(canvas);

  // Listen for move completions to record in history
  // Track pending drag state for history recording
  let pendingMoveXPath: string | null = null;
  let pendingMoveDelta = { x: 0, y: 0 };

  window.addEventListener('forge:dragStarted', ((e: CustomEvent) => {
    pendingMoveXPath = e.detail?.xpath || null;
    pendingMoveDelta = { x: 0, y: 0 };
  }) as EventListener);

  window.addEventListener('forge:dragFinished', ((e: CustomEvent) => {
    const { xpath, deltaX, deltaY } = e.detail || {};
    if (xpath && (deltaX !== 0 || deltaY !== 0)) {
      history.push({
        type: 'move',
        xpath,
        fromDeltaX: 0,
        fromDeltaY: 0,
        toDeltaX: deltaX,
        toDeltaY: deltaY,
      });
    }
    pendingMoveXPath = null;
  }) as EventListener);

  // Listen for text edits to record in history
  window.addEventListener('forge:textEdited', ((e: CustomEvent) => {
    const { xpath, oldText, newText } = e.detail || {};
    if (xpath && oldText !== newText) {
      history.push({
        type: 'textEdit',
        xpath,
        oldText,
        newText,
      });
    }
  }) as EventListener);

  // Listen for selection changes to update properties panel
  window.addEventListener('forge:selectionChanged', ((e: CustomEvent) => {
    properties.update(e.detail?.element || null);
  }) as EventListener);

  // Listen for move updates to refresh properties panel live
  window.addEventListener('forge:elementMoved', ((e: CustomEvent) => {
    if (e.detail?.element) {
      properties.update(e.detail.element);
    }
  }) as EventListener);

  // Listen for text edits to refresh properties
  window.addEventListener('forge:textEdited', ((e: CustomEvent) => {
    // Re-select after text edit to update displayed text content
    if (overlay.selectedElement) {
      properties.update(overlay.selectedElement);
    }
  }) as EventListener);

  console.log('SiteForge editor initialized');
}

document.addEventListener('DOMContentLoaded', init);
