// Lightweight markdown-to-HTML renderer for AI chat messages
// Supports: headings, bold, italic, inline code, fenced code blocks, lists, links, paragraphs
// No external dependencies — self-contained regex-based parser

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Sanitize rendered HTML — strip script tags and event handlers */
function sanitize(html: string): string {
  // Remove <script> tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove event handler attributes (onclick, onerror, onload, etc.)
  html = html.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Remove javascript: URLs
  html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  return html;
}

/** Render inline markdown: bold, italic, inline code, links */
function renderInline(text: string): string {
  let result = escapeHtml(text);

  // Inline code (backticks) — must be before bold/italic to avoid conflicts
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold + italic (***text*** or ___text___)
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  result = result.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');

  // Bold (**text** or __text__)
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_) — avoid matching underscores inside words
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  return result;
}

interface CodeBlock {
  lang: string;
  code: string;
}

/**
 * Parse markdown text into HTML.
 * Handles fenced code blocks, headings, lists, and paragraphs with inline formatting.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (``` with optional language)
    const fenceMatch = line.match(/^```(\S*)/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      output.push(renderCodeBlock({ lang, code: codeLines.join('\n') }));
      continue;
    }

    // Headings (# to ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      output.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule (---, ***, ___)
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      output.push('<hr>');
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      output.push('<ul>' + listItems.map(item => `<li>${renderInline(item)}</li>`).join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      output.push('<ol>' + listItems.map(item => `<li>${renderInline(item)}</li>`).join('') + '</ol>');
      continue;
    }

    // Empty line — skip (paragraph break)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^```/) &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].match(/^\s*[-*+]\s+/) &&
      !lines[i].match(/^\s*\d+\.\s+/) &&
      !lines[i].match(/^(\s*[-*_]\s*){3,}$/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      output.push(`<p>${renderInline(paraLines.join('\n').replace(/\n/g, '<br>'))}</p>`);
    }
  }

  return sanitize(output.join('\n'));
}

/** Render a fenced code block with optional filename header and copy button */
function renderCodeBlock(block: CodeBlock): string {
  const escaped = escapeHtml(block.code);
  const langClass = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : '';

  // If the lang looks like a file path (contains / or .), show filename header
  const isFilePath = block.lang && (/\//.test(block.lang) || /\.\w+$/.test(block.lang));
  const header = isFilePath
    ? `<div class="sf-code-header"><span>${escapeHtml(block.lang)}</span><button class="sf-code-copy-btn" data-code="${escapeHtml(block.code.replace(/"/g, '&quot;'))}">Copy</button></div>`
    : block.lang
      ? `<div class="sf-code-header"><span>${escapeHtml(block.lang)}</span><button class="sf-code-copy-btn" data-code="${escapeHtml(block.code.replace(/"/g, '&quot;'))}">Copy</button></div>`
      : '';

  return `<pre>${header}<code${langClass}>${escaped}</code></pre>`;
}
