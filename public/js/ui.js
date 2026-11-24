// 通用 UI 工具：转义、DOM 构建、图标、提示、弹窗、时间格式化

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (root, sel) => root.querySelector(sel);
export const $$ = (root, sel) => [...root.querySelectorAll(sel)];

const PATHS = {
  // 站点标志（鲸尾）
  logo: '<path d="M3.34 21.71 C3.53 21.17 4 19.52 4.48 18.46 C4.97 17.39 5.84 16.36 6.28 15.32 C6.71 14.28 7.09 13.22 7.09 12.22 C7.09 11.23 6.58 10.32 6.28 9.37 C5.98 8.42 5.41 7.44 5.3 6.52 C5.19 5.6 5.26 4.59 5.63 3.83 C5.99 3.08 6.92 2.12 7.5 2 C8.08 1.88 8.51 2.58 9.13 3.1 C9.75 3.62 10.64 4.47 11.21 5.14 C11.78 5.8 12.26 6.41 12.55 7.09 C12.84 7.77 12.54 8.69 12.96 9.21 C13.38 9.73 14.28 9.84 15.08 10.23 C15.87 10.62 16.95 10.98 17.72 11.53 C18.5 12.08 19.23 12.83 19.72 13.53 C20.21 14.23 20.79 15.16 20.66 15.73 C20.52 16.29 19.67 16.68 18.9 16.91 C18.14 17.14 17.03 17.22 16.05 17.11 C15.08 17 13.96 16.56 13.04 16.26 C12.12 15.96 11.21 15.39 10.55 15.32 C9.9 15.25 9.45 15.39 9.13 15.81 C8.81 16.23 8.67 17.1 8.64 17.85 C8.61 18.59 8.82 19.6 8.92 20.29 C9.03 20.98 9.2 21.71 9.25 22"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'folder-open': '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1"/><path d="M3 19 5.5 11h16L19 19z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  code: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/>',
  'arrow-up': '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  settings:
    '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
  unarchive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="m9 15 3-3 3 3"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 20V8"/><path d="m7 13 5-5 5 5"/><path d="M5 4h14"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  'chev-right': '<path d="m9 6 6 6-6 6"/>',
  'chev-down': '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  diff: '<path d="M12 3v14"/><path d="M5 10h14"/><path d="M5 21h14"/>',
  terminal: '<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m16 7 3 3"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a7 7 0 0 0-4-6.3"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8"/><path d="M7 21v-7h10v7"/>',
  'file-plus': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  screen: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  paperclip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  compose: '<path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 15l-4 1 1-4z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
};

export const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;

// —— 提示 ——
let toastBox;
export function toast(msg, type = 'info', ms = 2600) {
  if (!toastBox) {
    toastBox = el('<div class="toasts"></div>');
    document.body.appendChild(toastBox);
  }
  const t = el(`<div class="toast ${type}">${esc(msg)}</div>`);
  toastBox.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// —— 弹窗 ——
export function modal({ title, body, actions = [], width, onOpen }) {
  const overlay = el(`<div class="overlay"><div class="dialog" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="dialog-body"></div><div class="dialog-actions"></div></div></div>`);
  const dialog = $(overlay, '.dialog');
  if (width) dialog.style.maxWidth = width;
  const bodyEl = $(overlay, '.dialog-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  const actionsEl = $(overlay, '.dialog-actions');
  for (const a of actions) {
    const b = el(`<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger solid' : ''}">${esc(a.label)}</button>`);
    b.addEventListener('click', async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try {
        const r = await a.onClick({ close, body: bodyEl });
        if (r !== false) close();
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        b.disabled = false;
      }
    });
    actionsEl.appendChild(b);
  }
  document.body.appendChild(overlay);
  const first = $(bodyEl, 'input, textarea, select');
  if (first) setTimeout(() => first.focus(), 30);
  onOpen && onOpen(bodyEl, close);
  return { close, body: bodyEl };
}

export function confirmDialog(message, { title = '请确认', okText = '确定', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: `<p style="margin:0;color:var(--text-2)">${esc(message)}</p>`,
      actions: [
        { label: '取消', onClick: () => { done = true; resolve(false); } },
        { label: okText, primary: !danger, danger, onClick: () => { done = true; resolve(true); } },
      ],
    });
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.body)) {
        obs.disconnect();
        if (!done) resolve(false);
      }
    });
    obs.observe(document.body, { childList: true });
  });
}

export function promptDialog(title, { label = '', value = '', placeholder = '', okText = '确定' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const body = el(`<div class="field" style="margin:0">${label ? `<label>${esc(label)}</label>` : ''}<input class="input" value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`);
    const input = $(body, 'input');
    const m = modal({
      title,
      body,
      actions: [
        { label: '取消', onClick: () => { done = true; resolve(null); } },
        { label: okText, primary: true, onClick: () => { done = true; resolve(input.value.trim()); } },
      ],
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        done = true;
        resolve(input.value.trim());
        m.close();
      }
    });
    setTimeout(() => input.select(), 40);
    const obs = new MutationObserver(() => {
      if (!document.body.contains(m.body)) {
        obs.disconnect();
        if (!done) resolve(null);
      }
    });
    obs.observe(document.body, { childList: true });
  });
}

// —— 时间 ——
export function timeAgo(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 45) return '刚刚';
  if (d < 3600) return `${Math.round(d / 60)} 分钟前`;
  if (d < 86400) return `${Math.round(d / 3600)} 小时前`;
  if (d < 86400 * 7) return `${Math.round(d / 86400)} 天前`;
  return formatDate(ts);
}

export function formatDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const STATUS = {
  queued: { label: '排队中', cls: 'running' },
  running: { label: '运行中', cls: 'running' },
  completed: { label: '已完成', cls: 'completed' },
  failed: { label: '失败', cls: 'failed' },
  stopped: { label: '已停止', cls: 'stopped' },
};

export function statusBadge(status) {
  const s = STATUS[status] || { label: status, cls: '' };
  return `<span class="badge ${s.cls}">${status === 'running' || status === 'queued' ? '<span class="spin"></span>' : ''}${s.label}</span>`;
}

export function statsHtml(stats) {
  if (!stats || !stats.files) return '';
  return `<span class="stat"><span class="add">+${stats.added}</span><span class="del">−${stats.removed}</span></span>`;
}

export function autosize(ta, max = 320) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(max, ta.scrollHeight) + 'px';
  };
  ta.addEventListener('input', fit);
  fit();
  return fit;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el('<textarea style="position:fixed;opacity:0"></textarea>');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('已复制', 'success', 1400);
}

// 代码块复制按钮（事件委托）
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const pre = b.closest('.code-block')?.querySelector('pre');
  if (pre) copyText(pre.innerText);
});

// 点击菜单外部时关闭所有弹出菜单（.menu > .menu-pop）
document.addEventListener('click', (e) => {
  document.querySelectorAll('.menu-pop:not(.hidden)').forEach((pop) => {
    const owner = pop.closest('.menu') || pop.parentElement;
    if (!owner.contains(e.target)) pop.classList.add('hidden');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.menu-pop:not(.hidden)').forEach((p) => p.classList.add('hidden'));
});

/** 绑定一个简单的下拉菜单：点击 trigger 切换 pop */
export function bindMenu(trigger, pop) {
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = pop.classList.contains('hidden');
    document.querySelectorAll('.menu-pop:not(.hidden)').forEach((p) => p !== pop && p.classList.add('hidden'));
    pop.classList.toggle('hidden', !willOpen);
  });
}
