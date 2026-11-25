// 智能体技能（Agent Skills）：参考 anthropics/skills 的设计
// · 平时只把每个技能的名称和一句话简介放进系统提示词
// · 需要时智能体调用 use_skill 读取完整说明（渐进式加载，节省上下文）
// · 内置技能 + 项目技能（项目中的 skills/<名称>/SKILL.md，同学可以自己写）
import { FRONTEND_DESIGN_BODY, FRONTEND_DESIGN_DESCRIPTION, THEMES } from './skills-data.js';
import { sortedPaths } from './files.js';

export { THEMES };

// 主题字体原为演示文稿用的 DejaVu 系列，网页中换成对应的系统字体栈（含中文回退）
const FONT_STACK = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
  serif: "Georgia, 'Times New Roman', 'Songti SC', 'SimSun', 'Noto Serif SC', serif",
};
export const themeFont = (name) => (/serif/i.test(name) && !/sans/i.test(name) ? FONT_STACK.serif : FONT_STACK.sans);

const SITE_NOTES_DESIGN = `

## 本站补充说明（RTY Code）

- 本站的使用者多在中国大陆：不要依赖 Google Fonts 等可能无法访问的外部字体和 CDN；中文用系统字体栈，例如 ${FONT_STACK.sans}。需要特色字体时，优先用字重、字号、字距和版式本身来体现。
- 页面文案默认使用中文（跟随用户的语言），写真实、具体的内容，不要用“Lorem ipsum”之类的占位文字。
- 开始写代码前，先在回复里用几行话给出设计方案（配色 4–6 个色值、字体与字号层级、布局思路），然后按方案实现。
- 用户在「预览」面板中查看效果；动画要尊重 prefers-reduced-motion，并保证手机宽度下可用。`;

function themeMarkdown(t) {
  return [
    `### ${t.name}（${t.zh}）`,
    t.desc,
    ...t.colors.map((c) => `- ${c.name} \`${c.hex}\`：${c.role}`),
    `- 标题字体：${t.headers}（网页中用：${themeFont(t.headers)}）`,
    `- 正文字体：${t.body}（网页中用：${themeFont(t.body)}）`,
    `- 适合：${t.best}`,
  ].join('\n');
}

const THEME_BODY = `# Theme Factory（主题工厂）

为网页、页面或其他作品套用一套完整、协调的配色与字体主题。共有 10 套预设主题，也可以按用户描述现场生成新主题。

## 使用方法

1. 用户在输入框「＋ → 选择网页主题」里选了主题，或在消息里点名了主题：直接使用该主题。
2. 用户只说“换个风格”“好看一点”而没有指定：根据项目内容推荐 1–2 套最合适的主题，说明理由后直接采用最合适的一套（用户随时可以要求换）。
3. 套用主题时：
   - 在 CSS 的 :root 中把主题色定义为变量（例如 --color-primary、--color-bg），页面其余部分只引用变量，方便以后换主题。
   - 每种颜色按“用途”说明使用；正文文字与背景的对比度至少 4.5:1，不够时把文字色加深或改用主题中更深 / 更浅的颜色。
   - 字体使用下面给出的网页字体栈。
   - 整个项目所有页面保持同一套主题。
4. 没有合适的预设主题时，可以生成新主题：起一个能体现配色与字体气质的名字，给出 4 个色值（每个写明用途）和标题 / 正文字体，先在回复中展示，再应用。

## 预设主题

${THEMES.map(themeMarkdown).join('\n\n')}
`;

export const BUILTIN_SKILLS = [
  {
    name: 'frontend-design',
    title: '前端设计',
    description: `${FRONTEND_DESIGN_DESCRIPTION} 做网页、界面、落地页、作品集、小游戏界面，或用户要求“好看一点 / 重新设计”时使用。`,
    body: FRONTEND_DESIGN_BODY + SITE_NOTES_DESIGN,
    builtin: true,
  },
  {
    name: 'theme-factory',
    title: '主题工厂',
    description: '为网页或其他作品套用 10 套预设配色 + 字体主题之一（深海、日落大道、森林、现代极简、黄金时刻、北极霜、沙漠玫瑰、科技创新、植物园、午夜星河），或按描述生成新主题。用户选择或点名主题、要求统一配色风格时使用。',
    body: THEME_BODY,
    builtin: true,
  },
];

// ───────────── 项目技能 ─────────────

const SKILL_FILE = /^(?:\.claude\/skills|\.?skills)\/([^/]+)\/SKILL\.md$/;

/** 解析 SKILL.md 开头的 YAML 信息（只支持 name / description，description 可以是多行 > 或 |） */
export function parseFrontmatter(text) {
  const m = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: String(text || '') };
  const meta = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value === '>' || value === '|' || value === '>-' || value === '|-' || value === '') {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(value.startsWith('|') ? '\n' : ' ');
    }
    meta[kv[1]] = value.replace(/^["']|["']$/g, '');
  }
  return { meta, body: m[2] };
}

/** 项目中的技能：skills/<名称>/SKILL.md（也支持 .skills/ 和 .claude/skills/） */
export function projectSkills(files) {
  const out = [];
  for (const path of sortedPaths(files)) {
    const m = path.match(SKILL_FILE);
    if (!m) continue;
    const { meta } = parseFrontmatter(files[path]);
    out.push({
      name: String(meta.name || m[1]).trim().slice(0, 64),
      description: String(meta.description || '（没有简介）').trim().slice(0, 600),
      path,
      dir: path.slice(0, -'SKILL.md'.length),
    });
  }
  return out;
}

/** 当前可用的全部技能（项目技能与内置技能同名时，以项目为准） */
export function listSkills(files) {
  const proj = projectSkills(files);
  const names = new Set(proj.map((s) => s.name));
  return [...BUILTIN_SKILLS.filter((s) => !names.has(s.name)), ...proj];
}

/** 放进系统提示词的技能清单 */
export function skillsPrompt(files) {
  const list = listSkills(files);
  const lines = [
    '技能（Skills）：下面每个技能都有一份完整说明。任务与某个技能相关时，先调用 use_skill 读取它的说明，再按说明工作；用户点名某个技能时必须先读取。',
    ...list.map((s) => `- ${s.name}${s.builtin ? '（内置）' : `（项目：${s.path}）`}：${s.description}`),
    '用户想把一套做法保存下来反复使用时，可以帮他在项目中新建 skills/<英文名>/SKILL.md：开头用 --- 包住的 name 和 description（写清楚做什么、什么时候用），下面写具体步骤和要求。',
  ];
  return lines.join('\n');
}

/** 读取技能完整说明，找不到时返回 null */
export function loadSkill(files, name) {
  const key = String(name || '').trim().toLowerCase();
  const proj = projectSkills(files).find((s) => s.name.toLowerCase() === key);
  if (proj) {
    const { body } = parseFrontmatter(files[proj.path]);
    const extra = sortedPaths(files).filter((p) => p.startsWith(proj.dir) && p !== proj.path);
    return `# 技能：${proj.name}\n\n${body.trim()}${extra.length ? `\n\n该技能目录下的其他文件（需要时用 read_file 读取）：\n${extra.join('\n')}` : ''}`;
  }
  const b = BUILTIN_SKILLS.find((s) => s.name.toLowerCase() === key);
  return b ? `# 技能：${b.name}\n\n${b.body}` : null;
}
