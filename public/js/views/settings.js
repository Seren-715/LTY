// 账号设置
import { api, getMode } from '../api.js';
import { esc, $, icon, toast, formatDate, confirmDialog, promptDialog } from '../ui.js';
import { downloadBlob } from '../zip.js';
import { state, navigate } from '../state.js';
import { avatarSrc, chooseAvatar } from '../avatar.js';
import { formatUsageCost } from '../sidebar.js';

export async function settingsView(container) {
  if (getMode() === 'static') return staticSettings(container);
  const { user } = await api.get('/api/auth/me');
  container.innerHTML = `<div class="settings">
    <div class="page-head"><h1>账号设置</h1></div>
    <div class="card">
      <h2>账号信息</h2>
      <p class="sub">你的基本信息</p>
      <div class="row" style="gap:14px">
        ${avatarButton(user)}
        <div class="grow"><div style="font-weight:600;font-size:15px">${esc(user.username)}</div>
          <div class="muted" style="font-size:13px">${user.role === 'admin' ? '管理员' : '普通用户'} · 注册于 ${formatDate(user.createdAt)}</div>
          ${avatarLinks(user)}</div>
        <button class="btn danger" data-act="logout">${icon('logout')}退出登录</button>
      </div>
    </div>
    <form class="card pw">
      <h2>修改密码</h2>
      <p class="sub">修改后，其他设备上的登录会失效</p>
      <div class="field"><label>当前密码</label><input class="input" type="password" name="old" autocomplete="current-password"></div>
      <div class="form-grid">
        <div class="field"><label>新密码</label><input class="input" type="password" name="n1" autocomplete="new-password"></div>
        <div class="field"><label>确认新密码</label><input class="input" type="password" name="n2" autocomplete="new-password"></div>
      </div>
      <button class="btn primary" type="submit">更新密码</button>
    </form>
  </div>`;

  bindAvatar(container, user);
  $(container, '[data-act="logout"]').onclick = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    state.user = null;
    navigate('#/login');
  };
  const form = $(container, 'form.pw');
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (form.n1.value !== form.n2.value) return toast('两次输入的新密码不一致', 'error');
    try {
      await api.post('/api/auth/password', { oldPassword: form.old.value, newPassword: form.n1.value });
      form.reset();
      toast('密码已更新', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

function renderKeySpending(balance) {
  const amount = (value) => esc(formatUsageCost(value, balance.currency));
  const details = (title, label, rows, field) => !rows.length ? '' : `<section class="usage-detail">
    <h3>${title}</h3>
    <table class="table usage-table">
      <thead><tr><th scope="col">${label}</th><th scope="col">实际消费</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${esc(row[field])}</td><td>${amount(row.cost)}</td></tr>`).join('')}</tbody>
    </table>
  </section>`;
  const updatedAt = balance.updatedAt ? Date.parse(balance.updatedAt) : NaN;
  return `<div class="usage-summary">
    <div><div class="muted">今日消费</div><strong>${amount(balance.today?.cost)}</strong></div>
    <div><div class="muted">累计消费</div><strong>${amount(balance.total?.cost)}</strong></div>
  </div>
  ${details('按日消费', '日期', balance.daily || [], 'date')}
  ${details('按模型消费', '模型', balance.models || [], 'model')}
  ${Number.isFinite(updatedAt) ? `<p class="usage-updated muted">查询于 ${esc(formatDate(updatedAt))}</p>` : ''}`;
}

// —— 纯静态模式：消费、昵称、数据备份 ——
async function staticSettings(container) {
  const { user } = await api.get('/api/auth/me');
  const { masked } = await api.get('/api/session/key');
  const money = (n) => '$' + Number(n || 0).toFixed(4).replace(/0{1,2}$/, '');
  container.innerHTML = `<div class="settings">
    <div class="page-head"><h1>账号设置</h1></div>
    <div class="card">
      <h2>账号</h2>
      <p class="sub">你的账号由 API Key 识别，数据保存在本浏览器中</p>
      <div class="row" style="gap:14px;flex-wrap:wrap">
        ${avatarButton(user)}
        <div class="grow"><div style="font-weight:600;font-size:15px">${esc(user.username)} <button class="btn ghost sm" data-act="rename">${icon('edit')}改昵称</button></div>
          <div class="muted mono" style="font-size:12.5px">${esc(masked)}</div>
          ${avatarLinks(user)}</div>
        <button class="btn danger" data-act="logout">${icon('logout')}退出登录</button>
      </div>
    </div>
    <div class="card">
      <h2>${icon('key')} <span class="balance-title">API Key 用量</span></h2>
      <p class="sub balance-note">由 API 平台统计，可能有几分钟延迟。</p>
      <div class="balance-box" aria-live="polite"><span class="muted"><span class="spin"></span> 正在查询…</span></div>
      <div class="actions" style="margin-top:12px"><button class="btn sm" data-act="refresh">${icon('refresh')}刷新</button></div>
    </div>
    <div class="card">
      <h2>${icon('save')} 数据备份</h2>
      <p class="sub">项目和任务只保存在当前浏览器中。清除浏览器数据或换电脑前，请先导出备份。</p>
      <div class="actions">
        <button class="btn primary" data-act="export">${icon('download')}导出备份</button>
        <button class="btn" data-act="import">${icon('upload')}导入备份</button>
        <input type="file" accept=".json,application/json" class="hidden imp">
        <span class="spacer"></span>
        <button class="btn danger" data-act="wipe">${icon('trash')}清空本地数据</button>
      </div>
    </div>
  </div>`;

  bindAvatar(container, user);
  const box = $(container, '.balance-box');
  const balanceTitle = $(container, '.balance-title');
  const balanceNote = $(container, '.balance-note');
  const refresh = $(container, '[data-act="refresh"]');
  const isCurrent = () => box.isConnected && state.user?.id === user.id;
  const loadBalance = async (force = false) => {
    refresh.disabled = true;
    box.innerHTML = '<span class="muted"><span class="spin"></span> 正在查询…</span>';
    try {
      const b = await api.get(force ? '/api/balance?refresh=1' : '/api/balance');
      if (!isCurrent()) return;
      if (force) window.dispatchEvent(new Event('rty:usage-refresh'));
      if (b.source === 'tangguo') {
        balanceTitle.textContent = '当前 API Key 消费';
        balanceNote.textContent = '唐果统计的实际消费。未返回的金额显示为「—」。';
        box.innerHTML = b.unsupported
          ? '<span class="muted">唐果未提供当前 Key 的消费数据。</span>'
          : renderKeySpending(b);
        return;
      }
      balanceTitle.textContent = '额度';
      if (b.unsupported) {
        box.innerHTML = '<span class="muted">当前 API 平台不支持查询额度，请到平台官网查看。</span>';
        return;
      }
      const pct = b.limit ? Math.max(0, Math.min(100, (b.remaining / b.limit) * 100)) : null;
      box.innerHTML = `<div class="form-grid">
        <div><div class="muted" style="font-size:12.5px">剩余额度</div><div style="font-size:24px;font-weight:650;color:var(--primary)">${b.remaining != null ? money(b.remaining) : '不限额'}</div></div>
        <div><div class="muted" style="font-size:12.5px">已使用 / 上限</div><div style="font-size:24px;font-weight:650">${money(b.usage)} <span class="muted" style="font-size:15px;font-weight:500">/ ${b.limit != null ? money(b.limit) : '∞'}</span></div></div>
      </div>${pct != null ? `<div class="meter"><span style="width:${pct}%"></span></div>` : ''}`;
    } catch (e) {
      if (isCurrent()) box.innerHTML = `<div class="error-box" style="margin:0">${esc(e.message)}</div>`;
    } finally {
      refresh.disabled = false;
    }
  };
  loadBalance();

  container.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'refresh') loadBalance(true);
    else if (act === 'logout') {
      if (!(await confirmDialog('退出后需要重新输入 API Key 才能登录。本地数据会保留。', { okText: '退出' }))) return;
      await api.post('/api/auth/logout');
      state.user = null;
      navigate('#/login');
    } else if (act === 'rename') {
      const n = await promptDialog('修改昵称', { value: user.username });
      if (!n) return;
      try {
        const r = await api.post('/api/auth/nickname', { nickname: n });
        state.user = r.user;
        navigate('#/settings');
      } catch (err) {
        toast(err.message, 'error');
      }
    } else if (act === 'export') {
      const data = await api.get('/api/backup');
      const d = new Date();
      const name = `rty-code-备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
      downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), name);
      toast(`已导出 ${data.projects.length} 个项目、${data.tasks.length} 个任务`, 'success');
    } else if (act === 'import') $(container, '.imp').click();
    else if (act === 'wipe') {
      if (!(await confirmDialog('清空当前账号在本浏览器中的所有项目和任务？此操作不可恢复，建议先导出备份。', { danger: true, okText: '清空' }))) return;
      await api.del('/api/backup');
      toast('已清空本地数据');
    }
  });
  $(container, '.imp').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const r = await api.post('/api/backup', JSON.parse(await f.text()));
      toast(`已导入 ${r.projects} 个项目、${r.tasks} 个任务`, 'success');
    } catch (err) {
      toast(err instanceof SyntaxError ? '文件不是合法的 JSON' : err.message, 'error');
    }
  };
}

// —— 头像 ——
function avatarButton(user) {
  return `<button class="avatar lg avatar-edit" data-avatar="change" title="更换头像"><img src="${esc(avatarSrc(user))}" alt=""><span class="avatar-overlay">${icon('image')}</span></button>`;
}

function avatarLinks(user) {
  return `<div class="avatar-links"><button class="link-btn" data-avatar="change">更换头像</button>${
    user.avatar ? '<button class="link-btn muted" data-avatar="reset">恢复默认</button>' : ''
  }</div>`;
}

function bindAvatar(container, user) {
  container.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-avatar]')?.dataset.avatar;
    if (!act) return;
    let avatar = null;
    if (act === 'change') {
      avatar = await chooseAvatar();
      if (!avatar) return;
    }
    try {
      const r = await api.post('/api/auth/avatar', { avatar });
      state.user = r.user;
      Object.assign(user, r.user);
      container.querySelectorAll('.avatar-edit img').forEach((img) => (img.src = avatarSrc(r.user)));
      container.querySelectorAll('.avatar-links').forEach((el) => (el.outerHTML = avatarLinks(r.user)));
      window.dispatchEvent(new Event('rty:refresh-sidebar'));
      toast(avatar ? '头像已更新' : '已恢复默认头像', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
