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
        body = injectBridge(body, false);
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
    // Static projects get the live reload flag set
    const injected = injectBridge(html, true);
    res.type('text/html').send(injected);
  };
}

function injectBridge(html: string, isStatic: boolean): string {
  // For static projects, inject a flag so the bridge knows to connect to live reload
  const staticFlag = isStatic
    ? '<script>window.__sfIsStaticProject = true;</script>\n'
    : '';
  const injection = staticFlag + BRIDGE_TAG;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${injection}\n</body>`);
  }
  if (html.includes('</html>')) {
    return html.replace('</html>', `${injection}\n</html>`);
  }
  return html + injection;
}
