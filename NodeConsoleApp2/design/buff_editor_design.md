# Buff 编辑器/测试器设计文档 (Buff Editor & Tester Design)

## 1. 概述 (Overview)

为了支撑 Buff 系统的低耦合与数据驱动设计，我们需要一个可视化的 **Buff 编辑器 + 执行验证测试器** 来管理 Buff 的 JSON 数据，并验证它在当前引擎实现中的真实生效情况。

本仓库当前已经实现了 Buff 相关核心模块：

* `script/engine/buff/BuffRegistry.js`：加载 `assets/data/buffs.json`，并支持 `aliasOf`
* `script/engine/buff/BuffManager.js`：角色持有 Buff 的容器（add/remove/tick、toJSON/fromJSON、getEffectiveStat）
* `script/engine/buff/BuffSystem.js`：订阅 `EventBus` 并按 `effects[].trigger` 执行 `action`
* `script/engine/CoreEngine.js`：在伤害管线中构造并传递可变 `context`，并发出事件

因此本设计文档会将 Buff Editor 的重点从“仅编辑 JSON”调整为“编辑 + 可复现触发链路 + 可观察上下文变化”。

*   **编辑对象**: 符合 `buff_design.md` 中定义的 Buff JSON 结构。
*   **运行环境**: 浏览器 (Web Browser)。
*   **核心功能**: 加载 JSON, 可视化编辑表单, 导出 JSON。

## 2. 功能需求 (Functional Requirements)

### 2.1 文件管理与数据来源

Buff Editor 需要支持两种数据来源（用于不同阶段的工作流）：

1) **项目数据直连（推荐）**
   * 直接读取 `assets/data/buffs.json`（通过 HTTP 服务运行页面）
   * 好处：与引擎一致，支持 `aliasOf`
2) **本地文件导入**
   * 支持点击按钮上传本地 JSON 文件，或者将 JSON 文本粘贴到输入框
   * 用于快速试验 / 外部协作

导出方式：

*   **导出库 (Output Library)**：保存/导出完整的 `buffs.json`
*   **导出单条 (Output Single)**：仅导出当前选中的 Buff 定义（便于 PR/审阅）

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
*   **叠加策略 (Stack Strategy)**: 下拉选择。

> 需要与当前实现对齐：`BuffManager` 当前实现并使用：`refresh` / `add` / `extend` / `replace`。
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
*   **编辑项**（需要与 `BuffSystem` 当前可执行动作对齐）：
    *   **触发时机 (Trigger)**: `onTurnStart`, `onTurnEnd`, `onAttackPre`, `onAttackPost`, `onTakeDamagePre`, `onTakeDamage`, `onDefendPost`
    *   **动作 (Action)**（当前已实现最小集）：
        * `damage`, `heal`, `applyBuff`, `skipTurn`, `modifyAP`, `absorbDamage`, `modifyDamageTaken`, `REMOVE_SELF`, `MODIFY_STAT_TEMP`
        * 其它动作可允许输入，但应明确标注“引擎未支持”并在模拟时输出 `BUFF:WARN`
    *   **目标 (Target)**: `self` / `target` / `attacker`
    *   **参数配置 (Params / value)**:
        *   这是一个动态键值对编辑器。
        *   支持添加 Key-Value 对。
        *   **Value 输入**: 支持普通文本，也支持简单的语法高亮提示 (如果可能)，用于输入动态表达式 (如 `{context.damageDealt} * 0.2`)。

> 注意：当前 `buffs.json` 里有两种参数风格：
> 1) 顶层 `value/valueType`（例如 `damage` / `heal`）
> 2) `params: { stat, value, type }`（例如 `MODIFY_STAT_TEMP`）
> Editor 需要同时支持两种结构。

## 3. UI 界面设计 (UI Layout)

采用 **三栏式布局 (Three-Column Layout)**：

* 左：Buff 库（从 `buffs.json` 加载的列表 + 搜索）
* 中：当前 Buff 的编辑与 JSON 预览（包含 alias 展开视图）
* 右：模拟调试区（用于驱动 `EventBus` 与 `context` 管线，验证真实生效）

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
3.  **模拟器联动（本次改版重点）**:
    *   右侧模拟调试区将包含四块：
        1) Player 数据（从 `player.json` 加载）
        2) Enemy 数据（从 `enemies.json` 加载并可选择）
        3) 操作按钮（驱动回合、施加 Buff、模拟攻击/受击）
        4) 日志区域（订阅 `BATTLE_LOG` / `BUFF:*` 输出）
    *   点击 "施加 Buff"：实际调用 `BuffManager.add(buffId)`，并展示 add 后 buff 列表变化。
    *   点击 "模拟攻击"：构造 `context` 并按明确顺序 emit 事件，观察 `context` 是否被 Buff 修改。

## 4. 技术实现方案 (Technical Implementation)

### 4.1 技术栈
*   **HTML5/CSS3**: Flexbox 布局，简洁风格。
*   **JavaScript (ES6+)**: 原生 JS，或者使用轻量级框架 **Vue.js (CDN模式)** 以便于双向数据绑定和列表渲染。考虑到维护性和开发效率，推荐使用 Vue.js。

### 4.2 数据结构 (Model)
编辑器内部需要区分两套数据：

1) **Buff 定义库**：来自 `buffs.json`（字典结构）
2) **模拟运行时对象**：`BuffRegistry` / `BuffManager` / `BuffSystem` / `EventBus`

建议的数据形态：

```javascript
// ① Buff 定义（类似 buffs.json）
let buffDefinitions = {
	"buff_poison": { /* ... */ },
	// ...
};

// ② 运行时（与引擎一致的类）
const registry = new BuffRegistry(buffDefinitions);
const buffSystem = new BuffSystem(EventBus, registry);

const simulatedPlayer = createRuntimeActorFromPlayerJson();
simulatedPlayer.buffs = new BuffManager(simulatedPlayer, registry, EventBus);
buffSystem.registerManager(simulatedPlayer.buffs);

const simulatedEnemy = createRuntimeActorFromEnemyTemplate();
simulatedEnemy.buffs = new BuffManager(simulatedEnemy, registry, EventBus);
buffSystem.registerManager(simulatedEnemy.buffs);
```

### 4.3 文件 I/O
*   使用 `<input type="file" accept=".json" />` 读取文件。
*   使用 `FileReader.readAsText()` 解析内容。
*   使用 `URL.createObjectURL(new Blob(...))` 生成下载链接。

## 5. 模拟与调试 (Simulation & Debugging)

编辑器不应仅是静态数据的输入工具，更应充当逻辑验证的沙盒。

### 5.1 目标对象配置 (Target Context)

为了测试 Buff 在不同实体上的表现，需提供模拟对象的配置功能。

*   **数据源（对齐 DataManagerV2 的加载方式）**:
    *   Player：从 `assets/data/player.json` 加载（尽量与当前引擎一致）
    *   Enemies：从 `assets/data/enemies.json` 加载，并在 UI 上选择一个模板作为模拟敌人
    *   Buffs：从 `assets/data/buffs.json` 加载（支持 `aliasOf` 展开）
*   **部位选择 (Body Parts)**（对齐当前 `CoreEngine` 的伤害结算逻辑）：
    *   模拟攻击必须选择一个 `bodyPart`
    *   部位列表来自 `actor.bodyParts` 的 key
*   **状态快照 (State Inspector)**:
    *   在界面右侧或底部提供“目标状态监视区”，实时展示当前对象的 HP, AP, Attributes, 以及所有部位的护甲值。
    *   **应用测试**: 点击 [Apply Buff] 按钮，将当前编辑器中的 Buff 临时注入到模拟对象的 `BuffManager` 中。

### 5.2 模拟状态机 (Simulation FSM)

通过模拟游戏核心流程的关键节点，验证 Buff 的 `trigger` 是否正确工作。

*   **回合控制器 (Turn Control)**（对齐 `BuffSystem` 当前订阅的事件）：
    *   `[Start Turn]`: `EventBus.emit('TURN_START', { turn })` -> 对应 trigger `onTurnStart`
    *   `[End Turn]`: `EventBus.emit('TURN_END', { turn })` -> 对应 trigger `onTurnEnd` + `tickTurn()`（持续时间递减/过期移除）
*   **战斗事件模拟 (Event Simulator)**（对齐当前 `CoreEngine` 的最小战斗管线）:
    *   **模拟发起攻击 (Cast Skill / Attack)**（强制明确 source/target，减少混淆）:
        *   输入：
            * Source：Player / Enemy（二选一）
            * Target：Enemy / Player（二选一）
            * rawDamage：数值输入
            * bodyPart：下拉选择（来自 Target 的 `bodyParts`）
        *   流程（建议在日志中逐步打印 context 的变化）：
            1) 构造 `context = { attacker, target, rawDamage, bodyPart, tempModifiers, damageTaken, damageDealt }`
            2) `EventBus.emit('BATTLE_ATTACK_PRE', context)`
               * 预期：`MODIFY_STAT_TEMP` 写入 `context.tempModifiers`（例如 `armorMitigationMult`）
            3) 护甲结算（由模拟器实现，与 CoreEngine 当前逻辑一致）：
               * 读取 `context.tempModifiers.armorMitigationMult` 应用到护甲吸收阶段
            4) `context.damageTaken = pendingDamage`，执行 `EventBus.emit('BATTLE_TAKE_DAMAGE_PRE', context)`
               * 预期：护盾/减伤相关 action 写入 `context.shieldPool` / `context.damageTakenMult`
            5) 应用 `damageTakenMult/shieldPool`，扣除 hp
            6) `context.damageDealt = finalDamage`，执行 `EventBus.emit('BATTLE_ATTACK_POST', context)`
               * 预期：吸血等基于 `damageDealt` 的 buff 生效
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
    *   **报错提示**: 如果 `action` 不被 `BuffSystem` 支持，应输出 `BUFF:WARN` 且在 UI 高亮。

### 5.4 必须覆盖的测试用例（用于验证“真的生效”）

本编辑器的 Simulation 不仅是 UI，而是要能复现并验证 Buff 的关键能力：

1) **aliasOf**：选择 `buff_lifesteal` 时，应在“展开定义视图”中显示其实际使用的 `passive_vampire` 逻辑
2) **DoT**：对 Target 施加 `buff_poison`，点击 `[End Turn]` 应扣血并 tick duration
3) **破甲（armorMitigationMult）**：
   * 对攻击者施加 `buff_armor_pen`
   * 进行一次 `Cast Skill`（rawDamage > 0，目标部位护甲 > 0）
   * 观察护甲扣减是否比无 Buff 更快（日志需打印 armorMitMult 与护甲变化）
4) **护盾（shieldPool）**：
   * 对受击者施加 `buff_shield`
   * 受击时 `damageTaken` 先被 shield 吸收，再扣 hp
5) **吸血（damageDealt）**：
   * 对攻击者施加 `buff_lifesteal` 或 `passive_vampire`
   * 攻击后 `BATTLE_ATTACK_POST` 应触发 heal，回血不超过 maxHp

## 6. 待办事项 (To-Do List)

1.  对齐现有 `test/buff_editor_v2.html`，明确它在新设计中的位置（是“旧版原型”还是“升级基座”）。
2.  先实现“只读加载 + 模拟器”，确保能跑通 5.4 的测试用例。
3.  再实现“编辑与保存”，避免编辑器做出来但无法验证生效。
4.  增加 schema 校验（至少校验：id/type/lifecycle/effects 格式）。
5.  增加 alias 解析展示（原始定义 vs 展开定义）。
