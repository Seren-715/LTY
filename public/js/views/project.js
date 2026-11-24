// 项目详情：文件树 + 代码编辑器 + 预览
import { api } from '../api.js';
import { esc, el, $, icon, toast, modal, confirmDialog, promptDialog } from '../ui.js';
import { state, loadProjects, prefs, navigate } from '../state.js';
import { renderTree, mountPreviewPanel } from '../components.js';
import { deleteProject } from './projects.js';
import { highlight, langFromPath } from '../highlight.js';
import { htmlEntries } from '../preview.js';
import { downloadZip, downloadFile } from '../zip.js';

const TEXT_EXT = /\.(html?|css|scss|less|js|mjs|cjs|jsx|ts|tsx|json|md|txt|py|java|go|rs|c|h|cpp|hpp|cs|php|rb|sh|bash|yml|yaml|toml|ini|env|xml|svg|vue|svelte|sql|kt|swift|dart|lua|r|gitignore|editorconfig|csv)$/i;

export async function projectView(container, id) {
  let project = await api.get(`/api/projects/${id}`);
  let active = null;
  const drafts = {}; // path -> 未保存的内容
  const collapsed = new Set();
  let showPreview = prefs.get('projPreview', false);
  let previewInst = null;

  container.innerHTML = `<div class="project-page">
    <header class="task-header">
      <a class="btn ghost icon" href="#/projects" title="返回">${icon('back')}</a>
      <span class="proj-icon">${icon('folder')}</span>
      <h2 class="pname" title="项目设置"></h2>
      <span class="muted pdesc" style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px"></span>
      <span class="spacer"></span>
      <button class="btn sm primary" data-act="task">${icon('sparkle')}新建任务</button>
      <button class="btn sm" data-act="preview">${icon('eye')}<span>预览</span></button>
      <button class="btn sm" data-act="zip">${icon('download')}下载 ZIP</button>
      <button class="btn sm ghost" data-act="settings">${icon('settings')}设置</button>
    </header>
    <div class="project-body">
      <aside class="side">
        <div class="side-head"><span class="grow">文件</span>
          <button class="btn ghost icon sm" data-act="new-file" title="新建文件">${icon('file-plus')}</button>
          <button class="btn ghost icon sm" data-act="upload" title="上传文件">${icon('upload')}</button>
          <input type="file" multiple class="hidden up-input">
        </div>
        <div class="tree"></div>
      </aside>
      <section class="editor-pane"></section>
      <section class="preview-pane hidden"></section>
    </div>
  </div>`;

  const tree = $(container, '.tree');
  const pane = $(container, '.editor-pane');
  const previewPane = $(container, '.preview-pane');
  const body = $(container, '.project-body');

  const renderHead = () => {
    $(container, '.pname').textContent = project.name;
    $(container, '.pdesc').textContent = project.description || '';
    document.title = `${project.name} · ${state.config.siteName}`;
  };

  const currentContent = (p) => (p in drafts ? drafts[p] : project.files[p]);

  const renderFileTree = () =>
    renderTree(tree, project.files, {
      active,
      collapsed,
      marks: new Set(Object.keys(drafts)),
      onSelect: (p) => open(p),
    });

  function open(p) {
    active = p;
    renderFileTree();
    renderEditor();
  }

  function renderEditor() {
    if (!active || !(active in project.files)) {
      const n = Object.keys(project.files).length;
      pane.innerHTML = `<div class="empty" style="margin:auto">${icon('file')}<div>${n ? '从左侧选择一个文件' : '项目还没有文件'}</div>
        <div class="row" style="justify-content:center;margin-top:12px"><button class="btn sm" data-act="new-file">${icon('file-plus')}新建文件</button><button class="btn sm primary" data-act="task">${icon('sparkle')}让智能体来写</button></div></div>`;
      return;
    }
    const path = active;
    pane.innerHTML = `<div class="viewer-head">${icon('file')}<span class="grow" style="overflow:hidden;text-overflow:ellipsis">${esc(path)}</span>
        <span class="dirty-dot hidden" title="未保存"></span>
        <span class="muted pos" style="font-size:12px"></span>
        <button class="btn ghost sm" data-act="dl-file" title="下载此文件">${icon('download')}</button>
        <button class="btn ghost sm" data-act="rename" title="重命名">${icon('edit')}</button>
        <button class="btn ghost sm" data-act="delete-file" title="删除">${icon('trash')}</button>
        <button class="btn sm primary" data-act="save" title="保存 (Ctrl+S)">${icon('save')}保存</button>
      </div>
      <div class="editor"><div class="gutter"></div><div class="area"><pre aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></div></div>`;
    const taEl = $(pane, 'textarea');
    const pre = $(pane, 'pre');
    const gutter = $(pane, '.gutter');
    const dot = $(pane, '.dirty-dot');
    const pos = $(pane, '.pos');
    const lang = langFromPath(path);
    taEl.value = currentContent(path);

    const paint = () => {
      const v = taEl.value;
      pre.innerHTML = highlight(v, lang) + '\n';
      const n = v.split('\n').length;
      gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
      dot.classList.toggle('hidden', !(path in drafts));
    };
    const sync = () => {
      pre.scrollTop = taEl.scrollTop;
      pre.scrollLeft = taEl.scrollLeft;
      gutter.scrollTop = taEl.scrollTop;
    };
    const updatePos = () => {
      const before = taEl.value.slice(0, taEl.selectionStart);
      const line = before.split('\n').length;
      const col = before.length - before.lastIndexOf('\n');
      pos.textContent = `行 ${line}，列 ${col}`;
    };
    let raf = 0;
    taEl.addEventListener('input', () => {
      if (taEl.value === project.files[path]) delete drafts[path];
      else drafts[path] = taEl.value;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          paint();
          sync();
          renderFileTree();
        });
    });
    taEl.addEventListener('scroll', sync);
    taEl.addEventListener('keyup', updatePos);
    taEl.addEventListener('click', updatePos);
    taEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.isComposing) {
        e.preventDefault();
        const s = taEl.selectionStart;
        const en = taEl.selectionEnd;
        if (e.shiftKey) {
          const lineStart = taEl.value.lastIndexOf('\n', s - 1) + 1;
          if (taEl.value.slice(lineStart, lineStart + 2) === '  ') {
            taEl.setRangeText('', lineStart, lineStart + 2, 'preserve');
          }
        } else taEl.setRangeText('  ', s, en, 'end');
        taEl.dispatchEvent(new Event('input'));
      } else if (e.key === 'Enter' && !e.isComposing) {
        // 保持缩进
        const s = taEl.selectionStart;
        const lineStart = taEl.value.lastIndexOf('\n', s - 1) + 1;
        const indent = taEl.value.slice(lineStart, s).match(/^[ \t]*/)[0];
        if (indent) {
          e.preventDefault();
          taEl.setRangeText('\n' + indent, s, taEl.selectionEnd, 'end');
          taEl.dispatchEvent(new Event('input'));
        }
      }
    });
    paint();
    updatePos();
    taEl.focus();
  }

  async function saveFiles(paths) {
    const files = {};
    for (const p of paths) files[p] = drafts[p];
    const r = await api.put(`/api/projects/${id}/files`, { files });
    project.files = r.files;
    for (const p of paths) delete drafts[p];
    renderFileTree();
    if (active) $(pane, '.dirty-dot')?.classList.add('hidden');
    previewInst?.refresh();
  }

  async function save() {
    if (!active || !(active in drafts)) return toast('没有需要保存的修改');
    try {
      await saveFiles([active]);
      toast('已保存', 'success', 1200);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function newFile() {
    const dir = active && active.includes('/') ? active.slice(0, active.lastIndexOf('/') + 1) : '';
    const p = await promptDialog('新建文件', { label: '文件路径（可包含目录，例如 src/app.js）', value: dir, placeholder: 'index.html' });
    if (!p) return;
    if (p in project.files) return open(p);
    try {
      const r = await api.put(`/api/projects/${id}/files`, { files: { [p]: '' } });
      project.files = r.files;
      const created = Object.keys(r.files).find((k) => k === p.replace(/^\.?\/+/, '')) || p;
      open(created);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function upload(fileList) {
    const files = {};
    const skipped = [];
    for (const f of fileList) {
      if (!TEXT_EXT.test(f.name) && f.type && !f.type.startsWith('text/') && f.type !== 'application/json') {
        skipped.push(f.name);
        continue;
      }
      if (f.size > (state.config.limits?.maxFileBytes || 1048576)) {
        skipped.push(f.name);
        continue;
      }
      const dir = active && active.includes('/') ? active.slice(0, active.lastIndexOf('/') + 1) : '';
      files[dir + (f.webkitRelativePath || f.name)] = await f.text();
    }
    if (skipped.length) toast(`已跳过非文本或过大的文件：${skipped.join('、')}`, 'error', 4000);
    if (!Object.keys(files).length) return;
    try {
      const r = await api.put(`/api/projects/${id}/files`, { files });
      project.files = r.files;
      renderFileTree();
      open(Object.keys(files)[0]);
      toast(`已上传 ${Object.keys(files).length} 个文件`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function settingsDialog() {
    const b = el(`<div>
      <div class="field"><label>项目名称</label><input class="input" name="name" maxlength="60"></div>
      <div class="field"><label>简介</label><input class="input" name="desc" maxlength="500"></div>
      <div class="field"><label>自定义指令</label><textarea class="textarea" name="ins" rows="5" placeholder="例如：使用 TypeScript；代码注释使用中文；遵循 Airbnb 风格…"></textarea>
        <span class="hint">每次运行任务时都会发送给智能体。也可以在项目根目录放一个 AGENTS.md 文件。</span></div>
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:6px" class="row"><span class="grow muted" style="font-size:13px">删除项目会同时删除其中所有文件和任务</span><button class="btn sm danger" data-del>${icon('trash')}删除项目</button></div>
    </div>`);
    $(b, '[name=name]').value = project.name;
    $(b, '[name=desc]').value = project.description || '';
    $(b, '[name=ins]').value = project.instructions || '';
    const m = modal({
      title: '项目设置',
      body: b,
      width: '520px',
      actions: [
        { label: '取消' },
        {
          label: '保存',
          primary: true,
          onClick: async () => {
            const r = await api.patch(`/api/projects/${id}`, {
              name: $(b, '[name=name]').value,
              description: $(b, '[name=desc]').value,
              instructions: $(b, '[name=ins]').value,
            });
            Object.assign(project, { name: r.name, description: r.description, instructions: $(b, '[name=ins]').value });
            renderHead();
            toast('已保存', 'success');
          },
        },
      ],
    });
    $(b, '[data-del]').onclick = async () => {
      m.close();
      const p = state.projects.find((x) => x.id === id) || { id, name: project.name, fileCount: Object.keys(project.files || {}).length };
      if (!(await deleteProject(p))) return;
      navigate('#/projects');
    };
  }

  function togglePreview(on) {
    showPreview = on;
    prefs.set('projPreview', on);
    previewPane.classList.toggle('hidden', !on);
    body.classList.toggle('with-preview', on);
    $(container, '[data-act="preview"] span').textContent = on ? '关闭预览' : '预览';
    if (on && !previewInst) previewInst = mountPreviewPanel(previewPane, { getFiles: () => ({ ...project.files, ...drafts }) });
    if (!on && previewInst) {
      previewInst.destroy();
      previewInst = null;
      previewPane.innerHTML = '';
    }
  }

  container.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'save') save();
    else if (act === 'new-file') newFile();
    else if (act === 'upload') $(container, '.up-input').click();
    else if (act === 'settings') settingsDialog();
    else if (act === 'preview') togglePreview(!showPreview);
    else if (act === 'zip') {
      if (!Object.keys(project.files).length) return toast('项目没有文件');
      downloadZip(project.name, { ...project.files, ...drafts });
    } else if (act === 'dl-file') {
      if (active) downloadFile(active, currentContent(active));
    } else if (act === 'task') {
      prefs.set('projectId', id);
      navigate('#/');
    } else if (act === 'rename') {
      const to = await promptDialog('重命名 / 移动文件', { value: active });
      if (!to || to === active) return;
      try {
        if (active in drafts) await saveFiles([active]);
        const r = await api.post(`/api/projects/${id}/rename`, { from: active, to });
        project.files = r.files;
        open(Object.keys(r.files).find((k) => k === to.replace(/^\.?\/+/, '')) || to);
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (act === 'delete-file') {
      if (!(await confirmDialog(`删除文件 ${active}？`, { danger: true, okText: '删除' }))) return;
      try {
        const r = await api.put(`/api/projects/${id}/files`, { delete: [active] });
        project.files = r.files;
        delete drafts[active];
        active = null;
        renderFileTree();
        renderEditor();
        previewInst?.refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  $(container, '.pname').onclick = settingsDialog;
  $(container, '.up-input').onchange = (e) => {
    upload([...e.target.files]);
    e.target.value = '';
  };

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };
  document.addEventListener('keydown', onKey);
  const onBeforeUnload = (e) => {
    if (Object.keys(drafts).length) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  // 拖拽上传
  pane.addEventListener('dragover', (e) => e.preventDefault());
  tree.addEventListener('dragover', (e) => e.preventDefault());
  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) upload([...e.dataTransfer.files]);
  };
  pane.addEventListener('drop', onDrop);
  tree.addEventListener('drop', onDrop);

  renderHead();
  active = htmlEntries(project.files)[0] || Object.keys(project.files).sort()[0] || null;
  renderFileTree();
  renderEditor();
  if (showPreview) togglePreview(true);

  return () => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onBeforeUnload);
    previewInst?.destroy();
    if (Object.keys(drafts).length) toast('有未保存的修改已丢弃', 'error');
  };
}
