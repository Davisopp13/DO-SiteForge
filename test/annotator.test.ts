import { describe, it, expect } from 'vitest';
import { annotateHtml } from '../src/server/sourcemap/annotator.js';

describe('annotateHtml', () => {
  it('adds data-sf-line and data-sf-col to a simple div', () => {
    const html = '<div class="hero">hello</div>';
    const result = annotateHtml(html);
    expect(result).toBe('<div data-sf-line="1" data-sf-col="1" class="hero">hello</div>');
  });

  it('tracks line numbers correctly across newlines', () => {
    const html = '<section>\n  <p>text</p>\n</section>';
    const result = annotateHtml(html);
    // <section> is on line 1, col 1
    // <p> is on line 2, col 3
    expect(result).toContain('data-sf-line="1" data-sf-col="1"');
    expect(result).toContain('data-sf-line="2" data-sf-col="3"');
  });

  it('tracks column numbers correctly within a line', () => {
    const html = '    <h1>Title</h1>';
    const result = annotateHtml(html);
    expect(result).toBe('    <h1 data-sf-line="1" data-sf-col="5">Title</h1>');
  });

  it('does NOT annotate skip tags: html, head, body, script, style, link, meta', () => {
    const skip = ['html', 'head', 'body', 'script', 'style', 'link', 'meta'];
    for (const tag of skip) {
      const html = `<${tag}>`;
      const result = annotateHtml(html);
      expect(result).toBe(html);
    }
  });

  it('does NOT annotate closing tags', () => {
    const html = '</div>';
    expect(annotateHtml(html)).toBe('</div>');
  });

  it('does NOT annotate HTML comments', () => {
    const html = '<!-- comment -->';
    expect(annotateHtml(html)).toBe('<!-- comment -->');
  });

  it('does NOT annotate DOCTYPE', () => {
    const html = '<!DOCTYPE html>';
    expect(annotateHtml(html)).toBe('<!DOCTYPE html>');
  });

  it('annotates self-closing void tags: br, img, hr, input', () => {
    const cases: [string, string][] = [
      ['<br>', '<br data-sf-line="1" data-sf-col="1">'],
      ['<hr>', '<hr data-sf-line="1" data-sf-col="1">'],
      ['<img src="x.png" alt="x">', '<img data-sf-line="1" data-sf-col="1" src="x.png" alt="x">'],
      ['<input type="text">', '<input data-sf-line="1" data-sf-col="1" type="text">'],
    ];
    for (const [input, expected] of cases) {
      expect(annotateHtml(input)).toBe(expected);
    }
  });

  it('preserves all original whitespace and indentation', () => {
    const html = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '</head>',
      '<body>',
      '  <section class="hero">',
      '    <h1>Hello</h1>',
      '  </section>',
      '</body>',
      '</html>',
    ].join('\n');

    const result = annotateHtml(html);

    // Skip tags pass through unchanged
    expect(result).toContain('<html lang="en">');
    expect(result).toContain('<head>');
    expect(result).toContain('<body>');
    expect(result).toContain('  <meta charset="UTF-8">');

    // Visible elements get annotated
    // <section class="hero"> is on line 7, col 3
    expect(result).toContain('<section data-sf-line="7" data-sf-col="3" class="hero">');
    // <h1> is on line 8, col 5
    expect(result).toContain('<h1 data-sf-line="8" data-sf-col="5">Hello</h1>');
  });

  it('handles multiple elements on the same line', () => {
    // '<span>a</span>' is 14 chars, so second '<span>' starts at col 15
    const html = '<span>a</span><span>b</span>';
    const result = annotateHtml(html);
    expect(result).toContain('data-sf-line="1" data-sf-col="1"');
    expect(result).toContain('data-sf-line="1" data-sf-col="15"');
  });

  it('handles tags with no attributes', () => {
    const html = '<div>';
    expect(annotateHtml(html)).toBe('<div data-sf-line="1" data-sf-col="1">');
  });

  it('handles multi-line attribute tags', () => {
    const html = '<div\n  class="foo"\n  id="bar"\n>';
    const result = annotateHtml(html);
    expect(result.startsWith('<div data-sf-line="1" data-sf-col="1"')).toBe(true);
    // Attributes and newlines preserved after tag name
    expect(result).toContain('\n  class="foo"');
  });

  it('returns empty string for empty input', () => {
    expect(annotateHtml('')).toBe('');
  });

  it('annotates a realistic HTML snippet correctly', () => {
    const html = [
      '<section class="cards">',
      '  <div class="card">',
      '    <h3>Title</h3>',
      '    <p>Description</p>',
      '  </div>',
      '</section>',
    ].join('\n');

    const result = annotateHtml(html);
    expect(result).toContain('<section data-sf-line="1" data-sf-col="1" class="cards">');
    expect(result).toContain('<div data-sf-line="2" data-sf-col="3" class="card">');
    expect(result).toContain('<h3 data-sf-line="3" data-sf-col="5">');
    expect(result).toContain('<p data-sf-line="4" data-sf-col="5">');
  });
});
