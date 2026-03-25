// Overlay — transparent div over the iframe that intercepts mouse events
// Draws hover highlights, selection boxes, and resize handles

import type { CanvasManager } from './canvas.js';
import type { ElementInfo, ElementRect } from '../bridge/protocol.js';

export interface OverlayManager {
  overlayEl: HTMLElement;
  selectedElement: ElementInfo | null;
  isTextEditing: boolean;
}

interface OverlayState {
  hoveredElement: ElementInfo | null;
  selectedElement: ElementInfo | null;
  isTextEditing: boolean;
  pendingHoverRequest: boolean;
}

export function createOverlay(canvasEl: HTMLElement, canvas: CanvasManager): OverlayManager {
  // Create overlay div positioned over iframe
  const overlayEl = document.createElement('div');
  overlayEl.id = 'sf-overlay';
  overlayEl.style.cssText = `
    position: absolute;
    inset: 0;
    z-index: 10;
    cursor: default;
  `;
  canvasEl.appendChild(overlayEl);

  // Highlight elements (absolutely positioned divs)
  const hoverHighlight = createHighlightDiv('sf-hover-highlight');
  const selectionBox = createHighlightDiv('sf-selection-box');
  const tagTooltip = createTagTooltip();
  const resizeHandles = createResizeHandles();

  overlayEl.appendChild(hoverHighlight);
  overlayEl.appendChild(selectionBox);
  overlayEl.appendChild(tagTooltip);
  for (const handle of resizeHandles) {
    overlayEl.appendChild(handle);
  }

  // State
  const state: OverlayState = {
    hoveredElement: null,
    selectedElement: null,
    isTextEditing: false,
    pendingHoverRequest: false,
  };

  // Listen for bridge responses
  canvas.onBridgeMessage((data) => {
    switch (data.type) {
      case 'forge:elementInfo': {
        if (data.requestType === 'atPoint') {
          state.pendingHoverRequest = false;
          state.hoveredElement = data.element;
          drawHoverHighlight(data.element);
        }
        break;
      }
      case 'forge:hover': {
        // Direct hover from bridge (when overlay isn't intercepting)
        state.hoveredElement = data.element;
        drawHoverHighlight(data.element);
        break;
      }
      case 'forge:select': {
        // Direct select from bridge (during text edit mode)
        handleSelect(data.element);
        break;
      }
    }
  });

  // Mouse events on overlay
  overlayEl.addEventListener('mousemove', (e: MouseEvent) => {
    if (state.isTextEditing) return;
    if (state.pendingHoverRequest) return;

    const iframeOffset = canvas.getIframeOffset();
    const x = e.clientX - iframeOffset.x;
    const y = e.clientY - iframeOffset.y;

    state.pendingHoverRequest = true;
    canvas.sendToBridge({
      type: 'forge:getElementAtPoint',
      x,
      y,
    });
  });

  overlayEl.addEventListener('click', (e: MouseEvent) => {
    if (state.isTextEditing) return;

    const iframeOffset = canvas.getIframeOffset();
    const x = e.clientX - iframeOffset.x;
    const y = e.clientY - iframeOffset.y;

    // Check if clicking on an element or empty space
    if (state.hoveredElement) {
      handleSelect(state.hoveredElement);
    } else {
      handleSelect(null);
    }
  });

  overlayEl.addEventListener('mouseleave', () => {
    state.hoveredElement = null;
    drawHoverHighlight(null);
  });

  // --- Drawing functions ---

  function drawHoverHighlight(element: ElementInfo | null) {
    if (!element || (state.selectedElement && element.xpath === state.selectedElement.xpath)) {
      hideElement(hoverHighlight);
      return;
    }

    const rect = toOverlayCoords(element.boundingRect);
    positionDiv(hoverHighlight, rect);
    hoverHighlight.style.border = '1.5px dashed var(--sf-accent)';
    hoverHighlight.style.background = 'rgba(55, 138, 221, 0.05)';
    hoverHighlight.style.pointerEvents = 'none';
    hoverHighlight.style.display = 'block';
  }

  function drawSelection(element: ElementInfo | null) {
    if (!element) {
      hideElement(selectionBox);
      hideElement(tagTooltip);
      hideResizeHandles();
      return;
    }

    const rect = toOverlayCoords(element.boundingRect);

    // Selection box
    positionDiv(selectionBox, rect);
    selectionBox.style.border = '2px solid var(--sf-accent)';
    selectionBox.style.background = 'rgba(55, 138, 221, 0.04)';
    selectionBox.style.pointerEvents = 'none';
    selectionBox.style.display = 'block';

    // Tag tooltip
    tagTooltip.textContent = element.tagName + (element.id ? `#${element.id}` : '') + (element.className ? `.${element.className.split(' ')[0]}` : '');
    tagTooltip.style.display = 'block';
    tagTooltip.style.left = `${rect.x}px`;
    tagTooltip.style.top = `${rect.y - 22}px`;

    // Resize handles at 4 corners
    drawResizeHandles(rect);
  }

  function handleSelect(element: ElementInfo | null) {
    state.selectedElement = element;
    drawSelection(element);
    // Hide hover highlight when selecting
    if (element) {
      hideElement(hoverHighlight);
    }

    // Dispatch custom event for properties panel etc.
    window.dispatchEvent(new CustomEvent('forge:selectionChanged', {
      detail: { element },
    }));
  }

  function toOverlayCoords(rect: ElementRect): ElementRect {
    const iframeOffset = canvas.getIframeOffset();
    const overlayRect = overlayEl.getBoundingClientRect();
    return {
      x: rect.x + iframeOffset.x - overlayRect.x,
      y: rect.y + iframeOffset.y - overlayRect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  function drawResizeHandles(rect: ElementRect) {
    const HANDLE_SIZE = 8;
    const half = HANDLE_SIZE / 2;

    const positions = [
      { x: rect.x - half, y: rect.y - half },                                    // top-left
      { x: rect.x + rect.width - half, y: rect.y - half },                       // top-right
      { x: rect.x - half, y: rect.y + rect.height - half },                      // bottom-left
      { x: rect.x + rect.width - half, y: rect.y + rect.height - half },         // bottom-right
    ];

    for (let i = 0; i < resizeHandles.length; i++) {
      const handle = resizeHandles[i];
      handle.style.left = `${positions[i].x}px`;
      handle.style.top = `${positions[i].y}px`;
      handle.style.display = 'block';
    }
  }

  function hideResizeHandles() {
    for (const handle of resizeHandles) {
      handle.style.display = 'none';
    }
  }

  // Expose state through the manager
  const manager: OverlayManager = {
    overlayEl,
    get selectedElement() { return state.selectedElement; },
    get isTextEditing() { return state.isTextEditing; },
  };

  return manager;
}

// --- Helper factories ---

function createHighlightDiv(id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = `
    position: absolute;
    display: none;
    pointer-events: none;
    border-radius: 2px;
    z-index: 11;
  `;
  return div;
}

function createTagTooltip(): HTMLDivElement {
  const div = document.createElement('div');
  div.id = 'sf-tag-tooltip';
  div.style.cssText = `
    position: absolute;
    display: none;
    background: #1a1a1a;
    color: #e8e8e8;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 10px;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 3px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 12;
  `;
  return div;
}

function createResizeHandles(): HTMLDivElement[] {
  const handles: HTMLDivElement[] = [];
  const cursors = ['nw-resize', 'ne-resize', 'sw-resize', 'se-resize'];

  for (let i = 0; i < 4; i++) {
    const handle = document.createElement('div');
    handle.className = 'sf-resize-handle';
    handle.style.cssText = `
      position: absolute;
      display: none;
      width: 8px;
      height: 8px;
      background: #fff;
      border: 1.5px solid var(--sf-accent);
      border-radius: 1px;
      cursor: ${cursors[i]};
      z-index: 13;
      pointer-events: none;
    `;
    handles.push(handle);
  }

  return handles;
}

function positionDiv(div: HTMLElement, rect: ElementRect) {
  div.style.left = `${rect.x}px`;
  div.style.top = `${rect.y}px`;
  div.style.width = `${rect.width}px`;
  div.style.height = `${rect.height}px`;
}

function hideElement(el: HTMLElement) {
  el.style.display = 'none';
}
