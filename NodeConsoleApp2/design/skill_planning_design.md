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

> 说明：`speed` 属于执行/结算阶段（决定先后手、回合内排序等）的数据；**在规划阶段的输入合法性与存储上不需要依赖 speed**。

### 3.3 目标与选择（决定“单选/多选/是否需要部位”）
- `target.subject`：`SUBJECT_SELF | SUBJECT_ENEMY | ...`
- `target.scope`：
  - `SCOPE_ENTITY`：目标本体
  - `SCOPE_PART`：单部位
- `target.selection.mode`：`single | multiple`
- `target.selection.selectCount: number`：当 `mode=multiple` 时表示一次施放要选多少个部位

> 备注：执行阶段由 `skill.actions[]` 决定如何消费 `selectionResult`，规划阶段只负责产出 selection。

---

## 4. 规划输入（UI -> Engine -> Planner）

### 4.1 规划交互入口（从 Engine 进入 PLANNING 开始）

规划不是“UI 的一个点击动作”，而是战斗流程中的一个 **Engine 驱动的阶段状态（PLANNING）**。

因此，规划交互的起点应当是 Engine 分发“进入规划阶段”的状态（或事件），UI 只是在 `PLANNING_ACTIVE` 内部响应用户输入。

#### 4.1.1 宏观状态：Battle Phase（Engine 负责）

建议将回合内与规划相关的宏观状态描述为：

- `TURN_START -> PLANNING_ENTER -> PLANNING_ACTIVE -> PLANNING_COMMIT -> EXECUTING`

其中：

- `PLANNING_ENTER`：Engine 初始化 Planner（清空/恢复）、同步 runtime snapshot、广播 UI 所需事件；
- `PLANNING_ACTIVE`：允许 UI 发起一系列规划输入（可能多次循环）；
- `PLANNING_COMMIT`：锁定/冻结本回合规划输出（供执行阶段消费）。

#### 4.1.2 微观循环：UI 交互状态机（PLANNING_ACTIVE 内部）

在 `PLANNING_ACTIVE` 内部，玩家可能执行多个独立循环：

- `idle`（未 armed 技能）
- `armed(skillId)`（已选中技能，等待选择目标/部位）
- `drafting(skillId)`（仅对 `mode=multiple`：已开始累积 `selectedParts`）

关键事件（UI 发起）：

1. `selectSkill(skillId)`：进入/切换到 `armed(skillId)`
   - UI 根据 `skill.target`（subject/scope/selection）高亮合法槽位（可选 slotKey 集合）
2. `clickSlot(slotKey)`：
   - `mode=single`：直接提交一次规划输入
   - `mode=multiple`：进入/推进 `drafting`（累计 `selectedParts`，满 `selectCount` 后提交一次规划输入）
3. `clickBlank/cancel` 或 `selectSkill(otherSkillId)`：取消当前 armed/draft，并开始下一轮循环

> 说明：这一层状态机属于 UI/交互体验；合法性与最终权威状态必须由 Planner/Engine 兜底。

#### 4.1.3 UI -> Engine 的规划提交入口

在“草稿期不提交”的模式下，`PLANNING_ACTIVE` 的所有交互都停留在 UI 草稿态；
只有在 `PLANNING_COMMIT`（点击提交按钮）时，才会把“本回合全部规划结果”一次性提交给 Engine/Planner。

> 重要约定：
>
>- `armed/drafting`（selectionDraft）属于 UI 内存态。
>- Planner 的权威规划态只在 `PLANNING_COMMIT` 生成/更新。

因此，`PLANNING_ACTIVE` 阶段 UI 不调用 `assignSkillToSlot(...)`；而是在 UI 内维护一份草稿集合：

- `planningDraftBySkill: Record<skillId, DraftPlannedAction>`

当进入 `PLANNING_COMMIT` 时，UI 一次性提交草稿集合（建议新增入口）：

- `engine.input.commitPlanning({ planningDraftBySkill })`

> 说明：
>
>- `slotKey/bodyPart` 仍属于 UI 映射维度；在 batch commit 中可作为 `DraftPlannedAction.ui` 的可选字段。
>- 关键维度应当是 `skillId + targetId + selectionResult`。

### 4.2 Engine 补齐字段

Engine 在 `PLANNING_ENTER/ACTIVE/COMMIT` 上有明确的阶段边界。

#### 4.2.1 进入/提交规划阶段（宏观）

- `CoreEngine.enterPlanning()`：初始化本回合 Planner 状态、同步 runtime snapshot、通知 UI
- `CoreEngine.commitPlanning()`：对 UI 草稿做一次性校验与落盘，冻结 Planner 输出为执行阶段可消费的快照

#### 4.2.2 提交一次规划（微观）

在 batch commit 模式下，Engine 在 `commitPlanning({ planningDraftBySkill })` 内对每条草稿补齐字段：

- `cost: number`

这些来自 `skillConfig` 与玩家属性（如 AP 系统）组合。

### 4.3 Planner 接口

Planner 提供两类能力：

1) **规划周期内部索引（slot 维度）**：用于 UI/布局映射与快速访问（例如判断 slot 是否占用）。
2) **对外权威提交（skill 维度）**：主引擎关心的“本回合哪些 skill 被激活了”。

因此建议将提交接口定义为 skill-centric（权威），并支持 batch：

- `TurnPlanner.planSkill({ skillId, targetId, selectionResult, cost, ui?: { slotKey, bodyPart } })`
- `TurnPlanner.planMany({ planningDraftBySkill })`

其中 `ui` 是可选的 UI 映射字段，不应被执行器依赖。

> 现有代码实现仍为 `TurnPlanner.assign({ slotKey, ... })`（slot-centric）。
> 若短期不改代码，可以在 `commitPlanning(...)` 内把草稿展开为对 `assign(...)` 的调用（仍然是一键 commit），
> 但最终必须产出 `plannedBySkill/skillToSlots` 的 skill-centric 输出。

Planner 的职责：

1. 校验 `slotKey` 格式与容量；
2. 校验 AP；
3. 规整/生成 `selectionResult`（保证 action 中必有 selectionResult）；
4. 写入内部状态。

> 关键原则：Planner 的对外“可观测输出”应以 **skill 为中心**；slot 维度只能作为规划周期内部的索引与 UI 映射。

---

## 5. 规划输出（Planner -> Engine -> UI）

### 5.1 Planner 内部状态（权威）

`TurnPlanner` 持有：

#### 5.1.1 规划周期内部索引（允许 slot 维度，但仅用于内部访问）

- `assigned: Record<slotKey, actionId>`（slot -> actionId，供 UI 根据 slotKey 快速判断是否占用）

#### 5.1.2 对外核心输出（skill 维度，主引擎关心）

- `plannedBySkill: Record<skillId, PlannedAction>`（本回合哪些 skill 被激活了）
- `skillToSlots: Record<skillId, slotKey[]>`（该 skill 对应占用了哪些槽位，用于 UI 渲染/回放/调试）

> 注：`skillToSlots` 是 UI/调试友好结构。主引擎一般只需要 `plannedBySkill`（或其数组视图）。

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

> 说明：
>
>- `selectionResult` 是 Planner 的责任：即使 UI 不传，也应根据 skill 配置补齐默认值。
>- `slotKey/meta` 属于 UI/调试维度，**不应成为主引擎消费该 action 的必要字段**。

### 5.2 Engine 队列快照（用于渲染/执行）

`CoreEngine` 应提供一个“以 skill 为中心”的视图（供执行器或战斗流程使用），以及一个“以 slot 为中心”的视图（供 UI 渲染使用）。

建议对外输出分两类：

1. **Skill 视图（主引擎/执行器关心）**
   - `engine.playerPlannedBySkill: Record<skillId, PlannedAction>`
2. **Slot/UI 视图（UI 关心）**
   - `engine.playerSkillQueue: PlannedAction[]`（或按 slotKey 重建的列表，用于 Action Matrix 渲染）

UI 渲染 `Action Matrix` 主要依赖此队列。

### 5.3 Runtime 快照（用于调试/可视化/未来存档）

`CoreEngine._syncPlannerToRuntime()` 同步（建议）：

- `runtime.planning.player.plannedBySkill`
- `runtime.planning.player.skillToSlots`

可选（仅用于 UI 复原/排错）：

- `runtime.planning.player.assigned`

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

> 当前代码尚未实现该规则；建议在 `TurnPlanner.assign()` 中以 `plannedBySkill[skillId]` 为权威做 hard constraint（替换语义）。

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

### 7.1 多选技能（`selection.mode=multiple`）的明确交互流程（建议）

本节目标：把“多选技能”与“多槽位放置”严格区分开。

- **多选技能**：一次规划提交产生 **一条** `PlannedAction`，该 action 的 `selectionResult.selectedParts` 里包含多个部位。
- **不是**：把同一个 skillId 放到多个 slot 上从而产生多条 action。

#### 7.1.1 前置：进入 `PLANNING_ACTIVE`

1. Engine 进入 `PLANNING_ACTIVE` 并通知 UI。
2. UI 处于 `idle`，未 armed 技能。

#### 7.1.2 开始一轮多选循环：`selectSkill(skillId)`

1. 玩家点击一个 `mode=multiple` 的技能按钮。
2. UI 进入 `armed(skillId)` 并初始化 `selectionDraft`：
   - `selectedParts = ∅`
   - `selectCount = skill.target.selection.selectCount`
   - `targetId` 由当前上下文确定（敌方当前选中/默认敌人等）
3. UI 高亮“允许点击的部位行/槽位”。

> 高亮的依据是 `target.subject`（self/enemy）和 `target.scope`（entity/part）。
> 在新的 schema 下，多选仍是 `SCOPE_PART + mode=multiple`，不再依赖 `SCOPE_MULTI_PARTS`。

#### 7.1.3 累积选择：`clickSlot(slotKey)`

当玩家点击某个合法空槽（slotKey 对应某个 bodyPart）时：

- 读取 `slotKey` 映射出的 `part`（例如 `enemy:head:0` -> `head`）
- 若 `part` 尚未选中：加入 `selectionDraft.selectedParts`
- 若 `part` 已选中：视为“toggle”，从 `selectedParts` 移除（便于修正误点）

UI 在每次点击后更新提示：

- `已选 n / selectCount`

并且：

- 当 `n < selectCount`：继续保持 `drafting(skillId)`，允许继续点其它部位
- 当 `n === selectCount`：进入下一步“提交”

#### 7.1.4 提交：一次提交生成一条 action

当 `selectedParts` 达到 `selectCount` 时，UI **不提交给 Engine/Planner**，而是把结果写入 UI 草稿集合：

- `planningDraftBySkill[skillId] = DraftPlannedAction`

其中：

- `selectionResult = { mode:'multiple', scope:'SCOPE_PART', selectCount, selectedParts:[...] }`
- `bodyPart = selectedParts[0]`（仅作为 UI/旧字段映射；执行器不应依赖它）
- `slotKey` 仅作为 UI 映射字段（用于 Action Matrix 的落点/展示），权威维度来自 `skillId + selectionResult`

写入草稿后（建议体验）：

- UI 清空 `selectionDraft`，回到 `armed(skillId)` 或 `idle`（取决于产品：是否保持 armed）
- UI 用“草稿已就绪”的样式提示该技能已完成规划（直到 commit 或被覆盖）

#### 7.1.5 取消与切换

- `clickBlank/cancel`：丢弃 `selectionDraft`，回到 `idle`
- `selectSkill(otherSkillId)`：丢弃当前 draft，切换到新 skill 的 armed 循环

> 关键约束：在“技能 B 的 selection 循环”中，不应通过误点影响“技能 A 已完成的规划结果”。
> 对已完成的规划要修改，必须显式进入编辑模式或通过 Planner 的替换规则完成。

---

## 8. 待办与下一步

- [ ] 在 `TurnPlanner.assign()` 实现“每回合每技能仅 1 次”的硬约束（替换或拒绝）。
- [ ] 明确该规则的维度：仅 `skillId` 还是 `skillId + targetId`。
- [ ] 执行阶段：由技能执行器消费 `selectionResult.selectedParts`（后续单独文档/章节）。

---

## 9. 基于当前实现的差距分析与升级策略

本章不做“兼容性兜底”的设计；目标是把规划模块升级到“Engine 相位驱动 + Planner skill-centric 权威输出”的一致模型。

### 9.1 当前实现的主要问题（为什么会导致交互/约束反复失控）

1) **Planner 输入是 slot-centric，但输出期望 skill-centric**
- 现状：`TurnPlanner.assign({ slotKey, ... })` 以 slot 为主语。
- 结果：很容易把“同一 skill 多次规划”的约束（每回合 1 次）做成 UI 行为或分散逻辑。
- 风险：任何绕过 UI 的入口（脚本/回放/未来 UI）都可能破坏约束。

2) **`selectionResult` 在规划阶段没有形成强约束的“权威结构”**
- 现状：规划入口依赖 `bodyPart/slotKey`，而 `selectionResult` 可能缺省或不完整。
- 结果：多选技能容易退化成“放多个槽位”而不是“一次 action 携带多个部位”。

3) **引擎相位（enter/commit）缺少明确 API/数据冻结点**
- 现状：文档已引入 `PLANNING_ENTER/COMMIT`，但缺少对应实现接口与冻结语义。
- 结果：UI 只能“边点边改”，缺少明确的提交边界，也不利于回放/存档。

### 9.2 升级策略（按最小闭环拆解）

#### 阶段 A：先引入 batch commit（把“草稿期”与“权威规划态”解耦）

目标：`PLANNING_ACTIVE` 只产生 UI 草稿；`PLANNING_COMMIT` 一次性提交。

- UI 增加 `planningDraftBySkill`
- Engine 增加 `commitPlanning({ planningDraftBySkill })`

产出：误触不再直接污染引擎规划态；撤销/重选成本显著降低。

#### 阶段 B：把“权威输出”收敛到 skill 维度（commit 后的一致快照）

目标：Planner 内部仍允许 slot 索引，但对外提供 `plannedBySkill/skillToSlots` 的权威快照。

- 在 `TurnPlanner` 增加：
  - `plannedBySkill: Record<skillId, PlannedAction>`
  - `skillToSlots: Record<skillId, slotKey[]>`
- 每次 `assign(...)` 成功后，统一维护这两个结构。

产出：Engine/UI/快照都可以改为优先读取 skill 视图，slot 视图仅用于渲染。

#### 阶段 C：把“每技能每回合仅 1 次”做成 Planner 硬约束（替换语义）

目标：无论 UI 怎么点，只要提交同 skillId，Planner 都先移除旧记录再写入新记录。

- 以 `plannedBySkill[skillId]` 为权威判断：
  - 已存在则 unassign 旧 action 占用的 slotKey 集合
  - 插入新 action

产出：单选技能“替换”不再依赖 UI；多选技能也不会无限占槽。

#### 阶段 D：把 Planner 的提交接口语义升级为 skill-centric + batch

目标：文档中的 `planSkill(...)` 成为真实入口：

- `planSkill({ skillId, targetId, selectionResult, cost, ui?: { slotKey, bodyPart } })`

产出：规划模块在概念层面与实现层面一致；slotKey 不再是权威输入。

#### 阶段 E：补齐 Engine 的 enter/commit 生命周期与冻结合约

- `enterPlanning()`：reset planner、同步 runtime、通知 UI
- `commitPlanning()`：冻结快照，后续执行阶段只读

产出：规划阶段有明确边界，便于存档/回放/调试。
