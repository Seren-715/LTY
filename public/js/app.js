// 入口：路由与顶栏
import { api, setUnauthorizedHandler, initBackend, getMode } from './api.js';
import { esc, el, $, icon, toast } from './ui.js';
import { state, loadConfig, navigate } from './state.js';
import { authView } from './views/auth.js';
import { homeView } from './views/home.js';
import { taskView } from './views/task.js';
import { projectsView } from './views/projects.js';
import { projectView } from './views/project.js';
import { settingsView } from './views/settings.js';
import { adminView } from './views/admin.js';

const app = document.getElementById('app');

const ROUTES = [
  { re: /^#\/login$/, view: authView, public: true, bare: true },
  { re: /^#\/?$/, view: homeView, nav: 'home' },
  { re: /^#\/tasks\/([\w-]+)$/, view: taskView, nav: 'home', full: true },
  { re: /^#\/projects$/, view: projectsView, nav: 'projects' },
  { re: /^#\/projects\/([\w-]+)$/, view: projectView, nav: 'projects', full: true },
  { re: /^#\/settings$/, view: settingsView, nav: 'settings' },
  { re: /^#\/admin$/, view: adminView, nav: 'admin', admin: true },
];

let cleanup = null;
let shellEl = null;

function renderShell(active) {
  const u = state.user;
  const isAdmin = u.role === 'admin';
  if (!shellEl) {
    shellEl = el(`<div>
      <header class="topbar">
        <a class="brand" href="#/"><span class="logo">${icon('logo')}</span><span class="site-name"></span></a>
        <nav class="nav">
          <a href="#/" data-nav="home">任务</a>
          <a href="#/projects" data-nav="projects">项目</a>
          <a href="#/admin" data-nav="admin" class="admin-link">管理</a>
        </nav>
        <span class="spacer"></span>
        <a class="balance-chip hidden" href="#/settings" title="Key 剩余额度"></a>
        <div class="menu">
          <button class="avatar" title="账号"></button>
          <div class="menu-pop hidden">
            <div class="menu-head"><b class="menu-user"></b><span class="muted menu-role" style="font-size:12px"></span></div>
            <a class="menu-item" href="#/settings">${icon('user')}账号设置</a>
            <a class="menu-item admin-link" href="#/admin">${icon('shield')}站点管理</a>
            <button class="menu-item danger" data-act="logout">${icon('logout')}退出登录</button>
          </div>
        </div>
      </header>
      <main id="view"></main>
    </div>`);
    const pop = $(shellEl, '.menu-pop');
    $(shellEl, '.avatar').onclick = (e) => {
      e.stopPropagation();
      pop.classList.toggle('hidden');
    };
    document.addEventListener('click', () => pop.classList.add('hidden'));
    $(shellEl, '[data-act="logout"]').onclick = async () => {
      await api.post('/api/auth/logout').catch(() => {});
      state.user = null;
      toast('已退出登录');
      navigate('#/login');
    };
  }
  $(shellEl, '.site-name').textContent = state.config.siteName;
  $(shellEl, '.avatar').textContent = (u.username[0] || '?').toUpperCase();
  $(shellEl, '.menu-user').textContent = u.username;
  $(shellEl, '.menu-role').textContent = getMode() === 'static' ? '使用自己的 API Key' : isAdmin ? '管理员' : '普通用户';
  refreshBalance();
  shellEl.querySelectorAll('.admin-link').forEach((a) => a.classList.toggle('hidden', !isAdmin));
  shellEl.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  if (!app.contains(shellEl)) {
    app.innerHTML = '';
    app.appendChild(shellEl);
  }
  return $(shellEl, '#view');
}

// 顶栏余额（静态模式下读取 Key 的剩余额度）
let balanceAt = 0;
export async function refreshBalance(force = false) {
  const chip = shellEl && $(shellEl, '.balance-chip');
  if (!chip || getMode() !== 'static') return;
  if (!force && Date.now() - balanceAt < 30000) return;
  balanceAt = Date.now();
  try {
    const b = await api.get('/api/balance');
    if (b.unsupported) return chip.classList.add('hidden');
    chip.classList.remove('hidden');
    chip.classList.toggle('low', b.remaining != null && b.remaining < 0.2);
    const money = (n) => '$' + Number(n || 0).toFixed(2);
    chip.innerHTML = b.remaining != null ? `余额 <b>${money(b.remaining)}</b>` : `已用 <b>${money(b.usage)}</b>`;
  } catch {
    chip.classList.add('hidden');
  }
}
window.addEventListener('rty:task-end', () => refreshBalance(true));

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
    shellEl = null;
    app.innerHTML = '';
    container = el('<div></div>');
    app.appendChild(container);
  } else {
    // 每个页面使用全新的容器，避免页面在共享容器上重复绑定事件
    const main = renderShell(r.nav);
    main.innerHTML = '';
    container = el('<div class="view-root"></div>');
    main.appendChild(container);
  }
  window.scrollTo(0, 0);
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
  window.addEventListener('hashchange', router);
  router();
})();
