// 单元测试：智能体技能系统
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listSkills, loadSkill, parseFrontmatter, skillsPrompt, THEMES } from '../../public/js/core/skills.js';
import { executeTool, titleFromMessage } from '../../public/js/core/agent.js';

const projectFiles = {
  'skills/作业格式/SKILL.md': '---\nname: homework-format\ndescription: >\n  按课程要求排版作业，\n  交作业前使用。\n---\n# 步骤\n1. 首页写学号\n',
  'skills/作业格式/模板.md': '# 模板',
  'index.html': '',
};

test('内置技能：frontend-design 和 theme-factory，带完整说明', () => {
  const names = listSkills({}).map((s) => s.name);
  assert.deepEqual(names, ['frontend-design', 'theme-factory']);
  assert.match(loadSkill({}, 'frontend-design'), /Ground your designs in the subject matter/);
  assert.match(loadSkill({}, 'frontend-design'), /本站补充说明/);
  const theme = loadSkill({}, 'theme-factory');
  assert.equal(THEMES.length, 10);
  for (const t of THEMES) assert.ok(theme.includes(t.name) && t.colors.every((c) => theme.includes(c.hex)), t.name);
});

test('项目技能：解析 SKILL.md 的 name / 多行 description，列出同目录文件', () => {
  const { meta, body } = parseFrontmatter(projectFiles['skills/作业格式/SKILL.md']);
  assert.equal(meta.name, 'homework-format');
  assert.equal(meta.description, '按课程要求排版作业， 交作业前使用。');
  assert.match(body, /首页写学号/);
  const prompt = skillsPrompt(projectFiles);
  assert.match(prompt, /homework-format（项目：skills\/作业格式\/SKILL\.md）/);
  const text = loadSkill(projectFiles, 'Homework-Format');
  assert.match(text, /首页写学号/);
  assert.match(text, /skills\/作业格式\/模板\.md/);
});

test('项目技能可以覆盖同名的内置技能', () => {
  const files = { 'skills/fd/SKILL.md': '---\nname: frontend-design\ndescription: 我们自己的设计规范\n---\n只用黑白两色\n' };
  const list = listSkills(files);
  assert.equal(list.filter((s) => s.name === 'frontend-design').length, 1);
  assert.match(loadSkill(files, 'frontend-design'), /只用黑白两色/);
});

test('use_skill 工具：读取说明；名字不对时列出可用技能', () => {
  const ctx = { project: { name: 'p', files: projectFiles }, task: {}, mode: 'code' };
  const ok = executeTool('use_skill', { name: 'homework-format' }, ctx);
  assert.ok(ok.ok && !ok.changed);
  const bad = executeTool('use_skill', { name: 'nope' }, ctx);
  assert.equal(bad.ok, false);
  assert.match(bad.output, /frontend-design、theme-factory、homework-format/);
});

test('任务标题不包含自动附加的主题说明', () => {
  assert.equal(titleFromMessage({ _text: '做一个个人主页\n\n（网页主题：请使用 theme-factory 技能中的「Ocean Depths」主题）' }), '做一个个人主页');
});
