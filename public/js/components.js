// 可复用组件：文件树、代码查看、变更列表、预览面板
import { esc, el, $, $$, icon } from './ui.js';
import { highlight, langFromPath } from './highlight.js';
import { renderDiffTable, diffStats } from './diff.js';
import { mountPreview, htmlEntries } from './preview.js';
import { downloadFile } from './zip.js';

// —— 文件树 ——
function buildTree(paths) {
  const root = { dirs: new Map(), files: [] };
  for (const p of paths) {
    const segs = p.split('/');
    let node = root;
    for (let i = 0; i < segs.length - 1; i++) {
      if (!node.dirs.has(segs[i])) node.dirs.set(segs[i], { dirs: new Map(), files: [] });
      node = node.dirs.get(segs[i]);
    }
    node.files.push(p);
  }
  return root;
}

/**
 * 渲染文件树。opts: { active, marks:Set, collapsed:Set, onSelect(path), onToggle(dir) }
 */
export function renderTree(container, files, opts) {
  const paths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  if (!paths.length) {
    container.innerHTML = `<div class="muted" style="padding:12px;font-size:13px">暂无文件</div>`;
    return;
  }
  const collapsed = opts.collapsed || new Set();
  const marks = opts.marks || new Set();
  const out = [];
  const walk = (node, prefix, depth) => {
    for (const [name, child] of [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const full = prefix ? `${prefix}/${name}` : name;
      const open = !collapsed.has(full);
      out.push(
        `<div class="tree-item dir" data-dir="${esc(full)}" style="padding-left:${8 + depth * 14}px">${icon(open ? 'chev-down' : 'chev-right')}${icon(open ? 'folder-open' : 'folder')}<span class="name">${esc(name)}</span></div>`,
      );
      if (open) walk(child, full, depth + 1);
    }
    for (const p of node.files) {
      const name = p.split('/').pop();
      out.push(
        `<div class="tree-item ${p === opts.active ? 'active' : ''}" data-path="${esc(p)}" style="padding-left:${8 + depth * 14 + 18}px" title="${esc(p)}">${icon('file')}<span class="name">${esc(name)}</span>${marks.has(p) ? '<span class="dot"></span>' : ''}</div>`,
      );
    }
  };
  walk(buildTree(paths), '', 0);
  container.innerHTML = out.join('');
  container.onclick = (e) => {
    const f = e.target.closest('[data-path]');
    if (f) return opts.onSelect && opts.onSelect(f.dataset.path);
    const d = e.target.closest('[data-dir]');
    if (d) {
      if (collapsed.has(d.dataset.dir)) collapsed.delete(d.dataset.dir);
      else collapsed.add(d.dataset.dir);
      renderTree(container, files, { ...opts, collapsed });
    }
  };
}

export function codeViewHtml(path, content) {
  const lines = content.split('\n');
  const n = lines.length - (content.endsWith('\n') && lines.length > 1 ? 1 : 0);
  const gutter = Array.from({ length: Math.max(1, n) }, (_, i) => i + 1).join('\n');
  return `<div class="code-view"><div class="gutter">${gutter}</div><pre>${highlight(content, langFromPath(path)) || ' '}</pre></div>`;
}

// —— 文件浏览面板（任务页右侧「文件」） ——
export function mountFileBrowser(container, { getFiles, getMarks }) {
  container.innerHTML = `<div class="files-split"><div class="tree"></div><div class="viewer" style="overflow:auto;min-width:0"></div></div>`;
  const tree = $(container, '.tree');
  const viewer = $(container, '.viewer');
  let active = null;
  const collapsed = new Set();
  const render = () => {
    const files = getFiles();
    if (!active || !(active in files)) active = htmlEntries(files)[0] || Object.keys(files).sort()[0] || null;
    renderTree(tree, files, {
      active,
      collapsed,
      marks: getMarks ? getMarks() : null,
      onSelect: (p) => {
        active = p;
        render();
      },
    });
    if (!active) {
      viewer.innerHTML = `<div class="empty">${icon('folder')}<div>项目中还没有文件</div></div>`;
      return;
    }
    const content = files[active];
    viewer.innerHTML = `<div class="viewer-head">${icon('file')}<span class="grow" style="overflow:hidden;text-overflow:ellipsis">${esc(active)}</span><span class="muted">${content.split('\n').length} 行</span><button class="btn ghost sm" data-dl-file title="下载此文件">${icon('download')}</button></div>${codeViewHtml(active, content)}`;
    $(viewer, '[data-dl-file]').onclick = () => downloadFile(active, content);
  };
  render();
  return { refresh: render };
}

// —— 变更面板 ——
export function renderChanges(container, changes, { onRevert, onRevertAll, readOnly } = {}) {
  const paths = Object.keys(changes || {}).sort();
  if (!paths.length) {
    container.innerHTML = `<div class="empty">${icon('diff')}<div>此任务还没有修改任何文件</div><div style="font-size:12.5px;margin-top:4px">在「编码」模式下，智能体对文件的修改会显示在这里</div></div>`;
    return;
  }
  let totalA = 0;
  let totalR = 0;
  const blocks = paths.map((p) => {
    const c = changes[p];
    const s = diffStats(c.before ?? '', c.after ?? '');
    totalA += s.added;
    totalR += s.removed;
    const tag = c.before == null ? '<span class="tag-new">新建</span>' : c.after == null ? '<span class="tag-del">删除</span>' : '';
    return `<div class="diff-file" data-path="${esc(p)}">
      <div class="diff-file-head">${icon('chev-down', 'chev')}<span class="path grow">${esc(p)}</span>${tag}
        <span class="stat"><span class="add">+${s.added}</span><span class="del">−${s.removed}</span></span>
        ${c.after != null ? `<button class="btn ghost sm" data-dl="${esc(p)}" title="下载此文件">${icon('download')}</button>` : ''}
        ${readOnly ? '' : `<button class="btn ghost sm" data-revert="${esc(p)}" title="撤销此文件的修改">${icon('undo')}</button>`}
      </div>
      <div class="diff-table-wrap">${renderDiffTable(c.before ?? '', c.after ?? '', langFromPath(p))}</div>
    </div>`;
  });
  container.innerHTML = `<div class="panel-toolbar"><span><b>${paths.length}</b> 个文件 · <span class="stat"><span class="add">+${totalA}</span><span class="del">−${totalR}</span></span></span><span class="spacer"></span>
    <button class="btn sm ghost" data-act="collapse">全部折叠</button>
    ${readOnly ? '' : `<button class="btn sm danger" data-act="revert-all">${icon('undo')}撤销全部</button>`}</div>${blocks.join('')}`;
  container.onclick = (e) => {
    const dl = e.target.closest('[data-dl]');
    if (dl) {
      e.stopPropagation();
      return downloadFile(dl.dataset.dl, changes[dl.dataset.dl].after);
    }
    const rv = e.target.closest('[data-revert]');
    if (rv) {
      e.stopPropagation();
      return onRevert && onRevert(rv.dataset.revert);
    }
    const act = e.target.closest('[data-act]');
    if (act?.dataset.act === 'revert-all') return onRevertAll && onRevertAll();
    if (act?.dataset.act === 'collapse') {
      const files = $$(container, '.diff-file');
      const allCollapsed = files.every((f) => f.classList.contains('collapsed'));
      files.forEach((f) => f.classList.toggle('collapsed', !allCollapsed));
      act.textContent = allCollapsed ? '全部折叠' : '全部展开';
      return;
    }
    const head = e.target.closest('.diff-file-head');
    if (head) head.parentElement.classList.toggle('collapsed');
  };
}

// —— 预览面板（带页面选择和控制台） ——
export function mountPreviewPanel(container, { getFiles, onFix }) {
  container.innerHTML = `<div class="preview-wrap">
    <div class="panel-toolbar">
      ${icon('eye')}<select class="pill-select select entry" style="max-width:260px"></select>
      <span class="spacer"></span>
      <button class="btn sm ghost" data-act="refresh" title="刷新">${icon('refresh')}刷新</button>
    </div>
    <div class="frame-host" style="flex:1;display:flex;min-height:0"></div>
    <div class="console-head">${icon('terminal')}控制台 <span class="c-count"></span><span class="spacer"></span>${onFix ? `<button class="btn soft sm fix-btn hidden" data-act="fix" title="把报错发给智能体，让它找出原因并修复">${icon('sparkle')}<span></span></button>` : ''}<button class="btn ghost sm" data-act="clear">清空</button><button class="btn ghost sm" data-act="toggle">收起</button></div>
    <div class="console"></div>
  </div>`;
  const consoleEl = $(container, '.console');
  const countEl = $(container, '.c-count');
  const select = $(container, '.entry');
  let count = 0;
  // 收集报错，供「让智能体修复」使用（去重，最多 10 条）
  let errors = [];
  const fixBtn = container.querySelector('.fix-btn');
  const syncFix = () => {
    if (!fixBtn) return;
    fixBtn.classList.toggle('hidden', !errors.length);
    fixBtn.querySelector('span').textContent = `让智能体修复（${errors.length}）`;
  };
  const log = ({ level, text }) => {
    if (level === 'error' && errors.length < 10 && !errors.includes(text)) {
      errors.push(String(text).slice(0, 800));
      syncFix();
    }
    count++;
    countEl.textContent = `(${count})`;
    const line = el(`<div class="c-line ${level === 'error' ? 'error' : level === 'warn' ? 'warn' : ''}"></div>`);
    line.textContent = text;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };
  const clear = () => {
    consoleEl.innerHTML = '';
    count = 0;
    countEl.textContent = '';
    errors = [];
    syncFix();
  };
  const preview = mountPreview($(container, '.frame-host'), { getFiles, onLog: log });
  const fillSelect = () => {
    const entries = htmlEntries(getFiles());
    select.innerHTML = entries.length ? entries.map((p) => `<option ${p === preview.entry ? 'selected' : ''}>${esc(p)}</option>`).join('') : '<option>（无 HTML 文件）</option>';
    select.disabled = !entries.length;
  };
  preview.onEntry = fillSelect;
  fillSelect();
  select.onchange = () => {
    clear();
    preview.setEntry(select.value);
  };
  container.onclick = (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'refresh') {
      clear();
      fillSelect();
      preview.refresh();
    } else if (a === 'clear') clear();
    else if (a === 'fix') {
      const list = errors.slice();
      clear();
      onFix?.({ errors: list, entry: preview.entry });
    }
    else if (a === 'toggle') {
      consoleEl.classList.toggle('hidden');
      e.target.closest('button').textContent = consoleEl.classList.contains('hidden') ? '展开' : '收起';
    }
  };
  return {
    refresh() {
      clear();
      fillSelect();
      preview.refresh();
    },
    destroy: () => preview.destroy(),
  };
}
