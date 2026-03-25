// SiteForge Editor — Main Application Entry

import { createCanvas } from './canvas.js';
import { createOverlay } from './overlay.js';
import { createToolbar } from './toolbar.js';

function init() {
  const toolbarEl = document.getElementById('sf-toolbar');
  const canvasEl = document.getElementById('sf-canvas');
  const properties = document.getElementById('sf-properties');

  if (!toolbarEl || !canvasEl || !properties) {
    console.error('SiteForge: Missing required DOM elements');
    return;
  }

  // Initialize toolbar (must be before overlay so mode badge is in the DOM)
  const toolbar = createToolbar(toolbarEl);

  // Initialize canvas with iframe
  const canvas = createCanvas(canvasEl);

  // Initialize overlay for element interaction
  const overlay = createOverlay(canvasEl, canvas);

  // Properties panel placeholder
  properties.innerHTML = `
    <div class="sf-properties-placeholder">
      Select an element to see its properties
    </div>
  `;

  // Listen for selection changes to update properties panel
  window.addEventListener('forge:selectionChanged', ((e: CustomEvent) => {
    const element = e.detail?.element;
    if (!element) {
      properties.innerHTML = `
        <div class="sf-properties-placeholder">
          Select an element to see its properties
        </div>
      `;
      return;
    }

    properties.innerHTML = `
      <div class="sf-properties-header">
        <span class="sf-prop-tag">&lt;${element.tagName}&gt;</span>
        ${element.className ? `<span class="sf-prop-class">.${element.className.split(' ')[0]}</span>` : ''}
      </div>
      <div class="sf-properties-section">
        <div class="sf-prop-row">
          <span class="sf-prop-label">Position</span>
          <span class="sf-prop-value">${Math.round(element.boundingRect.x)}, ${Math.round(element.boundingRect.y)}</span>
        </div>
        <div class="sf-prop-row">
          <span class="sf-prop-label">Size</span>
          <span class="sf-prop-value">${Math.round(element.boundingRect.width)} × ${Math.round(element.boundingRect.height)}</span>
        </div>
      </div>
    `;
  }) as EventListener);

  console.log('SiteForge editor initialized');
}

document.addEventListener('DOMContentLoaded', init);
