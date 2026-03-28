import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyEdit } from '../src/server/sourcemap/patcher.js';
import type { MoveEdit, TextEdit, DeleteEdit, InsertEdit } from '../src/server/sourcemap/types.js';

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

describe('applyEdit — DeleteEdit', () => {
  it('removes a simple element on its own line', () => {
    writeHtml('index.html', '<body>\n  <p>Hello</p>\n  <p>other</p>\n</body>\n');
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 2,
      sourceCol: 3,
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toBe('<body>\n  <p>other</p>\n</body>\n');
    expect(output).not.toContain('Hello');
  });

  it('removes a multi-line element and its children', () => {
    const html = '<body>\n  <div class="card">\n    <p>content</p>\n  </div>\n  <p>after</p>\n</body>\n';
    writeHtml('index.html', html);
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 2,
      sourceCol: 3,
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toBe('<body>\n  <p>after</p>\n</body>\n');
    expect(output).not.toContain('card');
    expect(output).not.toContain('content');
  });

  it('handles nested elements of the same tag name correctly', () => {
    const html = '<ul>\n  <li>one\n    <ul>\n      <li>nested</li>\n    </ul>\n  </li>\n  <li>two</li>\n</ul>\n';
    writeHtml('index.html', html);
    // Delete the outer <li> (line 2, col 3)
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 2,
      sourceCol: 3,
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).not.toContain('nested');
    expect(output).toContain('<li>two</li>');
  });

  it('removes a void element (self-closing) on its own line', () => {
    writeHtml('index.html', '<div>\n  <br>\n  <p>text</p>\n</div>\n');
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 2,
      sourceCol: 3,
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toBe('<div>\n  <p>text</p>\n</div>\n');
  });

  it('removes an inline element without removing the whole line', () => {
    writeHtml('index.html', '<p>Hello <strong>world</strong> today</p>\n');
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 1,
      sourceCol: 10, // <strong> starts at col 10
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('Hello  today'); // space where <strong>world</strong> was
    expect(output).not.toContain('<strong>');
  });

  it('refuses to delete <body> and returns an error', () => {
    writeHtml('index.html', '<html>\n<body>\n  <p>content</p>\n</body>\n</html>\n');
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 2,
      sourceCol: 1,
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Refusing/);
    // File should be unchanged
    expect(readHtml('index.html')).toContain('<body>');
  });

  it('refuses to delete <html> and returns an error', () => {
    writeHtml('index.html', '<html>\n<body></body>\n</html>\n');
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 1,
      sourceCol: 1,
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Refusing/);
  });

  it('returns error when wrong position given', () => {
    writeHtml('index.html', '<div>hello</div>\n');
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 1,
      sourceCol: 5, // points to 'h', not '<'
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('reports correct linesBefore and linesAfter (line count decreases)', () => {
    writeHtml('index.html', '<div>\n  <p>remove me</p>\n  <p>keep</p>\n</div>\n');
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 2,
      sourceCol: 3,
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    expect(result.linesBefore).toBeGreaterThan(result.linesAfter);
  });

  it('preserves surrounding HTML structure intact after deletion (full document)', () => {
    const html = '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Title</h1>\n  <p>Remove me</p>\n  <footer>Footer</footer>\n</body>\n</html>\n';
    writeHtml('index.html', html);
    const edit: DeleteEdit = {
      type: 'delete',
      sourceLine: 5,
      sourceCol: 3,
      filepath: 'index.html',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('<h1>Title</h1>');
    expect(output).toContain('<footer>Footer</footer>');
    expect(output).not.toContain('Remove me');
  });
});

describe('applyEdit — InsertEdit', () => {
  it('inserts new element after target element on same indentation level', () => {
    const html = '<body>\n  <p>First</p>\n  <p>Last</p>\n</body>\n';
    writeHtml('index.html', html);
    // Insert after <p>First</p> (line 2, col 3)
    const edit: InsertEdit = {
      type: 'insert',
      targetLine: 2,
      targetCol: 3,
      filepath: 'index.html',
      html: '<p>New</p>',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('<p>First</p>');
    expect(output).toContain('  <p>New</p>');
    expect(output).toContain('<p>Last</p>');
    // New element appears between First and Last
    const firstIdx = output.indexOf('<p>First</p>');
    const newIdx = output.indexOf('<p>New</p>');
    const lastIdx = output.indexOf('<p>Last</p>');
    expect(firstIdx).toBeLessThan(newIdx);
    expect(newIdx).toBeLessThan(lastIdx);
  });

  it('inserts after a multi-line element', () => {
    const html = '<body>\n  <div class="card">\n    <p>content</p>\n  </div>\n  <p>after</p>\n</body>\n';
    writeHtml('index.html', html);
    // Insert after <div class="card"> block (line 2, col 3)
    const edit: InsertEdit = {
      type: 'insert',
      targetLine: 2,
      targetCol: 3,
      filepath: 'index.html',
      html: '<div class="new-card">New</div>',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('<div class="card">');
    expect(output).toContain('  <div class="new-card">New</div>');
    expect(output).toContain('<p>after</p>');
    // new-card appears after the closing </div> of card
    const cardCloseIdx = output.indexOf('</div>\n  <div class="new-card">');
    expect(cardCloseIdx).toBeGreaterThan(-1);
  });

  it('preserves indentation of target element for inserted element', () => {
    const html = '<body>\n    <section>\n        <h2>Title</h2>\n    </section>\n</body>\n';
    writeHtml('index.html', html);
    // Insert after <section> (line 2, col 5 — 4 spaces)
    const edit: InsertEdit = {
      type: 'insert',
      targetLine: 2,
      targetCol: 5,
      filepath: 'index.html',
      html: '<footer>Footer</footer>',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('    <footer>Footer</footer>');
  });

  it('inserts after a self-closing (void) element', () => {
    const html = '<div>\n  <img src="a.png">\n  <p>text</p>\n</div>\n';
    writeHtml('index.html', html);
    const edit: InsertEdit = {
      type: 'insert',
      targetLine: 2,
      targetCol: 3,
      filepath: 'index.html',
      html: '<img src="b.png">',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('src="a.png"');
    expect(output).toContain('  <img src="b.png">');
    expect(output).toContain('<p>text</p>');
  });

  it('returns error when wrong position given', () => {
    writeHtml('index.html', '<div>hello</div>\n');
    const edit: InsertEdit = {
      type: 'insert',
      targetLine: 1,
      targetCol: 5, // points to 'h', not '<'
      filepath: 'index.html',
      html: '<span>new</span>',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('reports linesBefore and linesAfter (line count increases)', () => {
    writeHtml('index.html', '<div>\n  <p>target</p>\n</div>\n');
    const edit: InsertEdit = {
      type: 'insert',
      targetLine: 2,
      targetCol: 3,
      filepath: 'index.html',
      html: '<p>inserted</p>',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    expect(result.linesAfter).toBeGreaterThan(result.linesBefore);
  });

  it('preserves all surrounding HTML when inserting', () => {
    const html = '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Title</h1>\n  <p>Content</p>\n</body>\n</html>\n';
    writeHtml('index.html', html);
    const edit: InsertEdit = {
      type: 'insert',
      targetLine: 4,
      targetCol: 3,
      filepath: 'index.html',
      html: '<h2>Subtitle</h2>',
    };
    const result = applyEdit(edit, tmpDir);
    expect(result.success).toBe(true);
    const output = readHtml('index.html');
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('<h1>Title</h1>');
    expect(output).toContain('  <h2>Subtitle</h2>');
    expect(output).toContain('<p>Content</p>');
    expect(output).toContain('</body>');
    // h2 appears between h1 and p
    const h1Idx = output.indexOf('<h1>');
    const h2Idx = output.indexOf('<h2>');
    const pIdx = output.indexOf('<p>');
    expect(h1Idx).toBeLessThan(h2Idx);
    expect(h2Idx).toBeLessThan(pIdx);
  });
});
