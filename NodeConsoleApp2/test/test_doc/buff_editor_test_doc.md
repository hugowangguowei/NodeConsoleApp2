# Buff Editor v3 测试日志（规范版）

> 本文档用于记录 `test/buff_editor_v3.html` 的功能验证结果，作为后续回归测试/缺陷追踪依据。

## 1. 测试信息

- 测试工具：`test/buff_editor_v3.html`
- 测试数据：
  - Buff：`assets/data/buffs.json`
  - Enemy：`assets/data/enemies.json`
  - Player：`assets/data/player.json`
- 测试重点：
  1) Buff 数据字段完整性（description/tags/lifecycle/effects/statModifiers）
  2) Buff 施加/移除/叠加/持续时间扣减
  3) Buff 在事件驱动下的触发与效果（伤害、控制、属性修改、护盾等）
  4) 模拟调试区 UI 是否能正确反映运行时状态变更

## 2. 统一问题（General Issues）

### G-01 多个 Buff 缺少 `description`

- 现象：多个 buff 在编辑器中缺少 `description` 字段或为 `""`。
- 影响：
  - 测试阶段无法快速判断 buff 的设计意图、触发条件、效果边界；
  - 后续做平衡与关卡配置时可读性差，容易误配。
- 复现步骤（建议）：
  1) 打开 `buff_editor_v3.html`
  2) `Load Project buffs.json`
  3) 左侧逐个选择 buff，观察编辑区 `Description` 字段是否为空
- 验收标准（建议）：
  - `assets/data/buffs.json` 中每个 buff 条目都存在 `description` 字段（允许为空，但建议为可读文本）；
  - 编辑器导入后，所有 buff 的 `description` 均可被展示/编辑。
- 初步原因分析（不改代码）：
  - 数据层：`buffs.json` 中部分条目缺字段或为空（数据缺省/未补齐）。
  - 工具层：导入时未对缺字段做默认填充（例如 `description: ""`）。

### G-02 模拟调试区 Player/Enemy 的 Buff 列表无法删除单项

- 现象：模拟调试区展示了 player/enemy 的 `buffs` 列表，但无法对“已存在的 buff 实例”执行删除。
- 影响：
  - 难以做组合测试（例如：A+B+C 与 A+B 的对比）；
  - 难以验证叠加策略（refresh/add/extend/replace）与驱散行为；
  - 测试流程被迫依赖 Reset，无法保持其它状态（如护甲破损、HP 阶段）不变。
- 复现步骤（建议）：
  1) Apply 任意 buff 到 enemy
  2) 在右侧 `Enemies 数据` -> `buffs` 列表中寻找“删除/移除”入口
  3) 实际无入口，只能 Reset 或手动“Remove Selected Buff”（且不一定能精准删除到某个实例）
- 验收标准（建议）：
  - 支持两种删除语义（至少一种）：
    - **按实例删除**：对 `getAll()` 的每条 buff（以 `instanceId` 标识）提供删除按钮；
    - **按类型删除**：按 `buffId` 一键移除该类型的所有实例（用于快速清理）。
  - 删除后 UI 列表立刻更新，且日志显示明确的移除原因（manual/clean/reset）。
- 初步原因分析（不改代码）：
  - 工具层：UI 只展示 `BuffManager.getAll()` 的结果，没有绑定删除操作。
  - 引擎接口层：`BuffManager.remove(...)` 可能需要 `instanceId`（单实例）或 `buffId`（类型），目前 UI 未暴露对应参数。

## 3. 具体 Buff 测试记录（Per-Buff）

> 说明：以下条目以“现象”为准，buffId 以 `buffs.json` 内实际 id 为准。

### B-01 中毒（Poison）

- 现象：缺少 `description` 字段；伤害判断正确。
- 复现步骤：
  1) 打开 `buff_editor_v3.html`，加载 `buffs.json`
  2) 选择中毒 buff，Apply 到 enemy
  3) 触发回合事件（Start Turn / End Turn），观察日志与 enemy HP
- 预期：
  - 日志出现 DoT 伤害；enemy HP 按数值递减。
- 实际：
  - 伤害触发正确；description 缺失。
- 初步原因分析（不改代码）：
  - description 为数据完整性问题；伤害逻辑本身可用。

### B-02 眩晕（Stun）

- 现象：缺少 `description` 字段；当前工具无法进行有效测试。
- 阻塞原因：
  - 当前工具缺少“敌方行动/敌方回合决策/尝试行动”的模拟入口。
  - 眩晕类 buff 通常需要在「行动尝试/技能释放」时拦截，单纯 Start/End Turn 难以体现。
- 初步原因分析（不改代码）：
  1) BuffSystem 可能监听的是 action/cast 相关事件，但编辑器未触发此类事件；
  2) 或者 stun 的效果是改变行动力/跳过行动，但编辑器没有行动系统可表现。
- 结论：
  - 需要在测试工具中增加“敌方尝试行动”模拟入口。

### B-03 力量增强（Strength Up / atk up）

- 现象：增加力量 buff 后，攻击伤害正确增加；但 `statModifier.type` 切换没有效果。
- 复现步骤：
  1) 选择力量增强 buff，Apply 到攻击方（player 或 enemy）
  2) 执行 `Cast Attack` 观察伤害变化
  3) 修改 `statModifiers[atk].type`（flat/percent/overwrite）并再次攻击
- 预期：
  - 不同 type 对伤害增益表现不同（例如 percent 按比例放大）。
- 实际：
  - 伤害会增加；但切换 type 未见明显差异。
- 初步原因分析（不改代码）：
  1) 引擎对 `statModifiers.type` 的支持可能仅实现了 `flat`，其他类型未实现或未接入计算；
  2) 该 buff 的实际生效路径可能不走 `statModifiers`，而是通过 `effects` 写入 `context.tempModifiers`；
  3) 编辑器中对 buff 的实时编辑，可能未同步到运行时 registry（取决于 BuffRegistry 是否做了深拷贝缓存）。
- 结论：
  暂时只需要支持 `flat` 类型，但是可以预留percent,formula,multi等接口，如果在测试时候进行了调用，需要进行日志记录，方便后续补充实现。
### B-04 护盾（Shield）

- 现象：给 enemy 添加护盾 buff 后，不能正确“增加护甲值”。
- 复现步骤：
  1) 选择护盾 buff，Apply 到 enemy
  2) 观察 enemy 的 bodyParts/护甲显示，或执行 `Cast Attack` 观察伤害吸收情况
- 预期（当前测试记录的预期）：
  - 护甲值上升/护甲显示变化。
- 实际：
  - 未观察到护甲值增加。
- 初步原因分析（不改代码）：
  1) 设计层面：护盾（Shield）与护甲（Armor）可能不是同一概念。
     - 护甲通常是 bodyParts.current/max（部位耐久）
     - 护盾更可能是独立吸收层（例如 `context.shieldPool`），不会改变护甲数值
  2) 若护盾采用吸收层实现，则正确的验证方式应为：受到伤害时先被 shield 吸收，并在日志中体现 absorbed，而不是“护甲增加”。
  3) 若你确实希望护盾表现为护甲加成，则需要明确映射策略：护盾应该增哪个部位/全部部位护甲，以及 UI 应如何展示。
- 结论：
  我们需要明确“护盾”的设计期望，护盾的目标是能够吸收n层伤害，而不是直接增加护甲值。
