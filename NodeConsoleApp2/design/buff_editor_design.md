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

采用经典的 **左侧列表 - 右侧详情** 布局，无需复杂的路由。

### 3.1 布局结构

```text
+-------------------------------------------------------------+
|  [Header]  Buff Editor v1.0   [Load JSON]  [Save JSON]      |
+----------------------+--------------------------------------+
|  [Search Box]        |  [Data Form]                         |
|                      |                                      |
|  [Buff List]         |  +--- Basic Info ----------------+   |
|  - buff_bleed_01     |  | ID: [________]  Type: [v]     |   |
|  - buff_stun         |  | Name: [_______] Tags: [x][x]  |   |
|  - passive_armor     |  +-------------------------------+   |
|  [+ New Buff]        |                                      |
|                      |  +--- Lifecycle -----------------+   |
|                      |  | Duration: [3]  Strategy: [v]  |   |
|                      |  +-------------------------------+   |
|                      |                                      |
|                      |  +--- Stat Modifiers (-/+) ------+   |
|                      |  | [atk]  [10] [%]  [x]          |   |
|                      |  | [def]  [-5] [flat] [x]        |   |
|                      |  +-------------------------------+   |
|                      |                                      |
|                      |  +--- Effects (Triggers) (-/+) --+   |
|                      |  | [v] onAttackPost              |   |
|                      |  |     Action: [HEAL]            |   |
|                      |  |     Target: [self]            |   |
|                      |  |     Params:                   |   |
|                      |  |       key: value  [x]         |   |
|                      |  |       value: {dmg}*0.2 [x]    |   |
|                      |  +-------------------------------+   |
+----------------------+--------------------------------------+
```

### 3.2 交互逻辑细节

1.  **新建**: 点击 "+ New Buff"，右侧表单清空，自动生成一个默认模板 (e.g. ID="new_buff_01").
2.  **保存 (内存)**: 修改表单时，实时更新内存中的对象 (不需要显式的 "Save" 按钮来确认每一次修改，但要有 "Export" 导出到文件)。
3.  **参数动态解析**:
    *   在 Effects 的 Params 区域，提供常用变量的提示 (Tooltip)，例如提示用户可以使用 `{context.damage}`。
4.  **图标预览**: 如果输入了 Icon ID，尝试在一个小方框中显示 (如果实现了图标资源加载)。

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
3.  实现基础属性和生命周期的表单绑定。
4.  实现 `statModifiers` 的动态增删组件。
5.  实现 `effects` 及其内部 `params` 的嵌套动态增删组件。
6.  增加简单的输入校验 (e.g. ID 查重)。
