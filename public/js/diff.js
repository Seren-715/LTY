// 行级 diff 与渲染
import { esc } from './ui.js';
import { highlight } from './highlight.js';
import { diffLines, diffStats } from './core/diff.js';

export { diffLines, diffStats };

/** 渲染统一视图（带 3 行上下文）的表格 HTML */
export function renderDiffTable(before, after, lang, context = 3) {
  const ops = diffLines(before, after);
  const show = new Array(ops.length).fill(false);
  ops.forEach((op, i) => {
    if (op.t !== '=') for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k++) show[k] = true;
  });
  const rows = [];
  let skipped = false;
  for (let i = 0; i < ops.length; i++) {
    if (!show[i]) {
      skipped = true;
      continue;
    }
    if (skipped) {
      const op = ops[i];
      rows.push(`<tr class="hunk"><td class="ln"></td><td class="ln"></td><td colspan="2">@@ 第 ${(op.a ?? op.b) + 1} 行附近 @@</td></tr>`);
      skipped = false;
    }
    const op = ops[i];
    const code = highlight(op.s, lang) || ' ';
    const cls = op.t === '+' ? 'add' : op.t === '-' ? 'del' : '';
    const sign = op.t === '=' ? ' ' : op.t === '+' ? '+' : '−';
    rows.push(
      `<tr class="${cls}"><td class="ln">${op.a !== undefined ? op.a + 1 : ''}</td><td class="ln">${op.b !== undefined ? op.b + 1 : ''}</td><td class="sign">${sign}</td><td>${code}</td></tr>`,
    );
  }
  if (!rows.length) return `<div class="empty" style="padding:16px">${esc('内容没有变化')}</div>`;
  return `<table class="diff-table">${rows.join('')}</table>`;
}
