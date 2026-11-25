// 命令面板（Ctrl / ⌘ + K）：搜索任务和项目，或执行常用操作
// 交互参考 Preline UI 的 Combobox / Search Modal（MIT），改写为原生 JS
import { api } from './api.js';
import { esc, el, $, icon } from './ui.js';
import { state, prefs, navigate } from './state.js';
import { play, soundEnabled, setSoundEnabled } from './fx.js';

let open = null;

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const paletteKey = isMac ? '⌘K' : 'Ctrl K';

function actions() {
  return [
    { kind: '操作', icon: 'compose', label: '新聊天', hint: '回到首页开始新的对话', run: () => navigate('#/') },
    { kind: '操作', icon: 'plus', label: '新建项目', run: async () => {
      const { newProjectDialog } = await import('./views/projects.js');
      const p = await newProjectDialog();
      if (p) {
        prefs.set('projectId', p.id);
        window.dispatchEvent(new Event('rty:refresh-sidebar'));
        navigate('#/');
      }
    } },
    { kind: '操作', icon: 'folder', label: '所有项目', run: () => navigate('#/projects') },
    { kind: '操作', icon: 'user', label: '账号设置', run: () => navigate('#/settings') },
    {
      kind: '操作',
      icon: soundEnabled() ? 'bolt' : 'x',
      label: soundEnabled() ? '关闭界面音效' : '开启界面音效',
      run: () => {
        setSoundEnabled(!soundEnabled());
        window.dispatchEvent(new Event('rty:sound-changed'));
      },
    },
  ];
}

export async function openPalette() {
  if (open) return open.focus();
  play('wisp');
  const overlay = el(`<div class="overlay palette-overlay"><div class="palette" role="dialog" aria-modal="true" aria-label="命令面板">
    <div class="pl-input">${icon('search')}<input placeholder="搜索任务、项目或操作…" aria-label="搜索" autocomplete="off"><kbd>Esc</kbd></div>
    <div class="pl-list" role="listbox"></div>
    <div class="pl-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span class="spacer"></span><span>${paletteKey} 随时打开</span></div>
  </div></div>`);
  document.body.appendChild(overlay);
  const input = $(overlay, 'input');
  const list = $(overlay, '.pl-list');
  let tasks = [];
  let items = [];
  let sel = 0;

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    open = null;
  };
  open = { focus: () => input.focus(), close };

  const match = (text, q) => !q || text.toLowerCase().includes(q);
  function build() {
    const q = input.value.trim().toLowerCase();
    const projName = (id) => state.projects.find((p) => p.id === id)?.name || '';
    const acts = actions().filter((a) => match(a.label, q));
    const projs = state.projects
      .filter((p) => match(p.name, q))
      .slice(0, q ? 8 : 4)
      .map((p) => ({ kind: '项目', icon: 'folder', label: p.name, hint: `${p.fileCount ?? 0} 个文件`, run: () => navigate(`#/projects/${p.id}`) }));
    const ts = tasks
      .filter((t) => !t.archived && (match(t.title || '', q) || match(projName(t.projectId), q)))
      .slice(0, q ? 12 : 6)
      .map((t) => ({ kind: q ? '任务' : '最近的任务', icon: 'chat', label: t.title || '未命名任务', hint: projName(t.projectId), run: () => navigate(`#/tasks/${t.id}`) }));
    items = q ? [...ts, ...projs, ...acts] : [...ts, ...acts, ...projs];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    render(q);
  }
  function highlight(text, q) {
    if (!q) return esc(text);
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + `<mark>${esc(text.slice(i, i + q.length))}</mark>` + esc(text.slice(i + q.length));
  }
  function render(q) {
    if (!items.length) {
      list.innerHTML = `<div class="pl-empty">没有找到「${esc(input.value.trim())}」</div>`;
      return;
    }
    let last = '';
    list.innerHTML = items
      .map((it, i) => {
        const head = it.kind !== last ? `<div class="pl-group">${esc((last = it.kind))}</div>` : '';
        return `${head}<button class="pl-item ${i === sel ? 'active' : ''}" data-i="${i}" role="option" aria-selected="${i === sel}">${icon(it.icon)}<span class="grow">${highlight(it.label, q)}</span>${it.hint ? `<span class="pl-hint">${esc(it.hint)}</span>` : ''}</button>`;
      })
      .join('');
    list.querySelector('.pl-item.active')?.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const it = items[i];
    if (!it) return;
    play('latch');
    close();
    it.run();
  }
  function move(d) {
    if (!items.length) return;
    sel = (sel + d + items.length) % items.length;
    list.querySelectorAll('.pl-item').forEach((b, i) => {
      b.classList.toggle('active', i === sel);
      b.setAttribute('aria-selected', i === sel);
    });
    list.querySelector('.pl-item.active')?.scrollIntoView({ block: 'nearest' });
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      choose(sel);
    }
  }
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) choose(Number(b.dataset.i));
  });
  list.addEventListener('mousemove', (e) => {
    const b = e.target.closest('[data-i]');
    if (b && Number(b.dataset.i) !== sel) {
      sel = Number(b.dataset.i);
      list.querySelectorAll('.pl-item').forEach((x, i) => x.classList.toggle('active', i === sel));
    }
  });
  input.addEventListener('input', () => {
    sel = 0;
    build();
  });
  build();
  input.focus();
  try {
    tasks = await api.get('/api/tasks');
    tasks.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    if (open) build();
  } catch {
    /* 未登录等情况 */
  }
}

/** 注册全局快捷键 */
export function installPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      if (!state.user || location.hash.startsWith('#/login')) return;
      e.preventDefault();
      if (open) open.close();
      else openPalette();
    }
  });
}
