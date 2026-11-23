// 左侧栏：新聊天 / 搜索 / 项目（文件夹）与其中的任务 / 账号
import { api, getMode } from './api.js';
import { esc, el, $, icon, toast, bindMenu } from './ui.js';
import { state, prefs, navigate, loadProjects } from './state.js';
import { newProjectDialog } from './views/projects.js';
import { avatarSrc } from './avatar.js';

const TASKS_PER_PROJECT = 8;

export function createSidebar({ onLogout }) {
  let tasks = [];
  let query = '';
  let active = { taskId: null, projectId: null, route: '' };
  let timer = 0;
  const collapsed = new Set(prefs.get('sbCollapsed', []));
  const showAll = new Set();
  let showArchived = false;

  const root = el(`<aside class="sidebar">
    <div class="sb-head">
      <a class="brand" href="#/"><span class="logo">${icon('logo')}</span><span class="site-name"></span></a>
      <button class="icon-btn sb-hide" title="收起侧栏">${icon('sidebar')}</button>
    </div>
    <div class="sb-nav">
      <a class="sb-item" href="#/" data-nav="home">${icon('compose')}<span>新聊天</span></a>
      <button class="sb-item" data-act="search">${icon('search')}<span>搜索</span></button>
      <div class="sb-search hidden"><input placeholder="搜索任务或项目"></div>
    </div>
    <div class="sb-section"><span class="grow">项目</span>
      <a class="icon-btn sm" href="#/projects" title="所有项目">${icon('folder')}</a>
      <button class="icon-btn sm" data-act="new-project" title="新建项目">${icon('plus')}</button>
    </div>
    <div class="sb-list"></div>
    <div class="sb-foot menu">
      <button class="sb-user">
        <span class="avatar"><img src="img/avatar.jpg" alt=""></span>
        <span class="sb-user-meta"><span class="sb-user-name"></span><span class="sb-balance"></span></span>
        ${icon('more')}
      </button>
      <div class="menu-pop up hidden">
        <a class="menu-item" href="#/settings">${icon('user')}账号设置</a>
        <a class="menu-item admin-link" href="#/admin">${icon('shield')}站点管理</a>
        <div class="menu-sep"></div>
        <button class="menu-item danger" data-act="logout">${icon('logout')}退出登录</button>
      </div>
    </div>
  </aside>`);

  const list = $(root, '.sb-list');
  const searchBox = $(root, '.sb-search');
  bindMenu($(root, '.sb-user'), $(root, '.sb-foot .menu-pop'));

  function renderUser() {
    const u = state.user;
    if (!u) return;
    $(root, '.site-name').textContent = state.config?.siteName || 'RTY Code';
    $(root, '.sb-user-name').textContent = u.username;
    const img = $(root, '.sb-user .avatar img');
    if (img.getAttribute('src') !== avatarSrc(u)) img.src = avatarSrc(u);
    root.querySelectorAll('.admin-link').forEach((a) => a.classList.toggle('hidden', u.role !== 'admin'));
  }

  function taskRow(t) {
    const running = t.status === 'running' || t.status === 'queued';
    const dot = running ? '<span class="spin"></span>' : t.status === 'failed' ? '<span class="sb-dot failed" title="失败"></span>' : '';
    return `<a class="sb-task ${t.id === active.taskId ? 'active' : ''}" href="#/tasks/${t.id}" title="${esc(t.title)}"><span class="sb-task-title">${esc(t.title)}</span>${dot}</a>`;
  }

  function render() {
    renderUser();
    root.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', active.route === a.dataset.nav));
    const q = query.toLowerCase();
    const visible = tasks.filter((t) => !!t.archived === showArchived && (!q || t.title.toLowerCase().includes(q) || t.projectName.toLowerCase().includes(q)));
    const projects = state.projects.filter((p) => !q || p.name.toLowerCase().includes(q) || visible.some((t) => t.projectId === p.id));
    if (!projects.length) {
      list.innerHTML = q
        ? `<div class="sb-empty">没有匹配的结果</div>`
        : `<div class="sb-empty">还没有项目<br><button class="btn sm soft" data-act="new-project" style="margin-top:8px">${icon('plus')}新建项目</button></div>`;
    } else {
      list.innerHTML = projects
        .map((p) => {
          const own = visible.filter((t) => t.projectId === p.id);
          const open = q ? true : !collapsed.has(p.id);
          const limit = showAll.has(p.id) ? own.length : TASKS_PER_PROJECT;
          return `<div class="sb-proj ${open ? 'open' : ''} ${p.id === active.projectId ? 'current' : ''}">
            <div class="sb-item sb-proj-row" data-proj="${p.id}">
              ${icon(open ? 'folder-open' : 'folder')}<span class="grow sb-proj-name">${esc(p.name)}</span>
              <span class="sb-row-actions">
                <a class="icon-btn xs" href="#/projects/${p.id}" title="查看文件" data-stop>${icon('file')}</a>
                <button class="icon-btn xs" data-new-in="${p.id}" title="在此项目中新聊天">${icon('compose')}</button>
              </span>
            </div>
            ${
              open
                ? `<div class="sb-tasks">${own.slice(0, limit).map(taskRow).join('') || `<div class="sb-empty sm">${showArchived ? '没有归档的任务' : '暂无任务'}</div>`}${
                    own.length > limit ? `<button class="sb-more" data-more="${p.id}">显示全部（${own.length}）</button>` : ''
                  }</div>`
                : ''
            }
          </div>`;
        })
        .join('');
    }
    const archivedCount = tasks.filter((t) => t.archived).length;
    if (archivedCount || showArchived) {
      list.insertAdjacentHTML(
        'beforeend',
        `<button class="sb-more archived-toggle" data-act="archived">${icon(showArchived ? 'back' : 'archive')}${showArchived ? '返回任务列表' : `已归档（${archivedCount}）`}</button>`,
      );
    }
  }

  async function refresh() {
    clearTimeout(timer);
    try {
      const [, t] = await Promise.all([loadProjects(), api.get('/api/tasks')]);
      tasks = t;
      render();
    } catch {
      /* 登录过期等情况由 api 层处理 */
    }
    if (!root.isConnected) return;
    timer = setTimeout(refresh, tasks.some((t) => t.status === 'running' || t.status === 'queued') ? 2500 : 20000);
  }

  // 余额（静态模式下读取 Key 剩余额度）
  let balanceAt = 0;
  async function refreshBalance(force = false) {
    const box = $(root, '.sb-balance');
    if (getMode() !== 'static') return (box.textContent = state.user?.role === 'admin' ? '管理员' : '');
    if (!force && Date.now() - balanceAt < 30000) return;
    balanceAt = Date.now();
    try {
      const b = await api.get('/api/balance');
      if (b.unsupported) return (box.textContent = '');
      box.textContent = b.remaining != null ? `余额 $${Number(b.remaining).toFixed(2)}` : `已用 $${Number(b.usage || 0).toFixed(2)}`;
      box.classList.toggle('low', b.remaining != null && b.remaining < 0.2);
    } catch {
      box.textContent = '';
    }
  }

  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-stop]')) return;
    const newIn = t.closest('[data-new-in]');
    if (newIn) {
      e.preventDefault();
      prefs.set('projectId', newIn.dataset.newIn);
      closeMobile();
      return navigate('#/');
    }
    const projRow = t.closest('[data-proj]');
    if (projRow) {
      const id = projRow.dataset.proj;
      if (collapsed.has(id)) collapsed.delete(id);
      else collapsed.add(id);
      prefs.set('sbCollapsed', [...collapsed]);
      prefs.set('projectId', id);
      render();
      window.dispatchEvent(new CustomEvent('rty:project-picked', { detail: { id } }));
      return;
    }
    const more = t.closest('[data-more]');
    if (more) {
      showAll.add(more.dataset.more);
      return render();
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'search') {
      searchBox.classList.toggle('hidden');
      if (!searchBox.classList.contains('hidden')) $(searchBox, 'input').focus();
      else {
        query = '';
        $(searchBox, 'input').value = '';
        render();
      }
    } else if (act === 'new-project') {
      const p = await newProjectDialog();
      if (p) {
        prefs.set('projectId', p.id);
        await refresh();
        navigate('#/');
      }
    } else if (act === 'archived') {
      showArchived = !showArchived;
      render();
    } else if (act === 'logout') onLogout();
    if (t.closest('a[href]')) closeMobile();
  });
  $(searchBox, 'input').addEventListener('input', (e) => {
    query = e.target.value.trim();
    render();
  });

  // 收起 / 展开（桌面）与抽屉（手机）
  const isMobile = () => window.matchMedia('(max-width: 860px)').matches;
  function closeMobile() {
    document.body.classList.remove('sb-mobile-open');
  }
  function toggle() {
    if (isMobile()) document.body.classList.toggle('sb-mobile-open');
    else {
      document.body.classList.toggle('sb-collapsed');
      prefs.set('sbHidden', document.body.classList.contains('sb-collapsed'));
    }
  }
  if (prefs.get('sbHidden', false)) document.body.classList.add('sb-collapsed');
  $(root, '.sb-hide').onclick = toggle;

  window.addEventListener('rty:refresh-sidebar', () => refresh());
  window.addEventListener('rty:task-end', () => {
    refresh();
    refreshBalance(true);
  });

  return {
    el: root,
    refresh,
    refreshBalance,
    toggle,
    closeMobile,
    setActive(a) {
      active = { ...active, ...a };
      render();
    },
    stop: () => clearTimeout(timer),
  };
}

/** 页面左上角的侧栏开关（侧栏收起或手机端时显示） */
export function sidebarToggleButton() {
  return `<button class="icon-btn sb-toggle" data-sb-toggle title="展开侧栏">${icon('sidebar')}</button>`;
}
