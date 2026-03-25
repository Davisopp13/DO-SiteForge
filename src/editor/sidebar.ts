// Sidebar — Tabbed right panel with Properties and AI Chat tabs

import type { ElementInfo } from '../bridge/protocol.js';
import { createProperties, type PropertiesManager } from './properties.js';
import { renderMarkdown } from './markdown.js';

export type SidebarTab = 'chat' | 'properties';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface SidebarManager {
  properties: PropertiesManager;
  switchTab(tab: SidebarTab): void;
  activeTab: SidebarTab;
  addMessage(role: 'user' | 'assistant', content: string): HTMLElement;
  updateAssistantMessage(el: HTMLElement, content: string): void;
  finalizeAssistantMessage(el: HTMLElement): void;
  showLoading(): void;
  hideLoading(): void;
  messages: ChatMessage[];
  chatMessagesEl: HTMLElement;
  isLoading: boolean;
}


export function createSidebar(container: HTMLElement): SidebarManager {
  let activeTab: SidebarTab = 'chat';
  let selectedElement: ElementInfo | null = null;
  let isLoading = false;
  const messages: ChatMessage[] = [];

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

  // Chat content: messages area (no padding — messages handle their own spacing)
  const chatContent = document.createElement('div');
  chatContent.className = 'sf-sidebar-content sf-chat-content';
  chatContent.style.padding = '0';
  chatContent.style.display = 'flex';
  chatContent.style.flexDirection = 'column';

  // Scrollable message container
  const chatMessagesEl = document.createElement('div');
  chatMessagesEl.className = 'sf-chat-messages';

  // Empty state
  const emptyState = document.createElement('div');
  emptyState.className = 'sf-chat-placeholder';
  emptyState.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <span>Describe a change to your site</span>
  `;
  chatMessagesEl.appendChild(emptyState);

  // Loading indicator (three animated dots)
  const loadingEl = document.createElement('div');
  loadingEl.className = 'sf-chat-loading';
  loadingEl.style.display = 'none';
  loadingEl.innerHTML = `<span class="sf-chat-dot"></span><span class="sf-chat-dot"></span><span class="sf-chat-dot"></span>`;

  chatContent.appendChild(chatMessagesEl);

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

  function scrollToBottom(): void {
    requestAnimationFrame(() => {
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    });
  }

  function hideEmptyState(): void {
    const placeholder = chatMessagesEl.querySelector('.sf-chat-placeholder');
    if (placeholder) {
      placeholder.remove();
    }
  }

  function addMessage(role: 'user' | 'assistant', content: string): HTMLElement {
    hideEmptyState();

    const msg: ChatMessage = { role, content, timestamp: Date.now() };
    messages.push(msg);

    const msgEl = document.createElement('div');
    msgEl.className = `sf-chat-msg sf-chat-msg-${role}`;

    if (role === 'user') {
      const bubble = document.createElement('div');
      bubble.className = 'sf-chat-bubble-user';
      bubble.textContent = content;
      msgEl.appendChild(bubble);
    } else {
      const bubble = document.createElement('div');
      bubble.className = 'sf-chat-bubble-ai';
      bubble.innerHTML = renderMarkdown(content);
      msgEl.appendChild(bubble);
    }

    // Insert before loading indicator if it's present
    if (loadingEl.parentElement === chatMessagesEl) {
      chatMessagesEl.insertBefore(msgEl, loadingEl);
    } else {
      chatMessagesEl.appendChild(msgEl);
    }

    scrollToBottom();
    return msgEl;
  }

  function updateAssistantMessage(el: HTMLElement, content: string): void {
    const bubble = el.querySelector('.sf-chat-bubble-ai');
    if (bubble) {
      bubble.innerHTML = renderMarkdown(content);
    }
    // Update stored message content
    const idx = messages.length - 1;
    if (idx >= 0 && messages[idx].role === 'assistant') {
      messages[idx].content = content;
    }
    scrollToBottom();
  }

  function finalizeAssistantMessage(el: HTMLElement): void {
    // Mark as complete (future: parse file changes, add suggestion chips)
    el.classList.add('sf-chat-msg-complete');
    scrollToBottom();
  }

  function showLoading(): void {
    isLoading = true;
    loadingEl.style.display = '';
    chatMessagesEl.appendChild(loadingEl);
    scrollToBottom();
  }

  function hideLoading(): void {
    isLoading = false;
    loadingEl.style.display = 'none';
    if (loadingEl.parentElement) {
      loadingEl.remove();
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
    addMessage,
    updateAssistantMessage,
    finalizeAssistantMessage,
    showLoading,
    hideLoading,
    messages,
    chatMessagesEl,
    get isLoading() {
      return isLoading;
    },
  };

  return manager;
}
