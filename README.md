# RTY Code · 代码编写智能体网站

一个类似 Codex 的 AI 编码智能体网站，界面采用浅蓝 + 白配色。登录后创建项目、描述任务，智能体会自动阅读和修改项目文件，并实时展示思考过程、工具调用、代码变更和网页预览。

网站有两种运行模式，代码是同一份：

| | **纯静态模式（推荐给同学共用）** | 服务器模式（可选） |
| --- | --- | --- |
| 部署 | 上传 `public/` 文件夹到任意静态托管（如 Qoder 个人站点），**不需要服务器** | 运行 `server.js`（Node.js 18.17+ 或 Docker） |
| 账号 | 用你分发的 API Key 登录，每人一个 Key | 用户名 + 密码注册登录 |
| 余额 | 由 API 平台管理（如 OpenRouter 给每个 Key 设额度上限），网站显示剩余额度 | 所有人共用站长的 Key，不限额 |
| 智能体 | 在浏览器里运行，关掉页面任务停止 | 在服务器后台运行 |
| 数据 | 保存在各自浏览器（IndexedDB），可导出 / 导入备份 | 保存在服务器 `data/` 目录 |

`public/config.js` 中的 `mode: 'auto'` 会自动判断：能连上 `server.js` 就用服务器模式，否则用纯静态模式。

## 功能

| 模块 | 说明 |
| --- | --- |
| 账号 | 静态模式：API Key 登录、昵称、顶栏显示剩余额度、数据导出 / 导入；服务器模式：注册 / 登录 / 修改密码，首个账号为管理员 |
| 任务 | 首页输入任务，可选「提问」（只读）或「编码」（可改文件）模式；可同时跑多个；支持追问、停止、失败重试、重命名、归档、搜索；显示每个任务的花费 |
| 智能体 | 通过工具调用读写项目文件：`list_files` / `read_file` / `search_files` / `write_file` / `edit_file` / `delete_file`；流式输出，显示思考过程（reasoning） |
| 变更 | 每个任务的代码 diff（新增/删除行数统计），可以按文件或整体撤销 |
| 预览 | 网页项目在沙箱 iframe 中直接运行，支持多页面跳转，并带控制台输出 |
| 项目 | 新建项目（空白 / 网页 / Node.js / Python 模板），在线编辑器（语法高亮、Ctrl+S 保存），上传文件（支持拖拽），下载 ZIP，项目自定义指令 / `AGENTS.md` |
| 管理（服务器模式） | 在网页中配置 API 地址、Key、模型列表、测试连接；开关注册；用户管理 |

## 纯静态模式：部署给同学用

### 1. 准备 OpenRouter

1. 注册 [OpenRouter](https://openrouter.ai)，在 **Credits** 页面充值（这是所有同学共用的钱包）。
2. 打开 **Settings → API Keys**，为每个同学点 **Create Key**：
   - **Name** 填同学的名字，方便你在后台区分谁用了多少；
   - **Credit limit** 填这个同学的额度（例如 5 美元），用完后该 Key 的请求会被拒绝，不会多花你的钱。
3. 把 Key 发给对应的同学（Key 只在创建时显示一次，请先保存好）。

之后的管理都在 OpenRouter 后台完成：

| 想做的事 | 在 OpenRouter 后台怎么操作 |
| --- | --- |
| 给同学充值 | 编辑该 Key，调高 Credit limit |
| 查看谁用了多少 | Activity 页面，或 API Keys 列表中每个 Key 的用量 |
| 停用某个同学 | 禁用或删除他的 Key |

### 2. 修改 `public/config.js`

```js
window.RTY_CONFIG = {
  mode: 'auto',
  siteName: 'RTY Code',
  apiBaseUrl: 'https://openrouter.ai/api/v1',
  models: ['deepseek/deepseek-chat', 'openai/gpt-4o-mini'], // 留空 [] 则自动列出所有支持工具调用的模型
  defaultModel: '',
  maxSteps: 30,
  systemPrompt: '',
  loginHint: '请输入分配给你的 API Key。没有 Key？请联系站点管理员。',
};
```

模型 ID 可以在 [openrouter.ai/models](https://openrouter.ai/models) 查询（筛选支持 Tools 的模型）。编码模式需要模型支持工具调用。

### 3. 上传

把 **`public/` 文件夹里的全部内容**上传到 Qoder 个人站点（或任何静态网站托管，如 GitHub Pages）。不需要安装依赖，也没有构建步骤。

本地预览：

```bash
cd public && python3 -m http.server 8080   # 打开 http://localhost:8080
```

> 注意：
> - 站点最好使用 HTTPS（静态托管平台一般默认提供）。
> - 同学的数据保存在各自的浏览器里，**清除浏览器数据会丢失**，换电脑前请在「账号设置 → 导出备份」。
> - 浏览器会直接请求模型接口，接口需要允许跨域（OpenRouter 支持）。如果换成其他平台出现「无法连接模型接口」，多半是该平台不允许浏览器直连。
> - 同学的 Key 只保存在他自己的浏览器中，其他同学看不到。

## 服务器模式：快速开始（可选）

```bash
cp .env.example .env     # 填写 API_BASE_URL / API_KEY / MODELS（也可以稍后在网页中填写）
npm start                # 打开 http://localhost:3000
```

首次打开会进入注册页，**第一个注册的账号就是管理员**。登录后进入「管理」页面填写 API 地址、Key、模型列表，点「测试连接」确认可用，然后「保存配置」。

## 服务器模式部署（任意 Node.js 托管）

本项目是一个标准的 Node.js Web 服务，部署时只需要：

| 配置项 | 值 |
| --- | --- |
| 运行环境 | Node.js 18.17 或更高 |
| 安装命令 | 不需要（无依赖）。如果平台必须填写，可填 `npm install` |
| 构建命令 | 不需要 |
| 启动命令 | `npm start`（即 `node server.js`） |
| 端口 | 读取环境变量 `PORT`（默认 3000），平台会自动注入的话无需设置 |
| 持久化目录 | `data/`（或用 `DATA_DIR` 指定）——账号、项目、任务都存在这里，**请确保平台会持久化该目录**，否则重新部署后数据会丢失 |

步骤：

1. 在 Qoder 中打开本仓库，使用其站点 / 部署功能，选择 Node.js 项目，填写上表中的启动命令。
2. 在平台的环境变量中设置 `API_BASE_URL`、`API_KEY`、`MODELS`（也可以部署后登录管理员账号在网页中设置）。
3. 为防止陌生人抢先注册成管理员，建议同时设置 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，服务启动时会自动创建管理员账号；如果是个人使用，可以设置 `ALLOW_REGISTER=false` 关闭公开注册。
4. 部署完成后访问站点即可。

> ⚠️ 本项目需要一个**能运行 Node.js 后端**的环境（登录和 API Key 保护都依赖后端）。如果你的站点只支持纯静态托管，请改用支持 Node.js 的托管方式，或使用下面的 Docker 部署到云服务器。

### Docker

```bash
docker build -t rty-code .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data \
  -e API_BASE_URL=https://api.openai.com/v1 -e API_KEY=sk-xxx -e MODELS=gpt-4o \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=change-me-please \
  --name rty-code rty-code
```

### 放在 Nginx 反向代理后面

任务的实时输出使用 SSE（Server-Sent Events），需要关闭代理缓冲：

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
  proxy_read_timeout 3600s;
}
```

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | 监听端口 | `3000` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `DATA_DIR` | 数据目录 | `./data` |
| `SITE_NAME` | 站点名称 | `RTY Code` |
| `API_BASE_URL` | OpenAI 兼容接口地址 | — |
| `API_KEY` | 接口密钥 | — |
| `MODELS` | 模型列表，逗号分隔 | — |
| `DEFAULT_MODEL` | 默认模型 | 列表第一个 |
| `ALLOW_REGISTER` | 是否允许自行注册 | `true` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 启动时自动创建的管理员 | — |
| `MAX_STEPS` | 单次运行最多调用模型的步数 | `30` |
| `STREAM` | 是否使用流式输出 | `true` |
| `TEMPERATURE` | 采样温度 | 模型默认 |
| `SESSION_DAYS` | 登录有效天数 | `30` |

网页「管理」中保存的配置优先于环境变量。

## 目录结构

```
server.js            （服务器模式）HTTP 服务、路由、任务运行与 SSE 推送
lib/                 （服务器模式）密码哈希、会话、JSON 文件存储、.env 读取
public/              ← 纯静态模式只需要上传这个文件夹
  config.js          站点配置（运行模式、API 地址、模型列表）
  index.html
  css/style.css      浅蓝 + 白主题
  js/app.js          前端路由与顶栏
  js/api.js          接口层：服务器模式走 HTTP，静态模式走浏览器内实现
  js/core/           前后端共用：智能体循环与工具、OpenAI 兼容客户端、文件校验、diff、项目模板
  js/local/          纯静态模式的浏览器内「后端」（IndexedDB 存储、Key 登录、额度查询、备份）
  js/views/*.js      登录、首页、任务、项目、设置、管理页面
  js/*.js            Markdown、语法高亮、diff、预览、ZIP 等组件
```

## 安全说明

纯静态模式：

- 每个同学的 Key 只保存在自己浏览器的 localStorage 中，不经过本站；退出登录即删除
- 额度由 API 平台在服务端强制执行，前端无法绕过
- 预览在沙箱 iframe 中运行，项目代码无法读取 Key

服务器模式：

- 密码使用 scrypt 加盐哈希；会话令牌在服务器只存哈希
- 修改类请求需要自定义请求头，防止 CSRF；Cookie 为 HttpOnly + SameSite=Lax（HTTPS 下自动加 Secure）
- 预览在不带 `allow-same-origin` 的沙箱 iframe 中运行，项目代码无法读取本站 Cookie 或调用本站接口
- 智能体只能操作项目的虚拟文件，**不会在服务器上执行任何代码或命令**
- 单文件 1MB、单项目 500 个文件 / 20MB 的限制
