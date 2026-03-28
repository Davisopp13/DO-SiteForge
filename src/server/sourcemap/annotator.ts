/**
 * HTML Line/Column Annotator
 *
 * Scans an HTML string character-by-character and inserts data-sf-line and
 * data-sf-col attributes into every visible element's opening tag. The source
 * file is never touched — annotation happens at serve time.
 */

const SKIP_TAGS = new Set([
  'html', 'head', 'body', 'script', 'style', 'link', 'meta',
]);

const TAG_NAME_RE = /[a-zA-Z0-9\-_]/;

/**
 * Returns a copy of `html` with `data-sf-line` and `data-sf-col` attributes
 * inserted into every non-skipped element's opening tag. Whitespace and
 * formatting are preserved exactly.
 *
 * Example: `<div class="hero">` on line 15, col 5 becomes
 *          `<div data-sf-line="15" data-sf-col="5" class="hero">`
 */
export function annotateHtml(html: string): string {
  const out: string[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  /** Push one character to output and advance position tracking. */
  const advance = (): void => {
    const ch = html[i];
    out.push(ch);
    if (ch === '\n') {
      line++;
      col = 1;
    } else {
      col++;
    }
    i++;
  };

  while (i < html.length) {
    if (html[i] !== '<') {
      advance();
      continue;
    }

    // We're at '<' — record position before consuming anything.
    const tagLine = line;
    const tagCol = col;

    // Peek at the next character to rule out: </  <!  <?
    const next = i + 1 < html.length ? html[i + 1] : '';
    if (next === '/' || next === '!' || next === '?') {
      advance();
      continue;
    }

    // Parse the tag name (letters, digits, hyphens, underscores).
    let j = i + 1;
    let tagName = '';
    while (j < html.length && TAG_NAME_RE.test(html[j])) {
      tagName += html[j];
      j++;
    }

    if (tagName.length === 0) {
      // Not a recognisable tag — pass '<' through unchanged.
      advance();
      continue;
    }

    // The character immediately after the tag name must be whitespace, '>', or
    // '/' (for void/self-closing tags).  Anything else means this isn't a tag.
    const afterName = j < html.length ? html[j] : '';
    if (
      afterName !== ' ' && afterName !== '\t' &&
      afterName !== '\n' && afterName !== '\r' &&
      afterName !== '>' && afterName !== '/'
    ) {
      advance();
      continue;
    }

    const lowerTag = tagName.toLowerCase();
    if (SKIP_TAGS.has(lowerTag)) {
      // Structural / non-visible tag — pass '<' through unchanged.
      advance();
      continue;
    }

    // Emit '<tagName data-sf-line="N" data-sf-col="N"' then continue from j.
    out.push('<');
    out.push(tagName);
    out.push(` data-sf-line="${tagLine}" data-sf-col="${tagCol}"`);

    // Advance position tracking for the characters we consumed without going
    // through advance().  Tag names never contain newlines so only col changes.
    col += 1 + tagName.length; // 1 for '<', tagName.length for the name
    i = j;
  }

  return out.join('');
}
