// Overlay — transparent div over the iframe that intercepts mouse events
// Draws hover highlights, selection boxes, and resize handles

import type { CanvasManager } from './canvas.js';
import type { ElementInfo, ElementRect } from '../bridge/protocol.js';

export interface OverlayManager {
  overlayEl: HTMLElement;
  selectedElement: ElementInfo | null;
  isTextEditing: boolean;
  isPreviewMode: boolean;
}

interface DragState {
  isDragging: boolean;
  startClientX: number;
  startClientY: number;
  currentDeltaX: number;
  currentDeltaY: number;
  elementXPath: string;
}

interface OverlayState {
  hoveredElement: ElementInfo | null;
  selectedElement: ElementInfo | null;
  isTextEditing: boolean;
  isTransitioning: boolean;
  isPreviewMode: boolean;
  pendingHoverRequest: boolean;
  drag: DragState | null;
  activeTool: string;
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
  const positionIndicator = createPositionIndicator();

  overlayEl.appendChild(hoverHighlight);
  overlayEl.appendChild(selectionBox);
  overlayEl.appendChild(tagTooltip);
  overlayEl.appendChild(positionIndicator);
  for (const handle of resizeHandles) {
    overlayEl.appendChild(handle);
  }

  // State
  const state: OverlayState = {
    hoveredElement: null,
    selectedElement: null,
    isTextEditing: false,
    isTransitioning: false,
    isPreviewMode: false,
    pendingHoverRequest: false,
    drag: null,
    activeTool: 'select',
  };

  // Text edit mode indicator
  const textEditIndicator = createTextEditIndicator();
  overlayEl.appendChild(textEditIndicator);

  // Listen for bridge responses
  canvas.onBridgeMessage((data) => {
    switch (data.type) {
      case 'forge:elementInfo': {
        if (data.requestType === 'atPoint') {
          state.pendingHoverRequest = false;
          state.hoveredElement = data.element;
          drawHoverHighlight(data.element);
          updateCursor();
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
      case 'forge:moveComplete': {
        // Update selection with final position after drag
        if (state.selectedElement && state.selectedElement.xpath === data.xpath) {
          state.selectedElement = {
            ...state.selectedElement,
            boundingRect: data.finalRect,
          };
          drawSelection(state.selectedElement);
        }
        break;
      }
      case 'forge:elementInserted': {
        // Auto-select the newly inserted element
        handleSelect(data.element);
        // Dispatch event for history tracking
        window.dispatchEvent(new CustomEvent('forge:elementInserted', {
          detail: {
            element: data.element,
            parentXPath: data.parentXPath,
            childIndex: data.childIndex,
            html: data.html,
          },
        }));
        break;
      }
      case 'forge:textEditComplete': {
        // Bridge signals that text editing has finished
        exitTextEditMode();
        // Dispatch event for history tracking
        window.dispatchEvent(new CustomEvent('forge:textEdited', {
          detail: {
            xpath: data.xpath,
            oldText: data.oldText,
            newText: data.newText,
          },
        }));
        break;
      }
    }
  });

  // Update cursor based on current state
  function updateCursor() {
    if (state.drag) {
      overlayEl.style.cursor = 'grabbing';
    } else if (state.activeTool === 'add') {
      overlayEl.style.cursor = 'crosshair';
    } else if (
      state.hoveredElement && state.selectedElement &&
      state.hoveredElement.xpath === state.selectedElement.xpath
    ) {
      overlayEl.style.cursor = 'grab';
    } else {
      overlayEl.style.cursor = 'default';
    }
  }

  // Listen for tool changes
  window.addEventListener('forge:toolChanged', ((e: CustomEvent) => {
    const prevTool = state.activeTool;
    state.activeTool = e.detail?.tool || 'select';

    if (state.activeTool === 'preview') {
      enterPreviewMode();
    } else if (prevTool === 'preview') {
      exitPreviewMode();
    }

    updateCursor();
  }) as EventListener);

  // Mouse events on overlay
  overlayEl.addEventListener('mousemove', (e: MouseEvent) => {
    if (state.isTextEditing || state.isTransitioning) return;

    // Handle drag in progress
    if (state.drag) {
      const deltaX = e.clientX - state.drag.startClientX;
      const deltaY = e.clientY - state.drag.startClientY;
      state.drag.currentDeltaX = deltaX;
      state.drag.currentDeltaY = deltaY;

      // Send move to bridge for visual feedback
      canvas.sendToBridge({
        type: 'forge:move',
        xpath: state.drag.elementXPath,
        deltaX,
        deltaY,
      });

      // Update position indicator near cursor
      updatePositionIndicator(e.clientX, e.clientY, deltaX, deltaY);

      // Update selection box position to follow the drag
      if (state.selectedElement) {
        const movedRect = {
          x: state.selectedElement.boundingRect.x + deltaX,
          y: state.selectedElement.boundingRect.y + deltaY,
          width: state.selectedElement.boundingRect.width,
          height: state.selectedElement.boundingRect.height,
        };
        const overlayCoords = toOverlayCoords(movedRect);
        positionDiv(selectionBox, overlayCoords);
        drawResizeHandles(overlayCoords);
        // Move tag tooltip too
        tagTooltip.style.left = `${overlayCoords.x}px`;
        tagTooltip.style.top = `${overlayCoords.y - 22}px`;
      }

      return;
    }

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

  overlayEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (state.isTextEditing || state.isTransitioning) return;

    // Start drag if clicking on a selected element
    if (state.selectedElement && state.hoveredElement &&
        state.hoveredElement.xpath === state.selectedElement.xpath) {
      e.preventDefault();
      state.drag = {
        isDragging: true,
        startClientX: e.clientX,
        startClientY: e.clientY,
        currentDeltaX: 0,
        currentDeltaY: 0,
        elementXPath: state.selectedElement.xpath,
      };
      updateCursor();

      // Dispatch drag start for history tracking
      window.dispatchEvent(new CustomEvent('forge:dragStarted', {
        detail: { xpath: state.selectedElement.xpath },
      }));
    }
  });

  overlayEl.addEventListener('mouseup', (e: MouseEvent) => {
    if (state.drag) {
      // Finalize the move
      canvas.sendToBridge({
        type: 'forge:finishMove',
        xpath: state.drag.elementXPath,
      });

      // Dispatch drag finished for history tracking
      window.dispatchEvent(new CustomEvent('forge:dragFinished', {
        detail: {
          xpath: state.drag.elementXPath,
          deltaX: state.drag.currentDeltaX,
          deltaY: state.drag.currentDeltaY,
        },
      }));

      hideElement(positionIndicator);
      state.drag = null;
      updateCursor();
      return;
    }

    if (state.isTextEditing) return;

    // Add tool: insert a new element at click position
    if (state.activeTool === 'add') {
      const iframeOffset = canvas.getIframeOffset();
      const x = e.clientX - iframeOffset.x;
      const y = e.clientY - iframeOffset.y;
      canvas.sendToBridge({
        type: 'forge:insertElement',
        x,
        y,
      });
      return;
    }

    // Normal click — select the hovered element
    if (state.hoveredElement) {
      handleSelect(state.hoveredElement);
    } else {
      handleSelect(null);
    }
  });

  overlayEl.addEventListener('dblclick', (e: MouseEvent) => {
    if (state.isTextEditing) return;

    // Double-click on a selected (or hovered) element to start text editing
    const targetElement = state.hoveredElement || state.selectedElement;
    if (!targetElement) return;

    e.preventDefault();

    // Select the element if not already selected
    if (!state.selectedElement || state.selectedElement.xpath !== targetElement.xpath) {
      handleSelect(targetElement);
    }

    enterTextEditMode(targetElement.xpath);
  });

  overlayEl.addEventListener('mouseleave', () => {
    // If dragging, finalize on leave
    if (state.drag) {
      canvas.sendToBridge({
        type: 'forge:finishMove',
        xpath: state.drag.elementXPath,
      });

      // Dispatch drag finished for history tracking
      window.dispatchEvent(new CustomEvent('forge:dragFinished', {
        detail: {
          xpath: state.drag.elementXPath,
          deltaX: state.drag.currentDeltaX,
          deltaY: state.drag.currentDeltaY,
        },
      }));

      hideElement(positionIndicator);
      state.drag = null;
      updateCursor();
    }
    state.hoveredElement = null;
    drawHoverHighlight(null);
  });

  // --- Preview mode ---

  function enterPreviewMode() {
    state.isPreviewMode = true;

    // Clear any current selection and hover highlights
    handleSelect(null);
    state.hoveredElement = null;
    drawHoverHighlight(null);

    // Pass all mouse events through to the iframe
    overlayEl.style.pointerEvents = 'none';

    // Dispatch event so properties panel can update
    window.dispatchEvent(new CustomEvent('forge:previewModeChanged', {
      detail: { preview: true },
    }));
  }

  function exitPreviewMode() {
    state.isPreviewMode = false;

    // Re-enable overlay interactions
    overlayEl.style.pointerEvents = 'auto';

    // Dispatch event so properties panel can update
    window.dispatchEvent(new CustomEvent('forge:previewModeChanged', {
      detail: { preview: false },
    }));
  }

  // --- Text edit mode ---

  function enterTextEditMode(xpath: string) {
    state.isTextEditing = true;

    // Disable overlay pointer-events so user can interact with the iframe's contentEditable element
    overlayEl.style.pointerEvents = 'none';
    overlayEl.style.cursor = 'text';

    // Show "Editing text" indicator
    textEditIndicator.style.display = 'block';

    // Hide hover highlight and resize handles during text editing
    hideElement(hoverHighlight);
    hideResizeHandles();

    // Send text edit start to bridge
    canvas.sendToBridge({
      type: 'forge:textEditStart',
      xpath,
    });

    // Dispatch event for toolbar/UI updates
    window.dispatchEvent(new CustomEvent('forge:textEditModeChanged', {
      detail: { editing: true },
    }));
  }

  function exitTextEditMode() {
    state.isTextEditing = false;

    // Re-enable overlay pointer-events
    overlayEl.style.pointerEvents = 'auto';
    updateCursor();

    // Hide "Editing text" indicator
    hideElement(textEditIndicator);

    // Re-draw selection if element is still selected
    if (state.selectedElement) {
      // Re-query element info since text content may have changed
      canvas.sendToBridge({
        type: 'forge:getElementByXPath',
        xpath: state.selectedElement.xpath,
      });
      // Handle the response to update selection
      const onceHandler = (data: any) => {
        if (data.type === 'forge:elementInfo' && data.requestType === 'byXPath' && data.element) {
          state.selectedElement = data.element;
          drawSelection(data.element);
        }
      };
      canvas.onBridgeMessage(onceHandler);
    }

    // Dispatch event for toolbar/UI updates
    window.dispatchEvent(new CustomEvent('forge:textEditModeChanged', {
      detail: { editing: false },
    }));
  }

  // Escape key handling is centralized in keyboard.ts
  // Listen for deselect requests from keyboard handler
  window.addEventListener('forge:requestDeselect', () => {
    handleSelect(null);
  });

  // Listen for viewport transition start — ignore hover requests during animation
  window.addEventListener('forge:viewport-transitioning', () => {
    // Exit text edit mode if active
    if (state.isTextEditing && state.selectedElement) {
      canvas.sendToBridge({
        type: 'forge:textEditEnd',
        xpath: state.selectedElement.xpath,
      });
    }
    // Deselect and clear everything immediately
    handleSelect(null);
    state.hoveredElement = null;
    state.pendingHoverRequest = false;
    drawHoverHighlight(null);
    // Block hover requests during transition — coordinates are changing
    state.isTransitioning = true;
  });

  // Listen for viewport changes — transition is complete, re-enable interactions
  window.addEventListener('forge:viewport-changed', () => {
    // Ensure clean state after reflow
    handleSelect(null);
    state.hoveredElement = null;
    state.pendingHoverRequest = false;
    drawHoverHighlight(null);
    // Re-enable hover requests now that layout is stable
    state.isTransitioning = false;
  });

  // --- Drawing functions ---

  function updatePositionIndicator(clientX: number, clientY: number, deltaX: number, deltaY: number) {
    const overlayRect = overlayEl.getBoundingClientRect();
    positionIndicator.textContent = `x: ${Math.round(deltaX)}, y: ${Math.round(deltaY)}`;
    positionIndicator.style.display = 'block';
    positionIndicator.style.left = `${clientX - overlayRect.x + 12}px`;
    positionIndicator.style.top = `${clientY - overlayRect.y + 12}px`;
  }

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
    get isPreviewMode() { return state.isPreviewMode; },
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

function createPositionIndicator(): HTMLDivElement {
  const div = document.createElement('div');
  div.id = 'sf-position-indicator';
  div.style.cssText = `
    position: absolute;
    display: none;
    background: rgba(26, 26, 26, 0.9);
    color: #e8e8e8;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 10px;
    line-height: 1;
    padding: 4px 7px;
    border-radius: 3px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 14;
  `;
  return div;
}

function createTextEditIndicator(): HTMLDivElement {
  const div = document.createElement('div');
  div.id = 'sf-text-edit-indicator';
  div.textContent = 'Editing text';
  div.style.cssText = `
    position: absolute;
    display: none;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--sf-accent, #378ADD);
    color: #fff;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 11px;
    line-height: 1;
    padding: 5px 12px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 15;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  `;
  return div;
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
