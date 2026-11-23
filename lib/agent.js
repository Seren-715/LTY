'use strict';
// 代码智能体：在项目虚拟文件系统上通过工具调用完成编码任务
const { chat } = require('./llm');
const { normPath, checkWrite, sortedPaths } = require('./files');

const READ_TOOLS = [
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
function executeTool(name, args, ctx) {
  const { project, task, mode } = ctx;
  const files = project.files;
  const record = (path, after) => {
    task.changes ||= {};
    if (!(path in task.changes)) task.changes[path] = { before: path in files ? files[path] : null };
    task.changes[path].after = after;
    if (task.changes[path].before === after) delete task.changes[path];
  };

  try {
    switch (name) {
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

      case 'write_file':
      case 'edit_file':
      case 'delete_file':
        if (mode !== 'code') return { ok: false, output: '错误：当前为「提问」模式，不能修改文件' };
        break;

      default:
        return { ok: false, output: `错误：未知工具 ${name}` };
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

function systemPrompt({ siteName, project, mode, globalPrompt }) {
  const parts = [
    `你是「${siteName}」中的代码编写智能体，正在帮助用户在项目「${project.name}」中工作。`,
    '项目以虚拟文件系统的形式保存在服务器上。你只能通过提供的工具查看和修改文件，无法执行命令、运行代码或访问网络。',
    '',
    '工作准则：',
    '- 动手修改前，先用 list_files / read_file / search_files 了解相关代码。',
    '- 修改已有文件时优先用 edit_file 做精确替换；新建文件或大幅重写时用 write_file 并提供完整内容。',
    '- 写出完整、可直接运行的代码，保持与现有代码一致的风格，不要留下 TODO 占位符。',
    '- 网页项目的入口文件为 index.html，用户可以在「预览」面板中直接查看运行效果（支持相对路径引用项目内的 CSS/JS）。',
    '- 完成后用简洁的中文总结：改了哪些文件、做了什么、如何运行或验证。',
    '- 用户使用什么语言提问，就用什么语言回答。',
    '',
    mode === 'code'
      ? '当前模式：编码。你可以创建、编辑和删除文件来完成任务。'
      : '当前模式：提问。你只能读取文件，不能修改。请回答问题、解释代码或给出修改建议（可以在回复中给出代码片段）。',
  ];
  if (project.description) parts.push('', `项目简介：${project.description}`);
  if (project.instructions) parts.push('', '项目自定义指令：', project.instructions);
  const agents = project.files['AGENTS.md'];
  if (agents) parts.push('', 'AGENTS.md：', agents.slice(0, 8000));
  if (globalPrompt) parts.push('', '站点附加指令：', globalPrompt);
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

function buildMessages(rawHistory) {
  const history = repairHistory(rawHistory);
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
async function runAgent({ task, project, config, signal, emit, saveTask, saveProject }) {
  const mode = task.mode === 'code' ? 'code' : 'ask';
  const tools = mode === 'code' ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
  const maxSteps = Math.max(1, Math.min(100, parseInt(config.maxSteps, 10) || 30));

  for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const messages = [
      { role: 'system', content: systemPrompt({ siteName: config.siteName, project, mode, globalPrompt: config.systemPrompt }) },
      ...buildMessages(task.history),
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
    if (r.usage) {
      task.usage ||= { prompt: 0, completion: 0 };
      task.usage.prompt += r.usage.prompt_tokens || 0;
      task.usage.completion += r.usage.completion_tokens || 0;
    }
    task.history.push(msg);
    saveTask();
    emit({ type: 'message', message: msg });

    if (!r.toolCalls.length) return;

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

  const note = { role: 'assistant', content: `（已达到单次运行的最大步数 ${maxSteps}，任务暂停。可以发送“继续”让我接着完成。）`, _at: Date.now() };
  task.history.push(note);
  saveTask();
  emit({ type: 'message', message: note });
}

module.exports = { runAgent, executeTool };
