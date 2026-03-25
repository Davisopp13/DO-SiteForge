// Parse file changes from AI responses
// Detects markdown code fences where the language/info string is a file path

export interface FileChange {
  filepath: string;
  language: string;
  content: string;
  isNew: boolean;
}

export type ApplyStatus = 'pending' | 'applying' | 'applied' | 'error';

/** Infer language from file extension */
function inferLanguage(filepath: string): string {
  const ext = filepath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    css: 'css', scss: 'scss', html: 'html', json: 'json', md: 'markdown',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', vue: 'vue', svelte: 'svelte',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', sh: 'bash',
  };
  return map[ext] || ext;
}

/** Check if a fenced code block language looks like a file path */
function isFilePath(lang: string): boolean {
  // Must contain a slash or a dot-extension pattern, and not be a known short language name
  if (/\//.test(lang)) return true;
  if (/\.\w+$/.test(lang) && lang.length > 4) return true;
  return false;
}

/**
 * Parse an AI response for file change blocks.
 * Looks for fenced code blocks where the info string is a file path:
 *   ```src/components/Hero.tsx
 *   ... code ...
 *   ```
 */
export function parseFileChanges(responseText: string): FileChange[] {
  const changes: FileChange[] = [];
  const lines = responseText.split('\n');
  let i = 0;

  while (i < lines.length) {
    const fenceMatch = lines[i].match(/^```(\S+)/);
    if (fenceMatch && isFilePath(fenceMatch[1])) {
      const filepath = fenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```

      changes.push({
        filepath,
        language: inferLanguage(filepath),
        content: codeLines.join('\n'),
        isNew: false, // will be resolved async via checkFileExists
      });
      continue;
    }
    i++;
  }

  return changes;
}

/**
 * Check if files exist via the /api/files/exists endpoint
 * and update the isNew flag on each FileChange.
 */
export async function resolveFileChanges(changes: FileChange[]): Promise<FileChange[]> {
  const resolved = await Promise.all(
    changes.map(async (change) => {
      try {
        const res = await fetch(`/api/files/exists?path=${encodeURIComponent(change.filepath)}`);
        if (res.ok) {
          const data = await res.json();
          return { ...change, isNew: !data.exists };
        }
      } catch {
        // If check fails, assume file exists (safer default)
      }
      return change;
    })
  );
  return resolved;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render file change cards and an "Apply changes" button.
 * Returns a container element to append below the AI message.
 */
export function renderFileChanges(changes: FileChange[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'sf-file-changes';

  // File change cards
  for (const change of changes) {
    const card = document.createElement('div');
    card.className = 'sf-file-card';

    // Header with filename and badge
    const header = document.createElement('div');
    header.className = 'sf-file-card-header';

    const filename = document.createElement('span');
    filename.className = 'sf-file-card-name';
    filename.textContent = change.filepath;

    const badge = document.createElement('span');
    badge.className = change.isNew ? 'sf-file-badge sf-file-badge-new' : 'sf-file-badge sf-file-badge-modified';
    badge.textContent = change.isNew ? 'new file' : 'modified';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'sf-file-card-toggle';
    toggleBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    toggleBtn.title = 'Toggle code preview';

    header.appendChild(filename);
    header.appendChild(badge);
    header.appendChild(toggleBtn);

    // Collapsible code preview
    const preview = document.createElement('div');
    preview.className = 'sf-file-card-preview';
    preview.style.display = 'none';
    preview.innerHTML = `<pre><code>${escapeHtml(change.content)}</code></pre>`;

    // Toggle expand/collapse
    toggleBtn.addEventListener('click', () => {
      const isExpanded = preview.style.display !== 'none';
      preview.style.display = isExpanded ? 'none' : '';
      toggleBtn.classList.toggle('expanded', !isExpanded);
    });
    header.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.sf-file-card-toggle')) return;
      const isExpanded = preview.style.display !== 'none';
      preview.style.display = isExpanded ? 'none' : '';
      toggleBtn.classList.toggle('expanded', !isExpanded);
    });

    card.appendChild(header);
    card.appendChild(preview);
    container.appendChild(card);
  }

  // Apply changes button
  const applyBtn = document.createElement('button');
  applyBtn.className = 'sf-apply-btn';
  applyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Apply changes`;
  container.appendChild(applyBtn);

  // Apply click handler
  applyBtn.addEventListener('click', () => {
    applyFileChanges(changes, applyBtn, container);
  });

  return container;
}

/**
 * Apply file changes silently (for auto-apply mode).
 * Returns success count and errors without manipulating DOM.
 */
export async function applyFileChangesAuto(
  changes: FileChange[],
): Promise<{ successCount: number; errors: string[] }> {
  let successCount = 0;
  const errors: string[] = [];

  for (const change of changes) {
    try {
      const res = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: change.filepath, content: change.content }),
      });
      if (res.ok) {
        successCount++;
      } else {
        const data = await res.json().catch(() => ({ error: 'Write failed' }));
        errors.push(`${change.filepath}: ${data.error || 'Write failed'}`);
      }
    } catch {
      errors.push(`${change.filepath}: Network error`);
    }
  }

  return { successCount, errors };
}

/**
 * Apply file changes by POSTing each to /api/files/write.
 */
async function applyFileChanges(
  changes: FileChange[],
  applyBtn: HTMLButtonElement,
  container: HTMLElement,
): Promise<void> {
  applyBtn.disabled = true;
  applyBtn.classList.add('sf-apply-btn-applying');
  applyBtn.innerHTML = `<span class="sf-apply-spinner"></span> Applying...`;

  let successCount = 0;
  const errors: string[] = [];

  for (const change of changes) {
    try {
      const res = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: change.filepath, content: change.content }),
      });
      if (res.ok) {
        successCount++;
      } else {
        const data = await res.json().catch(() => ({ error: 'Write failed' }));
        errors.push(`${change.filepath}: ${data.error || 'Write failed'}`);
      }
    } catch {
      errors.push(`${change.filepath}: Network error`);
    }
  }

  if (errors.length === 0) {
    applyBtn.classList.remove('sf-apply-btn-applying');
    applyBtn.classList.add('sf-apply-btn-done');
    applyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Changes applied — ${successCount} file${successCount !== 1 ? 's' : ''} updated`;
  } else {
    applyBtn.classList.remove('sf-apply-btn-applying');
    applyBtn.classList.add('sf-apply-btn-error');
    applyBtn.innerHTML = `Failed: ${errors[0]}`;
    applyBtn.disabled = false;

    // Add retry button
    const retryBtn = document.createElement('button');
    retryBtn.className = 'sf-apply-retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
      retryBtn.remove();
      applyBtn.classList.remove('sf-apply-btn-error');
      applyFileChanges(changes, applyBtn, container);
    });
    container.appendChild(retryBtn);
  }
}
