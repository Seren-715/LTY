// 代码智能体：在项目虚拟文件系统上通过工具调用完成编码任务（浏览器与 Node 通用）
import { chat } from './llm.js';
import { normPath, checkWrite, sortedPaths } from './files.js';
import { vueFiles, completeNodeProject, ENSURE_DEPS_PATH } from './scaffold.js';
import { skillsPrompt, loadSkill, listSkills } from './skills.js';

const READ_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'use_skill',
      description: '读取一个技能的完整说明（技能清单见系统提示词）。任务与某个技能相关，或用户点名某个技能时，先调用它，再按说明工作。',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '技能名称，例如 frontend-design' } },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出项目中的全部文件及其行数。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取一个文件的内容。可选指定起止行号（从 1 开始）来读取大文件的一部分。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，例如 src/index.js' },
          start_line: { type: 'integer', description: '起始行（可选）' },
          end_line: { type: 'integer', description: '结束行（可选，包含）' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: '在所有文件中搜索文本（默认区分大小写的纯文本匹配，可选正则），返回匹配的行。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要搜索的文本或正则表达式' },
          regex: { type: 'boolean', description: '是否按正则表达式匹配' },
          path_prefix: { type: 'string', description: '只搜索此前缀下的文件（可选）' },
        },
        required: ['query'],
      },
    },
  },
];

const WRITE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'scaffold_project',
      description:
        '生成标准项目骨架（与 npm create vue@latest 一致的 Vite + Vue 3 项目：package.json、vite.config.js、index.html、src/main.js、src/App.vue 等），只创建缺失的文件，不覆盖已有文件。新建 Vue 项目时先调用它，再在骨架上修改。',
      parameters: {
        type: 'object',
        properties: {
          template: { type: 'string', enum: ['vue'], description: '项目类型，目前支持 vue' },
          name: { type: 'string', description: '项目名（用于 package.json 的 name，可省略）' },
        },
        required: ['template'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '创建新文件或用完整内容覆盖已有文件。目录会自动创建。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件的完整内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        '对已有文件做精确的字符串替换。old_str 必须与文件中的内容（包括缩进和空白）完全一致且唯一；若需替换所有出现位置，设置 replace_all=true。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_str: { type: 'string', description: '要被替换的原始文本' },
          new_str: { type: 'string', description: '替换后的文本' },
          replace_all: { type: 'boolean', description: '是否替换所有匹配' },
        },
        required: ['path', 'old_str', 'new_str'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: '删除一个文件。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
];

const MAX_READ_CHARS = 60000;

function lineCount(s) {
  if (!s) return 0;
  return s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
}

function fileList(files) {
  const paths = sortedPaths(files);
  if (!paths.length) return '（项目目前没有文件）';
  return paths.map((p) => `${p} (${lineCount(files[p])} 行)`).join('\n');
}

/** 执行一次工具调用，返回 { ok, output, changed } */
// 记录一次文件变更（用于「变更」面板和撤销）
function recordChange(task, files, path, after) {
  task.changes ||= {};
  if (!(path in task.changes)) task.changes[path] = { before: path in files ? files[path] : null };
  task.changes[path].after = after;
  if (task.changes[path].before === after) delete task.changes[path];
}

/** 批量写入文件（跳过超出限制的文件），返回实际写入的路径 */
function applyFiles(project, task, map) {
  const done = [];
  for (const [path, content] of Object.entries(map)) {
    try {
      const p = checkWrite(project.files, path, content);
      recordChange(task, project.files, p, content);
      project.files[p] = content;
      done.push(p);
    } catch {
      /* 超出项目大小限制等，跳过 */
    }
  }
  return done;
}

export function executeTool(name, args, ctx) {
  const { project, task, mode } = ctx;
  const files = project.files;
  const record = (path, after) => recordChange(task, files, path, after);

  try {
    switch (name) {
      case 'use_skill': {
        const text = loadSkill(files, args.name);
        if (!text) return { ok: false, output: `错误：没有名为「${args.name}」的技能。可用技能：${listSkills(files).map((x) => x.name).join('、')}` };
        return { ok: true, output: text };
      }
      case 'list_files':
        return { ok: true, output: fileList(files) };

      case 'read_file': {
        const p = normPath(args.path);
        if (!(p in files)) return { ok: false, output: `错误：文件不存在：${p}` };
        let text = files[p];
        if (args.start_line || args.end_line) {
          const lines = text.split('\n');
          const s = Math.max(1, parseInt(args.start_line, 10) || 1);
          const e = Math.min(lines.length, parseInt(args.end_line, 10) || lines.length);
          text = `（第 ${s}-${e} 行，共 ${lines.length} 行）\n` + lines.slice(s - 1, e).join('\n');
        }
        if (text.length > MAX_READ_CHARS) {
          text = text.slice(0, MAX_READ_CHARS) + `\n…（内容过长已截断，请使用 start_line/end_line 分段读取）`;
        }
        return { ok: true, output: text === '' ? '（空文件）' : text };
      }

      case 'search_files': {
        const q = String(args.query ?? '');
        if (!q) return { ok: false, output: '错误：query 不能为空' };
        let test;
        if (args.regex) {
          let re;
          try {
            re = new RegExp(q);
          } catch (e) {
            return { ok: false, output: `错误：正则表达式无效：${e.message}` };
          }
          test = (line) => re.test(line);
        } else {
          test = (line) => line.includes(q);
        }
        const prefix = args.path_prefix ? normPath(args.path_prefix) : '';
        const out = [];
        for (const p of sortedPaths(files)) {
          if (prefix && !(p === prefix || p.startsWith(prefix + '/'))) continue;
          const lines = files[p].split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (test(lines[i])) {
              out.push(`${p}:${i + 1}: ${lines[i].slice(0, 240)}`);
              if (out.length >= 100) break;
            }
          }
          if (out.length >= 100) break;
        }
        return { ok: true, output: out.length ? out.join('\n') + (out.length >= 100 ? '\n…（仅显示前 100 条）' : '') : '没有找到匹配项' };
      }

      case 'scaffold_project':
      case 'write_file':
      case 'edit_file':
      case 'delete_file':
        if (mode !== 'code') return { ok: false, output: '错误：当前为「提问」模式，不能修改文件' };
        break;

      default:
        return { ok: false, output: `错误：未知工具 ${name}` };
    }

    if (name === 'scaffold_project') {
      if (args.template !== 'vue') return { ok: false, output: '错误：目前只支持 template = "vue"' };
      const tpl = vueFiles(args.name || project.name);
      const missing = Object.fromEntries(Object.entries(tpl).filter(([p]) => !(p in files)));
      const created = applyFiles(project, task, missing);
      // 已有 package.json 等文件时，补上缺失的依赖和自动安装脚本
      const updated = applyFiles(project, task, completeNodeProject(files, { name: project.name })).filter((p) => !created.includes(p));
      const lines = [];
      if (created.length) lines.push(`已创建 ${created.length} 个文件：\n${created.join('\n')}`);
      if (updated.length) lines.push(`已补全：${updated.join('、')}`);
      if (!lines.length) lines.push('项目骨架已完整，无需创建文件。');
      lines.push('入口为 index.html → src/main.js → src/App.vue，可用 @/ 引用 src 下的文件。接下来在此基础上修改。');
      return { ok: true, output: lines.join('\n'), changed: created.length + updated.length > 0 };
    }

    if (name === 'write_file') {
      const p = checkWrite(files, args.path, String(args.content ?? ''));
      const existed = p in files;
      record(p, String(args.content ?? ''));
      files[p] = String(args.content ?? '');
      return { ok: true, output: `${existed ? '已更新' : '已创建'} ${p}（${lineCount(files[p])} 行）`, changed: true };
    }

    if (name === 'edit_file') {
      const p = normPath(args.path);
      if (!(p in files)) return { ok: false, output: `错误：文件不存在：${p}。新建文件请使用 write_file。` };
      const oldStr = String(args.old_str ?? '');
      const newStr = String(args.new_str ?? '');
      if (!oldStr) return { ok: false, output: '错误：old_str 不能为空' };
      const text = files[p];
      const count = text.split(oldStr).length - 1;
      if (count === 0) return { ok: false, output: `错误：在 ${p} 中没有找到 old_str，请先 read_file 确认准确内容（包括缩进）。` };
      if (count > 1 && !args.replace_all) {
        return { ok: false, output: `错误：old_str 在 ${p} 中出现了 ${count} 次，请提供更多上下文使其唯一，或设置 replace_all=true。` };
      }
      const next = args.replace_all ? text.split(oldStr).join(newStr) : text.replace(oldStr, () => newStr);
      checkWrite(files, p, next);
      record(p, next);
      files[p] = next;
      return { ok: true, output: `已编辑 ${p}（替换 ${args.replace_all ? count : 1} 处）`, changed: true };
    }

    if (name === 'delete_file') {
      const p = normPath(args.path);
      if (!(p in files)) return { ok: false, output: `错误：文件不存在：${p}` };
      record(p, null);
      delete files[p];
      return { ok: true, output: `已删除 ${p}`, changed: true };
    }
  } catch (e) {
    return { ok: false, output: `错误：${e.message}` };
  }
  return { ok: false, output: '错误：未处理的工具调用' };
}

function systemPrompt({ siteName, project, globalPrompt }) {
  const parts = [
    `你是「${siteName}」中的代码编写智能体，正在帮助用户在项目「${project.name}」中工作。`,
    '项目以虚拟文件系统的形式保存在服务器上。你只能通过提供的工具查看和修改文件，无法执行命令、运行代码或访问网络。',
    '',
    '工作准则：',
    '- 动手修改前，先用 list_files / read_file / search_files 了解相关代码。',
    '- 修改已有文件时优先用 edit_file 做精确替换；新建文件或大幅重写时用 write_file 并提供完整内容。',
    '- 写出完整、可直接运行的代码，保持与现有代码一致的风格，不要留下 TODO 占位符。',
    '- 网页项目的入口文件为 index.html，用户可以在「预览」面板中直接查看运行效果（支持相对路径引用项目内的 CSS/JS）。',
    '- 用户要做 Vue 项目时：先调用 scaffold_project（template: "vue"）生成与 npm create vue@latest 一致的 Vite + Vue 3 骨架，再在上面修改，组件用 <script setup> 写在 src/ 下的 .vue 文件中。',
    '- npm 项目（Vue、React、Vite 等）：不要创建 node_modules、package-lock.json、dist 等目录或文件；用到的第三方包都要写进 package.json 的 dependencies。项目已配置 predev 脚本，用户下载后在项目目录运行 npm run dev 即可（第一次会自动安装依赖并打开浏览器），完成时请这样告诉用户，不要让用户手动执行 npm install 或 npm create。',
    '- Vue 单文件组件需要构建，「预览」面板无法直接运行，请提醒用户下载项目后运行。',
    '- 完成后用简洁的中文总结：改了哪些文件、做了什么、如何运行或验证。',
    '- 用户使用什么语言提问，就用什么语言回答。',
    '',
    '如果用户只是提问或讨论，直接回答即可，不要无故修改文件；需要动手实现时再创建、编辑或删除文件。',
    '用户可能附带图片（截图、设计稿、报错界面等）或文件内容，请结合附件理解需求。',
  ];
  if (project.description) parts.push('', `项目简介：${project.description}`);
  if (project.instructions) parts.push('', '项目自定义指令：', project.instructions);
  const agents = project.files['AGENTS.md'];
  if (agents) parts.push('', 'AGENTS.md：', agents.slice(0, 8000));
  if (globalPrompt) parts.push('', '站点附加指令：', globalPrompt);
  parts.push('', skillsPrompt(project.files));
  parts.push('', '当前项目文件：', fileList(project.files));
  return parts.join('\n');
}

// 发送给模型前清理历史：去掉内部字段，并压缩较早的工具输出以节省上下文
// 若运行被中止导致工具调用缺少结果，补上占位结果，否则接口会报错
function repairHistory(history) {
  const out = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    out.push(m);
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue;
    const answered = new Set();
    let j = i + 1;
    while (j < history.length && history[j].role === 'tool') {
      answered.add(history[j].tool_call_id);
      out.push(history[j]);
      j++;
    }
    for (const tc of m.tool_calls) {
      if (!answered.has(tc.id)) out.push({ role: 'tool', tool_call_id: tc.id, content: '（该工具调用已被中止，未执行）' });
    }
    i = j - 1;
  }
  return out;
}

function buildMessages(rawHistory, anthropicModel) {
  const history = repairHistory(rawHistory.filter((m) => !m._note));
  const toolIdx = [];
  history.forEach((m, i) => m.role === 'tool' && toolIdx.push(i));
  const keepFull = new Set(toolIdx.slice(-12));
  return history.map((m, i) => {
    const out = {};
    for (const [k, v] of Object.entries(m)) if (!k.startsWith('_')) out[k] = v;
    if (m.role === 'tool' && !keepFull.has(i) && typeof out.content === 'string' && out.content.length > 1500) {
      out.content = out.content.slice(0, 1500) + '\n…（较早的工具输出已截断）';
    }
    if (m.role === 'assistant' && out.content == null) out.content = '';
    if (anthropicModel && m.role === 'assistant' && m._anthropicModel === anthropicModel) {
      out._anthropicBlocks = m._anthropicBlocks;
    }
    if (anthropicModel && m.role === 'tool') out._ok = m._ok;
    return out;
  });
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    // 有些模型会在 JSON 外包一层代码块
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fallthrough */
      }
    }
    throw new Error('工具参数不是合法的 JSON');
  }
}

/**
 * 运行智能体循环。
 * hooks: emit(event), saveTask(), saveProject()
 */
export async function runAgent({ task, project, config, signal, emit, saveTask, saveProject }) {
  const mode = 'code';
  const tools = [...READ_TOOLS, ...WRITE_TOOLS];
  const maxSteps = Math.max(1, Math.min(100, parseInt(config.maxSteps, 10) || 30));

  // 本次运行改过文件时，检查 npm / Vue 项目是否完整，自动补上缺失的文件和依赖
  function finishProject() {
    if (!task.changes || !Object.keys(task.changes).length) return;
    const fixes = completeNodeProject(project.files, { name: project.name });
    const done = applyFiles(project, task, fixes);
    if (!done.length) return;
    saveProject();
    const list = done.map((p) => `\`${p}\``).join('、');
    const auto = project.files['package.json']?.includes(ENSURE_DEPS_PATH);
    const note = {
      role: 'assistant',
      content: `已自动补全项目文件：${list}。${auto ? '\n\n下载项目后，在项目目录打开命令行运行 `npm run dev` 即可：第一次会自动安装依赖，然后打开浏览器。' : ''}`,
      _note: true,
      _at: Date.now(),
    };
    task.history.push(note);
    saveTask();
    emit({ type: 'message', message: note });
    emit({ type: 'changes' });
  }

  for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const messages = [
      { role: 'system', content: systemPrompt({ siteName: config.siteName, project, globalPrompt: config.systemPrompt }) },
      ...buildMessages(task.history, config.protocol === 'anthropic' ? task.model : null),
    ];

    emit({ type: 'assistant_start' });
    const r = await chat(
      config,
      { model: task.model, messages, tools },
      {
        signal,
        onDelta: (text) => emit({ type: 'delta', text }),
        onReasoning: (text) => emit({ type: 'reasoning', text }),
      },
    );

    const msg = { role: 'assistant', content: r.content || '', _at: Date.now() };
    if (r.reasoning) msg._reasoning = r.reasoning;
    if (r.toolCalls.length) msg.tool_calls = r.toolCalls;
    if (r.nativeBlocks?.length) {
      msg._anthropicBlocks = r.nativeBlocks;
      msg._anthropicModel = task.model;
    }
    if (r.usage) {
      task.usage ||= { prompt: 0, completion: 0, cost: 0 };
      task.usage.prompt += r.usage.prompt_tokens || 0;
      task.usage.completion += r.usage.completion_tokens || 0;
      // OpenRouter 等平台会在 usage.cost 中返回本次花费（美元）
      if (typeof r.usage.cost === 'number') task.usage.cost = (task.usage.cost || 0) + r.usage.cost;
    }
    task.history.push(msg);
    saveTask();
    emit({ type: 'message', message: msg });

    if (!r.toolCalls.length) return finishProject();

    let changed = false;
    for (const tc of r.toolCalls) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      let result;
      try {
        const args = parseArgs(tc.function.arguments);
        result = executeTool(tc.function.name, args, { project, task, mode });
      } catch (e) {
        result = { ok: false, output: `错误：${e.message}` };
      }
      if (result.changed) changed = true;
      const toolMsg = { role: 'tool', tool_call_id: tc.id, content: result.output, _ok: result.ok, _at: Date.now() };
      task.history.push(toolMsg);
      emit({ type: 'message', message: toolMsg });
    }
    if (changed) saveProject();
    saveTask();
    if (changed) emit({ type: 'changes' });
  }

  finishProject();
  const note = { role: 'assistant', content: `（已达到单次运行的最大步数 ${maxSteps}，任务暂停。可以发送“继续”让我接着完成。）`, _at: Date.now() };
  task.history.push(note);
  saveTask();
  emit({ type: 'message', message: note });
}

// ───────────── 用户消息（文字 + 附件） ─────────────

export const ATTACH_LIMITS = { images: 8, imageBytes: 6 * 1024 * 1024, files: 10, fileChars: 300000 };

function fenceFor(text) {
  let f = '```';
  while (text.includes(f)) f += '`';
  return f;
}

/**
 * 构造用户消息。attachments: [{ type: 'image', name, dataUrl } | { type: 'file', name, content }]
 * - 文件内容以代码块形式拼接到文本中
 * - 有图片时 content 为 OpenAI 多模态数组：[{type:'text'}, {type:'image_url'}...]
 * - _text 保存用户原始输入，_files 保存文件名，用于界面展示
 */
export function buildUserMessage(prompt, attachments = []) {
  const text = String(prompt || '').trim();
  const list = Array.isArray(attachments) ? attachments : [];
  const files = list.filter((a) => a && a.type === 'file' && typeof a.content === 'string');
  const images = list.filter((a) => a && a.type === 'image' && /^data:image\/[\w.+-]+;base64,/.test(a.dataUrl || ''));
  if (files.length > ATTACH_LIMITS.files) throw new Error(`一次最多附加 ${ATTACH_LIMITS.files} 个文件`);
  if (images.length > ATTACH_LIMITS.images) throw new Error(`一次最多附加 ${ATTACH_LIMITS.images} 张图片`);
  for (const f of files) if (f.content.length > ATTACH_LIMITS.fileChars) throw new Error(`文件 ${f.name} 过大`);
  for (const i of images) if (i.dataUrl.length > ATTACH_LIMITS.imageBytes) throw new Error(`图片 ${i.name || ''} 过大`);
  if (!text && !files.length && !images.length) throw new Error('请输入内容');

  let full = text;
  for (const f of files) {
    const name = String(f.name || '附件').slice(0, 200);
    const fence = fenceFor(f.content);
    full += `${full ? '\n\n' : ''}附件文件 ${name}：\n${fence}\n${f.content}\n${fence}`;
  }
  const msg = { role: 'user', content: full, _text: text, _at: Date.now() };
  if (images.length) {
    msg.content = [
      { type: 'text', text: full || '请看图片。' },
      ...images.map((i) => ({ type: 'image_url', image_url: { url: i.dataUrl } })),
    ];
  }
  if (files.length) msg._files = files.map((f) => ({ name: String(f.name || '附件').slice(0, 200), size: f.content.length }));
  return msg;
}

/** 任务标题：取用户输入的第一行，没有文字时用附件名 */
export function titleFromMessage(msg) {
  const raw = msg._text || (typeof msg.content === 'string' ? msg.content : '') || msg._files?.[0]?.name || (Array.isArray(msg.content) ? '图片' : '');
  // 去掉输入框自动附加的说明（例如网页主题），标题只保留用户自己写的话
  const line = String(raw).replace(/（网页主题：[^）]*）/g, '').replace(/\s+/g, ' ').trim();
  return line.length > 48 ? line.slice(0, 48) + '…' : line || '新任务';
}
