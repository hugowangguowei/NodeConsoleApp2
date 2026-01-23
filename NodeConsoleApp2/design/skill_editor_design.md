# 技能编辑器设计文档 (Skill Editor Design)

## 1. 概述 (Overview)

为了满足日益复杂的技能系统设计需求，特别是技能树结构的可视化编辑，我们需要开发一款基于网页的 **技能编辑器 (Skill Editor)**。该编辑器将允许开发者在一个可视化的二维画布上创建、编辑、连接和管理技能节点，并最终将数据导出为游戏引擎可用的 JSON（目前为 `assets/data/skills.json`）。

核心目标：
*   **可视化编辑**：脱离纯文本编辑，通过节点连线直观地构建技能依赖图（DAG）。
*   **结构化 Buff 引用**：技能只“引用 Buff”，使用 `buffRefs.apply/applySelf/remove`，避免自由文本式的 [Buff] 描述。
*   **强校验**：在编辑阶段阻止无效数据（缺失 `buffId`、环依赖、非法目标/部位组合）。
*   **数据一致性**：确保导出的数据与当前 `assets/data/skills.json` 的字段/层级完全一致，且可被引擎加载。

---

## 2. 编辑器功能 (Editor Capabilities)

### 2.1 技能管理
*   **载入文件**：支持从本地加载 `assets/data/skills.json` 与 `assets/data/buffs.json`。技能数据以图谱形式展示在画布上。
*   **创建技能**：支持通过工具栏新建技能节点。
*   **编辑属性**：选中节点后，在侧边栏编辑技能详细属性（见第5章字段分组），其中 Buff 必须通过 `buffRefs` 结构编辑。
*   **删除技能**：支持删除选中的节点（智能处理前置/后置关系的解绑）。
*   **复制/粘贴**：快速复制已有技能配置，便于制作同流派的进阶技能。

### 2.2 技能树构建 (核心功能)
*   **节点拖拽**：在二维画布上自由拖拽技能节点，调整布局。
*   **连线关系**：通过从一个节点拖拽连线到另一个节点，建立 **前置依赖 (Prerequisite)** 关系（写入目标节点的 `prerequisites[]`）。
    *   箭头的方向表示依赖方向（例如：`重锤挥击` -> `野蛮冲撞` 表示 `重锤挥击` 是 `野蛮冲撞` 的前置）。
*   **关系解除**：选中连线并删除，解除依赖关系。
*   **DAG 校验**：检测是否存在循环依赖；禁止创建会生成环的连线。

### 2.3 数据输入/输出 (I/O)
*   **导入 JSON**：支持上传或粘贴现有的 `skills.json` 内容（对象映射结构），还原为图谱结构。
*   **导出 JSON**：一键生成符合引擎定义的 `skills.json`（对象映射结构：key 必须与 skill `id` 一致）。
*   **导出模式**：
    *   开发模式：保留 `editorMeta`（布局信息）。
    *   运行模式：剥离 `editorMeta`（避免污染运行数据）。
*   **本地缓存**：利用 `localStorage` 自动保存当前编辑进度，防止意外丢失。

---

## 3. 编辑器实现形式 (Implementation)

### 3.1 技术方案选型 (Technical Architecture)
为了满足网格对齐和正交折线的需求，建议采用 **分层渲染 (Layered Rendering)** 架构：

*   **Layer 1 (Bottom): 背景网格层 (Canvas)**
    *   使用 HTML5 Canvas 绘制静态网格线。
    *   **理由**: Canvas 绘制大量简单线条性能极佳，且作为背景无需交互，适合处理无限画布的视觉参考。
*   **Layer 2 (Middle): 连线层 (SVG)**
    *   使用全屏 SVG 覆盖在 Canvas 之上。
    *   **连线对象**: 使用 `<polyline>` 或 `<path>` 元素绘制折线。
    *   **理由**: SVG 元素是 DOM 的一部分，原生支持事件监听（如 `click` 选中连线、`hover` 高亮），这比在 Canvas 中手动实现点击检测要简单得多。
    *   **路由算法**: 不需要引入重型库，只需实现一个简易的 **Manhattan Routing** (曼哈顿路由) 算法，确保线条只在 `Grid Lines` 上行走。
*   **Layer 3 (Top): 节点交互层 (HTML DOM)**
    *   使用 `absolute` 定位的 `div` 元素表示技能节点。
    *   **理由**: 节点包含复杂的文本、图标和边框样式，HTML+CSS 是实现这些最灵活且开发成本最低的方式。
*   **辅助库**: 
    *   不建议使用大型图表库。推荐 **原生实现**，以保证对“网格吸附”和“正交走线”逻辑的绝对控制。

### 3.2 界面布局 (UI Layout)

编辑器界面分为四个主要区域：

#### A. 顶部工具栏 (Toolbar)
*   **文件操作**：[导入 JSON] [导出 JSON] [清空画布]
*   **视图操作**：[重置缩放] [自动排列(可选)]
*   **流派筛选**：下拉菜单选择当前显示的流派（例如：只显示“重装猛攻”），避免画布过于杂乱。

#### B. 技能列表 (SkillList)
*   **形态：左侧可折叠抽屉 (Drawer / Collapsible Sidebar)**
    *   **默认收起**，避免长期占用画布宽度；需要全局导航/搜索时再展开。
    *   抽屉展开后覆盖在画布左侧。
*   **展开/收起触发**
    *   顶部工具栏提供 `Skills` 按钮（Toggle Drawer）。
    *   画布左侧提供一个窄的“把手/边缘热区”（Edge Handle），点击或拖拽可展开。
    *   快捷键建议：`Ctrl+B` 切换抽屉；`Ctrl+K` 打开“快速搜索/跳转”输入框（可直接定位技能）。
*   **抽屉内容与能力（展开状态）**
    *   显示当前加载的所有技能列表（按 `name/id` 展示，附带 `rarity`/流派徽标可选）。
    *   支持搜索过滤（最小可用：`name` + `id`；增强：流派/稀有度/标签）。
    *   支持“定位到画布”：点击列表项后，若该技能已在画布上，则执行 `Center on Canvas` 并高亮节点。
    *   支持“未上画布技能”提示：
        *   若技能缺少 `editorMeta` 或未生成节点，则在列表中显示“未布局”标记。
        *   支持将该技能拖拽到画布上完成第一次放置（或提供 `Place on Canvas` 按钮）。
*   **职责边界**
    *   抽屉的定位：提供“全局导航/搜索/缺失布局发现”能力；不要求作为日常编辑主入口。
    *   新增/复制/删除等全局操作可放在 Toolbar 或右侧属性面板；抽屉内可仅保留轻量入口（可选）。

#### C. 中央画布区 (Canvas Workspace) - 核心设计
为了更好地支持技能树的可视化编辑，该区域采用 **基于网格的混合渲染 (Grid-based Hybrid Rendering)** 方案。

1.  **要素组成 (Composition)**
    *   **背景网格 (Background Grid)**: 画布被划分为 `M * N` 的虚拟网格区域（例如 100x100px 单元格）。
        *   **功能**: 对齐辅助，每个网格单元 (Cell) 作为一个布局插槽，通常只能容纳一个技能节点。
        *   **实现**: 使用 HTML5 Canvas 绘制浅色线条，随缩放和平移更新。
    *   **技能节点 (Skill Nodes)**: 浮动在网格之上的 DOM 元素。
        *   **功能**: 显示技能图标、名称、ID 和消耗。
        *   **对齐**: 拖拽释放时，节点会自动吸附 (Snap) 到最近的网格单元中心。
        *   **端口**: 实际上节点不显示显式的端口，但在逻辑上，每个单元格的四条边中点因为连线机制而成为潜在的连接点。
    *   **技能连线 (Skill Connections)**: 表示 `前置 -> 后续` 的依赖关系。
        *   **视觉**: 带有箭头的折线 (Polylines)。
        *   **方向**: 有向图，箭头指向依赖此技能的后续技能（或者反过来，视编辑器逻辑，通常 Parent -> Child）。

2.  **连线绘制技术 (Routing Strategy)**
    *   **正交路由 (Orthogonal Routing)**: 连线必须是水平或垂直的折线，禁止斜线。
    *   **边缘行走 (Channel Routing)**: 连线沿着网格线（即单元格的边缘）绘制，而不是穿过单元格内部。
        *   这样可以避免连线横穿技能节点，保证视觉清晰。
    *   **连接点 (Anchor Points)**: 每个网格单元的 **上、右、下、左** 四个边的中点是合法的连线出入口。
        *   连线算法会自动寻找最近的路径（例如简化的 Manhattan Pathfinding），从源节点的某一侧出来，沿着网格线走到目标节点的某一侧进入。

#### D. 右侧属性面板 (Properties Panel)
参考 `buff_editor_design.md` 与 `test/buff_editor_v3.html` 的样式，右侧属性面板建议采用 **卡片式分组（Panel + Section）**：每个区块有标题、可折叠（可选）、内部使用两列网格布局（label + input），复杂字段用“可增删列表/表格”。

**整体结构（推荐）**

* **Panel: Skill Editor（只读摘要）**
  * 显示：`id` / `name` / `rarity` 徽标、校验状态（?/??/?）
  * 操作：`Duplicate` / `Delete`（与左侧列表一致）

* **Panel: Basic Info（基础信息）**
  * `id`（Text）
    * 导出规则：JSON key 必须与 `id` 一致；若不一致，导出时提供“自动修正 key/取消导出”选项。
  * `name`（Text）
  * `rarity`（Select：Common/Uncommon/Rare/Epic/Legendary）
  * `description`（Textarea，建议等宽字体，参考 buff editor 的 monospace 输入框）

* **Panel: Target & Timing（行动与目标）**
  * `cost`（Number）
  * `speed`（Number）
  * `targetType`（Select：SELF / ENEMY / SINGLE_PART / ALL_PARTS / RANDOM_PART / SELF_PARTS）
  * `requiredPart`（Select，可空；当 `targetType` 为部位相关时显示）
  * `targetParts[]`（多选/Tag；仅当 `targetType=SELF_PARTS` 时显示）
  * 组合校验提示：
    * `targetType=SELF_PARTS` 时必须有 `targetParts[]`。
    * `requiredPart` 仅在需要时启用，非法组合高亮提示。

* **Panel: Values（数值字段，可选）**
  * `type`（Select/自由输入，取决于引擎约束）
  * `value`（Number/String）
  * `valueType`（Select，可空）
  * 校验提示：当 `valueType=PERCENT` 时 `value` 必须是 number。

* **Panel: Buff Refs（Buff 引用，核心）**
  * 分为三个子区块（与 `buffRefs` 对齐）：
    * `apply`（对敌方施加）
    * `applySelf`（对自身施加）
    * `remove`（移除/净化）
  * 每个子区块使用“可增删表格”（与 `buff_editor_v3.html` 的表格/列表风格一致）：
    * 列：`buffId`（Select + 搜索，数据源来自 `assets/data/buffs.json`）
    * 列：`target`（Select：self/enemy；默认与所在分组一致，例如 apply 默认 enemy）
    * 列：`chance`（Number，0~1，默认 1.0）
    * 列：`duration`（Number，可空，若不填则表示使用 Buff 默认）
    * 列：`stacks`（Number，可空）
    * 操作：`+ Add` / `Delete row`
  * 即时校验：
    * `buffId` 必须存在于 `buffs.json`，不存在时整行标红并在面板顶部汇总错误。
    * `chance` 必须在 `[0,1]`。

* **Panel: Effects（扩展 effects[]）**
  * 采用“Accordion 列表”（参考 buff editor 的 Effects/Triggers 形态）：
    * 每条 effect 展示：`type`（必填） + 关键参数（以 key/value 形式预览）
    * 支持：`+ Add effect` / `Delete` / 上下移动（可选）
  * 编辑方式：
    * MVP：提供 JSON 子编辑器（textarea）+ 简单 schema 校验。
    * 进阶：对常见 `effect.type` 提供模板化表单（如 AP 变化、忽略护甲、额外回合）。
  * **保存策略（重要）**：
    * `effects` 属于“自由文本 + 结构化数据”的特殊字段，中间态很容易不合法（JSON 断裂、未闭合括号）。
    * 因此不建议对 `effects` 做“失焦即保存/回车即保存”的强制实时写回。
    * 推荐在 `effects` 编辑框旁边提供 **专用按钮**：`Validate/Save Effects`。
      * 点击时执行：JSON 解析校验（必须为数组）+ 最小 schema 校验（例如每项必须包含 `type: string`）。
      * 校验通过才写回数据模型；校验失败仅提示错误，不污染上一版已保存的合法 `effects`。

* **Panel: Prerequisites（前置依赖）**
  * 只读展示 `prerequisites[]`（来自画布连线），但提供：
    * 快捷跳转到该技能节点（点击定位画布）
    * 一键移除某个前置（等价于删除对应连线）
  * DAG 校验错误在此面板汇总（例如：检测到环时提示并定位到相关边）。

* **Panel: Editor Meta（布局信息）**
  * `editorMeta.x/y` 只读显示（或提供“重置位置/吸附网格”按钮）。

---

## 4.x 属性编辑的保存策略（实时保存 vs 专用保存）

为提升编辑效率与数据安全性，属性面板建议采用“**普通字段实时保存 + 特殊字段专用保存**”的混合策略。

### 4.x.1 普通字段：实时保存（推荐）

适用范围：大多数标量字段与下拉选择字段，具有“校验简单、写回副作用小”的特点。

* 触发时机：
  * 输入框失去焦点（`blur`）自动保存
  * 在 `input` 中按 `Enter` 自动保存（`textarea` 默认不使用 Enter 保存，以免影响换行）
* 典型字段：
  * `name`、`rarity`、`cost`、`speed`、`targetType`、`requiredPart`
  * `type`、`value`、`valueType`
  * `description`
  * `buffRefs.*[]`（可采用“行内即时写回 + 即时校验提示”模式，而不是依赖全局 Save）

### 4.x.2 特殊字段：专用保存按钮（推荐）

适用范围：存在“编辑中间态频繁不合法”或“保存副作用明显”的字段。

* `effects`：强烈建议提供 `Validate/Save Effects` 专用按钮（详见上节）。
* （可选）未来若引入 JSON/DSL 类的扩展字段（例如脚本、表达式、复杂模板），同样应采用专用保存按钮。

### 4.x.3 `id` 字段策略：默认禁止编辑（推荐）

由于 `id` 是技能数据的主键，并且会影响：导出 JSON 的 key、技能树依赖引用（`prerequisites[]`）、以及编辑器内部选中状态。

* 建议默认将 `id` 设为只读展示，不允许在编辑器中修改。
* 新建技能时由编辑器自动生成唯一 `id`。
* 若未来需要支持“改名”，建议提供专门的 `Rename Skill Id` 操作（带二次确认与全局引用更新），而不是作为普通输入框实时保存。

---

## 4. 关键交互设计 (Interaction Design)

### 4.1 节点连线逻辑 (Connection Logic)
1.  **触发连线**: 
    *   鼠标悬停在技能节点（或其边缘）时，显示四个方向的 **连接锚点 (Anchor)** (半透明圆点)。
    *   从任一锚点按下鼠标左键开始拖拽。
2.  **拖拽过程**:
    *   显示一条跟随鼠标的虚线（此时可以是直线，作为预览）。
    *   鼠标经过其他节点的可连接锚点时，锚点高亮吸附。
3.  **建立连接**:
    *   在目标锚点释放鼠标。
    *   **系统计算路径**: 根据起点和终点的网格坐标，计算一条沿着网格线的正交路径 (Manhattan Path)。
    *   **数据更新**: 将连接关系写入数据模型（目标节点的 `prerequisites[]` 数组）。
4.  **删除连接**:
    *   选中连线（高亮），按 Delete 键删除。
    *   或右键与连线交互进行删除。

### 4.2 节点样式的动态化
*   **稀有度着色**：节点的头部颜色根据稀有度字段（Common: 灰, Uncommon: 绿, Rare: 蓝, Epic: 紫, Legendary: 金）自动变化，方便直观查看分布。
*   **流派分组**：不同流派的节点背景色或图标略有不同。

### 4.4 多选与成组移动（Ctrl+点击，推荐优先实现）

当技能数量较多时，逐个移动节点成本过高。为提升布局效率，建议在画布区增加“多选 + 成组移动”的基础交互。

#### 4.4.1 选中规则（最小可用）

* **单选**（默认）：
  * 普通点击某节点：清空其他选择，仅选中该节点。
* **多选**（Ctrl+点击）：
  * `Ctrl + 点击`：切换该节点的选中状态（Toggle）。
  * 若点击的是未选中节点：加入选择集。
  * 若点击的是已选中节点：从选择集中移除。
* **清空选择**：
  * 点击画布空白处：清空所有选中节点。

> 注：Shift 多选/框选可后续迭代；第一阶段建议优先实现 Ctrl+点击以满足高频需求。

#### 4.4.2 属性面板行为（多选时建议只读）

为避免“批量编辑”带来的复杂合并逻辑，MVP 建议采用：

* **单选时**：属性面板正常显示并可编辑。
* **多选时**：属性面板进入“多选只读模式”，显示：
  * 选中数量
  *（可选）主选中节点（最后一次点击的节点）的基础信息
  * 支持的批量操作入口（如：Delete / Duplicate（可选）/ Group Move）

#### 4.4.3 拖拽移动规则（成组移动）

* 当用户按下并拖拽一个“已选中节点”时：
  * **移动整组选中节点**（保持相对位置不变）。
* 当用户按下并拖拽一个“未选中节点”时：
  * 先切换为单选该节点，再进行拖拽移动。
* 释放鼠标时：
  * 对组内所有节点执行 Snap To Grid。

#### 4.4.4 连线交互优先级（避免歧义）

多选不应改变连线语义：

* 当用户从某个节点的 Anchor 开始拖拽连线时：
  * 仅以该节点作为连线源。
  * 不触发“成组移动”。

#### 4.4.5 删除行为（建议）

* 若当前选中的是连线：Delete/Backspace 删除连线（保持现有优先级）。
* 否则若存在多选节点：Delete/Backspace 触发“删除 N 个技能？”确认。

#### 4.4.6 性能注意事项（当前渲染架构下的优化方向）

在 Layered Rendering 架构下，若实现“拖拽过程中全量重绘 nodes + connections”，当节点数量增多时可能产生卡顿。

建议后续优化策略：

* 拖拽过程中仅更新被拖动节点（或选中组）对应 DOM 的 `left/top`，避免每帧重建所有节点 DOM。
* 连线可采用节流/合帧（例如 `requestAnimationFrame`）策略降低重绘频率。
* 鼠标释放时再做一次全量 `renderConnections()` 以保证最终状态一致。

---

## 5. 数据结构与校验 (Data Model & Validation)

当前项目的 `assets/data/skills.json` 使用 **对象映射**（key 为 skillId），而不是数组。编辑器内部模型与导出结构都应保持一致。

```json
{
  "skill_heavy_swing": {
    "id": "skill_heavy_swing",
    "name": "重锤挥击",
    "rarity": "Common",
    "cost": 3,
    "type": "DAMAGE",
    "value": 1.2,
    "valueType": "PERCENT",
    "speed": 0,
    "targetType": "SINGLE_PART",
    "description": "...",
    "buffRefs": {
      "apply": [],
      "applySelf": [],
      "remove": []
    },
    "effects": [],
    "prerequisites": [],
    "editorMeta": { "x": 100, "y": 200 }
  }
}
```

### 5.1 属性面板字段分组（建议）

#### A) 基础信息
* `id`（唯一）
* `name`
* `rarity`（Common/Uncommon/Rare/Epic/Legendary）

#### B) 行动与目标
* `cost`
* `speed`
* `targetType`（`SELF` / `ENEMY` / `SINGLE_PART` / `ALL_PARTS` / `RANDOM_PART` / `SELF_PARTS`）
* `requiredPart`（当技能要求特定部位时启用，例如 head/chest/arm/leg）
* `targetParts[]`（当 `targetType=SELF_PARTS` 时启用）

#### C) 数值（可选）
* `type`（例如 DAMAGE / HEAL / BUFF_SELF / DAMAGE_MULTI 等）
* `value`
* `valueType`（PERCENT / HP_PERCENT / CRIT_MULTIPLIER / PER_STACK 等）

#### D) Buff 引用（结构化）
* `buffRefs.apply[]`：对敌方施加
* `buffRefs.applySelf[]`：对自身施加
* `buffRefs.remove[]`：移除（净化/驱散）

每个引用项支持：`buffId`、`target(self/enemy)`、`chance`、`duration`、`stacks`。

#### E) 扩展效果（可选）
* `effects[]`：作为“引擎扩展点”，编辑器应提供 JSON 子编辑器 + 常用模板（例如 AP 变化、忽略护甲、额外回合等）。

#### F) 前置关系
* `prerequisites[]`：多前置数组（由画布连线生成）。

#### G) 编辑器元数据
* `editorMeta.x / editorMeta.y`：节点布局。

### 5.2 编辑器必须实现的校验

* `id` 唯一性：JSON key 必须与 skill `id` 一致（导出时自动修正或提示）。
* `prerequisites[]`：引用必须存在，且必须保持 DAG（无环）。
* `buffRefs.*[].buffId`：必须存在于 `assets/data/buffs.json`。
* 目标合法性：`targetType` 与 `requiredPart/targetParts` 的组合校验。
* 类型/数值校验（建议）：
  - `valueType=PERCENT` 时 `value` 必须为 number。
  - `chance` 范围为 `[0,1]`。

### 5.3 关于 `editorMeta`

默认方案：保存在技能对象内（单文件携带布局）。

导出时建议提供两个模式：
* 开发模式导出：保留 `editorMeta`。
* 运行模式导出：剥离 `editorMeta`。

---

## 6. 开发路线图 (Roadmap)

1.  **Phase 1: 基础原型**
    *   搭建 HTML 布局 (Left Canvas + Right Panel)。
    *   实现节点的 DOM 渲染。
    *   实现拖拽移动功能。
    *   实现属性面板的双向绑定。

2.  **Phase 2: 连线与关系**
    *   实现 SVG 连线绘制。
    *   实现拖拽创建连线。
    *   实现数据层面的父子关系绑定。

3.  **Phase 3: 数据导入导出**
    *   完成 JSON 解析与生成逻辑。
    *   实现 LocalStorage 自动保存。
    *   添加稀有度颜色等视觉优化。

4.  **Phase 4: 整合**
    *   将生成的 `skills.json` 放入 `assets/data/` 并在游戏中测试加载。
