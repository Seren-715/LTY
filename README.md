# RTY Code · 代码编写智能体网站

一个类似 Codex 的 AI 编码智能体网站，界面采用浅蓝 + 白配色。登录后创建项目、描述任务，智能体会自动阅读和修改项目文件，并实时展示思考过程、工具调用、代码变更和网页预览。

网站有两种运行模式，代码是同一份：

| | 服务器模式（可选） | **纯静态模式（默认）** |
| --- | --- | --- |
| 部署 | 运行 `server.js`（Node.js 18.17+ 或 Docker） | 上传 `public/` 到静态托管，API 提供方须允许浏览器跨域访问 |
| 账号 | 用户名 + 密码注册登录 | 用 API Key 登录 |
| 额度 | 所有人共用管理员配置的 Key | 每人使用自己的唐果 Key，额度在唐果查看 |
| 智能体 | 在服务器后台运行 | 在浏览器里运行，关掉页面任务停止 |
| 数据 | 保存在服务器 `data/` 目录 | 保存在各自浏览器（IndexedDB），可导出 / 导入备份 |

`public/config.js` 默认使用 `mode: 'static'`。站点只需要静态文件托管，模型请求由浏览器直接发给唐果。

## 功能

| 模块 | 说明 |
| --- | --- |
| 账号 | 静态模式：API Key 登录、昵称、数据导出 / 导入，接口支持时显示余额；服务器模式：注册 / 登录 / 修改密码，首个账号为管理员 |
| 任务 | 首页输入任务，可选「提问」（只读）或「编码」（可改文件）模式；可同时跑多个；支持追问、停止、失败重试、重命名、归档、搜索 |
| 智能体 | 通过工具调用读写项目文件：`list_files` / `read_file` / `search_files` / `write_file` / `edit_file` / `delete_file`；流式输出，显示思考过程（reasoning） |
| 变更 | 每个任务的代码 diff（新增/删除行数统计），可以按文件或整体撤销 |
| 预览 | 网页项目在沙箱 iframe 中直接运行，支持多页面跳转，并带控制台输出 |
| 项目 | 新建项目（空白 / 网页 / Node.js / Python 模板），在线编辑器（语法高亮、Ctrl+S 保存），上传文件（支持拖拽），下载 ZIP，项目自定义指令 / `AGENTS.md` |
| 管理（服务器模式） | 在网页中配置 API 地址、Key、模型列表、测试连接；开关注册；用户管理 |

## 纯静态部署与唐果 Key 登录

1. 把 `public/` 目录的全部内容部署到静态托管平台。
2. 在 [唐果中转站](https://api.tangguo.xin/) 创建 API Key，在站点登录页输入该 Key。API 地址已配置为 `https://api.tangguo.xin/v1`。
3. 登录会调用 `/v1/models` 验证 Key 并读取可用的模型。编码任务需选择支持工具调用的模型。

**跨域要求**　唐果需要允许部署站点的来源通过 CORS 访问 `/v1/models` 和 `/v1/chat/completions`，并允许 `Authorization`、`Content-Type` 请求头。实测 GitHub Pages 和本地预览来源的预检均返回 403。唐果开通部署站点的跨域访问后，浏览器才能验证 Key 并发送聊天请求。

本地预览：

```bash
python -m http.server 8080 --directory public   # 打开 http://localhost:8080
```

项目和任务按 Key 保存在当前浏览器中。更换 Key 或部署域名时，可先从旧站的「账号设置」导出备份，再登录新站导入。

## 可选服务器模式（任意 Node.js 托管）

使用用户名和密码的旧版部署可将 `public/config.js` 的 `mode` 设为 `server`，再按以下说明配置：

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
