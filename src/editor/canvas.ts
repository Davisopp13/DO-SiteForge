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
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
  `;

  // Create iframe pointing to /preview/
  const iframe = document.createElement('iframe');
  iframe.id = 'sf-preview-iframe';
  iframe.src = '/preview/';
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
    border-radius: 8px;
  `;

  container.appendChild(iframe);
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
