// 首页：任务输入框 + 任务列表（Codex 风格）
import { api } from '../api.js';
import { esc, $, icon, toast, timeAgo, statusBadge, statsHtml, autosize } from '../ui.js';
import { state, loadProjects, loadConfig, prefs, navigate } from '../state.js';
import { newProjectDialog } from './projects.js';

const SUGGESTIONS = [
  { text: '做一个待办事项网页', prompt: '用 HTML/CSS/JS 做一个漂亮的待办事项应用：可以添加、完成、删除任务，并用 localStorage 保存。' },
  { text: '解释这个项目的结构', prompt: '请阅读项目中的文件，解释项目的整体结构和每个文件的作用。', mode: 'ask' },
  { text: '找出潜在 Bug', prompt: '请检查项目代码，找出潜在的 Bug 和不规范的地方，并给出修改建议。', mode: 'ask' },
  { text: '添加深色模式', prompt: '为网页添加一个深色 / 浅色主题切换按钮，并记住用户的选择。' },
  { text: '补充注释和 README', prompt: '为项目的主要代码补充清晰的中文注释，并编写一份 README.md。' },
];

export function modelOptions(selected) {
  const { models = [], defaultModel } = state.config;
  if (!models.length) return '<option value="">未配置模型</option>';
  const current = models.includes(selected) ? selected : defaultModel;
  return models.map((m) => `<option value="${esc(m)}" ${m === current ? 'selected' : ''}>${esc(m)}</option>`).join('');
}

export function modelRefreshButton() {
  return state.config.mode === 'static'
    ? `<button type="button" class="btn ghost sm refresh-models" title="刷新模型列表">${icon('refresh')}刷新模型</button>`
    : '';
}

export function bindModelRefresh(container, modelSelect, onRefresh) {
  const button = $(container, '.refresh-models');
  if (!button) return;
  const label = button.innerHTML;
  button.onclick = async () => {
    button.disabled = true;
    modelSelect.disabled = true;
    button.innerHTML = '<span class="spin"></span>刷新中';
    try {
      const config = await loadConfig({ refreshModels: true });
      if (!button.isConnected) return;
      modelSelect.innerHTML = modelOptions(modelSelect.value);
      onRefresh?.(config);
      if (config.models.length) toast('模型列表已刷新', 'success');
      else toast('当前 API Key 没有可用的模型', 'error');
    } catch (e) {
      if (button.isConnected) toast(e.message || '刷新模型失败', 'error');
    } finally {
      button.innerHTML = label;
      modelSelect.disabled = false;
      button.disabled = false;
    }
  };
}

export async function homeView(container) {
  await Promise.all([loadProjects(), loadConfig()]);
  const cfg = state.config;
  let tab = 'active';
  let query = '';
  let tasks = [];
  let timer = null;

  let projectId = prefs.get('projectId');
  if (!state.projects.find((p) => p.id === projectId)) projectId = state.projects[0]?.id || '';
  const model = prefs.get('model');

  container.innerHTML = `<div class="home">
    <div class="hero"><h1>接下来要写点什么？</h1></div>
    <div class="banner model-notice ${cfg.configured ? 'hidden' : ''}">${icon('key')}<span class="grow">${
      cfg.groupedModels
        ? '当前 API Key 没有可用模型。请检查唐果分组，然后刷新模型。'
        : `尚未配置模型 API。${cfg.user?.role === 'admin' ? '请前往 <a href="#/admin">站点管理</a> 填写 API 地址、Key 和模型。' : '请联系管理员完成配置。'}`
    }</span></div>
    <div class="composer">
      <textarea placeholder="描述一个编码任务，例如：做一个带动画的个人主页…" rows="2"></textarea>
      <div class="composer-bar">
        <select class="select pill-select project" title="项目"></select>
        <select class="select pill-select model" title="模型">${modelOptions(model)}</select>
        ${modelRefreshButton()}
        <span class="spacer"></span>
        <span class="kbd" title="Ctrl/⌘ + Enter 发送编码任务">${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'} ↵</span>
        <button class="btn" data-mode="ask" title="只读：回答问题，不修改文件">${icon('chat')}提问</button>
        <button class="btn primary" data-mode="code" title="可以创建和修改文件">${icon('code')}编码</button>
      </div>
    </div>
    <div class="suggestions">${SUGGESTIONS.map((s, i) => `<button class="chip" data-sug="${i}">${icon('sparkle')}${esc(s.text)}</button>`).join('')}</div>

    <div class="section-head">
      <button class="tab active" data-tab="active">任务<span class="count c-active"></span></button>
      <button class="tab" data-tab="archived">已归档<span class="count c-archived"></span></button>
      <div class="search">${icon('search')}<input placeholder="搜索任务"></div>
    </div>
    <div class="task-list"></div>
  </div>`;

  const ta = $(container, 'textarea');
  const fit = autosize(ta);
  const projSel = $(container, '.project');
  const modelSel = $(container, '.model');
  const modelNotice = $(container, '.model-notice');
  const list = $(container, '.task-list');
  bindModelRefresh(container, modelSel, (config) => modelNotice.classList.toggle('hidden', config.configured));

  const fillProjects = () => {
    projSel.innerHTML =
      state.projects.map((p) => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>📁 ${esc(p.name)}</option>`).join('') +
      `<option value="__new">＋ 新建项目…</option>`;
    if (!state.projects.length) projSel.insertAdjacentHTML('afterbegin', '<option value="" selected>📁 自动创建项目</option>');
  };
  fillProjects();

  projSel.onchange = async () => {
    if (projSel.value === '__new') {
      const p = await newProjectDialog();
      if (p) projectId = p.id;
      fillProjects();
    } else projectId = projSel.value;
    prefs.set('projectId', projectId);
  };
  modelSel.onchange = () => {
    prefs.set('model', modelSel.value);
  };

  async function submit(mode) {
    if (modelSel.disabled) return;
    const prompt = ta.value.trim();
    if (!prompt) {
      ta.focus();
      return;
    }
    if (!state.config.configured) {
      return toast(state.config.groupedModels ? '当前 API Key 没有可用模型，请检查分组后刷新。' : '尚未配置模型 API', 'error');
    }
    container.querySelectorAll('[data-mode]').forEach((b) => (b.disabled = true));
    try {
      if (!projectId) {
        const p = await api.post('/api/projects', { name: '我的项目', template: 'blank' });
        projectId = p.id;
        prefs.set('projectId', projectId);
        await loadProjects();
      }
      const task = await api.post('/api/tasks', { projectId, prompt, mode, model: modelSel.value });
      ta.value = '';
      navigate(`#/tasks/${task.id}`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      container.querySelectorAll('[data-mode]').forEach((b) => (b.disabled = false));
    }
  }

  container.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => submit(b.dataset.mode)));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      submit('code');
    }
  });
  container.querySelectorAll('[data-sug]').forEach(
    (b) =>
      (b.onclick = () => {
        const s = SUGGESTIONS[+b.dataset.sug];
        ta.value = s.prompt;
        fit();
        ta.focus();
      }),
  );
  setTimeout(() => ta.focus(), 50);

  // —— 任务列表 ——
  const renderList = () => {
    const active = tasks.filter((t) => !t.archived);
    const archived = tasks.filter((t) => t.archived);
    $(container, '.c-active').textContent = active.length || '';
    $(container, '.c-archived').textContent = archived.length || '';
    let shown = tab === 'active' ? active : archived;
    if (query) {
      const q = query.toLowerCase();
      shown = shown.filter((t) => t.title.toLowerCase().includes(q) || t.projectName.toLowerCase().includes(q));
    }
    if (!shown.length) {
      list.innerHTML = `<div class="empty">${icon('list')}<div>${query ? '没有匹配的任务' : tab === 'active' ? '还没有任务，在上方描述你想做的事情吧' : '没有已归档的任务'}</div></div>`;
      return;
    }
    list.innerHTML = shown
      .map(
        (t) => `<a class="task-row" href="#/tasks/${t.id}">
          <div class="grow">
            <div class="task-title">${esc(t.title)}</div>
            <div class="task-meta"><span>${esc(t.projectName)}</span><span>·</span><span>${t.mode === 'ask' ? '提问' : '编码'}</span><span>·</span><span>${timeAgo(t.createdAt)}</span></div>
          </div>
          <div class="task-side">${statsHtml(t.stats)}${statusBadge(t.status)}</div>
        </a>`,
      )
      .join('');
  };

  const refresh = async () => {
    try {
      tasks = await api.get('/api/tasks');
      renderList();
    } catch {
      /* 忽略轮询错误 */
    }
    clearTimeout(timer);
    timer = setTimeout(refresh, tasks.some((t) => t.status === 'running') ? 2500 : 15000);
  };

  container.querySelectorAll('[data-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        container.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
        renderList();
      }),
  );
  $(container, '.search input').oninput = (e) => {
    query = e.target.value.trim();
    renderList();
  };

  list.innerHTML = `<div class="empty"><span class="spin"></span></div>`;
  await refresh();
  return () => clearTimeout(timer);
}
