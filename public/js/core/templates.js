// 新建项目时可选的初始模板
import { vueFiles } from './scaffold.js';

const templates = {
  blank: { label: '空白项目', files: {} },

  web: {
    label: '网页（HTML / CSS / JS）',
    files: {
      'index.html': `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>我的网页</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="card">
    <h1>你好，世界 👋</h1>
    <p>在左侧描述你想做的功能，让智能体帮你实现。</p>
    <button id="btn">点我</button>
    <p id="count">已点击 0 次</p>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
      'style.css': `* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: linear-gradient(160deg, #eef6ff, #ffffff);
  color: #1f2937;
}
.card {
  padding: 32px 40px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(43, 125, 233, 0.12);
  text-align: center;
}
button {
  padding: 8px 20px;
  border: 0;
  border-radius: 999px;
  background: #2b7de9;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}
button:hover { background: #1f6fd8; }
`,
      'script.js': `let count = 0;
const btn = document.getElementById('btn');
const label = document.getElementById('count');

btn.addEventListener('click', () => {
  count += 1;
  label.textContent = \`已点击 \${count} 次\`;
});
`,
    },
  },

  node: {
    label: 'Node.js',
    files: {
      'package.json': `{
  "name": "my-app",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  }
}
`,
      'index.js': `const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Hello from Node.js!');
});

server.listen(3000, () => console.log('http://localhost:3000'));
`,
      'README.md': `# my-app

\`\`\`bash
npm start
\`\`\`
`,
    },
  },

  python: {
    label: 'Python',
    files: {
      'main.py': `def main() -> None:
    print("Hello from Python!")


if __name__ == "__main__":
    main()
`,
      'requirements.txt': '',
      'README.md': `# my-app

\`\`\`bash
python main.py
\`\`\`
`,
    },
  },
};

// Vue 模板与智能体的 scaffold_project 共用同一份骨架，项目名在创建时填入
templates.vue = { label: 'Vue 3 + Vite', files: null };

export function templateList() {
  return Object.entries(templates).map(([id, t]) => ({ id, label: t.label }));
}

export function templateFiles(id, name) {
  if (id === 'vue') return vueFiles(name);
  return { ...(templates[id] || templates.blank).files };
}
