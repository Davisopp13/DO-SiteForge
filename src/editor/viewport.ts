// Viewport — responsive viewport toggle bar (Mobile / Tablet / Desktop / Custom)

export type ViewportPreset = 'mobile' | 'tablet' | 'desktop' | 'custom';

export interface ViewportManager {
  activePreset: ViewportPreset;
  setPreset(preset: ViewportPreset): void;
}

interface PresetConfig {
  label: string;
  icon: string;
  width: number | null; // null = 100%
  dimensions: string;
}

const PRESETS: Record<ViewportPreset, PresetConfig> = {
  mobile: {
    label: 'Mobile',
    icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="2" width="8" height="14" rx="1.5"/>
      <line x1="7.5" y1="13.5" x2="10.5" y2="13.5"/>
    </svg>`,
    width: 375,
    dimensions: '375 × 812',
  },
  tablet: {
    label: 'Tablet',
    icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="2" width="12" height="14" rx="1.5"/>
      <line x1="7.5" y1="14" x2="10.5" y2="14"/>
    </svg>`,
    width: 768,
    dimensions: '768 × 1024',
  },
  desktop: {
    label: 'Desktop',
    icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="14" height="10" rx="1"/>
      <path d="M6 16 L12 16"/>
      <path d="M9 13 L9 16"/>
    </svg>`,
    width: null,
    dimensions: '100%',
  },
  custom: {
    label: 'Custom',
    icon: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="6" height="6" rx="1"/>
      <rect x="10" y="2" width="6" height="6" rx="1"/>
      <rect x="2" y="10" width="6" height="6" rx="1"/>
      <rect x="10" y="10" width="6" height="6" rx="1"/>
    </svg>`,
    width: 1024,
    dimensions: '1024 × 800',
  },
};

export function createViewport(canvasEl: HTMLElement): ViewportManager {
  let activePreset: ViewportPreset = 'desktop';
  let customWidth = 1024;
  const buttons: Map<ViewportPreset, HTMLButtonElement> = new Map();

  // Create viewport bar
  const bar = document.createElement('div');
  bar.id = 'sf-viewport-bar';
  bar.className = 'sf-viewport-bar';

  // Buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'sf-viewport-buttons';

  const presets: ViewportPreset[] = ['mobile', 'tablet', 'desktop', 'custom'];
  for (const preset of presets) {
    const btn = document.createElement('button');
    btn.className = 'sf-viewport-btn';
    btn.title = `${PRESETS[preset].label} (${presets.indexOf(preset) + 1})`;
    btn.innerHTML = PRESETS[preset].icon;
    btn.addEventListener('click', () => setPreset(preset));
    buttonsContainer.appendChild(btn);
    buttons.set(preset, btn);
  }

  bar.appendChild(buttonsContainer);

  // Dimensions display
  const dimsDisplay = document.createElement('span');
  dimsDisplay.className = 'sf-viewport-dims';
  dimsDisplay.textContent = PRESETS.desktop.dimensions;
  bar.appendChild(dimsDisplay);

  // Insert bar at the top of the canvas area (before other children)
  canvasEl.insertBefore(bar, canvasEl.firstChild);

  // Set initial active state
  updateActiveButton();

  function setPreset(preset: ViewportPreset) {
    activePreset = preset;
    updateActiveButton();
    updateDimensions();

    // Dispatch viewport change event
    const width = preset === 'custom' ? customWidth : PRESETS[preset].width;
    window.dispatchEvent(new CustomEvent('forge:viewportChanged', {
      detail: { preset, width },
    }));
  }

  function updateActiveButton() {
    for (const [preset, btn] of buttons) {
      btn.classList.toggle('active', preset === activePreset);
    }
  }

  function updateDimensions() {
    if (activePreset === 'custom') {
      dimsDisplay.textContent = `${customWidth} × auto`;
    } else {
      dimsDisplay.textContent = PRESETS[activePreset].dimensions;
    }
  }

  function setCustomWidth(width: number) {
    customWidth = width;
    if (activePreset === 'custom') {
      updateDimensions();
    }
  }

  // Listen for viewport keyboard shortcuts (from keyboard.ts)
  window.addEventListener('forge:viewportShortcut', ((e: CustomEvent) => {
    const viewport = e.detail?.viewport as ViewportPreset;
    if (viewport && PRESETS[viewport]) {
      setPreset(viewport);
    }
  }) as EventListener);

  const manager: ViewportManager = {
    get activePreset() { return activePreset; },
    setPreset,
  };

  return manager;
}
