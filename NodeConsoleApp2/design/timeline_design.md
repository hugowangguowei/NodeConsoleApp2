# 行动时间轴（Timeline）设计方案

> 目标：把 `timeline labeled-block` 从“纯 UI 展示区”升级为**主战斗状态机下的子状态机**：
>
> - 回合规划提交后：接收我方行动队列并生成时间轴
> - AI 生成后：接收敌方行动并合并
> - 战斗模拟阶段：作为推演驱动器按顺序驱动执行与展示
> - 推演完成：向主引擎回传事件与摘要结果
>
> 本文以“高内聚、低耦合”为原则：Timeline 负责**排序、驱动、播放控制、事件分发**；具体结算逻辑由执行器/模拟器模块承担。

---

## 1. 模块定位与边界

### 1.1 Timeline 是什么
Timeline 是一个“回合级队列管理 + 播放驱动”的引擎子模块：

- 输入：本回合双方已决定的行动（我方来自规划器输出，敌方来自 AI 输出）
- 输出：按时间顺序的行动序列、执行过程事件、回合结束摘要

它必须具备：

- 可重置、可加载新回合
- 可播放/暂停/单步
- 可对外发布事件（用于 UI 与主引擎推进）

### 1.2 Timeline 不是什么（避免耦合/补丁化）
- **不是数据加载器**：不读取 JSON（`DataManagerV2` 负责）
- **不是规划器**：不决定玩家怎么选槽位/怎么选目标（`TurnPlanner`/输入模块负责）
- **不是结算引擎本体**：不直接硬编码 buff/伤害规则（交给 `ActionExecutor`/`BattleSimulator`）

### 1.3 “暴露问题”的原则
遵循仓库约束：关键数据缺失或结构不匹配，Timeline 应进入 `ERROR` 并通过系统弹窗/日志提示；**不允许 silent fallback 或 mock 兜底**。

---

## 2. 与现有模块的对接点（建议）

结合当前工程文件：

- `script/engine/CoreEngine.js`：主循环/状态机的拥有者，驱动 Timeline 子状态机
- `script/engine/TurnPlanner.js`：规划器，输出“按 skill 维度”的规划结果（参考 `design/skill_planning_design.md`）
- `script/ui/UI_BattleRow.js` / `script/ui/UI_SkillPanel.js`：提交规划按钮与主界面交互
- `UI_SystemModal.js`：承接 `TIMELINE_ERROR` 等错误提示

建议新增（或以文件存在情况为准）：

- `script/engine/TimelineManager.js`：本文核心设计模块
- `script/engine/ActionExecutor.js`（或 `BattleSimulator.js`）：执行 entry 并生成结果
- `script/ui/UI_TimelineBlock.js`：专职渲染 labeled-block 的 UI 控制器

---

## 3. 数据结构设计

### 3.1 TimelineEntry（时间轴条目）
时间轴的最小播放单位。

建议字段：

- `entryId: string`：唯一 ID（回合内唯一即可）
- `roundId: string | number`：回合标识（可选，但便于调试）
- `side: "self" | "enemy"`
- `actorId: string`
- `skillId: string`
- `plan: object`：规划快照（至少包含目标与部位/槽位选择结果；结构遵循规划设计文档）
- `time: number`：排序主键（越小越先执行）
- `priority?: number`：同 `time` 下的次级排序（越大越先）
- `meta?: { label?: string, iconKey?: string }`：纯展示辅助信息，避免 UI 反查过多
- `execution?: { state: "PENDING"|"RUNNING"|"DONE"|"CANCELED"|"ERROR", result?: object, error?: string }`

> 说明：`time` 不必直接等于 `speed`。如果未来要支持先手、延迟、插队、打断，应把 `time` 视为“行动调度时间”。

### 3.2 TimelineSnapshot（给 UI 的只读快照）
UI 渲染只依赖快照，避免拿到可变引用。

- `phase: "IDLE"|"READY"|"PLAYING"|"PAUSED"|"FINISHED"|"ERROR"`
- `currentIndex: number`
- `entries: Array<{ entryId, side, actorId, skillId, time, executionState, meta }>`
- `error?: { message: string, details?: any }`

### 3.3 RoundActionInput（加载本回合动作的输入）

- `selfPlans: Array<SkillPlan>`
- `enemyPlans: Array<SkillPlan>`（允许空数组，但必须显式传入）
- `rules?: { tieBreak?: string, sidePriority?: "self"|"enemy"|"alternate" }`

其中 `SkillPlan` 的字段应以 `design/skill_planning_design.md` 的输出为准（核心是“以 skill 为维度”而非 slot）。

---

## 4. Timeline 子状态机

### 4.1 状态定义
- `IDLE`：无队列
- `READY`：队列已构建，等待开始
- `PLAYING`：播放/推演中
- `PAUSED`：暂停
- `FINISHED`：本回合推演完成
- `ERROR`：数据缺失/执行失败

### 4.2 状态迁移
- `IDLE` → `READY`：`loadRoundActions()` 正常完成
- `READY` → `PLAYING`：`start()`
- `PLAYING` ↔ `PAUSED`：`pause()` / `resume()`
- `PLAYING` → `FINISHED`：执行到末尾
- 任意 → `ERROR`：输入校验失败、执行器报错等

### 4.3 关键约束
- `loadRoundActions()` 必须严格校验：缺字段即 `ERROR`，并发出 `TIMELINE_ERROR`。
- Timeline 不得在加载失败时回退到 mock 队列。

---

## 5. 排序策略（Scheduling）

### 5.1 基础排序
按以下规则排序（稳定排序）：
1) `time` 升序
2) `priority` 降序（缺省视作 0）
3) 同速同优先级的 tie-break：
   - 可配置为 `selfFirst` / `enemyFirst` / `alternate`
4) `stableIndex`（构建时顺序）作为最终兜底，确保稳定

### 5.2 为什么要抽出策略
后续需求（先攻 buff、插队、打断、减速/加速）会持续增长；把策略隔离可避免 Timeline 本体补丁化。

建议实现为：
- `TimelineScheduler.buildEntries(selfPlans, enemyPlans, ctx)`
- `TimelineScheduler.sort(entries, rules)`

---

## 6. 推演/执行驱动模型

### 6.1 两种模式

#### 模式 A：离线结算 + 回放（未来增强）
- 一次性执行所有 entry，生成事件流
- UI 播放事件流

优点：可快进/回放/跳转一致性强
缺点：需要明确的事件流结构

#### 模式 B：边播放边结算（建议 MVP）
- Timeline 每次 `step()` 执行一个 entry
- 结果即时应用到战斗态，并发事件更新 UI
- 播放节奏采用**离散步进**：按事件顺序推进，不做连续距离/位移时间模拟
- 默认步进 `0.3s / action`（可配置）

优点：实现成本低，适合当前迭代
缺点：回放能力弱（但可通过日志补齐）

### 6.3 离散时间步进规范（本期确定）

为降低复杂度并保证稳定性，本期时间轴采用离散时间：

1) **逻辑时间**：仅用于排序（`time/priority`），决定先后顺序。  
2) **展示时间**：固定步长推进（默认 `300ms`），每个 action 占用一个步进周期。  
3) 不引入“按距离推进、真实轨迹耗时、动画时长反推逻辑时间”等机制。  

实现约束：
- `TimelineManager.start({ stepDelayMs })` 默认 `stepDelayMs = 300`。
- UI 的 `1x/2x/4x` 仅影响展示步进间隔，不改变排序结果。
- 如果需要更精细的真实时间模拟，作为后续扩展，不在本期 MVP 范围。

### 6.2 执行器接口（建议）
Timeline 不关心具体 buff/伤害算法，只调用执行器：

- `executor.execute(entry, engineContext) -> ExecutionResult`

`ExecutionResult` 建议至少包含：
- `events: Array<GameEvent>`（伤害、资源变更、buff 变更等）
- `summary: object`
- `errors?: Array<string>`

---

## 7. 事件协议（Timeline ↔ CoreEngine/UI）

建议通过引擎统一事件总线（或 Timeline 自己的订阅机制），发布以下事件：

- `TIMELINE_READY({ roundId, count })`
- `TIMELINE_START({ roundId })`
- `TIMELINE_ENTRY_START({ entry })`
- `TIMELINE_ENTRY_END({ entry, result })`
- `TIMELINE_PAUSE({ roundId })`
- `TIMELINE_RESUME({ roundId })`
- `TIMELINE_FINISHED({ roundId, roundSummary })`
- `TIMELINE_ERROR({ message, details })`

UI `timeline labeled-block` 应订阅这些事件并刷新快照展示。

---

## 8. UI（timeline labeled-block）交互设计建议

### 8.1 展示层
a) Header：
- 回合号、播放控制：`开始/暂停/单步/倍速(1x/2x/4x)`

b) Body：
- 条目线性列表或分组列表（按 `time` 分组显示更直观）
- 每条显示：阵营、技能名、actor、time、状态（pending/running/done/error）

c) Footer：
- 最近 N 条执行日志摘要（用于你调试校验）

### 8.2 交互
- 点击某条 entry：展示 `plan` 摘要（目标、部位/槽位）+ 执行结果摘要
- 若 `ERROR`：调用系统模态框显示错误详情（不做兜底回退）

---

## 9. MVP 落地清单

1) 新增 `TimelineManager`：
- `reset()`
- `loadRoundActions(selfPlans, enemyPlans, rules)`（严格校验）
- `start()/pause()/resume()/step()`
- `getSnapshot()`

2) 在 `CoreEngine` 中增加 Timeline 子模块并在主循环相位对接：
- `PLANNING_COMMIT` 后构建 timeline → `READY`
- 进入 `BATTLE_SIMULATION` 相位后 `start()` 或由 UI 控制 `start()`
- 完成后发布 `TIMELINE_FINISHED` → 主循环进入结算/下一回合
- 默认播放节奏按离散步进 `0.3s / action`

3) UI labeled-block：
- 订阅 Timeline 事件并渲染 snapshot
- 提供 `开始/暂停/单步` 控制按钮

---

## 10. 开放问题（后续扩展）
- `time` 的计算来源：由规划器提供，还是由 timeline 根据角色速度计算？（建议先由规划器/调度策略模块计算，Timeline 只消费）
- 同速冲突规则：自优先/敌优先/交替/按角色属性（可配置）
- 是否支持中途插入（interrupt）：需要 `TimelineScheduler` 支持动态重排

---

## 11. 与 `skill_planning_design.md` 的一致性约束
- Timeline 输入必须是“以 `skill` 为维度的规划结果”，而不是以 slot 为主维度的结构。
- slot 维度结构仅允许存在于规划会话内部作为 UI 便利。
- Timeline 输出/执行日志建议以 `entry/skill` 为索引，避免主引擎被 slot 结构绑死。
