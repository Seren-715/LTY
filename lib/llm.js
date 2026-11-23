'use strict';
// OpenAI 兼容的 Chat Completions 客户端（支持流式输出与工具调用）。
// 兼容 OpenAI、DeepSeek、通义千问 DashScope 兼容模式、Moonshot、OpenRouter、各类中转等。

function endpoint(baseUrl, suffix) {
  let u = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!u) throw new Error('尚未配置 API 地址');
  if (suffix === '/chat/completions') {
    if (/\/chat\/completions$/.test(u)) return u;
    return u + suffix;
  }
  u = u.replace(/\/chat\/completions$/, '');
  return u + suffix;
}

function headers(cfg) {
  const h = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' };
  if (cfg.apiKey) h.Authorization = `Bearer ${cfg.apiKey}`;
  return h;
}

async function readError(res) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  let msg = text;
  try {
    const j = JSON.parse(text);
    msg = j.error?.message || j.message || j.msg || text;
  } catch {
    /* 非 JSON */
  }
  return new Error(`模型接口返回 ${res.status}${msg ? '：' + String(msg).slice(0, 600) : ''}`);
}

function mergeToolCalls(target, deltas) {
  for (const tc of deltas) {
    let i = typeof tc.index === 'number' ? tc.index : tc.id ? target.length : target.length - 1;
    if (i < 0) i = 0;
    const cur = (target[i] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
    if (tc.id) cur.id = tc.id;
    if (tc.function?.name) {
      // 有些服务每个分片都会带完整名称
      cur.function.name = cur.function.name === tc.function.name ? cur.function.name : cur.function.name + tc.function.name;
    }
    if (tc.function?.arguments) {
      const a = tc.function.arguments;
      cur.function.arguments += typeof a === 'string' ? a : JSON.stringify(a);
    }
  }
}

function finalizeToolCalls(list) {
  return list
    .filter((t) => t && t.function && t.function.name)
    .map((t, i) => ({
      id: t.id || `call_${Date.now().toString(36)}_${i}`,
      type: 'function',
      function: { name: t.function.name, arguments: t.function.arguments || '{}' },
    }));
}

/**
 * 调用 chat/completions。
 * handlers.onDelta(text) / handlers.onReasoning(text) 在流式输出时回调。
 * 返回 { content, reasoning, toolCalls, finishReason, usage }
 */
async function chat(cfg, body, { signal, onDelta, onReasoning } = {}) {
  const payload = { ...body };
  if (cfg.stream !== false) payload.stream = true;
  if (cfg.temperature !== undefined && cfg.temperature !== null && cfg.temperature !== '') {
    payload.temperature = Number(cfg.temperature);
  }

  const res = await fetch(endpoint(cfg.apiBaseUrl, '/chat/completions'), {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw await readError(res);

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream')) {
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    const m = j.choices?.[0]?.message || {};
    const content = typeof m.content === 'string' ? m.content : '';
    const reasoning = m.reasoning_content || m.reasoning || '';
    if (reasoning && onReasoning) onReasoning(reasoning);
    if (content && onDelta) onDelta(content);
    return {
      content,
      reasoning,
      toolCalls: finalizeToolCalls(m.tool_calls || []),
      finishReason: j.choices?.[0]?.finish_reason || null,
      usage: j.usage || null,
    };
  }

  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  let reasoning = '';
  let finishReason = null;
  let usage = null;
  const toolCalls = [];

  const handleData = (data) => {
    if (data === '[DONE]') return;
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      return;
    }
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    if (j.usage) usage = j.usage;
    const choice = j.choices?.[0];
    if (!choice) return;
    const d = choice.delta || choice.message || {};
    const r = d.reasoning_content ?? d.reasoning;
    if (typeof r === 'string' && r) {
      reasoning += r;
      onReasoning && onReasoning(r);
    }
    if (typeof d.content === 'string' && d.content) {
      content += d.content;
      onDelta && onDelta(d.content);
    }
    if (Array.isArray(d.tool_calls)) mergeToolCalls(toolCalls, d.tool_calls);
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line.startsWith('data:')) handleData(line.slice(5).trim());
    }
  }
  const rest = buf.trim();
  if (rest.startsWith('data:')) handleData(rest.slice(5).trim());

  return { content, reasoning, toolCalls: finalizeToolCalls(toolCalls), finishReason, usage };
}

async function listModels(cfg, signal) {
  const res = await fetch(endpoint(cfg.apiBaseUrl, '/models'), { headers: headers(cfg), signal });
  if (!res.ok) throw await readError(res);
  const j = await res.json();
  const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : Array.isArray(j) ? j : [];
  return arr.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean).sort();
}

module.exports = { chat, listModels };
