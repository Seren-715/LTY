// 轻量 Markdown 渲染：先转义再生成有限的 HTML，避免 XSS
import { esc } from './ui.js';
import { highlight } from './highlight.js';

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<)）]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w])__([^_\n]+)__(?!\w)/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}

function codeBlock(code, lang) {
  return `<div class="code-block"><div class="code-head"><span>${esc(lang || 'text')}</span><button class="copy-btn" data-copy>复制</button></div><pre><code>${highlight(code, lang)}</code></pre></div>`;
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isBlockStart(line, next) {
  return (
    /^\s*(```|~~~)/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*>/.test(line) ||
    LIST_RE.test(line) ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) ||
    (line.includes('|') && next !== undefined && TABLE_SEP.test(next))
  );
}

export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s*(```+|~~~+)\s*([^\s`]*)/);
    if (fence) {
      const marker = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) buf.push(lines[i++]);
      i++;
      out.push(codeBlock(buf.join('\n'), fence[2]));
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${head.map((_, j) => `<td>${inline(r[j] || '')}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      );
      continue;
    }

    const lm = line.match(LIST_RE);
    if (lm) {
      const baseIndent = lm[1].length;
      const ordered = /\d/.test(lm[2]);
      const start = ordered ? parseInt(lm[2], 10) : 1;
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE);
        if (m && m[1].length <= baseIndent + 1 && /\d/.test(m[2]) === ordered) {
          items.push([m[3]]);
          i++;
          continue;
        }
        if (m && m[1].length <= baseIndent + 1) break; // 另一种列表
        const isIndented = /^\s+\S/.test(lines[i]) && lines[i].match(/^\s*/)[0].length > baseIndent;
        if (isIndented && items.length) {
          items[items.length - 1].push(lines[i].slice(Math.min(baseIndent + 2, lines[i].match(/^\s*/)[0].length)));
          i++;
          continue;
        }
        if (!lines[i].trim() && i + 1 < lines.length && items.length) {
          const nxt = lines[i + 1];
          const nm = nxt.match(LIST_RE);
          if ((nm && nm[1].length <= baseIndent + 1 && /\d/.test(nm[2]) === ordered) || /^\s{2,}\S/.test(nxt)) {
            items[items.length - 1].push('');
            i++;
            continue;
          }
        }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      const html = items
        .map((it) => {
          let inner = renderMarkdown(it.join('\n'));
          const single = inner.match(/^<p>([\s\S]*?)<\/p>/);
          if (single && inner.indexOf('<p>', 3) < 0) inner = single[1] + inner.slice(single[0].length);
          return `<li>${inner}</li>`;
        })
        .join('');
      out.push(`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${html}</${tag}>`);
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}
