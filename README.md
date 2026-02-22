# NodeConsoleApp2

一套面向回合制/战棋类**技能系统**的「数据规范 + 可视化编辑器」原型工程：使用 JSON 描述 `Skills / Buffs / Effects`，并通过 HTML 编辑器降低配置与迭代成本。

适用人群：独立开发、数值/策划、工具开发者（希望把“设计文档—数据—编辑器”串成闭环）。

## 主要特性

- **数据驱动**：技能与 Buff 全部以 JSON 表达，便于版本化、对比与回滚。
- **可视化编辑**：提供技能编辑器与 Buff 编辑器页面（HTML/JS），支持结构化字段编辑与原始 JSON 同步查看。
- **设计文档同步**：`design/skill_design.md` 与 `design/buff_design.md` 用于定义字段/枚举/示例，目标是与数据文件保持一致。
- **面向迭代**：仓库内存在多个版本的数据文件（例如 `buffs_v2_1.json` / `buffs_v2_2.json` / `buffs_v2_3.json`），用于承载结构演进。

## 仓库结构（概览）

- `design/`：技能与 Buff 的设计文档、枚举说明与示例
- `DOC/`：工作计划、过程文档、TODO 等
- `*.html`：编辑器页面（技能/ Buff）
- `buffs*.json` / `skills*.json`：核心数据文件（可能按版本号逐步演进）

## 快速开始

### 方式 A：直接打开 HTML（最简单）

1. 克隆仓库：
   - `git clone https://github.com/hugowangguowei/NodeConsoleApp2.git`
   在本地通过 python -m http.server 3000方式启动一个静态服务器，访问 http://localhost:3000/ 即可看到文件列表。
2. 打开编辑器页面：
   - `buff_editor_v4.html`
   - `skill_editor_test_v3.html`

提示：如果浏览器对本地文件读取有限制，建议用任意静态服务器启动（例如 VS Code Live Server、`npx serve` 等）。

### 方式 B：结合数据文件进行导入/导出

- Buff 库：通常来自 `buffs*.json`
- 技能库：通常来自 `skills*.json`
- 编辑完成后导出 JSON 并提交版本管理，以便追踪数值迭代。

## 核心概念（简述）

- **Skill（技能）**：由若干效果（Effects）组成，包含目标、触发、参数等。
- **Buff（状态）**：包含生命周期（持续回合/次数等）与动作（Action），用于实现增益/减益/伤害/治疗/控制等。
- **Effect / Action**：描述“发生了什么”，编辑器会根据类型动态显示字段。

详细字段与枚举说明请查看：

- `design/skill_design.md`
- `design/buff_design.md`

## 路线图 / TODO

`todoList.md`：按优先级整理的下一步计划（包含 2-3 人协作拆分）。

近期重点（示例）：

- 对齐并修复新版本 `buffs_v2_3.json` 的加载/解析
- 给技能增加 `editorMeta.editState` 并在 UI 体现编辑状态
- 明确并收敛 `effect.action` 枚举及其参数结构，并同步到文档/数据/编辑器

## 贡献

欢迎提交 Issue / PR：

- Bug 反馈（建议附数据片段/复现步骤/截图）
- 文档补齐（字段定义、枚举语义、示例数据）
- 编辑器体验优化（校验、搜索、交互、可视化）


