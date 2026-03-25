// SiteForge Editor — Main Application Entry

import { createCanvas } from './canvas.js';
import { createOverlay } from './overlay.js';
import { createToolbar } from './toolbar.js';
import { createProperties } from './properties.js';

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
