// 项目列表 + 新建项目弹窗
import { api } from '../api.js';
import { esc, el, $, icon, modal, timeAgo, confirmDialog, toast } from '../ui.js';
import { state, loadProjects, navigate, prefs } from '../state.js';
import { play, blurIn } from '../fx.js';

/** 删除项目（确认后执行）。返回是否已删除 */
export async function deleteProject(p) {
  const parts = [p.fileCount != null ? `${p.fileCount} 个文件` : '所有文件', p.taskCount ? `${p.taskCount} 个任务` : ''].filter(Boolean);
  const ok = await confirmDialog(
    `确定删除项目「${p.name}」？其中的 ${parts.join('和 ')}都会被删除，此操作不可恢复。`,
    { title: '删除项目', danger: true, okText: '删除' },
  );
  if (!ok) return false;
  await api.del(`/api/projects/${p.id}`);
  play('sigh');
  if (prefs.get('projectId') === p.id) prefs.set('projectId', null);
  await loadProjects();
  window.dispatchEvent(new Event('rty:refresh-sidebar'));
  toast(`项目「${p.name}」已删除`, 'success');
  return true;
}

export function newProjectDialog() {
  return new Promise((resolve) => {
    let template = 'web';
    const templates = state.config.templates || [{ id: 'blank', label: '空白项目' }];
    const body = el(`<div>
      <div class="field"><label>项目名称</label><input class="input" name="name" maxlength="60" placeholder="例如：个人博客"></div>
      <div class="field"><label>简介（可选）</label><input class="input" name="desc" maxlength="500" placeholder="一句话描述这个项目"></div>
      <div class="field"><label>初始模板</label><div class="template-grid">${templates
        .map((t) => `<button type="button" class="template-opt ${t.id === template ? 'active' : ''}" data-t="${esc(t.id)}">${esc(t.label)}</button>`)
        .join('')}</div></div>
    </div>`);
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      template = b.dataset.t;
      body.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
    });
    let created = null;
    const create = async () => {
      const name = $(body, '[name=name]').value.trim();
      if (!name) {
        $(body, '[name=name]').focus();
        throw new Error('请输入项目名称');
      }
      created = await api.post('/api/projects', { name, description: $(body, '[name=desc]').value.trim(), template });
      await loadProjects();
      resolve(created);
    };
    const m = modal({
      title: '新建项目',
      body,
      actions: [
        { label: '取消', onClick: () => resolve(null) },
        { label: '创建', primary: true, onClick: create },
      ],
    });
    $(body, '[name=name]').addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        try {
          await create();
          m.close();
        } catch {
          /* 已提示 */
        }
      }
    });
  });
}

export async function projectsView(container) {
  container.innerHTML = `<div class="page">
    <div class="page-head"><h1>项目</h1><span class="muted">每个项目是一个独立的代码仓库，智能体在其中读写文件</span><span class="spacer"></span>
      <button class="btn primary" data-act="new">${icon('plus')}新建项目</button></div>
    <div class="grid"></div>
  </div>`;
  const grid = $(container, '.grid');
  const render = () => {
    if (!state.projects.length) {
      grid.outerHTML = `<div class="empty card">${icon('folder')}<div>还没有项目</div><div style="margin-top:12px"><button class="btn primary" data-act="new">${icon('plus')}创建第一个项目</button></div></div>`;
      return;
    }
    grid.innerHTML = state.projects
      .map(
        (p) => `<a class="card" href="#/projects/${p.id}">
          <h3><span class="proj-icon">${icon('folder')}</span><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span><button class="icon-btn sm card-del" data-del-proj="${p.id}" title="删除项目">${icon('trash')}</button></h3>
          <div class="desc">${esc(p.description || '暂无简介')}</div>
          <div class="meta"><span>${p.fileCount} 个文件</span><span>${p.taskCount} 个任务</span><span class="spacer"></span><span>${timeAgo(p.updatedAt)}</span></div>
        </a>`,
      )
      .join('');
  };
  await loadProjects();
  render();
  blurIn(grid.querySelectorAll('.card'));
  container.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-proj]');
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const p = state.projects.find((x) => x.id === del.dataset.delProj);
      if (p && (await deleteProject(p))) {
        if (!state.projects.length) return projectsView(container);
        render();
      }
      return;
    }
    if (!e.target.closest('[data-act="new"]')) return;
    const p = await newProjectDialog();
    if (p) navigate(`#/projects/${p.id}`);
  });
}
