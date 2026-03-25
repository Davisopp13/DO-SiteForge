// Properties Panel — shows selected element info in the right sidebar
// Exports render functions so the sidebar tab system can call them

import type { ElementInfo } from '../bridge/protocol.js';

export interface PropertiesManager {
  update(element: ElementInfo | null): void;
  render(): void;
}

function parseColor(color: string): string | null {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
  return color;
}

function formatPadding(padding: string): { top: string; right: string; bottom: string; left: string } {
  const parts = padding.split(' ').map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0] || '0px', right: parts[1] || '0px', bottom: parts[2] || '0px', left: parts[3] || '0px' };
}

function propRow(label: string, value: string, swatch?: string | null): string {
  const swatchHtml = swatch ? `<span class="sf-prop-swatch" style="background:${swatch}"></span>` : '';
  return `
    <div class="sf-prop-row">
      <span class="sf-prop-label">${label}</span>
      <span class="sf-prop-value">${swatchHtml}${value}</span>
    </div>
  `;
}

function renderProperties(element: ElementInfo): string {
  const styles = element.computedStyles;
  const rect = element.boundingRect;

  const bgColor = parseColor(styles.backgroundColor);
  const textColor = parseColor(styles.color);

  const padding = formatPadding(styles.padding);
  const margin = formatPadding(styles.margin);

  const classDisplay = element.className
    ? `<span class="sf-prop-class">.${element.className.split(' ')[0]}</span>`
    : '';

  return `
    <div class="sf-properties-header">
      <span class="sf-prop-tag">&lt;${element.tagName}&gt;</span>
      ${classDisplay}
    </div>

    <div class="sf-properties-section">
      <div class="sf-properties-section-title">Layout</div>
      ${propRow('Position', `${Math.round(rect.x)}, ${Math.round(rect.y)}`)}
      ${propRow('Size', `${Math.round(rect.width)} × ${Math.round(rect.height)}`)}
    </div>

    <div class="sf-properties-section">
      <div class="sf-properties-section-title">Style</div>
      ${propRow('Background', bgColor || 'transparent', bgColor)}
      ${propRow('Font size', styles.fontSize)}
      ${propRow('Color', textColor || 'inherit', textColor)}
      ${propRow('Border radius', styles.borderRadius)}
    </div>

    <div class="sf-properties-section">
      <div class="sf-properties-section-title">Spacing</div>
      ${propRow('Padding', `${padding.top} ${padding.right} ${padding.bottom} ${padding.left}`)}
      ${propRow('Margin', `${margin.top} ${margin.right} ${margin.bottom} ${margin.left}`)}
    </div>
  `;
}

export function renderPlaceholder(): string {
  return `
    <div class="sf-properties-placeholder">
      Select an element to see its properties
    </div>
  `;
}

export function renderPreviewPlaceholder(): string {
  return `
    <div class="sf-properties-placeholder">
      Preview mode — interactions disabled
    </div>
  `;
}

export function createProperties(container: HTMLElement): PropertiesManager {
  let isPreview = false;
  let currentElement: ElementInfo | null = null;

  function renderContent(): void {
    if (isPreview) {
      container.innerHTML = renderPreviewPlaceholder();
    } else if (!currentElement) {
      container.innerHTML = renderPlaceholder();
    } else {
      container.innerHTML = renderProperties(currentElement);
    }
  }

  renderContent();

  // Listen for preview mode changes
  window.addEventListener('forge:previewModeChanged', ((e: CustomEvent) => {
    isPreview = e.detail?.preview ?? false;
    renderContent();
  }) as EventListener);

  const manager: PropertiesManager = {
    update(element: ElementInfo | null) {
      currentElement = element;
      if (isPreview) return;
      renderContent();
    },
    render() {
      renderContent();
    },
  };

  return manager;
}
