// =====================================================================
//  站点配置（纯静态部署时只需要修改这个文件）
// =====================================================================
window.RTY_CONFIG = {
  // 运行模式：
  //   'static' —— 纯静态网站（不需要服务器）：同学用你分发的 API Key 登录，
  //               智能体在浏览器里运行，数据保存在各自的浏览器中。
  //   'server' —— 配合 server.js 使用（有服务器时的完整版，账号和余额由服务器管理）。
  //   'auto'   —— 自动检测：能连上 server.js 就用服务器模式，否则用静态模式。
  mode: 'auto',

  // 站点名称
  siteName: 'RTY Code',

  // 模型接口地址（OpenAI 兼容）。推荐 OpenRouter：可以给每个同学单独建 Key 并设置额度上限。
  apiBaseUrl: 'https://openrouter.ai/api/v1',

  // 可选的模型（OpenRouter 的模型 ID，可在 https://openrouter.ai/models 查询）。
  // 必须选择支持工具调用（Tools）的模型，否则「编码」模式无法修改文件。
  // 留空 [] 则自动从接口获取所有支持工具调用的模型。
  models: [
    'deepseek/deepseek-chat',
    'openai/gpt-4o-mini',
  ],

  // 默认模型（留空则使用列表第一个）
  defaultModel: '',

  // 单次运行最多调用模型多少步
  maxSteps: 30,

  // 附加系统提示词（对所有任务生效，可留空）
  systemPrompt: '',

  // 登录页的说明文字
  loginHint: '请输入分配给你的 API Key。没有 Key？请联系站点管理员。',
};
