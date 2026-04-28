// Canvas — manages the iframe element that renders the target site

export interface CanvasManager {
  iframe: HTMLIFrameElement;
  container: HTMLElement;
  getIframeOffset(): { x: number; y: number };
  getScale(): number;
  sendToBridge(message: any): void;
  onBridgeMessage(handler: (data: any) => void): void;
}

const DESKTOP_WIDTH = 1440;
const DESKTOP_HEIGHT = 900;

export function createCanvas(canvasEl: HTMLElement): CanvasManager {
  // Create iframe container (allows viewport resizing later)
  const container = document.createElement('div');
  container.id = 'sf-iframe-container';
  container.style.cssText = `
    position: relative;
    flex: 1;
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
    overflow: hidden;
  `;

  // Device frame wrapper — holds the iframe and provides device chrome
  const deviceFrame = document.createElement('div');
  deviceFrame.id = 'sf-device-frame';
  deviceFrame.className = 'sf-device-frame sf-device-desktop';

  // Notch indicator for mobile viewport
  const notch = document.createElement('div');
  notch.id = 'sf-device-notch';
  notch.className = 'sf-device-notch';
  deviceFrame.appendChild(notch);

  // Create iframe pointing to /preview/
  const iframe = document.createElement('iframe');
  iframe.id = 'sf-preview-iframe';
  iframe.src = '/preview/';
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
    display: block;
  `;

  deviceFrame.appendChild(iframe);
  container.appendChild(deviceFrame);
  canvasEl.appendChild(container);

  let currentScale = 1;
  let isDesktopMode = true;

  function applyDesktopScale() {
    const containerWidth = container.getBoundingClientRect().width;
    if (containerWidth <= 0) return;
    const scale = containerWidth / DESKTOP_WIDTH;
    currentScale = scale;
    deviceFrame.style.transform = `scale(${scale})`;
    deviceFrame.style.transformOrigin = 'top left';
  }

  function applyViewport(preset: string, width: number | null) {
    isDesktopMode = preset === 'desktop';

    deviceFrame.classList.remove('sf-device-mobile', 'sf-device-tablet', 'sf-device-desktop');
    if (preset === 'mobile' || (preset === 'custom' && width !== null && width < 640)) {
      deviceFrame.classList.add('sf-device-mobile');
    } else if (preset === 'tablet' || (preset === 'custom' && width !== null && width >= 640 && width < 1024)) {
      deviceFrame.classList.add('sf-device-tablet');
    } else {
      deviceFrame.classList.add('sf-device-desktop');
    }

    if (isDesktopMode) {
      deviceFrame.style.width = `${DESKTOP_WIDTH}px`;
      deviceFrame.style.height = `${DESKTOP_HEIGHT}px`;
      deviceFrame.style.maxWidth = 'none';
      container.style.justifyContent = 'flex-start';
      container.style.alignItems = 'flex-start';
      applyDesktopScale();
    } else {
      currentScale = 1;
      deviceFrame.style.transform = '';
      deviceFrame.style.height = '';
      deviceFrame.style.maxWidth = '100%';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'stretch';
      if (width !== null) {
        deviceFrame.style.width = `${width}px`;
      }
    }
  }

  // Recompute desktop scale whenever the canvas container resizes (e.g. sidebar toggle)
  const resizeObserver = new ResizeObserver(() => {
    if (isDesktopMode) {
      applyDesktopScale();
    }
  });
  resizeObserver.observe(container);

  // Bridge message handlers
  const messageHandlers: Array<(data: any) => void> = [];

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data.type !== 'string' || !data.type.startsWith('forge:')) {
      return;
    }
    for (const handler of messageHandlers) {
      handler(data);
    }
  });

  // Listen for viewport changes and resize the iframe
  window.addEventListener('forge:viewportChanged', ((e: CustomEvent) => {
    const { preset, width } = e.detail || {};

    // Signal that viewport transition has started (overlay should ignore hovers)
    window.dispatchEvent(new CustomEvent('forge:viewport-transitioning'));

    applyViewport(preset, width);

    // Wait for the CSS transition to finish before signaling the overlay
    const onTransitionEnd = () => {
      deviceFrame.removeEventListener('transitionend', onTransitionEnd);
      window.dispatchEvent(new CustomEvent('forge:viewport-changed', {
        detail: { preset, width },
      }));
    };
    deviceFrame.addEventListener('transitionend', onTransitionEnd);

    // Fallback: if no transition fires (e.g., same width or transitions disabled)
    setTimeout(() => {
      deviceFrame.removeEventListener('transitionend', onTransitionEnd);
      window.dispatchEvent(new CustomEvent('forge:viewport-changed', {
        detail: { preset, width },
      }));
    }, 500);
  }) as EventListener);

  // Dispatch an event when the iframe reloads so the overlay can clear the write-back lock
  iframe.addEventListener('load', () => {
    window.dispatchEvent(new CustomEvent('forge:iframe-loaded'));
  });

  // Apply initial desktop layout (no transition events needed on first load)
  applyViewport('desktop', DESKTOP_WIDTH);

  return {
    iframe,
    container,

    getIframeOffset(): { x: number; y: number } {
      const rect = iframe.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    },

    getScale(): number {
      return currentScale;
    },

    sendToBridge(message: any): void {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(message, '*');
      }
    },

    onBridgeMessage(handler: (data: any) => void): void {
      messageHandlers.push(handler);
    },
  };
}
