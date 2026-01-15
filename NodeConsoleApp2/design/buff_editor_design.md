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

建议比例: `20% : 40% : 40%`

```text
+-----------------------------------------------------------------------------------+
|  [Header]  Buff Editor v1.0   [Load JSON]  [Save JSON]                            |
+----------------------+--------------------------------------+---------------------+
|  [Column 1: List]    |  [Column 2: Editor]                  | [Column 3: Sim]     |
|                      |                                      |                     |
|  [Search Box]        |  +--- Basic Info ----------------+   | +--- Target -------+|
|                      |  | ID: [________]  Type: [v]     |   | | Enemy: [Orc v]   ||
|  [Buff List]         |  | Name: [_______] Tags: [x][x]  |   | | Part: [Chest v]  ||
|  - buff_bleed_01     |  +-------------------------------+   | +------------------+|
|  - buff_stun         |                                      |                     |
|  - passive_armor     |  +--- Lifecycle -----------------+   | +--- Inspector ----+|
|  [+ New Buff]        |  | Duration: [3]  Strategy: [v]  |   | | HP: 100/100      ||
|                      |  +-------------------------------+   | | Armor: 50        ||
|                      |                                      | | Buffs: [x] [x]   ||
|                      |  +--- Stat Modifiers (-/+) ------+   | +------------------+|
|                      |  | [atk]  [10] [%]  [x]          |   |                     |
|                      |  +-------------------------------+   | +--- Control ------+|
|                      |                                      | | [Start Turn]     ||
|                      |  +--- Effects (Triggers) (-/+) --+   | | [Apply Buff]     ||
|                      |  | [v] onAttackPost              |   | | [Take Dmg]       ||
|                      |  |     Action: [HEAL]            |   | +------------------+|
|                      |  |     Target: [self]            |   |                     |
|                      |  +-------------------------------+   | +--- Logs ---------+|
|                      |                                      | | > Turn 1 start   ||
|                      |                                      | | > Bleed: -5      ||
|                      |                                      | +------------------+|
+----------------------+--------------------------------------+---------------------+
```

### 3.2 交互逻辑细节

1.  **新建**: 点击 "+ New Buff"，中间表单清空，自动生成一个默认模板。
2.  **保存**: 修改表单时实时更新内存对象。
3.  **模拟器联动**:
    *   右侧面板始终显示当前选中的“模拟目标”状态。
    *   点击 "Apply Buff" 按钮时，将中间列当前编辑的 Buff 数据（内存版）应用到右侧的模拟对象上。
    *   右侧的操作（如 Start Turn）会触发事件，如果当前 Buff 有对应的 Trigger，会执行并在 Log 中显示结果。

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

## 5. 模拟与调试 (Simulation & Debugging)

编辑器不应仅是静态数据的输入工具，更应充当逻辑验证的沙盒。

### 5.1 目标对象配置 (Target Context)

为了测试 Buff 在不同实体上的表现，需提供模拟对象的配置功能。

*   **数据源**:
    *   **Player Template**: 默认加载 `player.json` 作为标准测试对象。
    *   **Enemy Catalog**: 自动读取 `assets/data/enemies.json`，在 UI 上渲染为下拉选择框 (e.g., "选择模拟对象: [ 哥布林斥候 (Lv.3) v ]")。
*   **部位选择 (Body Parts)**:
    *   若 Buff 是特定部位生效（如护甲 Buff），UI 需提供身体部位选择器 (Head, Chest, Left Arm, etc.)，该选择器应根据选定 Enemy 的 `bodyParts` 结构动态生成。
*   **状态快照 (State Inspector)**:
    *   在界面右侧或底部提供“目标状态监视区”，实时展示当前对象的 HP, AP, Attributes, 以及所有部位的护甲值。
    *   **应用测试**: 点击 [Apply Buff] 按钮，将当前编辑器中的 Buff 临时注入到模拟对象的 `BuffManager` 中。

### 5.2 模拟状态机 (Simulation FSM)

通过模拟游戏核心流程的关键节点，验证 Buff 的 `trigger` 是否正确工作。

*   **回合控制器 (Turn Control)**:
    *   `[Start Turn]`: 触发 `onTurnStart`。检查 DoT (持续伤害) 和 HoT (持续治疗) 是否生效，持续时间 (Duration) 是否递减。
    *   `[End Turn]`: 触发 `onTurnEnd`。检查 Buff 是否过期移除。
*   **战斗事件模拟 (Event Simulator)**:
    *   **模拟受到攻击 (Incoming Hit)**:
        *   输入: 伤害值 (Damage), 攻击部位 (Target Part), 伤害类型 (Physics/Magic)。
        *   流程: `onAttackPre` (防御侧) -> 计算护甲减免 -> `onTakeDamage` -> `onDefendPost` -> 更新 HP/Armor 显示。
    *   **模拟发起攻击 (Outgoing Attack)**:
        *   输入: 目标类型, 技能标签 (Tag)。
        *   流程: `onAttackPre` (攻击侧) -> 计算加成 -> `onAttackPost` (如吸血)。
    *   **模拟死亡 (Death)**:
        *   手动将 HP 设为 0，触发 `onDeath` (测试复活类 Buff)。

### 5.3 反馈与日志 (Feedback & Logs)

*   **可视化反馈**: 当模拟事件触发导致属性变更时，状态监视区应有闪烁或漂浮文字动画 (e.g., HP -5)。
*   **控制台日志 (Console)**:
    *   显示详细的执行流:
        > `[Simulate]` Turn 1 Start
        > `[Trigger]` buff_bleed_01 matched event "onTurnStart"
        > `[Action]` Execute "DAMAGE": 5 (Source: Self)
        > `[Result]` Target HP: 50 -> 45
    *   **报错提示**: 如果 JSON 配置的公式无法解析 (e.g., 变量名拼写错误)，应在日志中高亮报错。

## 6. 待办事项 (To-Do List)

1.  搭建 `test/buff_editor.html` 基本骨架。
2.  实现 JSON 文件加载与导出功能。
3.  实现基础属性和生命周期的表单绑定。
4.  实现 `statModifiers` 的动态增删组件。
5.  实现 `effects` 及其内部 `params` 的嵌套动态增删组件。
6.  增加简单的输入校验 (e.g. ID 查重)。
