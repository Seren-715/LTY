// 入口：路由与整体布局（左侧栏 + 主区域）
import { api, setUnauthorizedHandler, initBackend } from './api.js';
import { esc, el, $, icon, toast } from './ui.js';
import { state, loadConfig, navigate } from './state.js';
import { createSidebar } from './sidebar.js';
import { authView } from './views/auth.js';
import { homeView } from './views/home.js';
import { taskView } from './views/task.js';
import { projectsView } from './views/projects.js';
import { projectView } from './views/project.js';
import { settingsView } from './views/settings.js';
import { adminView } from './views/admin.js';
import { installFx, play } from './fx.js';
import { installPalette } from './palette.js';

const app = document.getElementById('app');

const ROUTES = [
  { re: /^#\/login$/, view: authView, public: true, bare: true },
  { re: /^#\/?$/, view: homeView, nav: 'home' },
  { re: /^#\/tasks\/([\w-]+)$/, view: taskView },
  { re: /^#\/projects$/, view: projectsView, nav: 'projects' },
  { re: /^#\/projects\/([\w-]+)$/, view: projectView, nav: 'project' },
  { re: /^#\/settings$/, view: settingsView, nav: 'settings' },
  { re: /^#\/admin$/, view: adminView, nav: 'admin', admin: true },
];

let cleanup = null;
let shellEl = null;
let sidebar = null;

async function logout() {
  await api.post('/api/auth/logout').catch(() => {});
  state.user = null;
  toast('已退出登录');
  navigate('#/login');
}

function renderShell() {
  if (!shellEl) {
    sidebar = createSidebar({ onLogout: logout });
    shellEl = el(`<div class="shell"><div class="sb-backdrop"></div><main id="view"></main><button class="icon-btn sb-fab" data-sb-toggle title="展开侧栏">${icon('sidebar')}</button></div>`);
    shellEl.prepend(sidebar.el);
    // 各页面头部的侧栏开关
    shellEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-sb-toggle]')) sidebar.toggle();
      if (e.target.classList.contains('sb-backdrop')) sidebar.closeMobile();
    });
    sidebar.refresh();
    sidebar.refreshBalance(true);
  }
  if (!app.contains(shellEl)) {
    app.innerHTML = '';
    app.appendChild(shellEl);
  }
  return $(shellEl, '#view');
}

async function router() {
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }
  const hash = location.hash || '#/';
  const r = ROUTES.find((x) => x.re.test(hash));
  if (!r) return navigate('#/');
  const params = hash.match(r.re).slice(1);

  if (!r.public && !state.user) return navigate('#/login');
  if (r.public && state.user && r.view === authView) return navigate('#/');
  if (r.admin && state.user?.role !== 'admin') return navigate('#/');

  document.title = state.config.siteName;
  let container;
  if (r.bare) {
    sidebar?.stop();
    shellEl = null;
    sidebar = null;
    app.innerHTML = '';
    container = el('<div></div>');
    app.appendChild(container);
  } else {
    const main = renderShell();
    // 每个页面使用全新的容器，避免页面在共享容器上重复绑定事件
    main.innerHTML = '';
    container = el('<div class="view-root"></div>');
    main.appendChild(container);
    sidebar.setActive({
      route: r.nav || '',
      taskId: r.view === taskView ? params[0] : null,
      projectId: r.view === projectView ? params[0] : null,
    });
    sidebar.refreshBalance();
    sidebar.closeMobile();
  }
  try {
    cleanup = (await r.view(container, ...params)) || null;
  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="page"><div class="error-box">${esc(e.message)}</div><a class="btn" href="#/">返回首页</a></div>`;
  }
}

setUnauthorizedHandler(() => {
  state.user = null;
  if (location.hash !== '#/login') {
    toast('登录已过期，请重新登录', 'error');
    navigate('#/login');
  }
});

(async function start() {
  try {
    await initBackend();
    await loadConfig();
  } catch (e) {
    app.innerHTML = `<div class="loading-page"><div><div class="error-box">无法连接服务器：${esc(e.message)}</div></div></div>`;
    return;
  }
  installFx();
  installPalette();
  // 不在该任务页面时，任务结束也给一个提示音（在任务页面时由任务页自己处理）
  window.addEventListener('rty:task-end', (e) => {
    const { id, status } = e.detail || {};
    if (!id || location.hash === `#/tasks/${id}`) return;
    play(status === 'completed' ? 'landed' : status === 'failed' ? 'buzz' : 'hush', { volume: 0.8 });
  });
  window.addEventListener('hashchange', router);
  router();
})();
