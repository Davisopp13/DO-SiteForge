// Sidebar — Tabbed right panel with Properties and AI Chat tabs

import type { ElementInfo } from '../bridge/protocol.js';
import { createProperties, type PropertiesManager } from './properties.js';
import { renderMarkdown } from './markdown.js';
import type { CanvasContext } from './context.js';

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
  sendMessage(text: string): void;
  focusInput(): void;
  clearChat(): void;
  setContextProvider(provider: () => Promise<CanvasContext>): void;
  inputEl: HTMLTextAreaElement;
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

  // Chat input area
  const chatInputArea = document.createElement('div');
  chatInputArea.className = 'sf-chat-input-area';

  const chatTextarea = document.createElement('textarea');
  chatTextarea.className = 'sf-chat-textarea';
  chatTextarea.placeholder = 'Describe a change...';
  chatTextarea.rows = 1;

  const sendBtn = document.createElement('button');
  sendBtn.className = 'sf-chat-send-btn';
  sendBtn.title = 'Send message';
  sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  chatInputArea.appendChild(chatTextarea);
  chatInputArea.appendChild(sendBtn);

  chatContent.appendChild(chatMessagesEl);
  chatContent.appendChild(chatInputArea);

  // Auto-grow textarea up to 4 lines
  function autoGrowTextarea(): void {
    chatTextarea.style.height = 'auto';
    const lineHeight = 18;
    const maxHeight = lineHeight * 4 + 16; // 4 lines + padding
    chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, maxHeight) + 'px';
  }

  chatTextarea.addEventListener('input', autoGrowTextarea);

  // Context provider for getting canvas context
  let contextProvider: (() => Promise<CanvasContext>) | null = null;

  function setContextProvider(provider: () => Promise<CanvasContext>): void {
    contextProvider = provider;
  }

  // Update placeholder based on context
  function updatePlaceholder(): void {
    if (isLoading) {
      chatTextarea.placeholder = 'Waiting for response...';
    } else if (selectedElement) {
      const tag = `<${selectedElement.tagName}>`;
      chatTextarea.placeholder = `Describe a change to ${tag}...`;
    } else {
      chatTextarea.placeholder = 'Describe a change...';
    }
  }

  // Set input disabled state during loading
  function setInputDisabled(disabled: boolean): void {
    chatTextarea.disabled = disabled;
    sendBtn.disabled = disabled;
    sendBtn.classList.toggle('disabled', disabled);
    updatePlaceholder();
  }

  // Send message
  async function sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // Add user message immediately (optimistic UI)
    addMessage('user', trimmed);

    // Clear textarea
    chatTextarea.value = '';
    autoGrowTextarea();

    // Disable input while waiting
    setInputDisabled(true);
    showLoading();

    // Collect context
    let context: CanvasContext | null = null;
    if (contextProvider) {
      try {
        context = await contextProvider();
      } catch {
        // Context collection failed — send without context
      }
    }

    // Build history for API (exclude the message we just added — it's sent as `message`)
    const historyForApi = messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          context: context || {},
          history: historyForApi,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }));
        hideLoading();
        setInputDisabled(false);
        addMessage('assistant', `Error: ${errData.error || res.statusText}`);
        return;
      }

      // Dispatch event for SSE stream handling (Task 12 will implement the stream reader)
      window.dispatchEvent(new CustomEvent('forge:chatResponse', {
        detail: { response: res },
      }));

      // For now, if no SSE handler picks it up, read as text fallback
      hideLoading();
      setInputDisabled(false);
    } catch (err) {
      hideLoading();
      setInputDisabled(false);
      addMessage('assistant', 'Connection error — check that the server is running and try again.');
    }
  }

  // Enter to send, Shift+Enter for newline
  chatTextarea.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(chatTextarea.value);
    }
  });

  // Send button click
  sendBtn.addEventListener('click', () => {
    sendMessage(chatTextarea.value);
  });

  // Focus input
  function focusInput(): void {
    chatTextarea.focus();
  }

  // Clear chat
  function clearChat(): void {
    messages.length = 0;
    chatMessagesEl.innerHTML = '';
    // Restore empty state
    const newEmptyState = document.createElement('div');
    newEmptyState.className = 'sf-chat-placeholder';
    newEmptyState.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span>Describe a change to your site</span>
    `;
    chatMessagesEl.appendChild(newEmptyState);
  }

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
    setInputDisabled(true);
  }

  function hideLoading(): void {
    isLoading = false;
    loadingEl.style.display = 'none';
    if (loadingEl.parentElement) {
      loadingEl.remove();
    }
    setInputDisabled(false);
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
    updatePlaceholder();
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
    sendMessage,
    focusInput,
    clearChat,
    setContextProvider,
    inputEl: chatTextarea,
  };

  return manager;
}
