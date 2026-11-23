// 首页（新聊天）：居中的一句话 + 底部输入框，风格参考 Codex
import { api } from '../api.js';
import { esc, $, icon, bindMenu } from '../ui.js';
import { state, loadProjects, loadConfig, prefs, navigate } from '../state.js';
import { createComposer } from '../composer.js';
import { sidebarToggleButton } from '../sidebar.js';
import { newProjectDialog } from './projects.js';

const SUGGESTIONS = ['做一个待办事项网页', '解释这个项目的结构', '找出潜在的 Bug'];

export async function homeView(container) {
  await Promise.all([loadProjects(), loadConfig()]);
  let projectId = prefs.get('projectId');
  if (!state.projects.find((p) => p.id === projectId)) projectId = state.projects[0]?.id || '';

  container.innerHTML = `<div class="home">
    <div class="view-bar">${sidebarToggleButton()}</div>
    <div class="home-center">
      <div class="home-mark">${icon('logo')}</div>
      <h1>我们应该在<span class="menu proj-menu"><button class="proj-pick"></button><div class="menu-pop hidden proj-pop"></div></span>中做些什么？</h1>
      <div class="banner model-notice hidden">${icon('key')}<span class="grow"></span></div>
    </div>
    <div class="home-bottom">
      <div class="suggestions">${SUGGESTIONS.map((s, i) => `<button class="chip" data-sug="${i}">${esc(s)}</button>`).join('')}</div>
      <div class="composer-slot"></div>
    </div>
  </div>`;

  const pick = $(container, '.proj-pick');
  const pop = $(container, '.proj-pop');
  bindMenu(pick, pop);

  const renderProject = () => {
    const p = state.projects.find((x) => x.id === projectId);
    pick.innerHTML = `${esc(p ? p.name : '新项目')}${icon('chev-down')}`;
    pop.innerHTML =
      `<div class="menu-label">选择项目</div>` +
      state.projects
        .map((x) => `<button class="menu-item ${x.id === projectId ? 'checked' : ''}" data-pid="${x.id}">${icon('folder')}<span class="grow">${esc(x.name)}</span>${x.id === projectId ? icon('check') : ''}</button>`)
        .join('') +
      `<div class="menu-sep"></div><button class="menu-item" data-pid="__new">${icon('plus')}新建项目…</button>`;
  };
  renderProject();
  pop.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pid]');
    if (!b) return;
    pop.classList.add('hidden');
    if (b.dataset.pid === '__new') {
      const p = await newProjectDialog();
      if (!p) return;
      projectId = p.id;
      window.dispatchEvent(new Event('rty:refresh-sidebar'));
    } else projectId = b.dataset.pid;
    prefs.set('projectId', projectId);
    renderProject();
  });
  // 在侧栏点击项目时同步
  const onPicked = (e) => {
    projectId = e.detail.id;
    renderProject();
  };
  window.addEventListener('rty:project-picked', onPicked);

  const notice = $(container, '.model-notice');
  const syncNotice = () => {
    const cfg = state.config;
    notice.classList.toggle('hidden', cfg.configured);
    $(notice, 'span').innerHTML = cfg.groupedModels
      ? '当前 API Key 没有可用模型。请检查分组，然后在输入框右下角的模型菜单中刷新。'
      : `尚未配置模型 API。${cfg.user?.role === 'admin' ? '请前往 <a href="#/admin">站点管理</a> 填写。' : '请联系管理员完成配置。'}`;
  };
  syncNotice();

  const composer = createComposer({
    placeholder: '描述你想做的事情，Enter 发送',
    autofocus: true,
    onModelsRefreshed: syncNotice,
    async onSubmit({ prompt, attachments, model }) {
      if (!state.config.configured) throw new Error(state.config.groupedModels ? '当前 API Key 没有可用模型，请检查分组后刷新。' : '尚未配置模型 API');
      if (!projectId) {
        const p = await api.post('/api/projects', { name: '我的项目', template: 'blank' });
        projectId = p.id;
        prefs.set('projectId', projectId);
        await loadProjects();
      }
      const task = await api.post('/api/tasks', { projectId, prompt, attachments, model });
      window.dispatchEvent(new Event('rty:refresh-sidebar'));
      navigate(`#/tasks/${task.id}`);
    },
  });
  $(container, '.composer-slot').appendChild(composer.el);

  container.querySelectorAll('[data-sug]').forEach((b) => (b.onclick = () => composer.setText(SUGGESTIONS[+b.dataset.sug])));

  return () => window.removeEventListener('rty:project-picked', onPicked);
}
