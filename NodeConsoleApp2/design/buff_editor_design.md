# Buff 编辑器设计文档 (Buff Editor Design)

## 1. 概述 (Overview)

为了支撑 Buff 系统的低耦合与数据驱动设计，我们需要一个可视化的编辑器来管理 Buff 的 JSON 数据。本编辑器将允许开发者直观地创建、修改、保存 Buff 配置，而无需直接编写容易出错的 JSON 字符串。

*   **编辑对象**: 符合 `buff_design.md` 中定义的 Buff JSON 结构。
*   **运行环境**: 浏览器 (Web Browser)。
*   **核心功能**: 加载 JSON, 可视化编辑表单, 导出 JSON。

## 2. 功能需求 (Functional Requirements)

### 2.1 文件管理
*   **加载 (Input)**: 支持点击按钮上传本地 JSON 文件，或者将 JSON 文本粘贴到输入框中进行解析。
*   **导出 (Output)**: 支持将当前编辑的 Buff 数据导出为 `.json` 文件下载，或复制 JSON 文本到剪贴板。
*   **列表管理**: 支持在一个编辑器会话中加载多个 Buff (Buff Library)，并在左侧列表进行切换编辑。

### 2.2 基础属性编辑
*   **ID**: 唯一标识符输入 (Text)。
*   **名称 (Name)**: 显示名称输入 (Text)。
*   **描述 (Description)**: 文本描述输入 (Text Area)。
*   **图标 (Icon)**: 图标资源 ID 输入 (Text)。
*   **类型 (Type)**: 下拉选择 (Select: `buff` | `debuff` | `hidden`)。
*   **标签 (Tags)**: 标签管理 (Tag Input)，支持添加/删除标签字符串 (e.g. `physical`, `fire`)。

### 2.3 生命周期配置 (Lifecycle)
*   **持续时间 (Duration)**: 数字输入 (Number)，支持 -1 (永久)。
*   **最大层数 (Max Stacks)**: 数字输入 (Number)。
*   **叠加策略 (Stack Strategy)**: 下拉选择 (Select: `refresh`, `independent`, `extend`, `replace`)。
*   **战斗结束清除 (Remove on Battle End)**: 复选框 (Checkbox)。

### 2.4 属性修正配置 (Stat Modifiers)
*   **展示形式**: 即使预览列表，支持添加/删除属性修正条目。
*   **编辑项**:
    *   **属性名**: 下拉选择 (e.g., `atk`, `def`, `speed`, `maxHp`, `critRate` 等)。
    *   **数值**: 数字输入。
    *   **类型**: 下拉选择 (`flat` | `percent`)。

### 2.5 动态效果配置 (Effects & Triggers)
这是编辑器的核心难点，需要支持复杂的动态参数。
*   **展示形式**: 可折叠的卡片列表 (Accordion List)。
*   **编辑项**:
    *   **触发时机 (Trigger)**: 下拉选择 (`onTurnStart`, `onAttackPost`, `onTakeDamage` 等)。
    *   **动作 (Action)**: 下拉选择或文本输入 (e.g., `HEAL`, `DAMAGE`, `MODIFY_STAT`, `APPLY_BUFF`)。
    *   **目标 (Target)**: 下拉选择 (`self`, `attacker`, `target`, `all_enemies`).
    *   **参数配置 (Params)**:
        *   这是一个动态键值对编辑器。
        *   支持添加 Key-Value 对。
        *   **Value 输入**: 支持普通文本，也支持简单的语法高亮提示 (如果可能)，用于输入动态表达式 (如 `{context.damageDealt} * 0.2`)。

## 3. UI 界面设计 (UI Layout)

采用 **三栏式布局 (Three-Column Layout)**，分别为：资源列表 (Assets) - 编辑区域 (Editor) - 模拟调试 (Simulation)。

### 3.1 布局结构

建议比例: `20% : 45% : 35%`

```text
+-----------------------------------------------------------------------------------+
|  [Header]  Buff Editor v1.0   [Load JSON]  [Save JSON]                            |
+----------------------+--------------------------------------+---------------------+
|  [Column 1: List]    |  [Column 2: Editor]                  | [Column 3: Sim]     |
|                      |                                      |                     |
|  [Search Box]        |  +--- Basic Info ----------------+   | +--- 1. Player -----+|
|                      |  | ID: [________]  Type: [v]     |   | | HP: 100/100      ||
|  [Buff List]         |  | Name: [_______] Tags: [x][x]  |   | | AP: 3/3          ||
|  - buff_bleed_01     |  +-------------------------------+   | | Buffs: [x]       ||
|  - buff_stun         |                                      | +------------------+|
|  - passive_armor     |  +--- Lifecycle -----------------+   |                     |
|  [+ New Buff]        |  | Duration: [3]  Strategy: [v]  |   | +--- 2. Enemy -----+|
|                      |  +-------------------------------+   | | Sel: [Goblin v]  ||
|                      |                                      | | HP: 50/50        ||
|                      |  +--- Stat Modifiers (-/+) ------+   | | Buffs: []        ||
|                      |  | [atk]  [10] [%]  [x]          |   | +------------------+|
|                      |  +-------------------------------+   |                     |
|                      |                                      | +--- 3. Control ---+|
|                      |  +--- Effects (Triggers) (-/+) --+   | | [Start] [End]    ||
|                      |  | [v] onAttackPost              |   | | [Apply Buff->P]  ||
|                      |  |     Action: [HEAL]            |   | | [Apply Buff->E]  ||
|                      |  |     Target: [self]            |   | | [Dmg -> P]       ||
|                      |  +-------------------------------+   | | [Dmg -> E]       ||
|                      |                                      | +------------------+|
|                      |                                      |                     |
|                      |                                      | +--- 4. Logs ------+|
|                      |                                      | | > Turn 1 start   ||
|                      |                                      | | > HP -5          ||
|                      |                                      | +------------------+|
+----------------------+--------------------------------------+---------------------+
```

### 3.2 交互逻辑细节

1.  **新建**: 点击 "+ New Buff"，中间表单清空，自动生成一个默认模板。
2.  **保存**: 修改表单时实时更新内存对象。
3.  **模拟器联动**:
    *   右侧面板同时显示 Player 和 Selected Enemy 的状态。
    *   点击 "Apply Buff -> Player/Enemy" 按钮时，将当前编辑的 Buff 数据（内存版）应用到对应的模拟对象上。

## 3.3 模拟调试区详情 (Simulation & Debug Details)

模拟调试区位于界面右侧，用于实时验证 Buff 的逻辑。该区域分为上下排列的四个模块，分别管理玩家、敌人、模拟控制和日志反馈。

### 3.3.1 Part 1: Player 数据 (Player Data)
*   **功能**: 展示玩家角色的当前状态，作为模拟环境中的主要交互对象之一。
*   **数据来源**: 自动加载 `assets/data/player.json` 作为玩家模板。
*   **展示内容**:
    *   **基础属性**: HP (当前/最大), AP (行动力)。
    *   **状态列表**: 当前身上的 Buff/Debuff 图标及剩余回合。
    *   **护甲状态**: 各部位 (Head, Chest 等) 的当前护甲值。

### 3.3.2 Part 2: Enemies 数据 (Enemies Data)
*   **功能**: 提供敌方角色的选择与状态查看，用于测试针对敌人的 Buff 或来自敌人的攻击。
*   **数据来源**: 自动读取 `assets/data/enemies.json` 获取敌人列表。
*   **交互控件**:
    *   **敌人选择器 (Select)**: 下拉选择要模拟的敌人类型 (如 "Goblin Warrior", "Orc Shaman")。切换敌人会重置敌人状态。
*   **展示内容**:
    *   **基础属性**: HP, Speed 等。
    *   **状态列表**: 敌人身上的 Buff/Debuff。
    *   **部位护甲**: 显示选中敌人的具体部位护甲信息。

### 3.3.3 Part 3: 操作按钮 (Control Buttons)
提供对模拟环境的干预能力，核心操作分为“回合控制”与“战斗模拟”。

*   **回合控制 (Round Control)**:
    *   `[Start Turn]`: 触发 **回合开始** 事件 (`onTurnStart`)。用于测试 DoT (流血/中毒) 或自动回血等效果。
    *   `[End Turn]`: 触发 **回合结束** 事件 (`onTurnEnd`)。用于测试 Buff 持续时间递减与过期移除逻辑。

*   **Buff 操作 (Buff Ops)**:
    *   `[Apply Buff -> Player]`: 将**当前编辑器中正在编辑的 Buff** 实例化并应用到 **Player** 身上。
    *   `[Apply Buff -> Enemy]`: 将**当前编辑器中正在编辑的 Buff** 实例化并应用到 **Selected Enemy** 身上。

*   **伤害/治疗模拟 (Action Sim)**:
    *   `[Deal Dmg -> Player]`: 模拟 Player 受到一次标准伤害 (如 10点)，触发 `onTakeDamage` 等防御侧 Trigger。
    *   `[Deal Dmg -> Enemy]`: 模拟 Player 对 Enemy 造成一次标准伤害，触发 `onAttackPost` (攻击侧) 和 Enemy 的受击逻辑。
    *   `[Cast Skill Mock]`: (可选) 模拟释放一个通用技能，用于测试复杂的 Trigger 链。

### 3.3.4 Part 4: 日志区域 (Log Area)
*   **功能**: 实时显示模拟过程中的事件流与数值变化，辅助排查逻辑错误。
*   **内容格式**:
    *   `[Turn]` Turn 1 Start / End
    *   `[Apply]` Applied [BuffName] to [Target]
    *   `[Trigger]` [BuffName] triggered on [Event]
    *   `[Effect]` Dealt 10 dmg to Player. Player HP: 100 -> 90
    *   **错误高亮**: 如果 Buff 脚本执行出错，显示红色错误信息。
*   **工具**: 提供 `[Clear]` 按钮清空日志。

## 4. 技术实现方案 (Technical Implementation)

### 4.1 技术栈
*   **HTML5/CSS3**: Flexbox 布局，简洁风格。
*   **JavaScript (ES6+)**: 原生 JS，或者使用轻量级框架 **Vue.js (CDN模式)** 以便于双向数据绑定和列表渲染。考虑到维护性和开发效率，推荐使用 Vue.js。

### 4.2 数据结构 (Model)
编辑器内部维护一个 `buffRegistry` 对象或数组：
```javascript
let buffList = [
    { id: "buff_01", name: "Demo", ... },
    // ...
];
```

### 4.3 文件 I/O
*   使用 `<input type="file" accept=".json" />` 读取文件。
*   使用 `FileReader.readAsText()` 解析内容。
*   使用 `URL.createObjectURL(new Blob(...))` 生成下载链接。

## 5. 待办事项 (To-Do List)

1.  搭建 `test/buff_editor.html` 基本骨架。
2.  实现 JSON 文件加载与导出功能。
3.  实现 `BuffRegistry` 和 `BuffManager` 的模拟运行环境。
4.  集成 `player.json` 和 `enemies.json` 的加载逻辑。
5.  实现 UI 上 4 个部分的联动逻辑 (Player, Enemy, Control, Logs)。
