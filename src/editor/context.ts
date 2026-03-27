// Context serializer — collects canvas state for AI chat context

import type { CanvasManager } from './canvas.js';
import type { OverlayManager } from './overlay.js';
import type { PageSummaryEntry, ElementInfo } from '../bridge/protocol.js';

export interface PageSummary {
  entries: PageSummaryEntry[];
}

export interface SelectionContext {
  tag: string;
  className?: string;
  id?: string;
  xpath: string;
  textContent: string;
  styles: Record<string, string>;
  parentTag: string;
  parentClass: string;
  siblingCount: number;
  childCount: number;
}

export type ViewportMode = 'mobile' | 'tablet' | 'desktop' | 'custom';

export interface CanvasContext {
  page: PageSummary;
  selection: SelectionContext | null;
  viewport: { width: number; mode: ViewportMode };
  projectType: string;
}

/**
 * Queries the bridge for a page summary: ordered list of top-level sections
 * with tag, class, approximate role, and text preview.
 */
export function getPageContext(canvas: CanvasManager): Promise<PageSummary> {
  return new Promise<PageSummary>((resolve) => {
    let settled = false;

    const handler = (data: any) => {
      if (data.type === 'forge:pageSummary' && !settled) {
        settled = true;
        cleanup();
        resolve({ entries: data.entries || [] });
      }
    };

    canvas.onBridgeMessage(handler);
    canvas.sendToBridge({ type: 'forge:getPageSummary' });

    // Timeout after 2s if bridge doesn't respond
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({ entries: [] });
      }
    }, 2000);

    function cleanup() {
      clearTimeout(timer);
    }
  });
}

/**
 * Builds a SelectionContext from the currently selected element.
 * Queries the bridge for parent/sibling/child info not available in ElementInfo.
 * Returns null when no element is selected.
 */
export function getSelectionContext(
  canvas: CanvasManager,
  overlay: OverlayManager,
): Promise<SelectionContext | null> {
  const selected = overlay.selectedElement;
  if (!selected) return Promise.resolve(null);

  return new Promise<SelectionContext>((resolve) => {
    let settled = false;

    const handler = (data: any) => {
      if (data.type === 'forge:selectionInfo' && !settled) {
        settled = true;
        cleanup();
        resolve(buildSelectionContext(selected, data));
      }
    };

    canvas.onBridgeMessage(handler);
    canvas.sendToBridge({ type: 'forge:getSelectionInfo', xpath: selected.xpath });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        // Fallback: build context without parent/sibling info
        resolve(buildSelectionContext(selected, {
          parentTag: '',
          parentClass: '',
          siblingCount: 0,
          childCount: 0,
        }));
      }
    }, 2000);

    function cleanup() {
      clearTimeout(timer);
    }
  });
}

function buildSelectionContext(
  el: ElementInfo,
  extra: {
    parentTag: string;
    parentClass: string;
    siblingCount: number;
    childCount: number;
    flexDirection?: string;
    flexWrap?: string;
    alignItems?: string;
    justifyContent?: string;
  },
): SelectionContext {
  const styles: Record<string, string> = {
    fontSize: el.computedStyles.fontSize,
    color: el.computedStyles.color,
    backgroundColor: el.computedStyles.backgroundColor,
    padding: el.computedStyles.padding,
    margin: el.computedStyles.margin,
    borderRadius: el.computedStyles.borderRadius,
    display: el.computedStyles.display,
  };

  // Include flex properties when element uses flexbox
  if (el.computedStyles.display === 'flex' || el.computedStyles.display === 'inline-flex') {
    if (extra.flexDirection) styles.flexDirection = extra.flexDirection;
    if (extra.flexWrap) styles.flexWrap = extra.flexWrap;
    if (extra.alignItems) styles.alignItems = extra.alignItems;
    if (extra.justifyContent) styles.justifyContent = extra.justifyContent;
  }

  return {
    tag: el.tagName,
    className: el.className || undefined,
    id: el.id || undefined,
    xpath: el.xpath,
    textContent: el.textContent,
    styles,
    parentTag: extra.parentTag,
    parentClass: extra.parentClass,
    siblingCount: extra.siblingCount,
    childCount: extra.childCount,
  };
}

/**
 * Collects the full canvas context for AI chat: page summary, selection, and viewport.
 */
const VIEWPORT_MODES: ViewportMode[] = ['mobile', 'tablet', 'desktop', 'custom'];

export async function getCanvasContext(
  canvas: CanvasManager,
  overlay: OverlayManager,
  viewportWidth: number,
  viewportMode: string,
  projectType: string,
): Promise<CanvasContext> {
  const [page, selection] = await Promise.all([
    getPageContext(canvas),
    getSelectionContext(canvas, overlay),
  ]);

  // Normalize viewportMode to the known union type; fall back to 'desktop'
  const mode: ViewportMode = (VIEWPORT_MODES as string[]).includes(viewportMode)
    ? (viewportMode as ViewportMode)
    : 'desktop';

  return {
    page,
    selection,
    viewport: { width: viewportWidth, mode },
    projectType,
  };
}
