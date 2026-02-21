# Buff/Debuff 系统设计文档 (Buff/Debuff System Design)

> 目标：基于 `skill_design.md` 的理念（数据驱动、结构化约束、可演进 schema、编辑器友好），升级 Buff 体系文档与 `buffs.json` 的推荐结构。
>
> 重要原则：
> 1) 技能只“施加/移除/引用”Buff，不内嵌 Buff 逻辑；Buff 负责自身生命周期与结算。
> 2) Buff 数据必须具备“自解释层”（meta/枚举/字段说明），以支撑编辑器下拉、校验、迁移。
> 3) Buff 效果模型需要“动作枚举 + payload 规范”，避免自由字符串漂移。

## 1. 系统综述 (System Overview)

Buff (增益) 与 Debuff (减益) 系统是本游戏战斗逻辑的核心底层机制。它不仅用于处理战斗中的临时状态（如眩晕、中毒），也作为装备属性、被动技能、场地效果的统载体。本设计文档基于 `skill_design.md` 和 `item_design.md` 中定义的技能与装备，抽象出核心的 Buff 对象库。

*   **核心目标**:
    1.  **统一性 (Unification)**: 将装备静态属性、技能持续效果、临时状态统一为“Buff对象”进行管理。
    2.  **解耦 (Decoupling)**: 技能和装备只负责“施加”Buff，而Buff的具体效果逻辑由Buff系统独立处理。
    3.  **数据驱动 (Data-Driven)**: 所有Buff通过JSON配置定义，支持热更新和编辑器扩展。

---

## 1.2 与技能系统的边界与对齐（Alignment with Skill System）

Buff 与 Skill 的职责边界应当与 `skill_design.md` 的“组合/约束/数据化”思路一致：

- Skill（主动技能）负责：选择目标（含部位选择）、资源与频率约束（AP、槽位、每回合限制）、以及“施加/移除 Buff”的指令。
- Buff（状态对象）负责：自身生命周期（duration/stack/remove）、以及在特定触发点（trigger）对战斗上下文（context）进行修改。

因此，`buffs.json` 的目标不是“列一堆对象”，而是成为一个可维护、可校验、可扩展的“效果库”。

---

## 1.3 基于测试结论的改动决策（Test-driven Change Decisions）

> 来源：`test/test_doc/buff_editor_test_doc_v2.md` 第三章（Per-Buff）的“结论”条目。
> 目标：把“本轮测试达成的取舍”固化为 Buff 体系的设计约束，避免后续数据继续沿用不可测/未落地的字段与语义。

### 1.2.1 原子性原则（Atomic Buff）

- Buff 是“效果原子对象”，Buff 内部尽量只表达**单一机制**。
- 若需要复合作用（例如“冻结=硬控+减速”），优先由技能/装备在施加阶段组合多个 Buff，而不是一个 Buff 内塞多个 effect/stat。


---

## 1.4 设计改版说明：从“对象清单”转为“需求/类型驱动”

当前版本的 `buff_design.md` 已经罗列了很多 Buff 对象，并且建立了追溯表。但从可维护性与后续实现（尤其是数据驱动实现）角度，现有结构存在一个痛点：

* Buff 的组织方式偏“从技能/装备推导出来的列表”，而不是“从引擎需要解决的问题（需求域）”出发。
* 这样会导致：
  1) 同一类需求（例如伤害修正）在文档中被分散、命名不统一（如 `debuff_weak` 与 `buff_weakness`）。
  2) 当实现 BuffSystem 时，难以直接映射到“伤害结算管线/回合钩子/技能可用性判定”等关键结算点。

因此本文档在不推翻既有 Buff 设计与数据结构基础上，补充一套**按 Buff 需求与类型（效果域）**的分类体系，并将所有已有 Buff 放入该分类体系中。

同时补充一套与 `skills_melee_v4_2.json` 类似的**数据文件 meta 头部规范**，用于让 `buffs.json` 具备可演进性与编辑器友好性。

---

## 2. 基础Buff对象设计 (Base Buff Object Design)

Buff对象是所有效果的最小单元。一个标准的 Buff 对象包含**基础信息**、**生命周期控制**、**效果行为**三大模块。

### 2.1 数据结构 (Data Structure)

```json
{
  "id": "buff_bleed_01",              // 唯一标识符
  "name": "流血 I",                   // 显示名称
  "description": "每回合受到5点伤害", // 显示描述
  "icon": "icon_bleed",               // 图标资源ID
  "type": "debuff",                   // 类型: buff (增益) | debuff (减益) | hidden (隐藏/系统)
  "tags": ["physical", "dot"],        // 标签: 用于驱散、免疫判断 (如: "magic", "control", "fire")
  
  "lifecycle": {
    "duration": 3,                    // 持续回合数 (-1 表示永久，如装备属性)
    "maxStacks": 5,                   // 最大叠加层数
    "stackStrategy": "refresh",       // 叠加策略: refresh (刷新时间) | independent (独立计算) | extend (延长) | replace (替换强度)
    "removeOnBattleEnd": true         // 战斗结束是否清除
  },
  
  "effects": [                        // 效果列表 (核心Payload)
    {
      "trigger": "onTurnStart",       // 触发时机
      "action": "damage",             // 行为类型
      "value": 5,                     // 基础数值
      "valueType": "flat",             // 数值类型: flat (固定值) | percent (百分比) | formula (公式)
      "target": "self"                // 作用目标: self (持有者) | attacker (攻击者 - 用于反伤)
    }
  ],
  
  "statModifiers": {                  // 属性修正 (被动生效)
    "atk": { "value": 10, "type": "percent" },  // 攻击力 +10%
    "def": { "value": -5, "type": "flat" }      // 防御力 -5
  },
  
  "scriptId": null                    // (可选) 复杂逻辑挂载的脚本ID
}
```

---

## 3. Buff 效果类型与触发机制 (Effects & Triggers)

Buff 的效果分为**静态属性修正**和**动态触发行为**两类。

### 3.1 静态属性修正 (Stat Modifiers)
当 Buff 存在时，被动修改角色的面板属性。
*   **支持属性**: `maxHp`, `atk`, `def`, `speed`, `critRate`, `hitRate`, `dodgeRate`, `actionPoints` (上限), `damageDealtMult`, `damageTakenMult`, `armorMitigationMult`.
*   **计算方式**: `Final = (Base + Flat_Sum) * (1 + Percent_Sum)`

#### 3.1.1 `statModifiers.type` 支持范围（与当前引擎对齐）

为保证回归可测与可定位，`statModifiers` 的 `type` 需要明确支持范围，并规定“未支持时必须告警”。

- **MVP 支持**（与现有 `BuffManager.getEffectiveStat` 对齐）：
  - `flat`
  - `percent` / `percent_base`
  - `overwrite`
- **预留但不保证实现**（占位 type，允许出现在数据中，但需要日志提示）：
  - `percent_current`
  - `formula`
  - `mult` / `multi`

未支持 type 的统一策略：

- 不允许静默忽略。
- 建议统一发出 `BUFF:WARN`：`{ ownerId, buffId, statKey, type, value, reason: 'statModifier_type_not_supported' }`

### 3.2 动态触发行为 (Triggered Actions)
通过监听战斗事件总线 (EventBus) 触发特定效果。

| 触发时机 (Trigger) | 描述 | 典型应用 |
| :--- | :--- | :--- |
| `onTurnStart` | 回合开始时 | 持续伤害(DoT)、持续治疗(HoT)、减少CD |
| `onTurnEnd` | 回合结束时 | Buff 持续时间递减、清除标记 |
| `onAttackPre` | 攻击结算前 | 命中率修正、伤害加成计算 |
| `onAttackPost` | 攻击结算后 | 吸血、施加攻击特效(如中毒) |
| `onDefendPre` | 防御结算前 | 闪避判断、格挡减免 |
| `onDefendPost` | 防御结算后 | 反伤(Thorns)、受击回能 |
| `onDeath` | 死亡时 | 复活、亡语爆炸 |

#### 3.2.1 行动尝试事件（用于控制类 Buff 可测性）

（本节已迁移至 `design/buff_editor_design.md`，作为“测试工具需要提供的行动模拟入口/事件”。）

---

## 4. Buff 类型体系（按需求域分类）

> 本节保留“按需求域分类”的结构作为设计索引（帮助内容生产与实现映射）。
> 具体 Buff 对象是否存在/是否纳入主数据，以 `assets/data/buffs_v2_3.json` 为准。

- A 类：伤害结算管线类（Damage Pipeline）
- B 类：回合周期结算类（Periodic）
- C 类：控制与行动限制类（Control / Action Gating）
- D 类：面板属性修正类（Stat Modifiers）
- E 类：防御机制类（Defensive Mechanics）
- F 类：反应/反制类（Reactive Effects）
- G 类：被动/系统类（Passives & Meta Buffs）

## 5. Buff 数据规范（Data Spec / Schema）

本章节给出 Buff 数据结构的落地规范：如何在 `assets/data/buffs.json` 中组织 Buff 对象，使其能被引擎、编辑器、测试工具共同使用，并具备可演进性。

> 本章风格与 `skill_design.md` 第 5 章对齐：先明确与其他系统的对接边界，再给出推荐 schema（含 meta/enums/fieldNotes），最后给出校验与兼容策略。

### 5.1 Buff 与 Skill 系统的对接规范（重要）

#### 5.1.1 设计原则

1) **Skill 只引用 Buff，不定义 Buff 的运行逻辑**

- Skill 的职责是“在何时、对谁施加/移除/刷新哪个 buff”。
- Buff 的职责是“这个 buff 在生命周期内如何结算”。

2) **Atomic Buff 优先（原子 Buff）**

- 单个 `buffId` 尽量只表达一个清晰机制。
- 复杂技能通过同时施加多个 `buffId` 来组合。

3) **触发器/动作以 Buff 为主，Skill 只负责施加时机与目标**

- Buff 的 tick 与事件触发由 Buff 自身定义（`effects[].trigger`）。

#### 5.1.2 Buff 引用约定（文档层面）

`skills.json` 推荐使用 `buffRefs.apply/applySelf/remove` 引用 Buff（见 `skill_design.md 5.1`）。Buff 数据侧需保证：

- `buffId` 稳定（不随显示名变更）
- 显示名为 UI 属性，不作为引用主键

---

### 5.2 `buffs.json` 顶层结构与版本化（Schema Versioning）

#### 5.2.1 推荐顶层容器结构

为对齐 `skills_melee_v4_2.json` 的可维护性，建议 `assets/data/buffs.json` 顶层使用容器结构：

```json
{
  "$schemaVersion": "buffs_v2_1_wrapped",
  "meta": {
    "title": "Buff 库",
    "source": "",
    "notes": [],
    "fieldNotes": {},
    "defaults": {
      "lifecycle": { "duration": 1, "maxStacks": 1, "stackStrategy": "replace", "removeOnBattleEnd": true }
    },
    "enums": {
      "buffTypes": ["buff", "debuff", "hidden"],
      "stackStrategies": ["refresh", "extend", "add", "max", "replace", "independent"],
      "triggers": ["onTurnStart", "onTurnEnd", "onAttackPre", "onAttackPost", "onTakeDamagePre", "onTakeDamagePost", "onDefendPre", "onDefendPost", "onDeath"],
      "targets": ["self", "target", "attacker"],
      "tags": ["dot", "control", "stat_up", "stat_down", "defense", "offensive", "poison", "physical"],
      "stats": ["maxHp", "atk", "def", "speed", "critRate", "hitRate", "dodgeRate", "damageDealtMult", "damageTakenMult", "armorMitigationMult", "ap", "maxAp"],
      "statModifierTypes": ["flat", "percent_base", "percent_current", "overwrite", "formula"],
      "effectActions": [
        "DAMAGE_HP",
        "DAMAGE_ARMOR",
        "HEAL_HP",
        "HEAL_ARMOR",
        "SKIP_TURN",
        "PREVENT_DAMAGE_HP",
        "PREVENT_DAMAGE_ARMOR",
        "AP_COST_ADD",
        "AP_COST_REDUCE",

        "MODIFY_AP",
        "ATTACK"
      ]
    }
  },
  "buffs": {}
}
```

说明：

- `meta.enums` 用于编辑器下拉与数据校验。
- `meta.fieldNotes` 用于把“字段含义”固定下来，避免团队记忆依赖。
- `meta.defaults` 用于提供缺省值（编辑器自动补齐、加载时合并）。

约定：

- `meta.enums.stats` 为 `statModifiers[].stat` 的枚举来源。
- `meta.enums.effectActions` 必须覆盖数据中实际出现的 action；其中 MVP 动作库见 5.4.2，其余 action 需要在文档中明确为“实验/待实现”并要求编辑器提供兜底 JSON 编辑入口（避免静默失败）。

#### 5.2.2 兼容旧版结构

迁移期可兼容两种形态：

- 旧版：顶层直接是 `buffId -> buffObject`
- 新版：顶层含 `buffs` 容器

加载层应做归一化：若未发现 `buffs` 字段，则视整个对象为 `buffs`。

---

### 5.3 单个 Buff 对象规范（Object Spec）

#### 5.3.1 必填字段（MVP）

- `id: string`（建议与 key 一致）
- `name: string`
- `description: string`
- `type: buff | debuff | hidden`（来自 `meta.enums.buffTypes`）
- `tags: string[]`（来自 `meta.enums.tags`，允许扩展但需逐步收敛）
- `lifecycle: { duration, maxStacks, stackStrategy, removeOnBattleEnd }`

#### 5.3.2 可维护性字段（推荐）

- `status?: active | deprecated | experimental`
- `aliasOf?: string`（指向另一个 `buffId`，表示语义入口保留但复用实现）
- `version?: string`
- `icon?: string`

#### 5.3.3 lifecycle 语义

- `duration: number`
  - `-1` 表示永久（常用于装备被动/系统 Buff）
- `maxStacks: number`
- `stackStrategy: enum`
  - `refresh`: 刷新持续时间
  - `extend`: 延长持续时间
  - `add`: 叠层（强度累计）
  - `max`: 同类只取最高强度（可用于“同 tag 互斥取最大”）
  - `replace`: 完全覆盖
  - `independent`: 独立实例并行（必要时才用）
- `removeOnBattleEnd: boolean`

> 建议：只在确有需求时使用 `independent`，否则会显著增加结算与 UI 可视化复杂度。

---

### 5.4 effects 规范（Trigger + Action + Target + Payload）

#### 5.4.1 统一结构

推荐统一使用：

```json
{
  "trigger": "onTurnEnd",
  "action": "DAMAGE_HP",
  "target": "self",
  "payload": { "value": "maxHp * 0.05", "valueType": "formula" }
}
```

约束：

- `trigger/action/target` 均来自 `meta.enums`。
- action 专用字段只允许出现在 `payload`（避免 `value/valueType/params` 混用）。

#### 5.4.2 动作库最小集合（MVP）

建议 MVP 支持：

- `DAMAGE_HP`：对生命值造成伤害
  - `payload.value/valueType`
- `DAMAGE_ARMOR`：对护甲造成伤害
  - `payload.value/valueType`
- `HEAL_HP`：恢复生命值
  - `payload.value/valueType`
- `HEAL_ARMOR`：恢复护甲
  - `payload.value/valueType`
- `SKIP_TURN`：跳过本回合行动
  - 无 payload 或 `payload.reason`
- `PREVENT_DAMAGE_HP`：阻止本次对生命值的伤害（一次性免伤/抵挡）
  - 无 payload（MVP：阻止全部伤害）或 `payload.reason`
  - 约束建议：仅允许在 `onTakeDamagePre` 触发器使用
- `PREVENT_DAMAGE_ARMOR`：阻止本次对护甲的伤害（一次性免伤/抵挡）
  - 无 payload（MVP：阻止全部伤害）或 `payload.reason`
  - 约束建议：仅允许在 `onTakeDamagePre` 触发器使用
- `AP_COST_ADD`：增加技能 AP 消耗（疲劳/缠绕/负重等）
  - `payload.value/valueType`
  - 约束建议：仅允许在“技能扣费前”的触发器使用（建议新增/采用 `onSkillCostCalc` / `onBeforePayCost` 语义）
- `AP_COST_REDUCE`：减少技能 AP 消耗（专注/连击窗口/加速施法等）
  - `payload.value/valueType`
  - 约束建议：仅允许在“技能扣费前”的触发器使用（建议新增/采用 `onSkillCostCalc` / `onBeforePayCost` 语义）


### 5.5 statModifiers 规范（Passive Modifiers）

#### 5.5.1 结构

```json
"statModifiers": [
  { "stat": "atk", "type": "flat", "value": 5 },
  { "stat": "damageTakenMult", "type": "percent_base", "value": 0.2 }
]
```

#### 5.5.2 建议约束

- `statModifiers[].stat` 的取值应优先来自 `meta.enums.stats`。
- 若遇到未知 stat 或未知 type：禁止静默忽略，必须产生日志告警（便于回归定位）。

---

### 5.6 校验规则（编辑器/加载器应当执行）

建议最少校验：

1) `buffs` key 与 `buff.id` 一致性（若保留双写）
2) `type/trigger/action/target/stackStrategy` 必须在 `meta.enums` 中
3) `statModifiers[].stat` 与 `statModifiers[].type` 必须可识别
4) `aliasOf` 指向的 buff 必须存在，且不允许循环 alias

---

### 5.7 向后兼容与迁移策略

为避免一次性改动过大，建议加载层做“归一化映射”：

- 旧 action 名称映射到新枚举（例如 `damage -> DAMAGE`，`setDamageTaken -> SET_DAMAGE_TAKEN`）
- 旧 `params` 合并进新 `payload`

迁移完成后，编辑器保存时统一输出新版结构。

## 6. 技能系统衍生 Buff 列表 (Skill System Derived Buffs)

基于 `skill_design.md` 第三章的技能设计，整理出如下 Buff 对象需求。这些对象将作为 JSON 数据配置的基础。（已删除）

## 7. 装备系统衍生 Buff 列表 (Item System Derived Buffs)

(补充自 `item_design.md`)

*   **passive_heavy_armor**: 速度 -5 (来源: 锁子甲) -> `statModifiers: { speed: -5 }`
*   **passive_vampire**: 20% 吸血 (来源: 吸血鬼之牙) -> `onAttackPost` -> `heal` (20% dmg)
*   **passive_start_weak**: 首回合攻击力降低 (来源: 角斗士头盔) -> `onTurnStart` (Round 1) -> Apply `debuff_weak`
*   **passive_phoenix**: 每场战斗一次复活 (来源: 凤凰吊坠) -> `lifecycle: { triggerLimit: 1 }`, `onDeath` -> Revive.

## 8. 总结 (Conclusion)

通过上述抽象，我们将复杂的战斗技能逻辑转化为了约 30 个基础 Buff 对象。在开发 `script/engine/BuffSystem.js` 时，应优先实现 `statModifiers` 和 `onTurnStart/End` 的处理逻辑，随后逐步实现 `EventBus` 中的 `onAttack/Defend` 钩子以支持高级 Buff。

## 9. 实现架构设计 (Implementation Architecture)

本章节描述如何实现一个低耦合、数据驱动的 Buff 系统，使其满足上述 JSON 配置需求。

### 9.1 架构核心 (Core Architecture)

整个系统由四个核心部分组成：
1.  **BuffManager**: 挂载在 Character 上的数据容器，负责 Buff 的增删改查和生命周期 Tick。
2.  **BuffSystem (Processor)**: 独立的单例系统，订阅 `EventBus`，是实际执行 Buff 逻辑的大脑。
3.  **ActionLibrary (Registry)**: 原子操作库，将 JSON 中的字符串 action 映射为具体的 JS 函数。
4.  **ConditionLibrary (Registry)**: 条件判断库，用于检查 effects 中的 triggers 是否满足执行条件。

### 9.2 数据流向 (Data Flow)

1.  **事件触发**: 战斗系统 (CombatSystem) 发布事件 (e.g. `EVENT.ATTACK_HIT`).
2.  **系统响应**: `BuffSystem` 监听到事件，遍历所有参与者的 `BuffManager`。
3.  **匹配 Trigger**: 对于每个 Buff，检查其 `effects` 列表中的 `trigger` 字段是否匹配当前事件名。
4.  **执行逻辑**: 如果匹配，调用 `ActionLibrary` 执行对应的原子函数。

### 9.3 动作库设计 (ActionLibrary - The "Code in JSON")

---

为了在 JSON 中配置逻辑，我们需要建立字符串到函数的映射表。

```javascript
// 伪代码示例
const ActionLibrary = {
    // 造成伤害
    "DAMAGE": (source, target, params, context) => {
        const val = resolveValue(params.value, source, target);
        target.takeDamage(val);
    },
    // 治疗
    "HEAL": (source, target, params, context) => {
        const val = resolveValue(params.value, source, target);
        target.heal(val);
    },
    // 修改属性 (临时)
    "MODIFY_STAT": (source, target, params, context) => {
        // ... logic to apply temporary modifier
    },
    // 施加/移除 Buff
    "APPLY_BUFF": (source, target, params) => {
        target.buffManager.addBuff(params.buffId);
    }
};

// 辅助函数: 解析动态数值
// 支持 JSON 配置: "value": "10" 或 "value": "source.atk * 0.5"
function resolveValue(valExpression, source, target) {
    if (typeof valExpression === 'number') return valExpression;
    // 简易解析器或 eval (需注意安全，单机游戏可接受)
    // 推荐: 简单的正则替换 + mathjs 库
        // 示例: "source.atk * 0.5" -> source.stats.atk * 0.5
    }
   ```

### 9.3.1 案例分析：配置“攻击吸血” (Example: Configuring Life Steal)

以 `buff_lifesteal` 为例，分析如何配置 **20% 吸血比例**，展示数据驱动的灵活性。

**1. JSON 配置**:
我们复用通用的 `HEAL` 动作，而不是专门编写 `LIFESTEAL` 动作。关键在于动态参数的配置方法。

```json
{
    "id": "buff_lifesteal",
    "effects": [
    {
        "trigger": "onAttackPost",          // 触发时机：攻击结算后
        "action": "HEAL",                   // 动作：执行治疗函数
        "target": "self",                   // 目标：来源者自己
        "params": {
        "value": "{context.damageDealt} * 0.2"  // 数值配置：引用上下文中的伤害值 * 0.2 (即20%吸血率)
        }
    }
    ]
}
```

**2. 上下文传递 (Context Injection)**:
当战斗系统触发 `onAttackPost` 时，必须将当次攻击的数据打包作为 `context` 传递出来。

```javascript
// 战斗引擎伪代码
const contextData = {
    damageDealt: 50,  // 本次攻击造成的实际伤害
    isCrit: true      // 是否暴击
};
EventBus.emit("onAttackPost", attacker, defender, contextData);
```

**3. 变量解析 (Variable Resolution)**:
在 `ActionLibrary` 的 `HEAL` 函数中，解析器会将 `{context.damageDealt}` 替换为 `50`，然后执行 `50 * 0.2 = 10` 的治疗。
这样，**吸血比例 (0.2)** 甚至 **计算公式** 都完全由 JSON 决定，改动时无需重新编译代码。

### 9.3.2 案例分析：配置“破甲意图” (Example: Configuring Armor Penetration)

目标是实现 **“下次攻击削弱目标护甲减免 30%，生效一次后消失”**。这是一个典型的 **耗散型 (Consumable) Buff**，需要组合两个 Effect 来实现。

**1. JSON 配置**:
```json
{
  "id": "buff_armor_pen",
  "effects": [
    {
      // 步骤 A: 临时削弱目标护甲 (仅本次计算有效)
      "trigger": "onAttackPre",
      "action": "MODIFY_STAT_TEMP", // 修改本次计算上下文中的属性（而不是永久改面板）
      "target": "target",
      "params": {
        "stat": "armorMitigationMult",
        "value": "+0.3",            // 护甲减免系数乘区提高 30%（意味着护甲更“软”，最终伤害更高）
        "type": "percent_current"
      }
    },
    {
      // 步骤 B: 攻击后自我移除
      "trigger": "onAttackPost",
      "action": "REMOVE_SELF",      // 这是一个假设的原子操作，移除Buff自身
      "target": "self"
    }
  ]
}
```

**2. 逻辑流 (Logic Flow)**:
1.  **前置钩子 (`onAttackPre`)**: 战斗系统在计算伤害公式 `Step 1: RawDmg = Atk - Def` 之前，触发此事件。
2.  **执行修正**: `ActionLibrary.MODIFY_STAT_TEMP` 介入，在**本次计算上下文**中写入 `armorMitigationMult`（例如 +30%），用于削弱“目标部位护甲参与减免时的减免系数”。
3.  **计算伤害**: 战斗系统在护甲结算阶段读取该 `armorMitigationMult`，从而让相同护甲值下的最终伤害更高。
4.  **后置钩子 (`onAttackPost`)**: 伤害结算完毕。
5.  **自我消耗**: 触发 `REMOVE_SELF`，Buff 从列表中移除，确保效果只生效一次。

### 9.4 参数体系深度解析 (Deep Dive into Parameters)

针对 `params` 中的核心字段 `stat`, `value`, `type`，本设计明确了哪些是**可直接扩展的**（无需改代码），哪些是**枚举类型**（需引擎支持）。

#### 9.4.1 stat (属性键名) - 可扩展 (Extensible)
*   **定义**: 目标对象上需要被修改的属性名称（如 `atk`, `def`, `speed`）。
*   **类型**: **开放字符串 (Open String)**。
*   **扩展策略**:
    *   这是一个**非枚举**字段。只要 `Character` 或 `BattleStats` 数据结构中存在该属性，JSON 配置即可引用。
    *   **举例**: 如果游戏后期新增了属性 `luck` (幸运)，程序员只需在角色数据结构中添加 `luck` 字段，策划即可在 Buff 中配置 `"stat": "luck"`，无需修改 `BuffSystem` 代码。
*   **引擎实现**:
    *   **禁止**: 使用硬编码判断 (e.g., `if (stat === 'atk') ...`).
    *   **推荐**: 使用动态属性访问 (Reflection-like access)。
    ```javascript
    // 引擎代码示例
    function applyModifier(target, statKey, value) {
        if (target.stats.hasOwnProperty(statKey)) {
             target.stats[statKey] += value;
        } else {
             console.warn(`Stat ${statKey} not found on target.`);
        }
    }
    ```

#### 9.4.2 type (计算策略) - 枚举值 (Enumeration)
*   **定义**: 数值作用于属性的数学算法。
*   **类型**: **闭合枚举 (Closed Enum)**。
*   **扩展策略**:
    *   这是一个**枚举**字段。新增类型意味着需要编写新的底层数学逻辑，**必须修改引擎代码**。
*   **标准枚举值**:
    1.  `flat`: **固定值修正**。公式: `Result = Base + Value`。 (例如: 攻击力 +10)
    2.  `percent_base`: **基础百分比**。公式: `Result = Base * (1 + Value)`。 (例如: 攻击力 +10%)
    3.  `percent_current`: **当前值百分比**。公式: `Result = Current * (1 + Value)`。 (例如: 减少当前 50% 的生命值)
    4.  `overwrite`: **覆盖**。公式: `Result = Value`。 (例如: 强制设置行动力为 0)
*   **引擎实现**:
    *   推荐使用策略模式 (Strategy Pattern) 维护这些算法，便于集中管理。

#### 9.4.3 value (数值载荷) - 高度动态 (Dynamic)
*   **定义**: 实际作用的数值大小。
*   **类型**: **多态 (Number | String Expression)**。
*   **扩展策略**:
    *   通过支持解析字符串公式，实现无限的扩展能力。
*   **数据形式**:
    *   **Number**: 静态常量 (e.g., `100`, `0.5`).
    *   **String**: 动态公式 (e.g., `"{source.atk} * 0.5 + 10"`).
*   **引擎实现**:
    *   利用 `Context` 上下文对象，解析字符串中的占位符（如 `{source.atk}`），替换为实际运行时数值后计算。

### 9.5 低耦合优势 (Decoupling Benefits)

*   **无需修改战斗代码**: 新增一个"攻击时吸血"的 Buff，只需要在 JSON 里配置 `trigger: onAttackPost`, `action: HEAL`, `target: self`。不需要去改动 CombatSystem 的攻击函数。
*   **统一入口**: 所有修改属性、造成伤害的来源都被统一管理，方便通过 `console.log` 追踪战斗日志。
*   **易于扩展**: 如果需要新机制（例如“偷取金币”），只需在 `ActionLibrary` 注册 `STEAL_GOLD` 函数，无需改动整个架构。

## 10. Buff 输入参数接口（Skill 可配置参数）(Buff Parameter Interface)

> 目的：解决“Buff 模板结构固定，但在 Skill 引用时需要配置少量数值参数（例如流血每轮伤害、持续回合）”的问题。
>
> 原则：
> 1) **Skill 只做引用与实例化参数**（override），不修改 Buff 的 trigger/action/target 等结构。
> 2) **白名单式可配置参数**：只有 Buff 明确声明为可覆盖的参数才允许在 Skill 侧配置。
> 3) **运行时合并**：`finalParams = defaults + overrides`，并对 overrides 做 schema 校验。

### 10.1 背景与动机

当前 `assets/data/buffs_v2_3.json` 的 Buff 数据以 `lifecycle + effects + statModifiers` 为核心。它非常适合表达“Buff 自身如何结算”。

但在技能编辑器（`test/skill_editor_test_v3.html`）中引用 Buff（`skills_melee_v4_3.json` 的 `buffRefs.apply/applySelf/remove`）时，常会出现一个需求：

- Buff 的 **行为机制固定**（例如流血在 `onTurnStart` 触发 `DAMAGE_HP`；不希望每个技能都改 trigger/action）。
- 但 Buff 的 **部分数值参数可配置**（例如每轮伤害、持续回合数、最大叠层）。

如果没有“可配置参数接口”，常见后果是：

- 复制出大量相似 Buff（`buff_bleed_1/buff_bleed_2/...`）造成冗余。
- 或在 Skill 侧硬编码不同 Buff 的 UI/解析分支，维护成本急剧上升。

因此引入以下接口：在 Buff 模板中声明可配置参数 schema；在 Skill 引用中提供 overrides。

### 10.2 Buff 侧新增字段（模板参数定义）

在每个单独 Buff 对象（`buffs.*`）中，建议新增以下字段（不改变现有 `lifecycle/effects/statModifiers` 语义）：

#### 10.2.1 `paramsDefaults`（推荐）

- 类型：`object`
- 含义：该 Buff 暴露给外部（Skill/道具/关卡等）可覆盖参数的默认值。
- 作用：当 Skill 不提供 overrides 时，运行时仍能用 defaults 得到可用的参数值。

示例（以 `buff_bleed` 为例，概念示例）：

```json
"paramsDefaults": {
  "damagePerTurn": 5,
  "duration": 3
}
```

> 提示：`duration` 目前位于 `lifecycle.duration`。为保持向后兼容，既可以继续保留 `lifecycle.duration` 作为默认值，也可以同步写入 `paramsDefaults.duration`（加载层归一化时做合并）。

#### 10.2.2 `paramsSchema`（关键）

- 类型：`object`（以参数 key 为键的字典）
- 含义：声明哪些参数允许被外部覆盖（overrideable），并提供最小 UI/校验信息。

```json
"paramsSchema": {
  "damagePerTurn": { "type": "int", "default": 5, "overrideable": true, "label": "damagePerTurn", "labelCn": "每回合伤害", "min": 1, "max": 999, "step": 1 },
  "duration": { "type": "int", "default": 3, "overrideable": true, "label": "duration", "labelCn": "持续回合数", "min": 1, "max": 99, "step": 1 }
}
```

### 10.3 `ParamSchema` 最小字段集合（用于自动生成 UI 与校验）

编辑器/加载器至少需要以下字段来实现：下拉/输入框渲染 + 基本合法性校验。

#### 10.3.1 最小字段（MVP）

- `type`: `"int" | "number" | "string" | "bool" | "enum"`
- `default`: 默认值（与 type 对齐）
- `overrideable`: `boolean`（是否允许 Skill 侧覆盖）
- `label`: `string`（英文/键名显示）
- `labelCn`: `string`（中文说明，用于 UI/文档注释）

#### 10.3.2 常用可选字段（强烈推荐）

- `min?: number`
- `max?: number`
- `step?: number`
- `enumValues?: string[]`（当 `type=enum` 时）

> 注意：不要尝试对 `effects[].trigger/action/target` 等结构字段提供 override；这些属于 Buff 行为机制，应保持模板稳定。

### 10.4 Skill 侧新增字段（实例参数 overrides）

`skills_melee_v4_3.json` 目前的 `buffRefs.apply/applySelf` 已包含 `buffId/target/chance/duration/stacks` 等。

为支持“同一个 buff 模板在不同技能中使用不同参数”，建议在每条 buff 引用对象中新增：

#### 10.4.1 `paramsOverrides`

- 位置：`skills[].buffRefs.apply[].paramsOverrides` 与 `skills[].buffRefs.applySelf[].paramsOverrides`
- 类型：`object`
- 含义：对该次 Buff 应用的参数覆盖值（仅存储覆盖项，不复制整份 Buff）。

示例（技能施加流血，但覆盖每轮伤害与持续回合）：

```json
{
  "buffId": "buff_bleed",
  "target": "enemy",
  "chance": 1.0,
  "paramsOverrides": {
    "damagePerTurn": 8,
    "duration": 2
  }
}
```

> 说明：UI 交互建议使用 `buff.name` 搜索选择，但落盘引用仍使用稳定的 `buffId`。

### 10.5 运行时合并与校验规则（必须明确）

#### 10.5.1 白名单校验（禁止静默）

对 `paramsOverrides` 中的每个 key：

1) 必须存在于 `buff.paramsSchema`。
2) 必须满足 `overrideable=true`。
3) 值必须符合 `type/min/max/enumValues` 等约束。

不满足时建议：编辑器直接报错；加载层输出 `BUFF:WARN`（并拒绝该覆盖项）。

#### 10.5.2 合并顺序

`finalParams = { ...buff.paramsDefaults, ...buffRef.paramsOverrides }`

如果 Buff 未提供 `paramsDefaults`，则可用 `paramsSchema.*.default` 形成隐式 defaults（加载层归一化生成）。

#### 10.5.3 与现有字段的映射（归一化建议）

为了不破坏 `buffs_v2_3.json` 已有结构，可在加载/运行时做归一化映射：

- `finalDuration`：优先取 `finalParams.duration`，否则取 `buff.lifecycle.duration`。
- tick 伤害/治疗数值：若该 Buff 的 `effects[].payload.value` 需要来自参数，则使用参数引用方式（见 10.6）。

### 10.6 参数如何影响 effect.payload（两种可选实现策略）

本项目当前 payload 支持 `value` 为 number 或 string（例如毒：`"maxHp * 0.05"`）。基于此，有两种贴近现状的策略：

#### 10.6.1 方案 A：在 `payload.value` 中约定参数引用语法（改动小）

- 示例：`"value": "@damagePerTurn"` 或 `"value": "params.damagePerTurn"`
- 运行时：若检测到 `value` 为引用表达式，则从 `finalParams` 取值。

优点：不新增字段；兼容现有 string formula 体系。
缺点：需要定义清晰的引用前缀与解析规则，避免与 formula 混淆。

#### 10.6.2 方案 B：在 payload 中增加 `valueRef`（更结构化）

```json
"payload": {
  "valueType": "flat",
  "valueRef": "damagePerTurn"
}
```

运行时：若存在 `valueRef`，则忽略 `value`（或 `value` 作为 fallback），直接使用 `finalParams[valueRef]`。

优点：结构清晰、编辑器更易做校验。
缺点：需要一次性演进 payload spec。

### 10.7 编辑器交互建议（BuffEditor/SkillEditor）

#### 10.7.1 BuffEditor（维护 schema）

- 在 Buff 参数编辑区提供：参数 key、default、type、约束(min/max/enum)、`overrideable` 勾选、`labelCn`。
- 保存时写入 `paramsSchema` 与 `paramsDefaults`。

#### 10.7.2 SkillEditor（按 schema 动态生成输入）

- Buff Refs 行选择 buff 后：读取该 Buff 的 `paramsSchema`，仅展示 `overrideable=true` 的参数。
- 自动生成输入控件并写入 `buffRef.paramsOverrides`。
- 保存前对 overrides 做 schema 校验，防止脏数据进入技能库。

### 10.8 `statModifiers` 是否支持覆盖（结论与推荐做法）

结论：**可以支持“数值覆盖”**，但推荐方式不是让 Skill 直接覆盖 `statModifiers` 的结构（增删条目、改 `stat`、改顺序），而是沿用本章的 **`paramsSchema + paramsOverrides`** 机制，把 `statModifiers[].value` 参数化。

#### 10.8.1 推荐约束（保持可维护性）

- ? 推荐允许覆盖：`statModifiers[].value`（数值强度），必要时也可让 `duration/maxStacks` 等生命周期数值通过参数覆盖。
- ?? 谨慎允许覆盖：`statModifiers[].type`（flat/percent_base/overwrite 等）——会影响叠加与数值管线，若开放必须加严格校验与编辑器约束。
- ? 不建议允许覆盖：
  - `statModifiers[].stat`（属性键）
  - `statModifiers[]` 的条目增删/重排（结构级覆盖）

原因：结构级覆盖会让 Skill 实际上“重写 Buff 本体”，会显著增加解析分支、迁移成本与回归难度。

#### 10.8.2 两种落地方式（与现有 `buffs_v2_3.json` 对齐）

**方式 A（改动最小）**：沿用 `value` 可为字符串的能力，在 `statModifiers[].value` 中使用参数引用语法。

- 示例：
  - `paramsDefaults.speedDelta = -5`
  - `paramsSchema.speedDelta.overrideable = true`
  - `statModifiers: [{ "stat": "speed", "type": "flat", "value": "@speedDelta" }]`

运行时：解析 `@speedDelta` 并从 `finalParams.speedDelta` 取值。

**方式 B（更结构化）**：在 `statModifiers[]` 中新增 `valueRef`。

```json
"statModifiers": [
  { "stat": "speed", "type": "flat", "valueRef": "speedDelta" }
]
```

运行时：若存在 `valueRef`，则使用 `finalParams[valueRef]` 作为 value。

> 推荐：短期可先采用方式 A 快速验证通路；当编辑器需要更强校验与更少歧义时，再演进到方式 B。


