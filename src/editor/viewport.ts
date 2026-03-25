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
  let isDraggingSlider = false;
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

  // Custom slider bar — inserted after the viewport bar
  const sliderBar = document.createElement('div');
  sliderBar.id = 'sf-viewport-slider-bar';
  sliderBar.className = 'sf-viewport-slider-bar';
  sliderBar.style.display = 'none';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '320';
  slider.max = '1920';
  slider.step = '1';
  slider.value = String(customWidth);
  slider.className = 'sf-viewport-slider';

  const sliderValue = document.createElement('span');
  sliderValue.className = 'sf-viewport-slider-value';
  sliderValue.textContent = `${customWidth}px`;

  sliderBar.appendChild(slider);
  sliderBar.appendChild(sliderValue);

  // Insert slider bar right after the viewport bar
  bar.insertAdjacentElement('afterend', sliderBar);

  // Slider real-time updates via oninput (not onchange)
  slider.addEventListener('input', () => {
    const width = parseInt(slider.value, 10);
    customWidth = width;
    sliderValue.textContent = `${width}px`;
    updateDimensions();

    // Disable CSS transition on device frame during drag for instant feedback
    if (!isDraggingSlider) {
      isDraggingSlider = true;
      const deviceFrame = document.getElementById('sf-device-frame');
      if (deviceFrame) {
        deviceFrame.classList.add('sf-no-transition');
      }
    }

    // Dispatch viewport change for canvas to resize iframe
    window.dispatchEvent(new CustomEvent('forge:viewportChanged', {
      detail: { preset: 'custom', width },
    }));
  });

  // Re-enable CSS transition when slider is released
  slider.addEventListener('mouseup', onSliderRelease);
  slider.addEventListener('touchend', onSliderRelease);

  function onSliderRelease() {
    isDraggingSlider = false;
    const deviceFrame = document.getElementById('sf-device-frame');
    if (deviceFrame) {
      deviceFrame.classList.remove('sf-no-transition');
    }
  }

  // Set initial active state
  updateActiveButton();

  function setPreset(preset: ViewportPreset) {
    activePreset = preset;
    updateActiveButton();
    updateDimensions();
    updateSliderVisibility();

    // Sync slider value when switching to custom
    if (preset === 'custom') {
      slider.value = String(customWidth);
      sliderValue.textContent = `${customWidth}px`;
    }

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

  function updateSliderVisibility() {
    sliderBar.style.display = activePreset === 'custom' ? 'flex' : 'none';
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
