// 站点管理：模型接口配置、注册开关、用户管理
import { api } from '../api.js';
import { esc, el, $, icon, toast, modal, confirmDialog, promptDialog, formatDate } from '../ui.js';
import { state, loadConfig } from '../state.js';

export async function adminView(container) {
  let s = await api.get('/api/admin/settings');

  container.innerHTML = `<div class="settings">
    <div class="page-head"><h1>站点管理</h1></div>

    <form class="card api-form" autocomplete="off">
      <h2>${icon('key')} 模型接口</h2>
      <p class="sub">使用唐果分配的 API Key，并从接口拉取模型 ID。API Key 只保存在服务器上。此处也支持其他 OpenAI 兼容接口。</p>
      <div class="form-grid">
        <div class="field full"><label>API 地址</label><input class="input mono" name="apiBaseUrl" placeholder="https://api.tangguo.xin/v1">
          <span class="hint">填写到 /v1 即可，系统会自动请求 <code>/chat/completions</code>；也可以直接填写完整的 chat/completions 地址。</span></div>
        <div class="field full"><label>API Key</label><input class="input mono" name="apiKey" type="password" placeholder="sk-...">
          <span class="hint key-hint"></span></div>
        <div class="field full"><label>模型列表</label><textarea class="textarea mono" name="models" rows="3" placeholder="每行一个，或用逗号分隔，例如：&#10;gpt-4o&#10;deepseek-chat"></textarea>
          <span class="hint">用户可以在这些模型之间切换。模型需要支持工具调用（function calling）才能修改文件。</span></div>
        <div class="field"><label>默认模型</label><select class="select" name="defaultModel"></select></div>
        <div class="field"><label>站点名称</label><input class="input" name="siteName" maxlength="40"></div>
      </div>
      <details style="margin-bottom:14px"><summary style="cursor:pointer;color:var(--text-2);font-weight:600;font-size:13px">高级设置</summary>
        <div class="form-grid" style="margin-top:12px">
          <div class="field"><label>单次运行最大步数</label><input class="input" name="maxSteps" type="number" min="1" max="100"><span class="hint">每一步是一次模型调用（含工具调用）</span></div>
          <div class="field"><label>Temperature（可选）</label><input class="input" name="temperature" placeholder="留空使用模型默认值"></div>
          <div class="field full"><label class="switch"><input type="checkbox" name="stream"><span class="track"></span><span>流式输出</span></label><span class="hint">如果你的接口不支持 stream，请关闭</span></div>
          <div class="field full"><label>附加系统提示词</label><textarea class="textarea" name="systemPrompt" rows="3" placeholder="对所有任务生效的额外指令"></textarea></div>
        </div>
      </details>
      <div class="actions">
        <button class="btn primary" type="submit">${icon('save')}保存配置</button>
        <button class="btn" type="button" data-act="fetch">${icon('download')}从接口拉取模型</button>
        <button class="btn" type="button" data-act="test">${icon('play')}测试连接</button>
      </div>
      <div class="result hidden"></div>
    </form>

    <div class="card">
      <h2>${icon('users')} 用户</h2>
      <p class="sub">管理可以登录本站的账号</p>
      <div class="row" style="margin-bottom:12px">
        <label class="switch grow"><input type="checkbox" class="allow-reg"><span class="track"></span><span>允许新用户自行注册</span></label>
        <button class="btn sm primary" data-act="add-user">${icon('plus')}添加用户</button>
      </div>
      <div style="overflow-x:auto"><table class="table users"></table></div>
    </div>
  </div>`;

  const form = $(container, '.api-form');
  const result = $(container, '.result');

  const fillForm = () => {
    form.apiBaseUrl.value = s.apiBaseUrl || '';
    form.apiKey.value = '';
    form.apiKey.placeholder = s.hasApiKey ? s.apiKey : 'sk-...';
    $(form, '.key-hint').textContent = s.hasApiKey ? '已保存 Key。留空表示不修改。' : '尚未设置 Key（部分本地/内网接口可以不填）。';
    form.models.value = (s.models || []).join('\n');
    form.siteName.value = s.siteName || '';
    form.maxSteps.value = s.maxSteps || 30;
    form.temperature.value = s.temperature ?? '';
    form.stream.checked = s.stream !== false;
    form.systemPrompt.value = s.systemPrompt || '';
    fillDefault(s.defaultModel);
    $(container, '.allow-reg').checked = !!s.allowRegister;
  };
  const parseModels = () =>
    form.models.value
      .split(/[,，\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  const fillDefault = (sel) => {
    const ms = parseModels();
    form.defaultModel.innerHTML = ms.length ? ms.map((m) => `<option ${m === sel ? 'selected' : ''}>${esc(m)}</option>`).join('') : '<option value="">（先填写模型列表）</option>';
  };
  form.models.addEventListener('input', () => fillDefault(form.defaultModel.value));

  const showResult = (ok, text) => {
    result.className = `result-box ${ok ? 'ok' : 'err'}`;
    result.textContent = text;
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    try {
      s = await api.put('/api/admin/settings', {
        apiBaseUrl: form.apiBaseUrl.value,
        apiKey: form.apiKey.value,
        models: parseModels(),
        defaultModel: form.defaultModel.value,
        siteName: form.siteName.value,
        maxSteps: form.maxSteps.value,
        temperature: form.temperature.value,
        stream: form.stream.checked,
        systemPrompt: form.systemPrompt.value,
      });
      fillForm();
      await loadConfig();
      document.querySelector('.site-name') && (document.querySelector('.site-name').textContent = state.config.siteName);
      toast('配置已保存', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  $(form, '[data-act="fetch"]').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const r = await api.post('/api/admin/models', { apiBaseUrl: form.apiBaseUrl.value, apiKey: form.apiKey.value });
      if (!r.models.length) return showResult(false, '接口没有返回任何模型');
      pickModels(r.models);
    } catch (err) {
      showResult(false, err.message);
    } finally {
      b.disabled = false;
    }
  };

  function pickModels(all) {
    const current = new Set(parseModels());
    const body = el(`<div>
      <div class="search" style="margin:0 0 10px">${icon('search')}<input placeholder="筛选模型" style="width:100%"></div>
      <div class="list" style="max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:10px;padding:6px"></div>
      <div class="hint muted" style="font-size:12px;margin-top:8px">共 ${all.length} 个模型</div>
    </div>`);
    const listEl = $(body, '.list');
    const renderList = (q = '') => {
      listEl.innerHTML = all
        .filter((m) => m.toLowerCase().includes(q.toLowerCase()))
        .map((m) => `<label class="row" style="padding:4px 8px;cursor:pointer;font:13px var(--mono)"><input type="checkbox" value="${esc(m)}" ${current.has(m) ? 'checked' : ''}>${esc(m)}</label>`)
        .join('');
    };
    listEl.addEventListener('change', (e) => {
      if (e.target.checked) current.add(e.target.value);
      else current.delete(e.target.value);
    });
    $(body, 'input').oninput = (e) => renderList(e.target.value);
    renderList();
    modal({
      title: '选择模型',
      body,
      width: '520px',
      actions: [
        { label: '取消' },
        {
          label: '使用所选模型',
          primary: true,
          onClick: () => {
            form.models.value = [...current].join('\n');
            fillDefault(form.defaultModel.value);
            showResult(true, `已选择 ${current.size} 个模型，记得点击「保存配置」。`);
          },
        },
      ],
    });
  }

  $(form, '[data-act="test"]').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    showResult(true, '正在测试…');
    try {
      const r = await api.post('/api/admin/test', {
        apiBaseUrl: form.apiBaseUrl.value,
        apiKey: form.apiKey.value,
        model: form.defaultModel.value || parseModels()[0],
      });
      showResult(true, `✅ 连接成功（${r.model}，耗时 ${r.ms}ms）\n模型回复：${r.reply || '（空）'}`);
    } catch (err) {
      showResult(false, err.message);
    } finally {
      b.disabled = false;
    }
  };

  $(container, '.allow-reg').onchange = async (e) => {
    try {
      s = await api.put('/api/admin/settings', { allowRegister: e.target.checked });
      toast(e.target.checked ? '已开放注册' : '已关闭注册', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // —— 用户 ——
  const table = $(container, '.users');
  async function loadUsers() {
    const users = await api.get('/api/admin/users');
    table.innerHTML = `<tr><th>用户名</th><th>角色</th><th>项目 / 任务</th><th>注册时间</th><th></th></tr>${users
      .map(
        (u) => `<tr data-id="${u.id}" data-name="${esc(u.username)}">
          <td><b>${esc(u.username)}</b>${u.id === state.user.id ? ' <span class="muted">（你）</span>' : ''}</td>
          <td><select class="select pill-select role" ${u.id === state.user.id ? 'disabled' : ''}><option value="user" ${u.role === 'user' ? 'selected' : ''}>普通用户</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>管理员</option></select></td>
          <td class="muted">${u.projectCount} / ${u.taskCount}</td>
          <td class="muted">${formatDate(u.createdAt)}</td>
          <td style="text-align:right;white-space:nowrap"><button class="btn ghost sm" data-u="reset">重置密码</button>${u.id === state.user.id ? '' : `<button class="btn ghost sm" data-u="del" style="color:var(--red)">${icon('trash')}</button>`}</td>
        </tr>`,
      )
      .join('')}`;
  }
  table.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('role')) return;
    const id = e.target.closest('tr').dataset.id;
    try {
      await api.patch(`/api/admin/users/${id}`, { role: e.target.value });
      toast('角色已更新', 'success');
    } catch (err) {
      toast(err.message, 'error');
      loadUsers();
    }
  });
  table.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-u]')?.dataset.u;
    if (!act) return;
    const tr = e.target.closest('tr');
    if (act === 'reset') {
      const pw = await promptDialog(`重置 ${tr.dataset.name} 的密码`, { label: '新密码（至少 6 位）' });
      if (!pw) return;
      try {
        await api.patch(`/api/admin/users/${tr.dataset.id}`, { password: pw });
        toast('密码已重置', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (act === 'del') {
      if (!(await confirmDialog(`删除用户 ${tr.dataset.name}？其所有项目和任务都会被删除。`, { danger: true, okText: '删除' }))) return;
      try {
        await api.del(`/api/admin/users/${tr.dataset.id}`);
        toast('已删除', 'success');
        loadUsers();
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });
  $(container, '[data-act="add-user"]').onclick = () => {
    const body = el(`<div>
      <div class="field"><label>用户名</label><input class="input" name="u" autocomplete="off"></div>
      <div class="field"><label>初始密码</label><input class="input" name="p" type="text" autocomplete="off"></div>
      <div class="field"><label>角色</label><select class="select" name="r"><option value="user">普通用户</option><option value="admin">管理员</option></select></div>
    </div>`);
    modal({
      title: '添加用户',
      body,
      actions: [
        { label: '取消' },
        {
          label: '添加',
          primary: true,
          onClick: async () => {
            await api.post('/api/admin/users', { username: $(body, '[name=u]').value, password: $(body, '[name=p]').value, role: $(body, '[name=r]').value });
            toast('用户已添加', 'success');
            loadUsers();
          },
        },
      ],
    });
  };

  fillForm();
  await loadUsers();
}
