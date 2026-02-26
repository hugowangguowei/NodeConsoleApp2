# 技能规划设计（Skill Planning Design）

> 目标：把“技能槽位规划（planning）”模块的概念、输入输出、数据结构与规则边界一次性写清楚，避免在多选/单选、槽位交互与执行逻辑之间反复误解。
>
> 本文聚焦 **战斗内 · 规划阶段（PLANNING）**。暂不讨论执行阶段如何消费 `selectionResult`（那属于 Skill/Action 执行器的职责）。

---

## 1. 范围与核心结论

### 1.1 范围

- UI：`UI_SkillPanel`（技能池/Action Matrix 槽位交互）
- Engine：`CoreEngine.input.assignSkillToSlot()`（规划输入入口）
- Planner：`TurnPlanner`（规划状态、校验、存储）
- Runtime Snapshot：`dataConfig.runtime.planning.player.*`（用于调试/回放/未来存档）

### 1.2 核心结论（当前产品定义）

1. **产品定义 B（多选技能）**：
   - “多选”不是指把同一个技能放到多个槽位；
   - 而是指 **一次施放（一次规划动作 action）携带多个部位选择结果**，即 `action.selectionResult.selectedParts: string[]`。

2. **每个技能每回合允许规划 1 次**（你已确认的规则）：
   - 这是一条 **规则层约束**，应由 Engine/Planner 兜底保证。
   - UI 侧可做体验优化（例如表现为“替换”），但不应成为唯一约束来源。

---

## 2. 术语

- **Skill（技能）**：静态数据对象，来自 `skills_melee_v4_5.json`，描述成本、目标、actions 等。
- **Action（规划动作 / planned action）**：规划阶段产生的一条记录，表示“本回合将施放某技能”及其选择结果。
- **Slot（槽位）**：Action Matrix 中的格子（`slotKey` 定位），是规划 UI 的可视化容器。
- **Selection（选择结果）**：技能在规划阶段得到的“选中了哪些部位/目标”的结果。

---

## 3. 技能对象数据（Skill Config）在规划阶段用到哪些字段

> 数据源：`DataManagerV2.getSkillConfig(skillId)` -> `gameConfig.skills[...]`

规划阶段主要关心：

### 3.1 身份与显示
- `id: string`
- `name: string`

### 3.2 资源/节奏
- `cost` 或 `costs.ap`：AP 消耗（当前 `CoreEngine` 使用 `skillConfig.cost`）
- `speed`：速度修正（当前 `CoreEngine` 使用 `skillConfig.speed`）

### 3.3 目标与选择（决定“单选/多选/是否需要部位”）
- `target.subject`：`SUBJECT_SELF | SUBJECT_ENEMY | ...`
- `target.scope`：
  - `SCOPE_ENTITY`：目标本体
  - `SCOPE_PART`：单部位
  - `SCOPE_MULTI_PARTS`：多部位（用于多选或全体概念的扩展）
- `target.selection.mode`：`single | multiple | ...`
- `target.selection.selectCount: number`：当 `scope=SCOPE_MULTI_PARTS` 且 `mode=multiple` 时表示一次施放要选多少个部位

> 备注：执行阶段由 `skill.actions[]` 决定如何消费 `selectionResult`，规划阶段只负责产出 selection。

---

## 4. 规划输入（UI -> Engine -> Planner）

### 4.1 UI 调用入口

`UI_SkillPanel.onEmptySlotClick()` 在玩家点击高亮槽位后调用：

- `engine.input.assignSkillToSlot({ slotKey, skillId, targetId, bodyPart, selectionResult })`

其中：

- `slotKey: string`
  - 规范：`(self|enemy):{part}:{index}`
  - 示例：`enemy:head:0`、`self:chest:0`

- `skillId: string`
- `targetId: string`
- `bodyPart: string`
  - 兼容字段：历史上系统以“单部位”为主要输入，因此仍保留。
  - 在产品定义 B 的多选里，`bodyPart` 通常取 `selectionResult.selectedParts[0]` 作为主部位。

- `selectionResult?: { mode, scope, selectCount, selectedParts }`
  - 多选技能提交时由 UI 携带。
  - 单选技能可不传，Planner 会根据技能数据生成默认值。

### 4.2 Engine 补齐字段

`CoreEngine.assignSkillToSlot()` 会在调用 `TurnPlanner.assign()` 时补齐：

- `cost: number`
- `speed: number`

这些来自 `skillConfig` 与玩家属性（速度）组合。

### 4.3 Planner 接口

`TurnPlanner.assign({ slotKey, skillId, targetId, bodyPart, cost, speed, selectionResult })`

Planner 的职责：

1. 校验 `slotKey` 格式与容量；
2. 校验 AP；
3. 规整/生成 `selectionResult`（保证 action 中必有 selectionResult）；
4. 写入内部状态（`assigned/actionsById/order/skillToSlots`）。

---

## 5. 规划输出（Planner -> Engine -> UI）

### 5.1 Planner 内部状态（权威）

`TurnPlanner` 持有：

- `assigned: Record<slotKey, actionId>`
- `actionsById: Record<actionId, PlannedAction>`
- `order: actionId[]`
- `skillToSlots: Map<skillId, Set<slotKey>>`（索引）

`PlannedAction`（当前实现字段）约定：

- `actionId: string`
- `slotKey: string`
- `source: 'PLAYER' | 'ENEMY'`（规划阶段玩家为主）
- `sourceId: string`
- `skillId: string`
- `targetId: string`
- `bodyPart: string`
- `selectionResult: { mode, scope, selectCount, selectedParts: string[] }`
- `cost: number`
- `speed: number`
- `meta: { side, part, slotIndex }`

### 5.2 Engine 队列快照（用于渲染/执行）

`CoreEngine._freezePlannerToQueue()` 生成：

- `engine.playerSkillQueue: PlannedAction[]`

UI 渲染 `Action Matrix` 主要依赖此队列。

### 5.3 Runtime 快照（用于调试/可视化/未来存档）

`CoreEngine._syncPlannerToRuntime()` 同步：

- `runtime.planning.player.assigned`
- `runtime.planning.player.actionsById`
- `runtime.planning.player.order`
- `runtime.planning.player.skillToSlots`

---

## 6. 规则与约束：应由谁负责

### 6.1 为什么“规则要由 Engine/Planner 兜底”

- UI 约束只能保证“当前 UI 交互路径”，不能保证：
  - 未来另一个 UI 组件调用同一引擎 API
  - 通过控制台/脚本直接调用 `engine.input.assignSkillToSlot`
  - UI 改版或 bug 造成绕过

因此，**Engine/Planner 必须保证状态合法**；UI 的限制属于“体验增强”。

### 6.2 本次已确认规则：每个技能每回合允许规划 1 次

建议定义为 Planner 级规则：

- 维度：`skillId`（是否还要区分 `targetId` 取决于产品，当前按你的描述默认为 skillId 粒度）
- 行为：
  - **替换**：同 skillId 已存在 action 时，新规划会先移除旧 action，再写入新 action；
  - 或 **拒绝**：返回 `{ ok:false, reason:"Skill already planned." }`。

> 当前代码尚未实现该规则；需要在 `TurnPlanner.assign()` 中利用 `skillToSlots` 做 hard constraint。

---

## 7. UI 多选（产品定义 B）建议交互状态（概念）

`UI_SkillPanel` 内部维护 `selectionDraft`：

- `skillId`
- `targetId`
- `targetType`
- `selectCount`
- `selectedParts: Set<string>`
- `previewSlotKey`

交互：

1. 选择多选技能 -> 高亮可选槽；
2. 连续点击不同部位 -> `selectedParts` 累计；
3. 满 `selectCount` -> 提交一次 `assignSkillToSlot` 并携带 `selectionResult.selectedParts`。

> UI 侧可以在 draft 未满时提示剩余数量，并禁止重复选择同一部位。

---

## 8. 待办与下一步

- [ ] 在 `TurnPlanner.assign()` 实现“每回合每技能仅 1 次”的硬约束（替换或拒绝）。
- [ ] 明确该规则的维度：仅 `skillId` 还是 `skillId + targetId`。
- [ ] 执行阶段：由技能执行器消费 `selectionResult.selectedParts`（后续单独文档/章节）。
