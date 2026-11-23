# RTY Code · 代码编写智能体网站

一个类似 Codex 的 AI 编码智能体网站，界面采用浅蓝 + 白配色。用户登录后创建项目、描述任务，智能体会自动阅读和修改项目文件，并实时展示思考过程、工具调用、代码变更和网页预览。

- **零依赖**：只需要 Node.js 18.17+，不用 `npm install`，没有构建步骤
- **API Key 只保存在服务器**：浏览器不会拿到 Key，所有模型请求都由后端转发
- **兼容任何 OpenAI 格式接口**：OpenAI、DeepSeek、通义千问（DashScope 兼容模式）、Moonshot、智谱、OpenRouter、各类中转 / 自建网关

## 功能

| 模块 | 说明 |
| --- | --- |
| 账号 | 注册 / 登录 / 退出、修改密码；第一个注册的账号自动成为管理员；会话 Cookie（HttpOnly），登录失败限流 |
| 任务 | 首页输入任务，可选「提问」（只读）或「编码」（可改文件）模式；任务在后台运行，可同时跑多个；支持追问、停止、失败重试、重命名、归档、搜索 |
| 智能体 | 通过工具调用读写项目文件：`list_files` / `read_file` / `search_files` / `write_file` / `edit_file` / `delete_file`；流式输出，显示思考过程（reasoning） |
| 变更 | 每个任务的代码 diff（新增/删除行数统计），可以按文件或整体撤销 |
| 预览 | 网页项目在沙箱 iframe 中直接运行，支持多页面跳转，并带控制台输出 |
| 项目 | 新建项目（空白 / 网页 / Node.js / Python 模板），在线编辑器（语法高亮、Ctrl+S 保存），上传文件（支持拖拽），下载 ZIP，项目自定义指令 / `AGENTS.md` |
| 管理 | 在网页中配置 API 地址、Key、模型列表（可从接口一键拉取）、测试连接；开关注册；添加 / 删除用户、重置密码、设置管理员 |

## 快速开始（本地）

```bash
cp .env.example .env     # 填写 API_BASE_URL / API_KEY / MODELS（也可以稍后在网页中填写）
npm start                # 打开 http://localhost:3000
```

首次打开会进入注册页，**第一个注册的账号就是管理员**。登录后进入「管理」页面填写：

1. **API 地址**：例如 `https://api.openai.com/v1`、`https://api.deepseek.com/v1`、`https://dashscope.aliyuncs.com/compatible-mode/v1`
2. **API Key**
3. **模型列表**：点「从接口拉取模型」选择，或手动填写，每行一个
4. 点「测试连接」确认可用，然后「保存配置」

> 编码模式依赖模型的工具调用（function calling）能力，请选择支持工具调用的模型。

## 部署到 Qoder 个人站点（或任意 Node.js 托管）

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
server.js            HTTP 服务、路由、任务运行与 SSE 推送
lib/
  agent.js           智能体循环、工具定义与执行、系统提示词
  llm.js             OpenAI 兼容客户端（流式、工具调用、拉取模型列表）
  auth.js            密码哈希（scrypt）、会话、限流
  store.js           JSON 文件存储
  files.js           虚拟文件系统路径校验与大小限制
  diff.js            行级 diff 统计
  templates.js       新建项目模板
public/
  index.html
  css/style.css      浅蓝 + 白主题
  js/app.js          前端路由与顶栏
  js/views/*.js      登录、首页、任务、项目、设置、管理页面
  js/*.js            Markdown、语法高亮、diff、预览、ZIP 等组件
```

## 安全说明

- 密码使用 scrypt 加盐哈希；会话令牌在服务器只存哈希
- 修改类请求需要自定义请求头，防止 CSRF；Cookie 为 HttpOnly + SameSite=Lax（HTTPS 下自动加 Secure）
- 预览在不带 `allow-same-origin` 的沙箱 iframe 中运行，项目代码无法读取本站 Cookie 或调用本站接口
- 智能体只能操作项目的虚拟文件，**不会在服务器上执行任何代码或命令**
- 单文件 1MB、单项目 500 个文件 / 20MB 的限制
