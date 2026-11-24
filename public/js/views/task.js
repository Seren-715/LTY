// 任务（对话）页：居中单栏对话；文件变更、文件和预览放在可开合的右侧面板中
import { api, streamEvents } from '../api.js';
import { esc, el, $, icon, toast, modal, statusBadge, statsHtml, confirmDialog, promptDialog, bindMenu } from '../ui.js';
import { state, loadConfig, prefs, navigate } from '../state.js';
import { renderMarkdown } from '../markdown.js';
import { highlight, langFromPath } from '../highlight.js';
import { renderDiffTable, diffStats } from '../diff.js';
import { renderChanges, mountFileBrowser, mountPreviewPanel } from '../components.js';
import { createComposer } from '../composer.js';
import { sidebarToggleButton } from '../sidebar.js';
import { downloadZip } from '../zip.js';

const TOOL_LABEL = {
  list_files: '查看文件列表',
  read_file: '读取',
  search_files: '搜索',
  write_file: '写入',
  edit_file: '编辑',
  delete_file: '删除',
};
const TOOL_ICON = { list_files: 'list', read_file: 'file', search_files: 'search', write_file: 'file-plus', edit_file: 'edit', delete_file: 'trash' };

function parseArgs(raw) {
  try {
    return typeof raw === 'object' ? raw || {} : JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

// 用户消息的展示内容：原始文字、图片、附件文件名
function userParts(m) {
  const images = Array.isArray(m.content) ? m.content.filter((p) => p.type === 'image_url').map((p) => p.image_url?.url).filter(Boolean) : [];
  let text = m._text;
  if (text === undefined) text = typeof m.content === 'string' ? m.content : (m.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  return { text, images, files: m._files || [] };
}

export async function taskView(container, id) {
  if (!state.config || state.config.mode === 'static') await loadConfig();
  let task = await api.get(`/api/tasks/${id}`);
  let project = null;
  let partial = null;
  let destroyed = false;
  let abort = null;
  let panelTab = prefs.get('panelTab', 'changes');
  let panelOpen = prefs.get('panelOpen', false);
  let panelInst = null;
  let focusPath = null;
  const toolData = [];

  container.innerHTML = `<div class="task-layout">
    <section class="chat-col">
      <header class="view-bar task-bar">
        ${sidebarToggleButton()}
        <div class="tb-title"><h2 class="title" title="点击重命名"></h2><a class="tb-proj"></a></div>
        <span class="spacer"></span>
        <span class="tb-status"></span>
        <button class="btn ghost sm tb-changes hidden" data-panel="changes" title="查看变更"></button>
        <button class="icon-btn" data-panel="preview" title="预览">${icon('eye')}</button>
        <button class="icon-btn" data-panel="files" title="文件">${icon('folder')}</button>
        <div class="menu">
          <button class="icon-btn more-btn" title="更多">${icon('more')}</button>
          <div class="menu-pop hidden right more-pop"></div>
        </div>
      </header>
      <div class="messages"><div class="thread"></div></div>
      <div class="dock"><div class="dock-inner"></div></div>
    </section>
    <aside class="side-panel">
      <div class="sp-head">
        <button class="tab" data-pt="changes">变更<span class="count c-changes"></span></button>
        <button class="tab" data-pt="files">文件</button>
        <button class="tab" data-pt="preview">预览</button>
        <span class="spacer"></span>
        <a class="icon-btn sp-proj" title="在项目中打开">${icon('external')}</a>
        <button class="icon-btn" data-act="close-panel" title="关闭面板">${icon('x')}</button>
      </div>
      <div class="panel-body"></div>
    </aside>
  </div>`;

  const layout = $(container, '.task-layout');
  const msgs = $(container, '.messages');
  const thread = $(container, '.thread');
  const panelBody = $(container, '.panel-body');
  const morePop = $(container, '.more-pop');
  bindMenu($(container, '.more-btn'), morePop);
  const running = () => task.status === 'running' || task.status === 'queued';

  const composer = createComposer({
    initialModel: task.model,
    dropZone: $(container, '.chat-col'),
    async onFolder({ name, files, skipped }) {
      const n = Object.keys(files).length;
      const ok = await confirmDialog(`把文件夹「${name}」中的 ${n} 个文件导入到项目「${task.projectName}」？同名文件会被覆盖。`, { okText: '导入' });
      if (!ok) return;
      const r = await api.put(`/api/projects/${task.projectId}/files`, { files });
      if (project) project.files = r.files;
      if (panelOpen) renderPanel();
      window.dispatchEvent(new Event('rty:refresh-sidebar'));
      toast(`已导入 ${n} 个文件${skipped.length ? `，跳过 ${skipped.length} 个非文本或过大的文件` : ''}`, 'success', 4200);
    },
    placeholder: '继续对话，Enter 发送，Shift + Enter 换行',
    async onSubmit({ prompt, attachments, model }) {
      task = await api.post(`/api/tasks/${id}/messages`, { prompt, attachments, model });
      partial = null;
      renderAll(true);
      subscribe();
      window.dispatchEvent(new Event('rty:refresh-sidebar'));
    },
    onStop: () => api.post(`/api/tasks/${id}/stop`).catch((err) => toast(err.message, 'error')),
  });
  $(container, '.dock-inner').appendChild(composer.el);

  async function loadProject() {
    try {
      project = await api.get(`/api/projects/${task.projectId}`);
    } catch {
      project = null;
    }
  }

  // —— 头部 ——
  function renderHeader() {
    $(container, '.title').textContent = task.title;
    document.title = `${task.title} · ${state.config.siteName}`;
    const proj = $(container, '.tb-proj');
    proj.textContent = task.projectName;
    proj.href = `#/projects/${task.projectId}`;
    $(container, '.sp-proj').href = `#/projects/${task.projectId}`;
    $(container, '.tb-status').innerHTML = task.status === 'completed' ? '' : statusBadge(task.status);
    const n = Object.keys(task.changes || {}).length;
    const ch = $(container, '.tb-changes');
    ch.classList.toggle('hidden', !n);
    ch.innerHTML = `${icon('diff')}${n} 个文件 ${statsHtml(task.stats)}`;
    $(container, '.c-changes').textContent = n || '';
    morePop.innerHTML = `
      <button class="menu-item" data-act="rename">${icon('edit')}重命名</button>
      <a class="menu-item" href="#/projects/${task.projectId}">${icon('folder')}打开项目</a>
      <button class="menu-item" data-act="dl-all">${icon('download')}下载项目 ZIP</button>
      <button class="menu-item" data-act="archive">${icon(task.archived ? 'unarchive' : 'archive')}${task.archived ? '取消归档' : '归档'}</button>
      ${task.usage?.cost ? `<div class="menu-tip">本任务花费 $${task.usage.cost.toFixed(4)}</div>` : ''}
      ${task.model ? `<div class="menu-tip mono">${esc(task.model)}</div>` : ''}
      <div class="menu-sep"></div>
      <button class="menu-item danger" data-act="delete">${icon('trash')}删除任务</button>`;
    composer.setRunning(running());
  }

  // —— 工具调用 ——
  function toolHtml(tc, result) {
    const args = parseArgs(tc.function.arguments);
    const name = tc.function.name;
    const idx = toolData.push({ tc, args, result }) - 1;
    const target = args.path ? esc(args.path) : args.query ? `“${esc(args.query)}”` : '';
    let status = '';
    const failed = result && (result._ok === false || /^错误[：:]/.test(result.content));
    if (!result) status = running() ? '<span class="spin"></span>' : '<span class="tool-note">未执行</span>';
    else if (failed) status = '<span class="tool-note err">失败</span>';
    let extra = '';
    if (!failed && name === 'write_file') extra = `<span class="stat"><span class="add">+${String(args.content ?? '').split('\n').length}</span></span>`;
    else if (!failed && name === 'edit_file') {
      const s = diffStats(String(args.old_str ?? ''), String(args.new_str ?? ''));
      extra = `<span class="stat"><span class="add">+${s.added}</span><span class="del">−${s.removed}</span></span>`;
    }
    return `<div class="tool ${failed ? 'failed' : ''}" data-tool="${idx}"><div class="tool-head">${icon(TOOL_ICON[name] || 'terminal', 'ti')}<span class="tool-label">${esc(TOOL_LABEL[name] || name)}</span><span class="path">${target}</span>${extra}${status}${icon('chev-right', 'chev')}</div><div class="tool-body"></div></div>`;
  }

  function fillToolBody(idx, bodyEl) {
    const { tc, args, result } = toolData[idx];
    const name = tc.function.name;
    let html = '';
    if (name === 'write_file') {
      html += `<pre>${highlight(String(args.content ?? ''), langFromPath(args.path || ''))}</pre>`;
    } else if (name === 'edit_file') {
      html += `<div class="tool-diff">${renderDiffTable(String(args.old_str ?? ''), String(args.new_str ?? ''), langFromPath(args.path || ''), 99)}</div>`;
    } else if (result) {
      const out = String(result.content || '');
      html += `<pre>${name === 'read_file' ? highlight(out.slice(0, 20000), langFromPath(args.path || '')) : esc(out.slice(0, 20000))}${out.length > 20000 ? '\n…' : ''}</pre>`;
    }
    if (result && (name === 'write_file' || name === 'edit_file' || name === 'delete_file') && result._ok === false) {
      html += `<div class="label">结果</div><pre>${esc(result.content)}</pre>`;
    }
    bodyEl.innerHTML = html || `<pre>${esc(result?.content || '无输出')}</pre>`;
  }

  // —— 消息 ——
  const nearBottom = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 140;
  const toBottom = () => (msgs.scrollTop = msgs.scrollHeight);

  function changesCard() {
    const paths = Object.keys(task.changes || {}).sort();
    if (!paths.length || running()) return '';
    const rows = paths
      .map((p) => {
        const c = task.changes[p];
        const s = diffStats(c.before ?? '', c.after ?? '');
        const tag = c.before == null ? '<span class="tag-new">新建</span>' : c.after == null ? '<span class="tag-del">删除</span>' : '';
        return `<button class="cc-row" data-open-change="${esc(p)}">${icon('file')}<span class="cc-path">${esc(p)}</span>${tag}<span class="stat"><span class="add">+${s.added}</span><span class="del">−${s.removed}</span></span></button>`;
      })
      .join('');
    return `<div class="changes-card">
      <div class="cc-head">${icon('diff')}<span class="grow">已修改 ${paths.length} 个文件 ${statsHtml(task.stats)}</span>
        <button class="btn ghost sm" data-open-change="">查看变更</button>
        <button class="btn ghost sm" data-panel="preview">${icon('eye')}预览</button>
        <span class="menu">
          <button class="btn soft sm" data-dl-menu>${icon('download')}下载</button>
          <span class="menu-pop right hidden dl-pop">
            <button class="menu-item" data-act="dl-all">${icon('folder')}<span class="grow">整个项目</span><span class="muted">ZIP</span></button>
            <button class="menu-item" data-act="dl-changed">${icon('diff')}<span class="grow">只下载修改过的文件</span><span class="muted">ZIP</span></button>
          </span>
        </span>
      </div>
      <div class="cc-files">${rows}</div>
    </div>`;
  }

  function renderMessages(forceBottom = false) {
    const stick = forceBottom || nearBottom();
    toolData.length = 0;
    const results = new Map();
    for (const m of task.history) if (m.role === 'tool') results.set(m.tool_call_id, m);
    const out = [];
    for (const m of task.history) {
      if (m.role === 'user') {
        const { text, images, files } = userParts(m);
        out.push(`<div class="msg user"><div class="bubble">
          ${images.length ? `<div class="msg-images">${images.map((src, i) => `<img src="${esc(src)}" alt="图片 ${i + 1}" data-zoom>`).join('')}</div>` : ''}
          ${files.length ? `<div class="msg-files">${files.map((f) => `<span class="msg-file">${icon('paperclip')}${esc(f.name)}</span>`).join('')}</div>` : ''}
          ${text ? `<div class="msg-text">${esc(text)}</div>` : ''}
        </div></div>`);
      } else if (m.role === 'assistant') {
        let inner = '';
        if (m._reasoning) inner += `<details class="reasoning"><summary>${icon('sparkle')}思考过程</summary><div class="r-body">${esc(m._reasoning)}</div></details>`;
        if (m.content) inner += `<div class="content md">${renderMarkdown(m.content)}</div>`;
        if (m._partial) inner += `<div class="muted" style="font-size:12px">（回复未完成）</div>`;
        if (m.tool_calls?.length) inner += `<div class="tool-group">${m.tool_calls.map((tc) => toolHtml(tc, results.get(tc.id))).join('')}</div>`;
        if (inner) out.push(`<div class="msg assistant">${inner}</div>`);
      }
    }
    if (running()) out.push('<div class="msg assistant streaming"></div>');
    else {
      out.push(changesCard());
      if (task.status === 'failed') {
        out.push(`<div class="error-box">运行失败：${esc(task.error || '未知错误')}<div style="margin-top:8px"><button class="btn sm" data-act="retry">${icon('refresh')}重试</button></div></div>`);
      } else if (task.status === 'stopped') {
        out.push(`<div class="stopped-note">已停止${task.error ? '：' + esc(task.error) : ''}</div>`);
      }
    }
    thread.innerHTML = out.join('');
    renderStreaming();
    if (stick) toBottom();
  }

  let streamRaf = 0;
  function renderStreaming() {
    streamRaf = 0;
    const box = $(thread, '.streaming');
    if (!box) return;
    const stick = nearBottom();
    const last = task.history[task.history.length - 1];
    const label = last?.role === 'tool' ? '正在处理' : '思考中';
    if (!partial || (!partial.text && !partial.reasoning)) {
      box.innerHTML = `<div class="thinking"><span class="shimmer">${label}…</span></div>`;
    } else {
      let html = '';
      if (partial.reasoning) {
        html += `<details class="reasoning" ${partial.text ? '' : 'open'}><summary>${icon('sparkle')}${partial.text ? '思考过程' : '<span class="shimmer">正在思考…</span>'}</summary><div class="r-body">${esc(partial.reasoning)}</div></details>`;
      }
      if (partial.text) html += `<div class="content md">${renderMarkdown(partial.text)}<span class="cursor"></span></div>`;
      box.innerHTML = html;
      const rb = $(box, 'details[open] .r-body');
      if (rb) rb.scrollTop = rb.scrollHeight;
    }
    if (stick) toBottom();
  }
  const scheduleStream = () => {
    if (!streamRaf) streamRaf = requestAnimationFrame(renderStreaming);
  };

  // —— 右侧面板 ——
  function setPanel(open, tab) {
    panelOpen = open;
    if (tab) panelTab = tab;
    prefs.set('panelOpen', panelOpen);
    prefs.set('panelTab', panelTab);
    layout.classList.toggle('panel-open', panelOpen);
    container.querySelectorAll('[data-panel]').forEach((b) => b.classList.toggle('active', panelOpen && b.dataset.panel === panelTab));
    renderPanel();
  }

  function renderPanel() {
    container.querySelectorAll('[data-pt]').forEach((b) => b.classList.toggle('active', b.dataset.pt === panelTab));
    if (panelInst?.destroy) panelInst.destroy();
    panelInst = null;
    if (!panelOpen) {
      panelBody.innerHTML = '';
      return;
    }
    if (!project) {
      panelBody.innerHTML = `<div class="empty">项目不存在或已被删除</div>`;
      return;
    }
    if (panelTab === 'changes') {
      renderChanges(panelBody, task.changes, {
        readOnly: running(),
        onRevert: (p) => revert([p]),
        onRevertAll: () => revert(null),
      });
      if (focusPath) {
        const target = panelBody.querySelector(`.diff-file[data-path="${CSS.escape(focusPath)}"]`);
        if (target) {
          panelBody.querySelectorAll('.diff-file').forEach((f) => f.classList.toggle('collapsed', f !== target));
          target.scrollIntoView({ block: 'start' });
        }
        focusPath = null;
      }
    } else if (panelTab === 'files') {
      panelInst = mountFileBrowser(panelBody, { getFiles: () => project.files, getMarks: () => new Set(Object.keys(task.changes || {})) });
    } else {
      panelInst = mountPreviewPanel(panelBody, { getFiles: () => project.files });
    }
  }

  let panelTimer = 0;
  function refreshPanelSoon() {
    if (!panelOpen) return;
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => {
      if (panelTab === 'changes') renderPanel();
      else panelInst?.refresh();
    }, 400);
  }

  async function revert(paths) {
    const ok = await confirmDialog(paths ? `撤销对 ${paths[0]} 的修改？` : '撤销此任务对所有文件的修改？文件会恢复到任务开始前的状态。', { danger: true, okText: '撤销' });
    if (!ok) return;
    try {
      task = await api.post(`/api/tasks/${id}/revert`, { paths: paths || [] });
      await loadProject();
      renderAll();
      renderPanel();
      toast('已撤销修改', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // —— 交互 ——
  container.addEventListener('click', async (e) => {
    const t = e.target;
    const head = t.closest('.tool-head');
    if (head) {
      const tool = head.parentElement;
      tool.classList.toggle('open');
      const body = $(tool, '.tool-body');
      if (tool.classList.contains('open') && !body.innerHTML) fillToolBody(+tool.dataset.tool, body);
      return;
    }
    const zoom = t.closest('[data-zoom]');
    if (zoom) {
      modal({ title: '图片', body: `<img src="${esc(zoom.src)}" style="max-width:100%;border-radius:10px;display:block">`, width: '920px', actions: [{ label: '关闭' }] });
      return;
    }
    const openChange = t.closest('[data-open-change]');
    if (openChange) {
      focusPath = openChange.dataset.openChange || null;
      return setPanel(true, 'changes');
    }
    const pb = t.closest('[data-panel]');
    if (pb) {
      const tab = pb.dataset.panel;
      return setPanel(!(panelOpen && panelTab === tab), tab);
    }
    const pt = t.closest('[data-pt]');
    if (pt) return setPanel(true, pt.dataset.pt);
    const dlMenu = t.closest('[data-dl-menu]');
    if (dlMenu) {
      e.stopPropagation();
      const pop = dlMenu.nextElementSibling;
      pop.classList.toggle('hidden');
      return;
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (!act) return;
    morePop.classList.add('hidden');
    container.querySelectorAll('.dl-pop').forEach((p) => p.classList.add('hidden'));
    if (act === 'dl-all' || act === 'dl-changed') {
      if (!project) return toast('项目不存在或已被删除', 'error');
      let files = project.files;
      if (act === 'dl-changed') {
        files = {};
        for (const [p, c] of Object.entries(task.changes || {})) if (c.after != null && p in project.files) files[p] = project.files[p];
      }
      if (!Object.keys(files).length) return toast('没有可下载的文件', 'error');
      downloadZip(project.name, files, act === 'dl-changed' ? '-修改的文件' : '');
      return toast(`已打包 ${Object.keys(files).length} 个文件`, 'success');
    }
    if (act === 'close-panel') setPanel(false);
    else if (act === 'retry') {
      try {
        task = await api.post(`/api/tasks/${id}/retry`, {});
        partial = null;
        renderAll(true);
        subscribe();
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (act === 'rename') rename();
    else if (act === 'archive') {
      const r = await api.patch(`/api/tasks/${id}`, { archived: !task.archived });
      task.archived = r.archived;
      renderHeader();
      window.dispatchEvent(new Event('rty:refresh-sidebar'));
      toast(r.archived ? '已归档' : '已取消归档');
    } else if (act === 'delete') {
      if (!(await confirmDialog('删除这个任务？对话记录将被删除，已写入项目的文件会保留。', { danger: true, okText: '删除' }))) return;
      await api.del(`/api/tasks/${id}`);
      window.dispatchEvent(new Event('rty:refresh-sidebar'));
      toast('已删除');
      navigate('#/');
    }
  });

  async function rename() {
    const t = await promptDialog('重命名任务', { value: task.title });
    if (!t) return;
    await api.patch(`/api/tasks/${id}`, { title: t });
    task.title = t;
    renderHeader();
    window.dispatchEvent(new Event('rty:refresh-sidebar'));
  }
  $(container, '.title').onclick = rename;

  // —— 事件流 ——
  function applyChangesLocally(changes) {
    if (!project) return;
    for (const [p, c] of Object.entries(changes || {})) {
      if (c.after == null) delete project.files[p];
      else project.files[p] = c.after;
    }
  }

  function onEvent(ev) {
    switch (ev.type) {
      case 'snapshot':
        task = ev.task;
        partial = ev.partial ? { ...ev.partial } : null;
        renderAll();
        break;
      case 'assistant_start':
        partial = { text: '', reasoning: '' };
        scheduleStream();
        break;
      case 'delta':
        partial ||= { text: '', reasoning: '' };
        partial.text += ev.text;
        scheduleStream();
        break;
      case 'reasoning':
        partial ||= { text: '', reasoning: '' };
        partial.reasoning += ev.text;
        scheduleStream();
        break;
      case 'message':
        task.history.push(ev.message);
        if (ev.message.role === 'assistant') partial = null;
        renderMessages();
        break;
      case 'changes':
        task.changes = ev.changes;
        task.stats = ev.stats;
        applyChangesLocally(ev.changes);
        renderHeader();
        refreshPanelSoon();
        break;
      case 'end':
        task = ev.task;
        partial = null;
        renderAll();
        window.dispatchEvent(new Event('rty:refresh-sidebar'));
        loadProject().then(() => !destroyed && renderPanel());
        break;
    }
  }

  function subscribe() {
    if (abort) abort.abort();
    abort = new AbortController();
    const my = abort;
    streamEvents(`/api/tasks/${id}/events`, onEvent, my.signal)
      .catch((e) => {
        if (e.name === 'AbortError' || destroyed) return;
        console.warn(e);
      })
      .finally(() => {
        // 连接意外断开且任务仍在运行时自动重连
        if (!destroyed && my === abort && running()) setTimeout(() => !destroyed && my === abort && subscribe(), 1500);
      });
  }

  function renderAll(forceBottom = false) {
    renderHeader();
    renderMessages(forceBottom);
  }

  await loadProject();
  renderAll(true);
  setPanel(panelOpen && !!Object.keys(task.changes || {}).length ? true : false, panelTab);
  if (running()) subscribe();
  else composer.focus();

  return () => {
    destroyed = true;
    if (abort) abort.abort();
    clearTimeout(panelTimer);
    if (panelInst?.destroy) panelInst.destroy();
  };
}
