// Parse file changes from AI responses
// Detects markdown code fences where the language/info string is a file path

export interface FileChange {
  filepath: string;
  language: string;
  content: string;
  isNew: boolean;
}

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
