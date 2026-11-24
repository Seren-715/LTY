// 输入框组件：文字 + 附件（文件 / 图片 / 截屏 / 粘贴 / 拖拽）+ 模型选择 + 发送
import { esc, el, $, icon, toast, autosize, bindMenu } from './ui.js';
import { state, loadConfig, prefs } from './state.js';

const TEXT_EXT =
  /\.(html?|css|scss|less|js|mjs|cjs|jsx|ts|tsx|json|jsonc|md|markdown|txt|log|py|java|go|rs|c|h|cpp|hpp|cc|cs|php|rb|sh|bash|zsh|bat|ps1|yml|yaml|toml|ini|cfg|conf|env|xml|svg|vue|svelte|sql|kt|swift|dart|lua|r|csv|tsv|gitignore|editorconfig|dockerfile|makefile|gradle|properties)$/i;
const MAX_FILE_BYTES = 300 * 1024;
const MAX_IMAGES = 8;
const MAX_FILES = 10;
const IMAGE_MAX_SIDE = 1600;

// —— 导入文件夹 ——
const IGNORE_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', '.nuxt', '.cache', '__pycache__', '.venv', 'venv', 'coverage', '.idea', '.vscode', 'target', 'vendor', '.DS_Store']);
const PROJECT_FILE_MAX = 1024 * 1024;
const PROJECT_MAX_FILES = 500;

function readAllEntries(dirEntry) {
  const reader = dirEntry.createReader();
  const all = [];
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

async function walkEntry(entry, prefix, out) {
  if (out.length > PROJECT_MAX_FILES * 4) return;
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ path: prefix + entry.name, file });
  } else if (entry.isDirectory && !IGNORE_DIRS.has(entry.name)) {
    for (const child of await readAllEntries(entry)) await walkEntry(child, prefix + entry.name + '/', out);
  }
}

/** 把 [{path, file}] 读成项目文件：跳过忽略目录、二进制和过大的文件 */
async function readProjectFiles(list) {
  const files = {};
  const skipped = [];
  let count = 0;
  for (const { path, file } of list) {
    const segs = path.split('/');
    if (segs.some((s) => IGNORE_DIRS.has(s)) || segs[segs.length - 1] === '.DS_Store') continue;
    const name = segs[segs.length - 1];
    const textLike = TEXT_EXT.test(name) || file.type.startsWith('text/') || !name.includes('.') || /^\./.test(name);
    if (!textLike || file.size > PROJECT_FILE_MAX) {
      skipped.push(path);
      continue;
    }
    if (count >= PROJECT_MAX_FILES) {
      skipped.push(path);
      continue;
    }
    const content = await file.text();
    if (content.includes('\u0000')) {
      skipped.push(path);
      continue;
    }
    files[path] = content;
    count++;
  }
  return { files, skipped };
}

let seq = 0;

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** 压缩图片：最长边不超过 1600px，大图转为 JPEG，返回 data URL */
async function imageToDataUrl(blob) {
  const original = await readAsDataUrl(blob);
  let img;
  try {
    img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('无法读取图片'));
      i.src = original;
    });
  } catch {
    throw new Error('不支持的图片格式');
  }
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && blob.size < 600 * 1024 && /^image\/(png|jpeg|webp|gif)$/.test(blob.type)) return original;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.86);
}

async function captureScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((r) => setTimeout(r, 250)); // 等待第一帧稳定
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return blob;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export const canCaptureScreen = () => !!navigator.mediaDevices?.getDisplayMedia && window.isSecureContext;

/**
 * opts: { placeholder, onSubmit({ prompt, attachments, model }), onStop(), initialModel, autofocus }
 * 返回 { el, focus(), setRunning(bool), setText(str) }
 */
export function createComposer(opts) {
  let attachments = []; // { id, type:'image'|'file', name, dataUrl?, content?, size }
  let running = false;
  let busy = false;
  const models = () => state.config?.models || [];
  let model = [opts.initialModel, prefs.get('model'), state.config?.defaultModel].find((m) => m && models().includes(m)) || models()[0] || '';

  const root = el(`<div class="composer">
    <div class="attach-row hidden"></div>
    <textarea rows="1" placeholder="${esc(opts.placeholder || '随心输入，Enter 发送，Shift + Enter 换行')}"></textarea>
    <div class="composer-bar">
      <div class="menu">
        <button type="button" class="icon-btn plus-btn" title="添加附件">${icon('plus')}</button>
        <div class="menu-pop up hidden">
          <button type="button" class="menu-item" data-add="file">${icon('paperclip')}添加文件</button>
          <button type="button" class="menu-item" data-add="image">${icon('image')}添加图片</button>
          ${canCaptureScreen() ? `<button type="button" class="menu-item" data-add="screen">${icon('screen')}截取屏幕</button>` : ''}
          ${opts.onFolder ? `<div class="menu-sep"></div><button type="button" class="menu-item" data-add="folder">${icon('folder')}导入文件夹到项目</button>` : ''}
          <div class="menu-tip">也可以把文件或文件夹直接拖到页面上，或粘贴截图</div>
        </div>
      </div>
      <span class="spacer"></span>
      <div class="menu model-menu">
        <button type="button" class="model-btn" title="选择模型">${icon('bolt')}<span class="model-name"></span>${icon('chev-down')}</button>
        <div class="menu-pop up right hidden model-pop"></div>
      </div>
      <button type="button" class="send-btn" title="发送">${icon('arrow-up')}</button>
    </div>
    <input type="file" multiple class="hidden f-file">
    <input type="file" multiple accept="image/*" class="hidden f-image">
    <input type="file" multiple webkitdirectory class="hidden f-dir">
  </div>`);

  const ta = $(root, 'textarea');
  const fit = autosize(ta, 260);
  const row = $(root, '.attach-row');
  const sendBtn = $(root, '.send-btn');
  const plusPop = $(root, '.menu .menu-pop');
  bindMenu($(root, '.plus-btn'), plusPop);

  // —— 模型菜单 ——
  const modelBtn = $(root, '.model-btn');
  const modelPop = $(root, '.model-pop');
  bindMenu(modelBtn, modelPop);
  const renderModels = () => {
    $(root, '.model-name').textContent = model || '未配置模型';
    const list = models();
    modelPop.innerHTML =
      (list.length
        ? `<div class="menu-label">模型</div>` +
          list.map((m) => `<button type="button" class="menu-item ${m === model ? 'checked' : ''}" data-model="${esc(m)}"><span class="grow mono">${esc(m)}</span>${m === model ? icon('check') : ''}</button>`).join('')
        : `<div class="menu-tip">没有可用的模型</div>`) +
      (state.config?.mode === 'static' ? `<div class="menu-sep"></div><button type="button" class="menu-item" data-refresh>${icon('refresh')}刷新模型列表</button>` : '');
  };
  renderModels();
  modelPop.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-model]');
    if (item) {
      model = item.dataset.model;
      prefs.set('model', model);
      modelPop.classList.add('hidden');
      renderModels();
      return;
    }
    const refresh = e.target.closest('[data-refresh]');
    if (!refresh) return;
    refresh.disabled = true;
    refresh.innerHTML = '<span class="spin"></span>刷新中…';
    try {
      const cfg = await loadConfig({ refreshModels: true });
      if (!cfg.models.includes(model)) model = cfg.defaultModel || cfg.models[0] || '';
      renderModels();
      toast(cfg.models.length ? '模型列表已刷新' : '当前 API Key 没有可用的模型', cfg.models.length ? 'success' : 'error');
      opts.onModelsRefreshed?.(cfg);
    } catch (err) {
      toast(err.message || '刷新模型失败', 'error');
      renderModels();
    }
  });

  // —— 附件 ——
  const renderAttachments = () => {
    row.classList.toggle('hidden', !attachments.length);
    row.innerHTML = attachments
      .map((a) =>
        a.type === 'image'
          ? `<div class="att att-img" title="${esc(a.name)}"><img src="${a.dataUrl}" alt=""><button type="button" class="att-x" data-rm="${a.id}" title="移除">${icon('x')}</button></div>`
          : `<div class="att att-file" title="${esc(a.name)}"><span class="att-ic">${icon('file')}</span><span class="att-meta"><span class="att-name">${esc(a.name)}</span><span class="att-size">${(a.size / 1024).toFixed(a.size < 10240 ? 1 : 0)} KB</span></span><button type="button" class="att-x" data-rm="${a.id}" title="移除">${icon('x')}</button></div>`,
      )
      .join('');
  };
  row.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    attachments = attachments.filter((a) => String(a.id) !== b.dataset.rm);
    renderAttachments();
  });

  async function addImage(blob, name) {
    if (attachments.filter((a) => a.type === 'image').length >= MAX_IMAGES) return toast(`最多添加 ${MAX_IMAGES} 张图片`, 'error');
    try {
      const dataUrl = await imageToDataUrl(blob);
      attachments.push({ id: ++seq, type: 'image', name: name || blob.name || '图片', dataUrl, size: dataUrl.length });
      renderAttachments();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function addFiles(fileList) {
    const skipped = [];
    for (const f of fileList) {
      if (f.type.startsWith('image/') && !/svg/.test(f.type)) {
        await addImage(f, f.name);
        continue;
      }
      const isText = TEXT_EXT.test(f.name) || f.type.startsWith('text/') || /json|xml|javascript/.test(f.type) || !f.name.includes('.');
      if (!isText || f.size > MAX_FILE_BYTES) {
        skipped.push(f.name);
        continue;
      }
      if (attachments.filter((a) => a.type === 'file').length >= MAX_FILES) {
        skipped.push(f.name);
        continue;
      }
      const content = await f.text();
      if (content.includes('\u0000')) {
        skipped.push(f.name);
        continue;
      }
      attachments.push({ id: ++seq, type: 'file', name: f.name, content, size: f.size });
    }
    renderAttachments();
    if (skipped.length) toast(`已跳过：${skipped.join('、')}（仅支持 300KB 以内的文本文件和图片）`, 'error', 4200);
  }

  $(root, '.f-file').onchange = (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  };
  $(root, '.f-image').onchange = (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  };
  plusPop.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-add]')?.dataset.add;
    if (!act) return;
    plusPop.classList.add('hidden');
    if (act === 'file') $(root, '.f-file').click();
    else if (act === 'image') $(root, '.f-image').click();
    else if (act === 'folder') $(root, '.f-dir').click();
    else if (act === 'screen') {
      try {
        const blob = await captureScreen();
        const d = new Date();
        await addImage(blob, `截图 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        ta.focus();
      } catch (err) {
        if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') toast(`截屏失败：${err.message || err}`, 'error');
      }
    }
  });

  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });
  // —— 文件夹导入 ——
  async function importFolder(name, list) {
    if (!opts.onFolder) return;
    toast(`正在读取文件夹「${name}」…`, 'info', 1500);
    const { files, skipped } = await readProjectFiles(list);
    if (!Object.keys(files).length) return toast('文件夹里没有可导入的文本文件', 'error');
    await opts.onFolder({ name, files, skipped });
  }

  $(root, '.f-dir').onchange = async (e) => {
    const picked = [...e.target.files];
    e.target.value = '';
    if (!picked.length) return;
    // webkitRelativePath 形如 “文件夹/子目录/文件”，第一段是文件夹名
    const name = picked[0].webkitRelativePath.split('/')[0] || '导入的项目';
    const list = picked.map((f) => ({ path: f.webkitRelativePath.split('/').slice(1).join('/') || f.name, file: f }));
    try {
      await importFolder(name, list);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // —— 拖拽：可以拖到整个页面区域 ——
  const zone = opts.dropZone || root;
  const overlay = el(`<div class="page-drop hidden"><div class="pd-box">${icon('upload')}<b>松开以添加</b><span>${
    opts.onFolder ? '文件会作为附件随消息发送，文件夹会导入到项目中' : '文件会作为附件随消息发送'
  }</span></div></div>`);
  zone.classList.add('drop-zone');
  zone.appendChild(overlay);
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  zone.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    overlay.classList.remove('hidden');
  });
  zone.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  zone.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      overlay.classList.add('hidden');
    }
  });
  zone.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.add('hidden');
    const dt = e.dataTransfer;
    // 必须在 drop 事件中同步取得 entry，之后才能异步读取
    const entries = [...(dt.items || [])].filter((i) => i.kind === 'file').map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    const dirs = entries.filter((en) => en.isDirectory);
    try {
      if (!dirs.length || !opts.onFolder) {
        if (dirs.length) toast('这里不支持拖入文件夹，请拖入文件', 'error');
        const loose = entries.length ? entries.filter((en) => en.isFile) : null;
        const files = loose ? await Promise.all(loose.map((en) => new Promise((res, rej) => en.file(res, rej)))) : [...dt.files];
        if (files.length) await addFiles(files);
        return;
      }
      const looseFiles = await Promise.all(entries.filter((en) => en.isFile).map((en) => new Promise((res, rej) => en.file(res, rej))));
      if (looseFiles.length) await addFiles(looseFiles);
      for (const dir of dirs) {
        const list = [];
        for (const child of await readAllEntries(dir)) await walkEntry(child, '', list);
        await importFolder(dir.name, list);
      }
    } catch (err) {
      toast(`读取拖入的内容失败：${err.message || err}`, 'error');
    }
  });

  // —— 发送 ——
  const syncSend = () => {
    sendBtn.classList.toggle('stop', running);
    sendBtn.innerHTML = running ? icon('stop') : icon('arrow-up');
    sendBtn.title = running ? '停止' : '发送';
    sendBtn.disabled = busy || (!running && !ta.value.trim() && !attachments.length);
  };
  ta.addEventListener('input', syncSend);
  const origRender = renderAttachments;

  async function submit() {
    if (running) return opts.onStop?.();
    if (busy) return;
    const prompt = ta.value.trim();
    if (!prompt && !attachments.length) return ta.focus();
    if (!model) return toast('没有可用的模型', 'error');
    busy = true;
    syncSend();
    try {
      await opts.onSubmit({
        prompt,
        model,
        attachments: attachments.map((a) => (a.type === 'image' ? { type: 'image', name: a.name, dataUrl: a.dataUrl } : { type: 'file', name: a.name, content: a.content })),
      });
      ta.value = '';
      attachments = [];
      origRender();
      fit();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = false;
      syncSend();
    }
  }
  sendBtn.onclick = submit;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  // 附件变化时刷新发送按钮状态
  new MutationObserver(syncSend).observe(row, { childList: true });
  syncSend();
  if (opts.autofocus) setTimeout(() => ta.focus(), 50);

  return {
    el: root,
    focus: () => ta.focus(),
    setRunning(v) {
      running = !!v;
      syncSend();
    },
    setText(t) {
      ta.value = t;
      fit();
      syncSend();
      ta.focus();
    },
    refreshModels: renderModels,
  };
}
