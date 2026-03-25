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

    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || '',
      className: typeof element.className === 'string' ? element.className : '',
      xpath: getXPath(element),
      textContent: (element.textContent || '').trim().substring(0, 200),
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
    }
  }

  // --- Mouse event forwarding ---

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

  // --- Initialize ---

  window.addEventListener('message', handleMessage);

  // Signal that bridge is ready
  sendToEditor({ type: 'forge:bridgeReady' });

  console.log('[SiteForge] Bridge script loaded');
})();
