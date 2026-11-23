// =====================================================================
//  站点配置（纯静态部署时只需要修改这个文件）
// =====================================================================
window.RTY_CONFIG = {
  // 运行模式：
  //   'static' —— 纯静态网站（不需要服务器）：同学用你分发的 API Key 登录，
  //               智能体在浏览器里运行，数据保存在各自的浏览器中。
  //   'server' —— 配合 server.js 使用（有服务器时的完整版，账号和余额由服务器管理）。
  //   'auto'   —— 自动检测：能连上 server.js 就用服务器模式，否则用静态模式。
  mode: 'static',

  // 站点名称
  siteName: 'RTY Code',

  // 以下模型设置仅用于静态模式。服务器模式使用 .env 或「站点管理」。
  // 使用静态模式时，接口必须允许浏览器跨域访问。
  apiBaseUrl: 'https://api.tangguo.xin/v1',

  // 只显示当前 Key 分组可用的型号。优先使用官方 ID，再匹配中转站别名。
  modelCatalog: [
    { id: 'gpt-6.2-sol', protocol: 'openai' },
    { id: 'gpt-6.2-astra', protocol: 'openai' },
    { id: 'claude-opus-5-5', aliases: ['claude-opus-5.5'], protocol: 'anthropic' },
    { id: 'claude-sonnet-5-5', aliases: ['claude-sonnet-5.5'], protocol: 'anthropic' },
  ],

  // 默认模型（留空则使用列表第一个）
  defaultModel: '',

  // 单次运行最多调用模型多少步
  maxSteps: 30,

  // 附加系统提示词（对所有任务生效，可留空）
  systemPrompt: '',

  // 登录页的说明文字
  loginHint: '请输入你的唐果 API Key。',
};
