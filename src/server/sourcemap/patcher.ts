import * as fs from 'fs';
import * as path from 'path';
import type { VisualEdit, MoveEdit, PatchResult } from './types.js';

export function applyEdit(edit: VisualEdit, projectDir: string): PatchResult {
  const absPath = path.resolve(projectDir, edit.filepath);
  const html = fs.readFileSync(absPath, 'utf-8');
  const linesBefore = html.split('\n').length;

  let patched: string;

  try {
    if (edit.type === 'move') {
      if (edit.deltaX === 0 && edit.deltaY === 0) {
        return { success: true, filepath: absPath, linesBefore, linesAfter: linesBefore };
      }
      patched = applyMoveEdit(html, edit);
    } else {
      return {
        success: false,
        filepath: absPath,
        linesBefore,
        linesAfter: linesBefore,
        error: `Edit type '${(edit as VisualEdit).type}' not yet implemented`,
      };
    }
  } catch (e: unknown) {
    return {
      success: false,
      filepath: absPath,
      linesBefore,
      linesAfter: linesBefore,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  fs.writeFileSync(absPath, patched, 'utf-8');
  const linesAfter = patched.split('\n').length;
  return { success: true, filepath: absPath, linesBefore, linesAfter };
}

/** Convert 1-indexed line/col to a 0-indexed character offset in the HTML string */
function lineColToOffset(html: string, line: number, col: number): number {
  const lines = html.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1; i++) {
    offset += lines[i].length + 1; // +1 for '\n'
  }
  offset += col - 1;
  return offset;
}

/** Returns the index of the closing '>' of the opening tag starting at tagStart */
function findTagClose(html: string, tagStart: number): number {
  let i = tagStart;
  let inQuote: string | null = null;
  while (i < html.length) {
    const ch = html[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
    } else {
      if (ch === '"' || ch === "'") inQuote = ch;
      else if (ch === '>') return i;
    }
    i++;
  }
  return -1;
}

function parseStyle(styleVal: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of styleVal.split(';')) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    map.set(trimmed.slice(0, colon).trim().toLowerCase(), trimmed.slice(colon + 1).trim());
  }
  return map;
}

function formatStyle(map: Map<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of map) {
    parts.push(`${k}: ${v}`);
  }
  return parts.join('; ');
}

function parsePx(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function applyMoveEdit(html: string, edit: MoveEdit): string {
  const tagStart = lineColToOffset(html, edit.sourceLine, edit.sourceCol);

  if (html[tagStart] !== '<') {
    throw new Error(
      `Expected '<' at line ${edit.sourceLine}, col ${edit.sourceCol}, found '${html[tagStart]}'`
    );
  }

  const tagEnd = findTagClose(html, tagStart);
  if (tagEnd === -1) {
    throw new Error(
      `Could not find closing '>' for tag at line ${edit.sourceLine}, col ${edit.sourceCol}`
    );
  }

  const tagText = html.slice(tagStart, tagEnd + 1);

  // Match style="..." or style='...'
  const styleAttrRegex = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i;
  const styleMatch = styleAttrRegex.exec(tagText);

  let newTagText: string;

  if (styleMatch) {
    // Group 2: double-quoted value, group 3: single-quoted value
    const existingStyle = styleMatch[2] ?? styleMatch[3] ?? '';
    const styleMap = parseStyle(existingStyle);

    const existingLeft = parsePx(styleMap.get('left') ?? '0');
    const existingTop = parsePx(styleMap.get('top') ?? '0');

    styleMap.set('position', 'relative');
    styleMap.set('left', `${Math.round(existingLeft + edit.deltaX)}px`);
    styleMap.set('top', `${Math.round(existingTop + edit.deltaY)}px`);

    const newStyleVal = formatStyle(styleMap);
    newTagText =
      tagText.slice(0, styleMatch.index) +
      `style="${newStyleVal}"` +
      tagText.slice(styleMatch.index + styleMatch[0].length);
  } else {
    // No style attribute — insert after the tag name
    let nameEnd = 1; // skip '<'
    while (nameEnd < tagText.length && !/[\s>/]/.test(tagText[nameEnd])) nameEnd++;

    const newStyle = `position: relative; left: ${Math.round(edit.deltaX)}px; top: ${Math.round(edit.deltaY)}px`;
    newTagText =
      tagText.slice(0, nameEnd) + ` style="${newStyle}"` + tagText.slice(nameEnd);
  }

  return html.slice(0, tagStart) + newTagText + html.slice(tagEnd + 1);
}
