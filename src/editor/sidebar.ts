// Sidebar — Tabbed right panel with Properties and AI Chat tabs

import type { ElementInfo } from '../bridge/protocol.js';
import { createProperties, type PropertiesManager } from './properties.js';

export type SidebarTab = 'chat' | 'properties';

export interface SidebarManager {
  properties: PropertiesManager;
  switchTab(tab: SidebarTab): void;
  activeTab: SidebarTab;
}

export function createSidebar(container: HTMLElement): SidebarManager {
  let activeTab: SidebarTab = 'chat';
  let selectedElement: ElementInfo | null = null;

  // Create tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'sf-sidebar-tabs';

  const chatTabBtn = document.createElement('button');
  chatTabBtn.className = 'sf-sidebar-tab active';
  chatTabBtn.textContent = 'AI Chat';
  chatTabBtn.dataset.tab = 'chat';

  const propsTabBtn = document.createElement('button');
  propsTabBtn.className = 'sf-sidebar-tab';
  propsTabBtn.textContent = 'Properties';
  propsTabBtn.dataset.tab = 'properties';

  tabBar.appendChild(chatTabBtn);
  tabBar.appendChild(propsTabBtn);

  // Context indicator (shows selected element info at top of chat)
  const contextIndicator = document.createElement('div');
  contextIndicator.className = 'sf-sidebar-context';
  contextIndicator.style.display = 'none';

  // Create content containers for each tab
  const chatContent = document.createElement('div');
  chatContent.className = 'sf-sidebar-content sf-chat-content';
  chatContent.innerHTML = `
    <div class="sf-chat-placeholder">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span>AI Chat — coming next</span>
    </div>
  `;

  const propsContent = document.createElement('div');
  propsContent.className = 'sf-sidebar-content sf-props-content';

  // Build DOM
  container.innerHTML = '';
  container.appendChild(tabBar);
  container.appendChild(contextIndicator);
  container.appendChild(chatContent);
  container.appendChild(propsContent);

  // Initialize properties panel inside its content container
  const properties = createProperties(propsContent);

  function updateContextIndicator(): void {
    if (selectedElement && activeTab === 'chat') {
      const tag = `<${selectedElement.tagName}>`;
      const cls = selectedElement.className
        ? ` .${selectedElement.className.split(' ')[0]}`
        : '';
      contextIndicator.innerHTML = `<span class="sf-context-label">Context:</span> <span class="sf-context-element">${tag}${cls}</span>`;
      contextIndicator.style.display = '';
    } else {
      contextIndicator.style.display = 'none';
    }
  }

  function switchTab(tab: SidebarTab): void {
    activeTab = tab;

    // Update tab button states
    chatTabBtn.classList.toggle('active', tab === 'chat');
    propsTabBtn.classList.toggle('active', tab === 'properties');

    // Show/hide content
    chatContent.style.display = tab === 'chat' ? '' : 'none';
    propsContent.style.display = tab === 'properties' ? '' : 'none';

    updateContextIndicator();
  }

  // Tab click handlers
  chatTabBtn.addEventListener('click', () => switchTab('chat'));
  propsTabBtn.addEventListener('click', () => switchTab('properties'));

  // Auto-switch to Properties when element is selected
  window.addEventListener('forge:selectionChanged', ((e: CustomEvent) => {
    const element: ElementInfo | null = e.detail?.element || null;
    selectedElement = element;
    if (element) {
      switchTab('properties');
    }
    updateContextIndicator();
  }) as EventListener);

  // Initialize with chat tab active
  switchTab('chat');

  const manager: SidebarManager = {
    properties,
    switchTab,
    get activeTab() {
      return activeTab;
    },
  };

  return manager;
}
