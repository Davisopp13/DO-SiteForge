import type { RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const BRIDGE_TAG = '<script src="/forge-bridge.js"></script>';

/**
 * Express middleware that intercepts HTML responses and injects
 * the SiteForge bridge script before the closing </body> tag.
 *
 * Works by overriding res.send and res.end to catch HTML content.
 */
export function createBridgeInjector(): RequestHandler {
  return (_req, res, next) => {
    const originalSend = res.send.bind(res);

    res.send = function (body?: any) {
      const contentType = res.get('Content-Type') || '';
      if (typeof body === 'string' && contentType.includes('text/html')) {
        body = injectBridge(body);
      }
      return originalSend(body);
    };

    next();
  };
}

/**
 * Serves static HTML files from a directory with bridge script injected.
 * Unlike express.static, this reads HTML files, injects the bridge tag,
 * and sends the modified content.
 */
export function createStaticWithInjection(projectDir: string): RequestHandler {
  return (req, res, next) => {
    // Resolve the file path from the request URL
    let urlPath = req.path || '/';
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    const filePath = path.join(projectDir, urlPath);

    // Only inject into .html files
    if (!filePath.endsWith('.html')) {
      next();
      return;
    }

    // Check file exists
    if (!fs.existsSync(filePath)) {
      next();
      return;
    }

    const html = fs.readFileSync(filePath, 'utf-8');
    const injected = injectBridge(html);
    res.type('text/html').send(injected);
  };
}

function injectBridge(html: string): string {
  if (html.includes('</body>')) {
    return html.replace('</body>', `${BRIDGE_TAG}\n</body>`);
  }
  if (html.includes('</html>')) {
    return html.replace('</html>', `${BRIDGE_TAG}\n</html>`);
  }
  return html + BRIDGE_TAG;
}
