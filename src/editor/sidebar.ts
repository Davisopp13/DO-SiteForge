// Sidebar — Tabbed right panel with Properties and AI Chat tabs

import type { ElementInfo } from '../bridge/protocol.js';
import { createProperties, type PropertiesManager } from './properties.js';
import { renderMarkdown } from './markdown.js';
import type { CanvasContext } from './context.js';
import { parseFileChanges, resolveFileChanges, renderFileChanges, applyFileChangesAuto, renderDirectWriteChanges, type WatchedFileChange } from './filechanges.js';

export type SidebarTab = 'chat' | 'properties';
export type ModelAlias = 'sonnet' | 'opus' | 'haiku';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
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


interface AIStatus {
  provider: string;       // 'claude-code' | 'anthropic-api' | 'disabled'
  available: boolean;
  supportsDirectWrites: boolean;
}

export function createSidebar(container: HTMLElement): SidebarManager {
  let activeTab: SidebarTab = 'chat';
  let selectedElement: ElementInfo | null = null;
  let isLoading = false;
  let autoApply = false;
  let aiEnabled = true; // assume enabled, will check on init
  let aiStatus: AIStatus = { provider: 'anthropic-api', available: true, supportsDirectWrites: false };
  let currentModel: ModelAlias = 'sonnet';
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

  // Empty state — anvil icon + prompt + clickable examples
  const EXAMPLE_PROMPTS = [
    'Add a contact form section',
    'Improve the page typography',
    'Make the hero full-width',
  ];

  function createEmptyState(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'sf-chat-placeholder';
    // SiteForge anvil icon (24px, muted)
    el.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="sf-chat-placeholder-icon">
        <path d="M7 4h10l1 4H6l1-4z"/>
        <rect x="3" y="8" width="18" height="3" rx="1"/>
        <path d="M8 11v6a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-6"/>
      </svg>
      <span class="sf-chat-placeholder-text">Ask AI to build or edit your site</span>
    `;
    const examplesEl = document.createElement('div');
    examplesEl.className = 'sf-chat-placeholder-examples';
    for (const prompt of EXAMPLE_PROMPTS) {
      const btn = document.createElement('button');
      btn.className = 'sf-chat-placeholder-example';
      btn.textContent = prompt;
      btn.addEventListener('click', () => sendMessage(prompt));
      examplesEl.appendChild(btn);
    }
    el.appendChild(examplesEl);
    return el;
  }

  chatMessagesEl.appendChild(createEmptyState());

  // No-API-key setup guide
  const setupGuide = document.createElement('div');
  setupGuide.className = 'sf-chat-setup-guide';
  setupGuide.style.display = 'none';
  setupGuide.innerHTML = `
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5;margin-bottom:12px">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
    <h3 class="sf-setup-heading">Set up AI to get started</h3>
    <div class="sf-setup-steps">
      <p class="sf-setup-recommend"><strong>Recommended:</strong> Install <a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank">Claude Code</a> for the best experience — no API key needed</p>
      <p>Or set an API key from <strong>console.anthropic.com</strong>:</p>
      <pre class="sf-setup-code">export ANTHROPIC_API_KEY=sk-ant-...</pre>
      <p>Or paste it below to save to <code>~/.siteforge/config.json</code>:</p>
    </div>
    <div class="sf-setup-input-row">
      <input type="password" class="sf-setup-key-input" placeholder="sk-ant-..." spellcheck="false" autocomplete="off" />
      <button class="sf-setup-save-btn">Save</button>
    </div>
    <div class="sf-setup-status" style="display:none"></div>
  `;

  // Wire up the save button
  const setupKeyInput = setupGuide.querySelector('.sf-setup-key-input') as HTMLInputElement;
  const setupSaveBtn = setupGuide.querySelector('.sf-setup-save-btn') as HTMLButtonElement;
  const setupStatus = setupGuide.querySelector('.sf-setup-status') as HTMLElement;

  setupSaveBtn.addEventListener('click', async () => {
    const key = setupKeyInput.value.trim();
    if (!key) return;

    setupSaveBtn.disabled = true;
    setupSaveBtn.textContent = 'Saving...';
    setupStatus.style.display = 'none';

    try {
      const res = await fetch('/api/config/set-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json() as { success?: boolean; error?: string; aiEnabled?: boolean };

      if (data.success && data.aiEnabled) {
        aiEnabled = true;
        activateChat();
      } else {
        setupStatus.textContent = data.error || 'Failed to save key';
        setupStatus.style.display = '';
        setupStatus.style.color = 'var(--sf-danger, #e55)';
      }
    } catch {
      setupStatus.textContent = 'Connection error — is the server running?';
      setupStatus.style.display = '';
      setupStatus.style.color = 'var(--sf-danger, #e55)';
    } finally {
      setupSaveBtn.disabled = false;
      setupSaveBtn.textContent = 'Save';
    }
  });

  setupKeyInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') setupSaveBtn.click();
  });

  /** Hide setup guide and show chat interface */
  function activateChat(): void {
    setupGuide.style.display = 'none';
    chatMessagesEl.style.display = '';
    chatInputArea.style.display = '';
    updatePlaceholder();
  }

  /** Show setup guide and hide chat interface */
  function deactivateChat(): void {
    setupGuide.style.display = '';
    chatMessagesEl.style.display = 'none';
    chatInputArea.style.display = 'none';
  }

  // Loading indicator (three animated dots + elapsed timer + reassurance messages)
  const loadingEl = document.createElement('div');
  loadingEl.className = 'sf-chat-loading';
  loadingEl.style.display = 'none';
  loadingEl.innerHTML = `
    <div class="sf-chat-loading-dots">
      <span class="sf-chat-dot"></span><span class="sf-chat-dot"></span><span class="sf-chat-dot"></span>
      <span class="sf-chat-loading-timer"></span>
    </div>
    <div class="sf-chat-loading-hint" style="display:none"></div>
  `;

  let loadingStartTime = 0;
  let loadingTimerInterval: ReturnType<typeof setInterval> | null = null;

  function startLoadingTimer(): void {
    loadingStartTime = Date.now();
    const timerEl = loadingEl.querySelector('.sf-chat-loading-timer') as HTMLElement;
    const hintEl = loadingEl.querySelector('.sf-chat-loading-hint') as HTMLElement;

    loadingTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - loadingStartTime) / 1000);
      timerEl.textContent = `${elapsed}s`;

      if (elapsed >= 120) {
        hintEl.textContent = 'Still working. If this doesn\'t complete, try a simpler request.';
        hintEl.style.display = '';
      } else if (elapsed >= 45) {
        hintEl.textContent = 'This is taking longer than usual. Complex changes may take up to 2 minutes.';
        hintEl.style.display = '';
      } else if (elapsed >= 15) {
        hintEl.textContent = 'Claude Code is reading your project files...';
        hintEl.style.display = '';
      } else {
        hintEl.style.display = 'none';
      }
    }, 1000);
  }

  function stopLoadingTimer(): void {
    if (loadingTimerInterval) {
      clearInterval(loadingTimerInterval);
      loadingTimerInterval = null;
    }
    const timerEl = loadingEl.querySelector('.sf-chat-loading-timer') as HTMLElement;
    const hintEl = loadingEl.querySelector('.sf-chat-loading-hint') as HTMLElement;
    timerEl.textContent = '';
    hintEl.style.display = 'none';
    hintEl.textContent = '';
  }

  // Chat input area
  const chatInputArea = document.createElement('div');
  chatInputArea.className = 'sf-chat-input-area';

  // Auto-apply toggle row
  const autoApplyRow = document.createElement('div');
  autoApplyRow.className = 'sf-auto-apply-row';

  // Model selector
  const MODEL_OPTIONS: { alias: ModelAlias; label: string; description: string }[] = [
    { alias: 'sonnet', label: 'Sonnet', description: 'Fast, great for most edits' },
    { alias: 'opus',   label: 'Opus',   description: 'Most capable, complex tasks' },
    { alias: 'haiku',  label: 'Haiku',  description: 'Fastest, simple changes' },
  ];

  const modelSelectorWrapper = document.createElement('div');
  modelSelectorWrapper.className = 'sf-model-selector';
  modelSelectorWrapper.style.display = 'none'; // hidden until AI is available

  const modelPill = document.createElement('button');
  modelPill.className = 'sf-model-pill';
  modelPill.textContent = 'Sonnet';

  const modelDropdown = document.createElement('div');
  modelDropdown.className = 'sf-model-dropdown';
  modelDropdown.style.display = 'none';

  function renderModelOptions(): void {
    modelDropdown.innerHTML = '';
    for (const opt of MODEL_OPTIONS) {
      const item = document.createElement('button');
      item.className = 'sf-model-option';
      if (opt.alias === currentModel) item.classList.add('active');
      item.innerHTML = `
        <span class="sf-model-option-name">${opt.label}</span>
        <span class="sf-model-option-desc">${opt.description}</span>
        ${opt.alias === currentModel ? '<span class="sf-model-option-check">✓</span>' : ''}
      `;
      item.addEventListener('click', () => {
        currentModel = opt.alias;
        modelPill.textContent = opt.label;
        closeModelDropdown();
        renderModelOptions();
        window.dispatchEvent(new CustomEvent('forge:modelChanged', { detail: { model: currentModel } }));
      });
      modelDropdown.appendChild(item);
    }
  }

  function openModelDropdown(): void {
    renderModelOptions();
    modelDropdown.style.display = '';
    modelPill.classList.add('open');
  }

  function closeModelDropdown(): void {
    modelDropdown.style.display = 'none';
    modelPill.classList.remove('open');
  }

  modelPill.addEventListener('click', (e) => {
    e.stopPropagation();
    if (modelDropdown.style.display === 'none') {
      openModelDropdown();
    } else {
      closeModelDropdown();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => closeModelDropdown());
  modelDropdown.addEventListener('click', (e) => e.stopPropagation());

  // Close dropdown when textarea is focused
  const closeDropdownOnFocus = (): void => closeModelDropdown();

  modelSelectorWrapper.appendChild(modelPill);
  modelSelectorWrapper.appendChild(modelDropdown);

  const autoApplyLabel = document.createElement('label');
  autoApplyLabel.className = 'sf-auto-apply-label';
  autoApplyLabel.textContent = 'Auto-apply';

  const autoApplySwitch = document.createElement('button');
  autoApplySwitch.className = 'sf-auto-apply-switch';
  autoApplySwitch.setAttribute('role', 'switch');
  autoApplySwitch.setAttribute('aria-checked', 'false');
  autoApplySwitch.innerHTML = `<span class="sf-auto-apply-thumb"></span>`;
  autoApplySwitch.addEventListener('click', () => {
    autoApply = !autoApply;
    autoApplySwitch.classList.toggle('active', autoApply);
    autoApplySwitch.setAttribute('aria-checked', String(autoApply));
  });

  autoApplyRow.appendChild(modelSelectorWrapper);
  autoApplyRow.appendChild(autoApplyLabel);
  autoApplyRow.appendChild(autoApplySwitch);

  const chatTextarea = document.createElement('textarea');
  chatTextarea.className = 'sf-chat-textarea';
  chatTextarea.placeholder = 'Describe a change...';
  chatTextarea.rows = 1;

  const sendBtn = document.createElement('button');
  sendBtn.className = 'sf-chat-send-btn';
  sendBtn.title = 'Send message';
  sendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  // Input row (textarea + send button)
  const chatInputRow = document.createElement('div');
  chatInputRow.className = 'sf-chat-input-row';
  chatInputRow.appendChild(chatTextarea);
  chatInputRow.appendChild(sendBtn);

  chatInputArea.appendChild(autoApplyRow);
  chatInputArea.appendChild(chatInputRow);

  chatContent.appendChild(setupGuide);
  chatContent.appendChild(chatMessagesEl);
  chatContent.appendChild(chatInputArea);

  // Auto-grow textarea smoothly up to max-height (120px)
  function autoGrowTextarea(): void {
    chatTextarea.style.height = 'auto';
    chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 120) + 'px';
  }

  chatTextarea.addEventListener('input', autoGrowTextarea);
  chatTextarea.addEventListener('focus', closeDropdownOnFocus);

  // Context provider for getting canvas context
  let contextProvider: (() => Promise<CanvasContext>) | null = null;

  function setContextProvider(provider: () => Promise<CanvasContext>): void {
    contextProvider = provider;
  }

  // Update placeholder based on context
  function updatePlaceholder(): void {
    if (!aiEnabled) {
      chatTextarea.placeholder = 'AI features disabled — set API key';
    } else if (isLoading) {
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
          model: currentModel,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
        hideLoading();
        setInputDisabled(false);
        showErrorMessage(errData.error || res.statusText);
        return;
      }

      // Read SSE stream from response body
      hideLoading();
      const assistantEl = addMessage('assistant', '');
      let fullContent = '';
      let renderTimer: ReturnType<typeof setTimeout> | null = null;
      let needsRender = false;
      let directWriteChanges: WatchedFileChange[] = [];
      let directWriteGitRef: string | null = null;

      function scheduleRender(): void {
        if (renderTimer) return;
        needsRender = true;
        renderTimer = setTimeout(() => {
          renderTimer = null;
          if (needsRender) {
            needsRender = false;
            updateAssistantMessage(assistantEl, fullContent);
          }
        }, 50);
      }

      function flushRender(): void {
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
        updateAssistantMessage(assistantEl, fullContent);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        updateAssistantMessage(assistantEl, 'Error: Could not read response stream.');
        setInputDisabled(false);
        return;
      }

      const decoder = new TextDecoder();
      let sseBuffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer (split on double newline)
          const parts = sseBuffer.split('\n\n');
          // Keep last incomplete part in buffer
          sseBuffer = parts.pop() || '';

          for (const part of parts) {
            if (!part.trim()) continue;

            let eventType = 'message';
            let eventData = '';

            for (const line of part.split('\n')) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                eventData = line.slice(6);
              }
            }

            if (eventType === 'delta' && eventData) {
              try {
                const parsed = JSON.parse(eventData) as { text: string };
                fullContent += parsed.text;
                scheduleRender();
              } catch {
                // Skip malformed delta
              }
            } else if (eventType === 'files' && eventData) {
              try {
                const parsed = JSON.parse(eventData) as { changes?: WatchedFileChange[]; gitRef?: string | null };
                if (parsed.changes && Array.isArray(parsed.changes)) {
                  directWriteChanges.push(...parsed.changes);
                }
                if (parsed.gitRef) {
                  directWriteGitRef = parsed.gitRef;
                }
              } catch {
                // Skip malformed files event
              }
            } else if (eventType === 'done') {
              // Stream complete
              break;
            } else if (eventType === 'error' && eventData) {
              try {
                const parsed = JSON.parse(eventData) as { message: string };
                fullContent += `\n\nError: ${parsed.message}`;
              } catch {
                fullContent += '\n\nError: Unknown error occurred.';
              }
              break;
            }
          }
        }
      } catch {
        if (!fullContent) {
          fullContent = 'Connection error — try again.';
        }
      }

      // Final render with complete content
      flushRender();
      await finalizeAssistantMessage(assistantEl);

      // Render direct write file changes (from Claude Code watcher)
      if (directWriteChanges.length > 0) {
        const directWritesEl = renderDirectWriteChanges(directWriteChanges, directWriteGitRef);
        assistantEl.appendChild(directWritesEl);
        scrollToBottom();

        // Show toast on canvas
        const count = directWriteChanges.length;
        const isStatic = !!(window as unknown as Record<string, unknown>).__sfIsStaticProject;
        const toastText = `${count} file${count !== 1 ? 's' : ''} updated` + (isStatic ? ', canvas refreshed' : '');
        showToast(toastText);
      }

      setInputDisabled(false);
    } catch (err) {
      hideLoading();
      setInputDisabled(false);
      showErrorMessage('Connection error — try again');
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
    chatMessagesEl.appendChild(createEmptyState());
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
      chatMessagesEl.scrollTo({
        top: chatMessagesEl.scrollHeight,
        behavior: 'smooth',
      });
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

    const modelForMsg = role === 'assistant' ? currentModel : undefined;
    const msg: ChatMessage = { role, content, timestamp: Date.now(), model: modelForMsg };
    messages.push(msg);

    const msgEl = document.createElement('div');
    msgEl.className = `sf-chat-msg sf-chat-msg-${role}`;

    if (role === 'user') {
      const bubble = document.createElement('div');
      bubble.className = 'sf-chat-bubble-user';
      bubble.textContent = content;
      msgEl.appendChild(bubble);
    } else {
      // Provider badge with model name: "Claude Code · Sonnet" or "API · Opus"
      const modelLabel = modelForMsg
        ? modelForMsg.charAt(0).toUpperCase() + modelForMsg.slice(1)
        : '';
      const badgeEl = document.createElement('span');
      badgeEl.className = 'sf-provider-badge';
      if (aiStatus.provider === 'claude-code') {
        badgeEl.textContent = modelLabel ? `Claude Code · ${modelLabel}` : 'Claude Code';
        badgeEl.classList.add('sf-provider-badge-cc');
      } else {
        badgeEl.textContent = modelLabel ? `API · ${modelLabel}` : 'API';
        badgeEl.classList.add('sf-provider-badge-api');
      }
      msgEl.appendChild(badgeEl);

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

  /** Show a red-tinted error message with error icon and Retry button */
  function showErrorMessage(errorText: string): void {
    hideEmptyState();

    const errEl = document.createElement('div');
    errEl.className = 'sf-chat-msg sf-chat-msg-error';
    errEl.innerHTML = `
      <div class="sf-chat-error-content">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sf-chat-error-icon">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>${errorText}</span>
      </div>
    `;

    const retryBtn = document.createElement('button');
    retryBtn.className = 'sf-chat-retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
      // Remove the error message element
      errEl.remove();
      // Resend the last user message
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        sendMessage(lastUserMsg.content);
      }
    });
    errEl.appendChild(retryBtn);

    chatMessagesEl.appendChild(errEl);
    renderSuggestionChips(errEl, '', true);
    scrollToBottom();
  }

  function showToast(text: string): void {
    const canvasEl = document.getElementById('sf-canvas');
    const parent = canvasEl || document.body;

    const toast = document.createElement('div');
    toast.className = 'sf-toast';
    toast.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sf-green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${text}`;
    parent.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('sf-toast-visible'));
    setTimeout(() => {
      toast.classList.remove('sf-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Suggestion chip logic — context-aware suggestions shown after AI responses
  function getSuggestionChips(lastAssistantContent: string, isError: boolean): string[] {
    // After an error response
    if (isError) {
      return ['Try again', 'Simplify the request'];
    }

    const hasFileChanges = parseFileChanges(lastAssistantContent).length > 0;

    // After a component/file was created or modified
    if (hasFileChanges) {
      return ['Adjust the styling', 'Add responsive breakpoints', 'Add another section'];
    }

    // When viewing at mobile viewport (width < 640px)
    const isMobileViewport = document.querySelector('.sf-device-mobile') !== null;
    const deviceFrame = document.querySelector('.sf-device-frame') as HTMLElement | null;
    const frameWidth = deviceFrame ? deviceFrame.offsetWidth : window.innerWidth;
    if (isMobileViewport || frameWidth < 640) {
      return ['Fix mobile layout', 'Stack elements vertically', 'Reduce font sizes'];
    }

    // When an element is selected
    if (selectedElement) {
      const tag = selectedElement.tagName || 'element';
      return [`Edit this ${tag}`, 'Delete this element', 'Duplicate this section'];
    }

    // Default — no special context
    return ['Add a new section', 'Review the page layout', 'Improve accessibility'];
  }

  function renderSuggestionChips(parentEl: HTMLElement, content: string, isError = false): void {
    // Remove any existing chips
    const existing = parentEl.querySelector('.sf-suggestion-chips');
    if (existing) existing.remove();

    const chips = getSuggestionChips(content, isError).slice(0, 3);
    if (chips.length === 0) return;

    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'sf-suggestion-chips';

    for (const chipText of chips) {
      const chip = document.createElement('button');
      chip.className = 'sf-suggestion-chip';
      chip.textContent = chipText;
      chip.addEventListener('click', () => {
        // Remove chips on click
        chipsContainer.remove();
        // Send the chip text as a message
        sendMessage(chipText);
      });
      chipsContainer.appendChild(chip);
    }

    parentEl.appendChild(chipsContainer);
    scrollToBottom();
  }

  async function finalizeAssistantMessage(el: HTMLElement): Promise<void> {
    el.classList.add('sf-chat-msg-complete');

    // Parse file changes from the assistant's response
    // Skip Apply-button flow when Claude Code writes files directly
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && !aiStatus.supportsDirectWrites) {
      const changes = parseFileChanges(lastMsg.content);
      if (changes.length > 0) {
        // Resolve isNew flags via API
        const resolved = await resolveFileChanges(changes);

        if (autoApply) {
          // Auto-apply: write files immediately, show toast
          const result = await applyFileChangesAuto(resolved);
          if (result.successCount > 0) {
            const isStatic = !!(window as unknown as Record<string, unknown>).__sfIsStaticProject;
            const toastText = `${result.successCount} file${result.successCount !== 1 ? 's' : ''} updated` + (isStatic ? ', canvas refreshed' : '');
            showToast(toastText);
          }
          if (result.errors.length > 0) {
            // Show file cards with error state for failed files
            const fileChangesEl = renderFileChanges(resolved);
            el.appendChild(fileChangesEl);
          }
        } else {
          const fileChangesEl = renderFileChanges(resolved);
          el.appendChild(fileChangesEl);
        }
      }
    }

    // Show suggestion chips after AI response
    if (lastMsg && lastMsg.role === 'assistant') {
      renderSuggestionChips(el, lastMsg.content);
    }

    scrollToBottom();
  }

  function showLoading(): void {
    isLoading = true;
    loadingEl.style.display = '';
    chatMessagesEl.appendChild(loadingEl);
    scrollToBottom();
    setInputDisabled(true);
    startLoadingTimer();
  }

  function hideLoading(): void {
    isLoading = false;
    stopLoadingTimer();
    loadingEl.style.display = 'none';
    if (loadingEl.parentElement) {
      loadingEl.remove();
    }
    setInputDisabled(false);
  }

  let tabInitialized = false;
  function switchTab(tab: SidebarTab): void {
    activeTab = tab;

    // Update tab button states
    chatTabBtn.classList.toggle('active', tab === 'chat');
    propsTabBtn.classList.toggle('active', tab === 'properties');

    const incoming = tab === 'chat' ? chatContent : propsContent;
    const outgoing = tab === 'chat' ? propsContent : chatContent;

    if (!tabInitialized) {
      // First call — no animation
      outgoing.style.display = 'none';
      incoming.style.display = '';
      incoming.style.opacity = '1';
      tabInitialized = true;
    } else {
      // Smooth opacity fade on tab switch (150ms)
      outgoing.style.opacity = '0';
      setTimeout(() => {
        outgoing.style.display = 'none';
        incoming.style.display = '';
        incoming.style.opacity = '0';
        // Force reflow so transition triggers
        void incoming.offsetHeight;
        incoming.style.opacity = '1';
      }, 150);
    }

    updateContextIndicator();
  }

  // Tab click handlers
  chatTabBtn.addEventListener('click', () => switchTab('chat'));
  propsTabBtn.addEventListener('click', () => switchTab('properties'));

  // Update context indicator and placeholder when selection changes — do NOT auto-switch tabs
  window.addEventListener('forge:selectionChanged', ((e: CustomEvent) => {
    const element: ElementInfo | null = e.detail?.element || null;
    selectedElement = element;
    updateContextIndicator();
    updatePlaceholder();
  }) as EventListener);

  // Show toast when AI changes are undone
  window.addEventListener('forge:undoComplete', ((e: CustomEvent) => {
    const count = e.detail?.restoredCount || 0;
    if (count > 0) {
      const isStatic = !!(window as unknown as Record<string, unknown>).__sfIsStaticProject;
      const toastText = `Changes reverted (${count} file${count !== 1 ? 's' : ''})` + (isStatic ? ', canvas refreshed' : '');
      showToast(toastText);
    }
  }) as EventListener);

  // Show toast when files are applied via manual Apply button
  window.addEventListener('forge:filesApplied', ((e: CustomEvent) => {
    const count = e.detail?.count || 0;
    if (count > 0) {
      const isStatic = !!(window as unknown as Record<string, unknown>).__sfIsStaticProject;
      const toastText = `${count} file${count !== 1 ? 's' : ''} updated` + (isStatic ? ', canvas refreshed' : '');
      showToast(toastText);
    }
  }) as EventListener);

  // Initialize with chat tab active
  switchTab('chat');

  // Check AI provider status on init
  fetch('/api/ai/status')
    .then((res) => res.json())
    .then((data: AIStatus) => {
      aiStatus = data;
      aiEnabled = data.available;
      if (!aiEnabled) {
        deactivateChat();
      } else {
        // Show model selector when AI is available
        modelSelectorWrapper.style.display = '';
        // Hide auto-apply toggle for Claude Code (writes are automatic)
        if (aiStatus.supportsDirectWrites) {
          autoApplyRow.style.display = 'none';
        }
      }
    })
    .catch(() => {
      // Can't reach server — leave chat enabled (will fail on send)
    });

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
