// 任务详情：左侧对话，右侧 变更 / 文件 / 预览
import { api, streamEvents } from '../api.js';
import { esc, $, icon, toast, statusBadge, statsHtml, autosize, confirmDialog, promptDialog, formatDate } from '../ui.js';
import { state, loadConfig, prefs, navigate } from '../state.js';
import { renderMarkdown } from '../markdown.js';
import { highlight, langFromPath } from '../highlight.js';
import { renderDiffTable } from '../diff.js';
import { renderChanges, mountFileBrowser, mountPreviewPanel } from '../components.js';
import { modelOptions } from './home.js';

const TOOL_LABEL = {
  list_files: '列出文件',
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

export async function taskView(container, id) {
  if (!state.config) await loadConfig();
  let task = await api.get(`/api/tasks/${id}`);
  let project = null;
  let partial = null;
  let destroyed = false;
  let abort = null;
  let panelTab = prefs.get('panelTab', 'changes');
  let followMode = task.mode;
  let panelInst = null;
  const toolData = [];

  container.innerHTML = `<div class="task-page">
    <header class="task-header">
      <a class="btn ghost icon" href="#/" title="返回">${icon('back')}</a>
      <h2 class="title" title="点击重命名"></h2>
      <div class="row meta" style="flex-wrap:wrap"></div>
      <span class="spacer"></span>
      <div class="row actions"></div>
    </header>
    <div class="task-body">
      <section class="conv">
        <div class="messages"></div>
        <div class="composer followup">
          <textarea rows="1" placeholder="继续对话，或让智能体修改…（Enter 发送，Shift+Enter 换行）"></textarea>
          <div class="composer-bar">
            <div class="segmented">
              <button data-fm="ask">${icon('chat')}提问</button>
              <button data-fm="code">${icon('code')}编码</button>
            </div>
            <select class="select pill-select model" title="模型"></select>
            <span class="spacer"></span>
            <button class="send-btn" title="发送">${icon('arrow-up')}</button>
          </div>
        </div>
      </section>
      <aside class="panel">
        <div class="panel-tabs">
          <button class="tab" data-pt="changes">${icon('diff')} 变更<span class="count c-changes"></span></button>
          <button class="tab" data-pt="files">${icon('folder')} 文件</button>
          <button class="tab" data-pt="preview">${icon('eye')} 预览</button>
          <span class="spacer"></span>
          <a class="btn ghost sm proj-link" title="在项目中打开">${icon('external')}打开项目</a>
        </div>
        <div class="panel-body"></div>
      </aside>
    </div>
  </div>`;

  const msgs = $(container, '.messages');
  const ta = $(container, '.followup textarea');
  const fit = autosize(ta, 220);
  const sendBtn = $(container, '.send-btn');
  const modelSel = $(container, '.followup .model');
  const panelBody = $(container, '.panel-body');
  const running = () => task.status === 'running' || task.status === 'queued';

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
    $(container, '.meta').innerHTML = `
      ${statusBadge(task.status)}
      <span class="badge mode">${icon('folder')}${esc(task.projectName)}</span>
      <span class="badge mode">${task.mode === 'ask' ? '提问' : '编码'}</span>
      ${task.model ? `<span class="badge mode mono" style="font-size:11.5px">${esc(task.model)}</span>` : ''}
      ${statsHtml(task.stats)}`;
    $(container, '.actions').innerHTML = `
      ${running() ? `<button class="btn sm" data-act="stop">${icon('stop')}停止</button>` : ''}
      <button class="btn sm ghost" data-act="archive" title="${task.archived ? '取消归档' : '归档'}">${icon(task.archived ? 'unarchive' : 'archive')}${task.archived ? '取消归档' : '归档'}</button>
      <button class="btn sm ghost" data-act="delete" title="删除任务">${icon('trash')}</button>`;
    $(container, '.proj-link').href = `#/projects/${task.projectId}`;
    const n = Object.keys(task.changes || {}).length;
    $(container, '.c-changes').textContent = n ? n : '';
    sendBtn.classList.toggle('stop', running());
    sendBtn.innerHTML = running() ? icon('stop') : icon('arrow-up');
    sendBtn.title = running() ? '停止' : '发送';
  }

  // —— 消息 ——
  function toolHtml(tc, result) {
    const args = parseArgs(tc.function.arguments);
    const name = tc.function.name;
    const idx = toolData.push({ tc, args, result }) - 1;
    const target = args.path ? esc(args.path) : args.query ? `“${esc(args.query)}”` : '';
    let status;
    if (!result) status = running() ? '<span class="spin" style="color:var(--primary)"></span>' : '<span class="err-dot"></span>';
    else status = result._ok === false || /^错误[：:]/.test(result.content) ? '<span class="err-dot" title="失败"></span>' : '<span class="ok-dot"></span>';
    let extra = '';
    if (result && /^已(创建|更新|编辑|删除)/.test(result.content)) extra = `<span class="muted" style="font-size:12px;white-space:nowrap">${esc(result.content.replace(/^.*?（/, '（'))}</span>`;
    return `<div class="tool" data-tool="${idx}"><div class="tool-head">${icon('chev-right', 'chev')}${icon(TOOL_ICON[name] || 'terminal')}<span>${esc(TOOL_LABEL[name] || name)}</span><span class="path grow">${target}</span>${extra}${status}</div><div class="tool-body"></div></div>`;
  }

  function fillToolBody(idx, bodyEl) {
    const { tc, args, result } = toolData[idx];
    const name = tc.function.name;
    let html = '';
    if (name === 'write_file') {
      html += `<div class="label">内容</div><pre>${highlight(String(args.content ?? ''), langFromPath(args.path || ''))}</pre>`;
    } else if (name === 'edit_file') {
      html += `<div class="label">修改</div><div style="border:1px solid var(--border);border-radius:8px;overflow:auto;background:#fff;max-height:320px">${renderDiffTable(String(args.old_str ?? ''), String(args.new_str ?? ''), langFromPath(args.path || ''), 99)}</div>`;
    } else if (Object.keys(args).length) {
      html += `<div class="label">参数</div><pre>${esc(JSON.stringify(args, null, 2))}</pre>`;
    }
    if (result && name !== 'write_file') {
      const out = String(result.content || '');
      html += `<div class="label">结果</div><pre>${name === 'read_file' ? highlight(out.slice(0, 20000), langFromPath(args.path || '')) : esc(out.slice(0, 20000))}${out.length > 20000 ? '\n…' : ''}</pre>`;
    } else if (result) {
      html += `<div class="label">结果</div><pre>${esc(result.content)}</pre>`;
    }
    bodyEl.innerHTML = html || '<span class="muted">无</span>';
  }

  const nearBottom = () => msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
  const toBottom = () => (msgs.scrollTop = msgs.scrollHeight);

  function renderMessages(forceBottom = false) {
    const stick = forceBottom || nearBottom();
    toolData.length = 0;
    const results = new Map();
    for (const m of task.history) if (m.role === 'tool') results.set(m.tool_call_id, m);
    const out = [];
    for (const m of task.history) {
      if (m.role === 'user') {
        out.push(`<div class="msg user"><div class="bubble"><span class="mode-tag">${m._mode === 'ask' ? '提问' : '编码'}${m._at ? ' · ' + formatDate(m._at) : ''}</span>${esc(m.content)}</div></div>`);
      } else if (m.role === 'assistant') {
        let inner = '';
        if (m._reasoning) inner += `<details class="reasoning"><summary>${icon('sparkle')}查看思考过程</summary><div class="r-body">${esc(m._reasoning)}</div></details>`;
        if (m.content) inner += `<div class="content md">${renderMarkdown(m.content)}</div>`;
        if (m._partial) inner += `<div class="muted" style="font-size:12px">（回复未完成）</div>`;
        for (const tc of m.tool_calls || []) inner += toolHtml(tc, results.get(tc.id));
        if (inner) out.push(`<div class="msg assistant">${inner}</div>`);
      }
    }
    if (running()) out.push('<div class="msg assistant streaming"></div>');
    else if (task.status === 'failed') {
      out.push(`<div class="error-box">${icon('x')} 运行失败：${esc(task.error || '未知错误')}</div><div style="margin:-6px 0 16px"><button class="btn sm" data-act="retry">${icon('refresh')}重试</button></div>`);
    } else if (task.status === 'stopped') {
      out.push(`<div class="muted" style="font-size:13px;margin-bottom:16px">⏹ 已停止${task.error ? '：' + esc(task.error) : ''}</div>`);
    }
    if (!task.history.length) out.push('<div class="empty">暂无消息</div>');
    msgs.innerHTML = out.join('');
    renderStreaming();
    if (stick) toBottom();
  }

  let streamRaf = 0;
  function renderStreaming() {
    streamRaf = 0;
    const box = $(msgs, '.streaming');
    if (!box) return;
    const stick = nearBottom();
    const last = task.history[task.history.length - 1];
    const label = last?.role === 'tool' ? '正在处理工具结果' : '思考中';
    if (!partial || (!partial.text && !partial.reasoning)) {
      box.innerHTML = `<div class="thinking"><span class="spin" style="color:var(--primary)"></span><span class="shimmer">${label}</span></div>`;
    } else {
      let html = '';
      if (partial.reasoning) {
        html += `<details class="reasoning" ${partial.text ? '' : 'open'}><summary>${icon('sparkle')}${partial.text ? '查看思考过程' : '<span class="shimmer">正在思考…</span>'}</summary><div class="r-body">${esc(partial.reasoning)}</div></details>`;
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

  msgs.addEventListener('click', async (e) => {
    const head = e.target.closest('.tool-head');
    if (head) {
      const tool = head.parentElement;
      tool.classList.toggle('open');
      const body = $(tool, '.tool-body');
      if (tool.classList.contains('open') && !body.innerHTML) fillToolBody(+tool.dataset.tool, body);
      return;
    }
    if (e.target.closest('[data-act="retry"]')) {
      try {
        task = await api.post(`/api/tasks/${id}/retry`, { model: modelSel.value });
        partial = null;
        renderAll(true);
        subscribe();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  // —— 右侧面板 ——
  function renderPanel() {
    container.querySelectorAll('[data-pt]').forEach((b) => b.classList.toggle('active', b.dataset.pt === panelTab));
    if (panelInst?.destroy) panelInst.destroy();
    panelInst = null;
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
    } else if (panelTab === 'files') {
      panelInst = mountFileBrowser(panelBody, { getFiles: () => project.files, getMarks: () => new Set(Object.keys(task.changes || {})) });
    } else {
      panelInst = mountPreviewPanel(panelBody, { getFiles: () => project.files });
    }
  }

  let panelTimer = 0;
  function refreshPanelSoon() {
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => {
      if (panelTab === 'changes') renderPanel();
      else panelInst?.refresh();
    }, 400);
  }

  async function revert(paths) {
    const ok = await confirmDialog(paths ? `撤销对 ${paths[0]} 的修改？` : '撤销此任务对所有文件的修改？此操作会把文件恢复到任务开始前的状态。', {
      danger: true,
      okText: '撤销',
    });
    if (!ok) return;
    try {
      task = await api.post(`/api/tasks/${id}/revert`, { paths: paths || [] });
      await loadProject();
      renderHeader();
      renderPanel();
      toast('已撤销修改', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  container.querySelectorAll('[data-pt]').forEach(
    (b) =>
      (b.onclick = () => {
        panelTab = b.dataset.pt;
        prefs.set('panelTab', panelTab);
        renderPanel();
      }),
  );

  // —— 头部操作 ——
  $(container, '.title').onclick = async () => {
    const t = await promptDialog('重命名任务', { value: task.title });
    if (!t) return;
    await api.patch(`/api/tasks/${id}`, { title: t });
    task.title = t;
    renderHeader();
  };
  $(container, '.actions').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'stop') {
      await api.post(`/api/tasks/${id}/stop`).catch((err) => toast(err.message, 'error'));
    } else if (act === 'archive') {
      const r = await api.patch(`/api/tasks/${id}`, { archived: !task.archived });
      task.archived = r.archived;
      renderHeader();
      toast(r.archived ? '已归档' : '已取消归档');
    } else if (act === 'delete') {
      if (!(await confirmDialog('删除这个任务？对话记录将被删除，但已写入项目的文件会保留。', { danger: true, okText: '删除' }))) return;
      await api.del(`/api/tasks/${id}`);
      toast('已删除');
      navigate('#/');
    }
  });

  // —— 追问 ——
  modelSel.innerHTML = modelOptions(state.config.models.includes(task.model) ? task.model : state.config.defaultModel);
  const syncMode = () => container.querySelectorAll('[data-fm]').forEach((b) => b.classList.toggle('active', b.dataset.fm === followMode));
  syncMode();
  container.querySelectorAll('[data-fm]').forEach(
    (b) =>
      (b.onclick = () => {
        followMode = b.dataset.fm;
        syncMode();
      }),
  );

  async function send() {
    if (running()) {
      await api.post(`/api/tasks/${id}/stop`).catch((err) => toast(err.message, 'error'));
      return;
    }
    const prompt = ta.value.trim();
    if (!prompt) return ta.focus();
    sendBtn.disabled = true;
    try {
      task = await api.post(`/api/tasks/${id}/messages`, { prompt, mode: followMode, model: modelSel.value });
      ta.value = '';
      fit();
      partial = null;
      renderAll(true);
      subscribe();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      sendBtn.disabled = false;
    }
  }
  sendBtn.onclick = send;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });

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
  renderPanel();
  if (running()) subscribe();
  if (!running()) setTimeout(() => ta.focus(), 50);

  return () => {
    destroyed = true;
    if (abort) abort.abort();
    clearTimeout(panelTimer);
    if (panelInst?.destroy) panelInst.destroy();
  };
}
