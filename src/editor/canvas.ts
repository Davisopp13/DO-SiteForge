// Canvas — manages the iframe element that renders the target site

export interface CanvasManager {
  iframe: HTMLIFrameElement;
  container: HTMLElement;
  getIframeOffset(): { x: number; y: number };
  sendToBridge(message: any): void;
  onBridgeMessage(handler: (data: any) => void): void;
}

export function createCanvas(canvasEl: HTMLElement): CanvasManager {
  // Create iframe container (allows viewport resizing later)
  const container = document.createElement('div');
  container.id = 'sf-iframe-container';
  container.style.cssText = `
    position: relative;
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: stretch;
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

    // Remove all device frame classes
    deviceFrame.classList.remove('sf-device-mobile', 'sf-device-tablet', 'sf-device-desktop');

    if (preset === 'mobile' || (preset === 'custom' && width && width < 640)) {
      deviceFrame.classList.add('sf-device-mobile');
    } else if (preset === 'tablet' || (preset === 'custom' && width && width >= 640 && width < 1024)) {
      deviceFrame.classList.add('sf-device-tablet');
    } else {
      deviceFrame.classList.add('sf-device-desktop');
    }

    // Set width
    if (width === null) {
      // Desktop: 100% width
      deviceFrame.style.width = '100%';
      deviceFrame.style.maxWidth = '100%';
    } else {
      deviceFrame.style.width = `${width}px`;
      deviceFrame.style.maxWidth = '100%';
    }

    // Dispatch event for overlay to recalculate positions
    // Use requestAnimationFrame to wait for CSS transition to start
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('forge:viewport-changed', {
        detail: { preset, width },
      }));
    });
  }) as EventListener);

  return {
    iframe,
    container,

    getIframeOffset(): { x: number; y: number } {
      const rect = iframe.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
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
