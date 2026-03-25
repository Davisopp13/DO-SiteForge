// Properties Panel — shows selected element info in the right sidebar

import type { ElementInfo } from '../bridge/protocol.js';

export interface PropertiesManager {
  update(element: ElementInfo | null): void;
}

function parseColor(color: string): string | null {
  // Returns a hex-ish representation for the swatch, or null if transparent
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

    <div class="sf-properties-footer">
      <button class="sf-ask-ai-btn" disabled title="AI assistance coming in Phase 2">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="8" cy="8" r="6.5"/>
          <path d="M6 6.5a2 2 0 1 1 2.5 1.94V9.5" stroke-linecap="round"/>
          <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/>
        </svg>
        Ask AI
      </button>
    </div>
  `;
}

function renderPlaceholder(): string {
  return `
    <div class="sf-properties-placeholder">
      Select an element to see its properties
    </div>
  `;
}

export function createProperties(container: HTMLElement): PropertiesManager {
  container.innerHTML = renderPlaceholder();

  const manager: PropertiesManager = {
    update(element: ElementInfo | null) {
      if (!element) {
        container.innerHTML = renderPlaceholder();
      } else {
        container.innerHTML = renderProperties(element);
      }
    },
  };

  return manager;
}
