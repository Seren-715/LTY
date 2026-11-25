# 第三方声明

`public/js/fx.js`、`public/js/palette.js` 和 `public/css/style.css` 末尾的交互效果，移植改写自以下 MIT 许可的开源项目。

## Bencho（界面音效等）

```
MIT License

Copyright (c) 2026 Lorenzo Cabra

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Not covered by this licence: the Bencho name and the goat mark, and the
photographs shown on bencho.dev (none are included here). Third-party
material keeps its own licence; see THIRD_PARTY.md.
```

其中 Plop 音效改编自 cuelume：

```
MIT License

Copyright (c) 2026 Daniel Belyi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Magic UI

```
MIT License

Copyright (c) Magic UI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Preline UI

```
MIT License

Copyright (c) 2026 Preline Labs Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


Preline UI Fair Use License

1. Usage Restrictions:
- Competing Products: The Software shall not be used to create any product or service that directly competes with Preline UI. A competing product is defined as any software or service that replicates the primary functionalities of Preline UI.
- Misuse and Abuse: The Software shall not be used for any activities that are deemed harmful, abusive, or intended to deceive end-users. This includes, but is not limited to, creating malware, engaging in fraudulent activities, or infringing on the rights of others.

2. Commercial Derivative Works:
Users are permitted to create and sell derivative works such as templates, themes, and page builders, provided that:
- The derivative works must not be marketed as competing products.
- Proper attribution must be given to the original author, including the name "Preline UI" and a link to the original repository.
- A clear distinction must be made between the original work and the derivative work, ensuring that users understand the source of each.

3. Distribution and Sublicensing:
Redistribution of the Software in its original or modified form is allowed under the MIT License, with the following additional conditions:
- Redistributions must include this Fair Use License in addition to the MIT License.
- Redistributions must not remove or alter any licensing information or notices.
- Must include clear attribution with a link to the original repository.

4. Termination:
The author reserves the right to terminate the rights granted under this Fair Use License if the user fails to comply with the terms. Upon termination, the user must cease all use and distribution of the Software, and destroy all copies in their possession.

5. Enforcement and Compliance:
- Users who believe that the terms of this Fair Use License have been violated are encouraged to report the violation to the author.
- The author reserves the right to take legal action to enforce compliance with this Fair Use License.```

## Anthropic Agent Skills（frontend-design、theme-factory）

`public/js/core/skills-data.js` 和 `public/js/core/skills.js` 中的内置技能来自 [anthropics/skills](https://github.com/anthropics/skills)，Copyright 2026 Anthropic, PBC.，按 Apache License 2.0 授权，许可证全文见 [`licenses/anthropic-skills-APACHE-2.0.txt`](licenses/anthropic-skills-APACHE-2.0.txt)。

本项目所做的修改：

- frontend-design：`SKILL.md` 正文原样收录，末尾追加了「本站补充说明」（中文字体与网络环境、文案语言、先给设计方案再写代码等）；描述后追加了中文触发说明。
- theme-factory：10 个主题文件（`themes/*.md`）转为结构化数据；使用说明改写为中文并适配网页场景（不再展示 PDF 主题样张，改为在输入框「＋ → 选择网页主题」中选择；DejaVu 字体映射为含中文回退的网页字体栈）。

## Vue 预览使用的库（public/vendor/vue/）

以下文件为官方发布的浏览器构建，未作修改（编译器仅用 esbuild 压缩），均为 MIT 许可，许可证原文放在同一目录：

| 文件 | 来源 | 版权 |
| --- | --- | --- |
| `vue.esm-browser.prod.js` | vue 3.5.46 | © 2018-present, Yuxi (Evan) You |
| `compiler-sfc.esm-browser.min.js` | @vue/compiler-sfc 3.5.46 | © 2018-present, Yuxi (Evan) You |
| `vue-router.esm-browser.prod.js` | vue-router 5.5.1 | © 2019-present Eduardo San Martin Morote |
| `pinia.esm-browser.prod.js` | pinia 4.1.0 | © 2019-present Eduardo San Martin Morote |

## PDF.js（public/vendor/pdfjs/）

`pdf.min.mjs`、`pdf.worker.min.mjs` 和 `cmaps/` 来自 [pdfjs-dist](https://github.com/mozilla/pdf.js) 6.5.438（Mozilla），未作修改，按 Apache License 2.0 授权，许可证原文见 `public/vendor/pdfjs/LICENSE.txt`。用于在浏览器里提取 PDF 附件中的文字。
