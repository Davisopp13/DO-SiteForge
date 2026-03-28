import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyEdit } from '../src/server/sourcemap/patcher.js';
import type { MoveEdit, TextEdit } from '../src/server/sourcemap/types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-patcher-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeHtml(filename: string, content: string): string {
  const filepath = path.join(tmpDir, filename);
  fs.writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

function readHtml(filename: string): string {
  return fs.readFileSync(path.join(tmpDir, filename), 'utf-8');
}

describe('applyEdit — MoveEdit', () => {
  it('adds style attribute to element with no existing style', () => {
    writeHtml('index.html', '<div class="hero">Hello</div>\n');
    const edit: MoveEdit = {
      type: 'move',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      deltaX: 30,
      deltaY: 50,
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('style="position: relative; left: 30px; top: 50px"');
    expect(output).toContain('class="hero"');
  });

  it('updates existing style attribute, adding position/left/top', () => {
    writeHtml('index.html', '<p style="color: red; font-size: 16px">text</p>\n');
    const edit: MoveEdit = {
      type: 'move',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      deltaX: 10,
      deltaY: -20,
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('position: relative');
    expect(output).toContain('left: 10px');
    expect(output).toContain('top: -20px');
    expect(output).toContain('color: red');
    expect(output).toContain('font-size: 16px');
  });

  it('accumulates onto existing left/top values', () => {
    writeHtml('index.html', '<div style="position: relative; left: 20px; top: 10px">x</div>\n');
    const edit: MoveEdit = {
      type: 'move',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      deltaX: 15,
      deltaY: -5,
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('left: 35px');
    expect(output).toContain('top: 5px');
  });

  it('skips file write when deltaX and deltaY are both 0', () => {
    const initial = '<div>Hello</div>\n';
    writeHtml('index.html', initial);
    const edit: MoveEdit = {
      type: 'move',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      deltaX: 0,
      deltaY: 0,
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    // File should be unchanged
    expect(readHtml('index.html')).toBe(initial);
  });

  it('handles element on a non-first line', () => {
    writeHtml('index.html', '<!DOCTYPE html>\n<html>\n<body>\n  <div class="box">content</div>\n</body>\n</html>\n');
    // <div class="box"> is on line 4, col 3
    const edit: MoveEdit = {
      type: 'move',
      sourceLine: 4,
      sourceCol: 3,
      filepath: 'index.html',
      deltaX: 100,
      deltaY: 200,
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('style="position: relative; left: 100px; top: 200px"');
    expect(output).toContain('class="box"');
    // Surrounding HTML preserved
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('</body>');
  });

  it('preserves all surrounding HTML exactly', () => {
    const html = '<!DOCTYPE html>\n<html>\n<body>\n  <p>before</p>\n  <div>target</div>\n  <p>after</p>\n</body>\n</html>\n';
    writeHtml('index.html', html);
    // <div> is on line 5, col 3
    const edit: MoveEdit = {
      type: 'move',
      sourceLine: 5,
      sourceCol: 3,
      filepath: 'index.html',
      deltaX: 5,
      deltaY: 5,
    };
    applyEdit(edit, tmpDir);
    const output = readHtml('index.html');
    expect(output).toContain('<p>before</p>');
    expect(output).toContain('<p>after</p>');
    expect(output).toContain('<div style="position: relative; left: 5px; top: 5px">target</div>');
  });

  it('returns error when wrong position given', () => {
    writeHtml('index.html', '<div>hello</div>\n');
    const edit: MoveEdit = {
      type: 'move',
      sourceLine: 1,
      sourceCol: 5, // points to 'h', not '<'
      filepath: 'index.html',
      deltaX: 10,
      deltaY: 10,
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('reports linesBefore and linesAfter (move does not change line count)', () => {
    writeHtml('index.html', '<div>line1</div>\n<p>line2</p>\n');
    const edit: MoveEdit = {
      type: 'move',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      deltaX: 10,
      deltaY: 0,
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    expect(result.linesBefore).toBe(3); // 2 lines + trailing empty from split
    expect(result.linesAfter).toBe(result.linesBefore);
  });

});

describe('applyEdit — TextEdit', () => {
  it('replaces text content in a simple element', () => {
    writeHtml('index.html', '<div>Hello world</div>\n');
    const edit: TextEdit = {
      type: 'text',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      oldText: 'Hello world',
      newText: 'Goodbye world',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toBe('<div>Goodbye world</div>\n');
  });

  it('preserves surrounding HTML when replacing text', () => {
    const html = '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Old title</h1>\n  <p>Paragraph</p>\n</body>\n</html>\n';
    writeHtml('index.html', html);
    const edit: TextEdit = {
      type: 'text',
      sourceLine: 4,
      sourceCol: 3,
      filepath: 'index.html',
      oldText: 'Old title',
      newText: 'New title',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('<h1>New title</h1>');
    expect(output).toContain('<p>Paragraph</p>');
    expect(output).toContain('<!DOCTYPE html>');
  });

  it('replaces only the matched text, not attributes', () => {
    writeHtml('index.html', '<button class="hero-btn">Click me</button>\n');
    const edit: TextEdit = {
      type: 'text',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      oldText: 'Click me',
      newText: 'Get started',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toBe('<button class="hero-btn">Get started</button>\n');
  });

  it('handles multi-line text content', () => {
    writeHtml('index.html', '<p>\n  Some text\n  on multiple lines\n</p>\n');
    const edit: TextEdit = {
      type: 'text',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      oldText: 'Some text',
      newText: 'Updated text',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('Updated text');
    expect(output).toContain('on multiple lines');
  });

  it('returns error when oldText is not found', () => {
    writeHtml('index.html', '<div>Hello</div>\n');
    const edit: TextEdit = {
      type: 'text',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      oldText: 'Nonexistent text',
      newText: 'replacement',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns error when wrong position given', () => {
    writeHtml('index.html', '<div>hello</div>\n');
    const edit: TextEdit = {
      type: 'text',
      sourceLine: 1,
      sourceCol: 5, // points to 'h', not '<'
      filepath: 'index.html',
      oldText: 'hello',
      newText: 'world',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('reports correct linesBefore and linesAfter for same-line replacement', () => {
    writeHtml('index.html', '<div>short</div>\n<p>other</p>\n');
    const edit: TextEdit = {
      type: 'text',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
      oldText: 'short',
      newText: 'longer text here',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    expect(result.linesBefore).toBe(result.linesAfter); // same line count
  });
});
