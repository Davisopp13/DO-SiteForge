import type { RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { annotateHtml } from './sourcemap/annotator.js';

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

    // Track which file is currently being served so /api/edits can default to it
    req.app.locals.sfCurrentFile = path.relative(projectDir, filePath);

    // Annotate with source line/col before injecting bridge script
    const annotated = annotateHtml(html);
    // Static projects get the live reload flag set
    const injected = injectBridge(annotated, true);
    res.type('text/html').send(injected);
  };
}

export function injectBridge(html: string, isStatic = false): string {
  // For static projects, inject a flag so the bridge knows to connect to live reload
  const staticFlag = isStatic
    ? '<script>window.__sfIsStaticProject = true;</script>\n'
    : '';
  const injection = staticFlag + BRIDGE_TAG;

  // Inject into <head> — module scripts in <body> are deferred and Vite's
  // hydration rewrites <body>, which strips classic script tags placed there.
  // <head> is left alone and classic scripts there execute before module
  // scripts begin.
  if (html.includes('</head>')) {
    return html.replace('</head>', `${injection}\n</head>`);
  }
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>\n${injection}`);
  }
  // Fallback for HTML without explicit <head> tags
  if (html.includes('<body>')) {
    return html.replace('<body>', `${injection}\n<body>`);
  }
  return injection + html;
}
