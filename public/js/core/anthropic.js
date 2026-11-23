// Anthropic Messages API，转换为智能体共用的文本、工具调用和用量格式。

function parseToolInput(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// OpenAI 多模态数组 → Anthropic 内容块
function toAnthropicContent(content) {
  if (!Array.isArray(content)) return content ? [{ type: 'text', text: content }] : [];
  const blocks = [];
  for (const part of content) {
    if (part.type === 'text' && part.text) blocks.push({ type: 'text', text: part.text });
    else if (part.type === 'image_url') {
      const url = part.image_url?.url || '';
      const m = url.match(/^data:([\w/.+-]+);base64,(.*)$/);
      if (m) blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
      else if (url) blocks.push({ type: 'image', source: { type: 'url', url } });
    }
  }
  return blocks;
}

function toAnthropicMessages(messages) {
  const system = [];
  const turns = [];
  for (const message of messages) {
    if (message.role === 'system' || message.role === 'developer') {
      if (message.content) system.push(message.content);
      continue;
    }

    const role = message.role === 'assistant' ? 'assistant' : 'user';
    let blocks;
    if (message.role === 'tool') {
      blocks = [{
        type: 'tool_result',
        tool_use_id: message.tool_call_id,
        content: message.content || '',
        ...(message._ok === false ? { is_error: true } : {}),
      }];
    } else if (role === 'assistant' && message._anthropicBlocks?.length) {
      blocks = message._anthropicBlocks;
    } else {
      blocks = toAnthropicContent(message.content);
      for (const call of message.tool_calls || []) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parseToolInput(call.function.arguments) });
      }
    }

    if (!blocks.length) continue;
    const previous = turns.at(-1);
    if (previous?.role === role) previous.content.push(...blocks);
    else turns.push({ role, content: [...blocks] });
  }
  return { system: system.join('\n\n'), messages: turns };
}

function toAgentResponse(blocks, stopReason, usage) {
  const content = [];
  const reasoning = [];
  const toolCalls = [];
  for (const block of blocks) {
    if (block.type === 'text') content.push(block.text);
    else if (block.type === 'thinking') reasoning.push(block.thinking);
    else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input || {}) },
      });
    }
  }
  const finishReasons = { end_turn: 'stop', stop_sequence: 'stop', tool_use: 'tool_calls', max_tokens: 'length' };
  return {
    content: content.join(''),
    reasoning: reasoning.join(''),
    toolCalls,
    finishReason: (stopReason && (finishReasons[stopReason] || stopReason)) || null,
    usage: usage ? {
      prompt_tokens: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
      completion_tokens: usage.output_tokens || 0,
    } : null,
    nativeBlocks: blocks,
  };
}

async function readAnthropicStream(res, readSse, onDelta, onReasoning) {
  const blocks = [];
  const toolInputs = new Map();
  let usage = null;
  let stopReason = null;
  let done = false;

  await readSse(res, (data) => {
    if (data === '[DONE]') return;
    const event = JSON.parse(data);
    if (event.type === 'error' || event.error) throw new Error(event.error?.message || 'Claude 流式请求失败');
    switch (event.type) {
      case 'message_start':
        usage = event.message.usage || null;
        break;
      case 'content_block_start': {
        const block = event.content_block;
        blocks[event.index] = block;
        if (block.type === 'text' && block.text) onDelta?.(block.text);
        if (block.type === 'thinking' && block.thinking) onReasoning?.(block.thinking);
        break;
      }
      case 'content_block_delta': {
        const block = blocks[event.index];
        if (!block) break;
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          block.text += delta.text;
          onDelta?.(delta.text);
        } else if (delta.type === 'thinking_delta') {
          block.thinking += delta.thinking;
          onReasoning?.(delta.thinking);
        } else if (delta.type === 'signature_delta') {
          block.signature = (block.signature || '') + delta.signature;
        } else if (delta.type === 'input_json_delta') {
          toolInputs.set(event.index, (toolInputs.get(event.index) || '') + delta.partial_json);
        } else if (delta.type === 'citations_delta') {
          (block.citations ||= []).push(delta.citation);
        }
        break;
      }
      case 'content_block_stop': {
        const input = toolInputs.get(event.index);
        if (input) blocks[event.index].input = JSON.parse(input);
        toolInputs.delete(event.index);
        break;
      }
      case 'message_delta':
        stopReason = event.delta?.stop_reason ?? stopReason;
        if (event.usage) usage = { ...usage, ...event.usage };
        break;
      case 'message_stop':
        done = true;
        break;
    }
  });

  if (!done) throw new Error('Claude 流式响应提前结束');
  return toAgentResponse(blocks.filter(Boolean), stopReason, usage);
}

export async function chatAnthropic(cfg, body, { signal, onDelta, onReasoning }, { endpoint, readError, readSse }) {
  const payload = {
    model: body.model,
    max_tokens: body.max_tokens ?? 8192,
    stream: cfg.stream !== false,
    ...toAnthropicMessages(body.messages),
  };
  if (!payload.system) delete payload.system;
  if (body.tools?.length) {
    payload.tools = body.tools.map(({ function: tool }) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', 'anthropic-version': '2023-06-01' };
  if (cfg.apiKey) headers['x-api-key'] = cfg.apiKey;
  const res = await fetch(endpoint(cfg.apiBaseUrl, '/messages'), {
    method: 'POST', headers, body: JSON.stringify(payload), signal,
  });
  if (!res.ok) throw await readError(res);
  if (res.headers.get('content-type')?.includes('text/event-stream')) return readAnthropicStream(res, readSse, onDelta, onReasoning);

  const message = await res.json();
  if (message.error) throw new Error(message.error.message || 'Claude 请求失败');
  if (!Array.isArray(message.content)) throw new Error('Claude 接口未返回消息内容');
  const result = toAgentResponse(message.content, message.stop_reason, message.usage);
  if (result.content) onDelta?.(result.content);
  if (result.reasoning) onReasoning?.(result.reasoning);
  return result;
}
