// Bridge script — injected into the iframe to communicate with the editor overlay
// This script must be self-contained with no imports (bundled as IIFE by tsup)
// All types are duplicated here since we can't import from protocol.ts at runtime

(function forgeBridge() {
  // Prevent double-initialization
  if ((window as any).__forgeBridgeInitialized) return;
  (window as any).__forgeBridgeInitialized = true;

  const FORGE_PREFIX = 'forge:';

  // --- XPath utilities ---

  function getXPath(element: Element): string {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.documentElement) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousElementSibling;
      }

      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return '/html/' + parts.join('/');
  }

  function getElementByXPath(xpath: string): Element | null {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      return result.singleNodeValue as Element | null;
    } catch {
      return null;
    }
  }

  // --- Element info extraction ---

  function getElementInfo(element: Element): any {
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);

    const sfLine = element.getAttribute('data-sf-line');
    const sfCol = element.getAttribute('data-sf-col');
    const sourceLine = sfLine !== null ? parseInt(sfLine, 10) : undefined;
    const sourceCol = sfCol !== null ? parseInt(sfCol, 10) : undefined;

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || '',
      className: typeof element.className === 'string' ? element.className : '',
      xpath: getXPath(element),
      textContent: (element.textContent || '').trim().substring(0, 200),
      sourceLine,
      sourceCol,
      boundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      computedStyles: {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
        padding: computed.padding,
        margin: computed.margin,
        borderRadius: computed.borderRadius,
        display: computed.display,
        position: computed.position,
        width: computed.width,
        height: computed.height,
      },
    };
  }

  // --- Core functions ---

  function getElementAtPoint(x: number, y: number): any | null {
    const element = document.elementFromPoint(x, y);
    if (!element || element === document.documentElement || element === document.body) {
      // Try body if we hit html/body directly but body has children
      if (document.body && document.body.children.length > 0) {
        // Return body info as fallback
        return null;
      }
      return null;
    }
    return getElementInfo(element);
  }

  function getAllEditableElements(): any[] {
    const elements: any[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node: Node) {
          const el = node as Element;
          // Skip script, style, and bridge-injected elements
          if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(el.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          // Include elements that have direct text content
          const hasDirectText = Array.from(el.childNodes).some(
            (child) => child.nodeType === Node.TEXT_NODE && (child.textContent || '').trim().length > 0
          );
          if (hasDirectText) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      elements.push(getElementInfo(node as Element));
    }

    return elements;
  }

  // --- Move tracking ---
  let moveState: { xpath: string; originalTransform: string } | null = null;

  function handleMove(xpath: string, deltaX: number, deltaY: number) {
    const element = getElementByXPath(xpath);
    if (!element) return;

    const htmlEl = element as HTMLElement;

    if (!moveState || moveState.xpath !== xpath) {
      moveState = {
        xpath,
        originalTransform: htmlEl.style.transform || '',
      };
    }

    htmlEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    htmlEl.style.opacity = '0.85';
  }

  function finishMove(xpath: string) {
    const element = getElementByXPath(xpath);
    if (!element) return;

    const htmlEl = element as HTMLElement;
    htmlEl.style.opacity = '';

    const rect = element.getBoundingClientRect();

    sendToEditor({
      type: 'forge:moveComplete',
      xpath,
      finalRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    });

    moveState = null;
  }

  // --- Text editing ---
  let editState: { xpath: string; originalText: string } | null = null;

  function startTextEdit(xpath: string) {
    const element = getElementByXPath(xpath);
    if (!element) return;

    const htmlEl = element as HTMLElement;
    editState = { xpath, originalText: htmlEl.textContent || '' };

    htmlEl.contentEditable = 'true';
    htmlEl.style.outline = 'none';
    htmlEl.style.boxShadow = 'inset 0 0 0 1px #378ADD';
    htmlEl.focus();

    // Listen for blur and keydown to end editing
    const endEdit = () => {
      htmlEl.contentEditable = 'false';
      htmlEl.style.boxShadow = '';

      const newText = htmlEl.textContent || '';
      sendToEditor({
        type: 'forge:textEditComplete',
        xpath,
        oldText: editState?.originalText || '',
        newText,
      });

      editState = null;
      htmlEl.removeEventListener('blur', endEdit);
      htmlEl.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        htmlEl.blur();
      }
    };

    htmlEl.addEventListener('blur', endEdit);
    htmlEl.addEventListener('keydown', onKeyDown);
  }

  function endTextEdit(xpath: string) {
    const element = getElementByXPath(xpath);
    if (!element) return;
    (element as HTMLElement).blur();
  }

  // --- Delete element ---

  function deleteElement(xpath: string) {
    const element = getElementByXPath(xpath);
    if (!element || element === document.body || element === document.documentElement) return;

    element.parentElement?.removeChild(element);

    sendToEditor({
      type: 'forge:elementDeleted',
      xpath,
    });
  }

  // --- Nudge element ---
  // Tracks cumulative nudge transforms per element
  const nudgeDeltas: Map<string, { x: number; y: number }> = new Map();

  function nudgeElement(xpath: string, deltaX: number, deltaY: number) {
    const element = getElementByXPath(xpath);
    if (!element) return;

    const htmlEl = element as HTMLElement;
    let current = nudgeDeltas.get(xpath) || { x: 0, y: 0 };
    current.x += deltaX;
    current.y += deltaY;
    nudgeDeltas.set(xpath, current);

    htmlEl.style.transform = `translate(${current.x}px, ${current.y}px)`;

    const rect = element.getBoundingClientRect();
    sendToEditor({
      type: 'forge:nudgeComplete',
      xpath,
      finalRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      totalDeltaX: current.x,
      totalDeltaY: current.y,
    });
  }

  // --- Insert element ---

  function insertElement(x: number, y: number) {
    // Find the element at the click point to determine parent
    const targetEl = document.elementFromPoint(x, y);
    const parent = targetEl && targetEl !== document.documentElement
      ? targetEl
      : document.body;

    // Create the new block element
    const newDiv = document.createElement('div');
    newDiv.style.cssText = 'width: 120px; height: 60px; background: #e8e8e8; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-family: sans-serif; font-size: 14px; color: #333; position: relative; cursor: default;';
    newDiv.textContent = 'New block';

    parent.appendChild(newDiv);

    const info = getElementInfo(newDiv);
    const parentXPath = getXPath(parent);
    const childIndex = Array.from(parent.children).indexOf(newDiv);

    sendToEditor({
      type: 'forge:elementInserted',
      element: info,
      parentXPath,
      childIndex,
      html: newDiv.outerHTML,
    });
  }

  function removeElement(xpath: string) {
    const element = getElementByXPath(xpath);
    if (!element || element === document.body || element === document.documentElement) return;
    element.parentElement?.removeChild(element);
    sendToEditor({ type: 'forge:elementRemoved', xpath });
  }

  function reinsertElement(parentXPath: string, childIndex: number, html: string) {
    const parent = getElementByXPath(parentXPath);
    if (!parent) return;

    const temp = document.createElement('div');
    temp.innerHTML = html;
    const newEl = temp.firstElementChild;
    if (!newEl) return;

    const children = parent.children;
    if (childIndex >= children.length) {
      parent.appendChild(newEl);
    } else {
      parent.insertBefore(newEl, children[childIndex]);
    }

    const info = getElementInfo(newEl);
    sendToEditor({
      type: 'forge:elementInserted',
      element: info,
      parentXPath,
      childIndex,
      html,
    });
  }

  // --- Page summary ---

  function guessRole(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const combined = `${tag} ${cls} ${id}`;

    if (tag === 'nav' || combined.includes('nav')) return 'navigation';
    if (tag === 'header' || combined.includes('header')) return 'header';
    if (tag === 'footer' || combined.includes('footer')) return 'footer';
    if (combined.includes('hero')) return 'hero';
    if (combined.includes('card')) return 'card';
    if (combined.includes('sidebar') || combined.includes('aside') || tag === 'aside') return 'sidebar';
    if (tag === 'main' || combined.includes('main-content') || combined.includes('main_content')) return 'main';
    if (tag === 'section') return 'section';
    if (tag === 'article') return 'article';
    if (tag === 'form') return 'form';
    return '';
  }

  function getPageSummary() {
    const entries: any[] = [];
    const body = document.body;
    if (!body) return entries;

    for (let i = 0; i < body.children.length; i++) {
      const child = body.children[i];
      // Skip script, style, and bridge-injected elements
      if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT'].includes(child.tagName)) continue;

      const text = (child.textContent || '').trim();
      const rect = child.getBoundingClientRect();

      entries.push({
        tag: child.tagName.toLowerCase(),
        className: typeof child.className === 'string' ? child.className : '',
        id: child.id || '',
        role: guessRole(child),
        textPreview: text.substring(0, 50),
        childCount: child.children.length,
        boundingRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
    }

    return entries;
  }

  // --- Undo/Redo operations ---

  function undoRedoMove(xpath: string, deltaX: number, deltaY: number) {
    const element = getElementByXPath(xpath);
    if (!element) return;

    const htmlEl = element as HTMLElement;
    if (deltaX === 0 && deltaY === 0) {
      htmlEl.style.transform = '';
    } else {
      htmlEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    }

    // Report updated position
    const rect = element.getBoundingClientRect();
    sendToEditor({
      type: 'forge:moveComplete',
      xpath,
      finalRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    });
  }

  function undoRedoSetText(xpath: string, text: string) {
    const element = getElementByXPath(xpath);
    if (!element) return;

    (element as HTMLElement).textContent = text;
  }

  // --- Communication ---

  function sendToEditor(message: any) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  }

  function handleMessage(event: MessageEvent) {
    const data = event.data;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith(FORGE_PREFIX)) {
      return;
    }

    switch (data.type) {
      case 'forge:getElementAtPoint': {
        const element = getElementAtPoint(data.x, data.y);
        sendToEditor({
          type: 'forge:elementInfo',
          element,
          requestType: 'atPoint',
        });
        break;
      }

      case 'forge:getElementByXPath': {
        const el = getElementByXPath(data.xpath);
        sendToEditor({
          type: 'forge:elementInfo',
          element: el ? getElementInfo(el) : null,
          requestType: 'byXPath',
        });
        break;
      }

      case 'forge:getAllEditableElements': {
        const elements = getAllEditableElements();
        sendToEditor({
          type: 'forge:editableElements',
          elements,
        });
        break;
      }

      case 'forge:move': {
        handleMove(data.xpath, data.deltaX, data.deltaY);
        break;
      }

      case 'forge:finishMove': {
        finishMove(data.xpath);
        break;
      }

      case 'forge:textEditStart': {
        startTextEdit(data.xpath);
        break;
      }

      case 'forge:textEditEnd': {
        endTextEdit(data.xpath);
        break;
      }

      case 'forge:undoRedoMove': {
        undoRedoMove(data.xpath, data.deltaX, data.deltaY);
        break;
      }

      case 'forge:undoRedoText': {
        undoRedoSetText(data.xpath, data.text);
        break;
      }

      case 'forge:deleteElement': {
        deleteElement(data.xpath);
        break;
      }

      case 'forge:nudgeElement': {
        nudgeElement(data.xpath, data.deltaX, data.deltaY);
        break;
      }

      case 'forge:insertElement': {
        insertElement(data.x, data.y);
        break;
      }

      case 'forge:removeElement': {
        removeElement(data.xpath);
        break;
      }

      case 'forge:reinsertElement': {
        reinsertElement(data.parentXPath, data.childIndex, data.html);
        break;
      }

      case 'forge:getPageSummary': {
        const entries = getPageSummary();
        sendToEditor({ type: 'forge:pageSummary', entries });
        break;
      }

      case 'forge:getSelectionInfo': {
        const selEl = getElementByXPath(data.xpath);
        if (selEl) {
          const parent = selEl.parentElement;
          const computed = window.getComputedStyle(selEl);
          sendToEditor({
            type: 'forge:selectionInfo',
            parentTag: parent ? parent.tagName.toLowerCase() : '',
            parentClass: parent ? (typeof parent.className === 'string' ? parent.className : '') : '',
            siblingCount: parent ? parent.children.length - 1 : 0,
            childCount: selEl.children.length,
            flexDirection: computed.flexDirection,
            flexWrap: computed.flexWrap,
            alignItems: computed.alignItems,
            justifyContent: computed.justifyContent,
          });
        } else {
          sendToEditor({
            type: 'forge:selectionInfo',
            parentTag: '',
            parentClass: '',
            siblingCount: 0,
            childCount: 0,
          });
        }
        break;
      }
    }
  }

  // --- Live reload (static projects only) ---

  function connectLiveReload(retriesLeft: number): void {
    if (!(window as any).__sfIsStaticProject) return;

    const wsUrl = `ws://${window.location.host}/livereload`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return;
    }

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'reload') {
          location.reload();
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.addEventListener('close', () => {
      if (retriesLeft > 0) {
        setTimeout(() => connectLiveReload(retriesLeft - 1), 2000);
      }
    });

    ws.addEventListener('error', () => {
      // close event will fire after error, triggering retry
    });
  }

  // --- Initialize ---
  // Bridge now injected into <head>, so DOM may not yet be parsed when this
  // script runs. Defer all DOM-touching code until DOMContentLoaded.
  // The __forgeBridgeInitialized flag (set above) is synchronous — that's
  // intentional, it must run immediately as a re-entry guard.

  function init() {
    document.addEventListener('mousemove', (e: MouseEvent) => {
      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (!element || element === document.documentElement) {
        sendToEditor({ type: 'forge:hover', element: null });
        return;
      }
      sendToEditor({ type: 'forge:hover', element: getElementInfo(element) });
    });

    document.addEventListener('click', (e: MouseEvent) => {
      // Don't intercept clicks during text editing
      if (editState) return;

      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (!element || element === document.documentElement) {
        sendToEditor({ type: 'forge:select', element: null });
        return;
      }
      sendToEditor({ type: 'forge:select', element: getElementInfo(element) });
    });

    window.addEventListener('message', handleMessage);

    // Connect to live reload server (no-op for framework projects)
    connectLiveReload(10);

    // Signal that bridge is ready
    sendToEditor({ type: 'forge:bridgeReady' });

    console.log('[SiteForge] Bridge script loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
