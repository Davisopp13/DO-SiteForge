// Context serializer — collects canvas state for AI chat context

import type { CanvasManager } from './canvas.js';
import type { PageSummaryEntry } from '../bridge/protocol.js';

export interface PageSummary {
  entries: PageSummaryEntry[];
}

export interface CanvasContext {
  page: PageSummary;
  viewport: { width: number; mode: string };
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
      // Note: onBridgeMessage pushes handlers to an array.
      // We can't remove it, but the settled flag prevents double-resolve.
    }
  });
}
