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

## 1.3 与技能系统的边界与对齐（Alignment with Skill System）

Buff 与 Skill 的职责边界应当与 `skill_design.md` 的“组合/约束/数据化”思路一致：

- Skill（主动技能）负责：选择目标（含部位选择）、资源与频率约束（AP、槽位、每回合限制）、以及“施加/移除 Buff”的指令。
- Buff（状态对象）负责：自身生命周期（duration/stack/remove）、以及在特定触发点（trigger）对战斗上下文（context）进行修改。

因此，`buffs.json` 的目标不是“列一堆对象”，而是成为一个可维护、可校验、可扩展的“效果库”。

---

## 1.2 基于测试结论的改动决策（Test-driven Change Decisions）

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

## 4. Buff 类型体系（按需求域分类）

本章节是新的“主分类”。分类原则是：**Buff = 静态修正（statModifiers） + 在特定事件点执行动作（effects）**。

你后续实现 `BuffSystem` 时可以按“事件钩子 -> 收集可用 Buff -> 执行动作/修改上下文”来落地。

### 4.1 A 类：伤害结算管线类（Damage Pipeline Buffs）

**需求**：影响一次攻击/技能的伤害结果，通常发生在 `onAttackPre`、`onTakeDamage`、`onAttackPost` 等事件。

#### 4.1.1 A1 输出修正（Damage Dealt Modifiers）

* 典型：虚弱、攻击削弱
* 推荐字段：`statModifiers.damageDealtMult`
* 示例：`buff_weakness`（历史口径：输出乘区）

> 对齐 1.2 的测试结论：本轮将“虚弱”口径定义为 **降低 `atk`**（D 类 statModifiers），而不是 `damageDealtMult`。
> 因此 A1 的 `damageDealtMult` 仍可保留为“未来可用的伤害乘区机制”，但 `debuff_weak` 不应再作为它的示例。

> 建议（文档层面）：统一命名与语义（例如只保留一个系列：`debuff_weakness_*`），避免出现“同义不同 ID”。代码层面无需立刻改动。

#### 4.1.2 A2 承伤修正（Damage Taken Modifiers）

* 典型：易伤、伤害抑制
* 推荐字段：`statModifiers.damageTakenMult`
* 示例：`buff_vulnerable`、`buff_pain_sup`（文档中的定义）、装备被动 `passive_dragon`（受伤减免）

#### 4.1.3 A3 护甲交互（Armor Interaction）——采用“改护甲减免系数”语义

**本项目战斗的关键差异点在于：护甲按部位独立存在，并参与减伤**。因此“破甲/穿透/护甲削弱”这类 Buff 需要明确语义，否则测试时会出现“明明施加了破甲 Buff，但伤害没有变化”的困惑。

本方案选择：**破甲类 Buff 不直接改护甲数值，也不直接无视护甲；而是修改护甲在伤害公式中的减免系数（Armor Mitigation Coefficient）**。

##### a) 伤害公式中的护甲减免系数（建议定义）

引擎在计算对某部位的伤害时，通常会经历：

1) 计算原始伤害 `rawDamage`
2) 根据目标部位护甲，得出减免系数 `mitigationCoeff`（0~1 范围为主）
3) 得到最终伤害 `finalDamage`

建议把护甲减免抽象成：

* `mitigationCoeff = f(armorValue, ...)`  （由护甲值决定）
* `finalDamage = rawDamage * mitigationCoeff`

##### b) Buff 如何“改护甲减免系数”

为保证数据驱动简单可控，推荐加入一个统一的可扩展字段：

* `statModifiers.armorMitigationMult`：对 `mitigationCoeff` 的乘法修正

语义：

* `armorMitigationMult = 1.0`：不改变护甲减免
* `armorMitigationMult > 1.0`：**破甲/穿透**（护甲减免变弱，系数更大，最终伤害更高）
* `armorMitigationMult < 1.0`：**护甲强化/格挡**（护甲减免更强，系数更小，最终伤害更低）

举例：

* 若原本 `mitigationCoeff = 0.30`（护甲很硬，最终只吃 30%）
* 施加破甲 Buff：`armorMitigationMult = 1.5`
* 则 `mitigationCoeff' = 0.30 * 1.5 = 0.45`，最终伤害提升 50%

##### c) 与“部位”结合

破甲通常是对“某个部位”生效，因此建议在 Buff 里用可选字段表达作用范围：

* `scope.part`：`"head" | "body" | "limbs" | "all"`

如果没有 `scope.part`，默认是 `all`。

> 当前 `buffs.json` 里并没有该字段，本设计先在文档中定义语义，后续实现时再决定是否加入 JSON（保持兼容）。

#### 4.1.4 A4 护盾/吸收/转化（Shield / Absorb / Conversion）

* 典型：护盾吸收、伤害转化为治疗
* 触发点（规范）：优先使用 `onTakeDamagePre`（而不是 `onTakeDamage`）
* 示例：`buff_shield`（一次性抵挡）、`buff_damage_absorb`（Aegis，文档中定义）

**设计口径统一**（对齐 1.2 的测试结论）：

- 本轮回归口径下，`buff_shield` 定义为：**抵挡一次伤害（一次性）**。
- 推荐实现方式：在 `onTakeDamagePre` 阶段将 `context.damageTaken = 0`（或等价字段），并由 **lifecycle 耗散规则**在本次触发后移除/消耗（而不是依赖 `REMOVE_SELF` 动作）。
- 若未来需要“护盾池/可吸收数值”的体系，可另行引入 `shieldPool` 机制 Buff（与本轮 `buff_shield` 区分 ID 与文案）。

**可追溯日志要求**（回归验证必需）：

- 当 shield 吸收发生时，建议输出结构化日志字段（或至少在文本中包含）：
  - `incomingDamage`
  - `absorbed`
  - `remainingDamage`
  - `remainingShield`
  - `sourceBuffId`
  - `targetId`

---

### 4.2 B 类：回合周期结算类（Periodic Buffs）

**需求**：每回合结算一次，不依赖攻击动作。

* B1 DoT：`buff_poison`、`buff_bleed`（`buff_burn` 已从 `assets/data/buffs.json` 移除）
* B2 HoT：治疗类（技能设计中出现后可补齐）
* B3 资源结算：`buff_ap_regen`（文档中定义）

---

### 4.3 C 类：控制与行动限制类（Control / Action Gating）

**需求**：决定角色能否行动、行动顺序、技能是否可用。

* C1 硬控：`buff_stun`（`skipTurn`）
* C2 软控：`buff_slow`（speed -5）
* C3 技能/部位禁用：本轮结论已删除 `buff_silence_limb`（暂不纳入回归与主数据）

---

### 4.4 D 类：面板属性修正类（Stat Buffs）

**需求**：直接修改角色面板属性用于后续所有计算。

* `buff_strength`、`debuff_weak` 的 `atk` 修正等

推荐做法：D 类 Buff 尽量只使用 `statModifiers`，不依赖 `effects`，保证结算简单。

---

### 4.5 E 类：防御机制类（Defensive Mechanics）

**需求**：改变死亡规则、提供下限保护或特殊吸收机制。

* E1 护盾/吸收：`buff_shield`（本轮定义为“一次性抵挡一次伤害”）
* E2/E4：本轮回归阶段不引入“免死/复活”体系；对应的 `buff_immortality_hp` / `buff_revive` 已从 `assets/data/buffs.json` 移除
* E3 护甲不朽：`buff_immortality_armor`（是否保留取决于护甲破坏管线落地）

---

### 4.6 F 类：反应/反制类（Reactive Effects）

**需求**：基于“攻击后/受击后”触发额外动作。

* `buff_thorns`（反伤）、`buff_counter`（反击）、`buff_lifesteal`（吸血）

---

### 4.7 G 类：被动/系统类（Passives & Meta Buffs）

**需求**：用于装备、天赋、场景常驻效果。通常 `duration = -1`，或通过引擎控制在战斗开始/结束时挂载与清理。

* `passive_knight`、`passive_heavy_armor`、`passive_dragon`、`passive_cursed_self_dmg` 等

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
  "$schemaVersion": "buffs_v1",
  "meta": {
    "title": "Buff Library",
    "source": "",
    "notes": [],
    "fieldNotes": {},
    "defaults": {
      "lifecycle": { "duration": 1, "maxStacks": 1, "stackStrategy": "replace", "removeOnBattleEnd": true }
    },
    "enums": {
      "buffTypes": ["buff", "debuff", "hidden"],
      "stackStrategies": ["refresh", "extend", "add", "max", "replace", "independent"],
      "triggers": ["onTurnStart", "onTurnEnd", "onAttackPre", "onAttackPost", "onTakeDamagePre", "onTakeDamagePost", "onDeath"],
      "targets": ["self", "target", "attacker"],
      "tags": ["dot", "control", "stat_up", "stat_down", "defense", "offensive", "poison", "physical"],
      "statNames": ["maxHp", "atk", "def", "speed", "critRate", "hitRate", "dodgeRate", "damageDealtMult", "damageTakenMult", "armorMitigationMult", "maxAp"],
      "statModifierTypes": ["flat", "percent_base", "percent_current", "overwrite", "formula"],
      "effectActions": ["DAMAGE", "HEAL", "SKIP_TURN", "SET_DAMAGE_TAKEN", "MODIFY_STAT_TEMP", "APPLY_BUFF", "REMOVE_BUFF"]
    }
  },
  "buffs": {}
}
```

说明：

- `meta.enums` 用于编辑器下拉与数据校验。
- `meta.fieldNotes` 用于把“字段含义”固定下来，避免团队记忆依赖。
- `meta.defaults` 用于提供缺省值（编辑器自动补齐、加载时合并）。

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
  "action": "DAMAGE",
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


为提升可维护性与编辑器体验，建议在 `meta.enums.effectActions` 的设计上同时遵循以下约束与改进方向（不影响 MVP 的最小落地顺序，但影响后续扩展的“长相”）：

##### (A) 每个 action 必须有明确语义与 payload 合同（Contract）

在 `meta.fieldNotes` 中为每个 action 增加说明（最低限度为“用途 + payload 字段”），避免出现“枚举有了但不知道怎么填”的情况。建议形态（与 5.4.2 的动作枚举保持一致）：

- `effects.action.DAMAGE_HP`：对 `target` 的生命值造成伤害。
  - `payload.value: number|string`（常量或公式）
  - `payload.valueType: flat|percent_base|percent_current|formula`
- `effects.action.DAMAGE_ARMOR`：对 `target` 的护甲造成伤害。
  - `payload.value: number|string`
  - `payload.valueType: flat|percent_base|percent_current|formula`
- `effects.action.HEAL_HP`：恢复 `target` 的生命值。
  - `payload.value: number|string`
  - `payload.valueType: flat|percent_base|percent_current|formula`
- `effects.action.HEAL_ARMOR`：恢复 `target` 的护甲。
  - `payload.value: number|string`
  - `payload.valueType: flat|percent_base|percent_current|formula`
- `effects.action.SKIP_TURN`：跳过本回合行动。
  - 可选 `payload.reason: string`


> 上述“合同”并不强制你一次性实现全部 action，但建议一次性把“字段定义清楚”，否则编辑器无法做到强校验与动态表单。

##### (F) 耗散/一次性机制：由 lifecycle 负责，而不是 action

为避免“生命周期与行为混写”，建议将“一次性/触发后消失/消耗层数”等耗散能力收敛到 `lifecycle`（或 `lifecycle.consume`）字段中，而不是通过 effect 中追加 `REMOVE_SELF` 来表达。

推荐形态（示例，字段名可后续定稿）：

```json
"lifecycle": {
  "duration": -1,
  "maxStacks": 1,
  "stackStrategy": "replace",
  "removeOnBattleEnd": true,
  "consume": { "mode": "remove", "when": "onTrigger", "count": 1 }
}
```

含义：

- `consume.mode`：`none | remove | consumeStacks`
- `consume.when`：`onTrigger`（命中该 Buff 的任一 effect 后触发）或更细粒度的事件点（如 `onTakeDamagePre`）
- `consume.count`：消耗层数（用于“n 次免疫/闪避”）

##### (B) 命名建议：优先“策划语义”，避免“面向实现细节”

长期来看，action 需要面向内容生产（策划/关卡/系统）而不仅仅是引擎实现。

- `ABSORB_TO_HEAL`：建议未来考虑更语义化的名称（例如 `CONVERT_DAMAGE_TO_HEAL` 或 `LIFESTEAL`），并明确它是“按本次承伤/按本次造成伤害/按吸收量”中的哪一种。
- `PREVENT_ARMOR_BREAK`：属于强耦合“部位护甲破坏规则”的特化 action。建议未来优先收敛成“规则修改类 action”的参数，而不是持续增加特化 action。

##### (C) 结构建议：避免 action 粒度混杂，优先合并同域动作

本版 MVP 动作库不包含“修改承伤/改写结算管线”类 action。

- 若未来确有需求，建议以“版本化扩展包”的形式引入（例如 `buffs_v2_2` 扩展动作库），而不是在 MVP 阶段提前占位。

##### (D) 对 `MODIFY_STAT_TEMP` 的约束建议（防止成为“万能 action 黑洞”）

本版 MVP 动作库不包含 `MODIFY_STAT_TEMP`。

- 若未来需要“临时改写上下文/结算参数”的能力，建议在更高版本中引入，并在同一版本内明确：作用域、回滚机制、优先级与可叠加规则。

##### (E) `ATTACK`/主动行为类 action 的边界建议

`ATTACK` 这类“生成一次主动行为”的 action 会显著提高系统复杂度（需要与战斗管线/Skill 选择/部位选择深度耦合）。

- 建议 MVP 阶段不实现或不开放给策划使用（可保留枚举但编辑器隐藏/标记为 advanced）。
- 若保留，需明确其 `payload` 合同（例如是否必须提供 `skillId`、是否允许指定 bodyPart、是否会再次触发 `onAttackPre/Post`）。

---

### 5.5 statModifiers 规范（Passive Modifiers）

#### 5.5.1 结构

```json
"statModifiers": {
  "atk": { "value": 5, "type": "flat" },
  "damageTakenMult": { "value": 0.2, "type": "percent_base" }
}
```

#### 5.5.2 建议约束

- `statModifiers` 的 key 应优先来自 `meta.enums.statNames`。
- 若遇到未知 stat key 或未知 type：禁止静默忽略，必须产生日志告警（便于回归定位）。

---

### 5.6 校验规则（编辑器/加载器应当执行）

建议最少校验：

1) `buffs` key 与 `buff.id` 一致性（若保留双写）
2) `type/trigger/action/target/stackStrategy` 必须在 `meta.enums` 中
3) `statModifiers` 的 key 与 type 必须可识别
4) `aliasOf` 指向的 buff 必须存在，且不允许循环 alias

---

### 5.7 向后兼容与迁移策略

为避免一次性改动过大，建议加载层做“归一化映射”：

- 旧 action 名称映射到新枚举（例如 `damage -> DAMAGE`，`setDamageTaken -> SET_DAMAGE_TAKEN`）
- 旧 `params` 合并进新 `payload`

迁移完成后，编辑器保存时统一输出新版结构。

## 6. 技能系统衍生 Buff 列表 (Skill System Derived Buffs)

基于 `skill_design.md` 第三章的技能设计，整理出如下 Buff 对象需求。这些对象将作为 JSON 数据配置的基础。

### 6.1 持续伤害与状态异常类 (DoT & Status Effects)

| Buff ID | 名称 | 类型 | 来源技能/职业 | 效果描述 | 实现逻辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `buff_bleed` | 流血 (Bleed) | Debuff | 剑术 (Duelist) | 每回合受到物理伤害 | `onTurnStart` -> `damage` (flat value) |
| `buff_burn` | 燃烧 (Burn) | Debuff | 元素 (Elementalist) | 已从主数据移除（未来版本：元素体系再引入） | - |
| `buff_poison` | 中毒 (Poison) | Debuff | 游侠 (Ranger), 涂毒 | 每回合受到最大HP百分比伤害 | `onTurnEnd` -> `damage` (percent maxHP) |
| `buff_stun` | 眩晕 (Stun) | Debuff | 重装 (Juggernaut), 道具 | 跳过当前回合 | 引擎状态检查 `canAct = false`, `onTurnStart` -> decrease duration |
| `buff_freeze` | 冻结 (Freeze) | Debuff | 元素 (Elementalist) | 已从主数据移除（未来版本：可作为 `buff_slow` 的 alias 再引入） | - |
| `buff_slow` | 减速 (Slow) | Debuff | 狙击 (Sniper) | 速度显著降低 | `statModifiers: { speed: -value }` |
| `buff_weakness` | 虚弱 (Weakness) | Debuff | 铁壁 (Guardian), 狙击 | （口径待定：本轮更偏好以 `atk` 表达虚弱；若保留 damageDealtMult，需明确与 `debuff_weak` 区分） | - |
| `buff_vulnerable` | 易伤 (Vulnerable)| Debuff | 狙击 (Sniper) | 受到的伤害增加 | `statModifiers: { damageTakenMult: +percent }` |
| `buff_silence_limb`| 致残 (Crippled) | Debuff | 狙击 (Sniper) | 已从主数据移除（未来版本：需先落地“技能/部位可用性判定管线”） | - |

### 6.2 战斗增益类 (Combat Buffs - Offensive)

| Buff ID | 名称 | 类型 | 来源技能/职业 | 效果描述 | 实现逻辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `buff_berserk` | 狂暴 (Berserk) | Buff | 重装 (Juggernaut) | 已从主数据移除（未来版本：命中/暴击链路落地后再引入） | - |
| `buff_focus` | 专注 (Focus) | Buff | 狙击 (Sniper) | 已从主数据移除（未来版本：命中/暴击链路落地后再引入） | - |
| `buff_magic_surge`| 魔力过载 (Surge) | Buff | 元素 (Elementalist) | 已从主数据移除（未来版本：法术伤害体系落地后再引入） | - |
| `buff_poison_coat`| 毒素涂层 (Coating)| Buff | 游侠 (Ranger) | 已从主数据移除（未来版本：与中毒叠加/来源规则明确后再引入） | - |
| `buff_eagle_eye` | 鹰眼 (Eagle Eye) | Buff | 狙击 (Sniper) | 已从主数据移除（未来版本：命中判定管线落地后再引入） | - |
| `buff_armor_pen` | 破甲意图 (Feint) | Buff | 剑术 (Duelist) | 下次攻击削弱护甲减免（提高目标护甲减免系数） | `onAttackPre` -> Apply `armorMitigationMult` (Temp/Context) |
| `buff_bless` | 祝福 (Bless) | Buff | 神圣 (Cleric) | 命中率与闪避率提升 | `statModifiers: { hitRate: +20%, dodgeRate: +10% }` |

### 6.3 防御与生存类 (Combat Buffs - Defensive)

| Buff ID | 名称 | 类型 | 来源技能/职业 | 效果描述 | 实现逻辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `buff_iron_will` | 钢铁意志 (Iron Will)| Buff | 铁壁 (Guardian) | 已从主数据移除（未来版本：def/护甲口径统一后再引入） | - |
| `buff_block` | 格挡 (Block) | Buff | 铁壁 (Guardian) | 下次受到的伤害减半 | `onTakeDamagePre` -> Modify Incoming Dmg * 0.5 |
| `buff_pain_sup` | 痛苦压制 (Suppression)| Buff | 神圣 (Cleric) | 受到的伤害减少30% | `statModifiers: { damageTakenMult: -30% }` |
| `buff_evasion` | 残影 (Evasion) | Buff | 游侠 (Ranger) | （本轮结论：n 次免疫伤害；当前主数据实现为 1 次） | `onTakeDamagePre` -> `damageTaken=0` + `REMOVE_SELF` |
| `buff_immortality_hp`| 天使守护 (Immortal HP) | Buff | 神圣 (Cleric) | （本轮结论：回归阶段移除；主数据已移除） | - |
| `buff_immortality_armor`| 不朽壁垒 (Immortal Armor) | Buff | 铁壁 (Guardian) | 护甲无法被破坏（TBD） | 需要护甲破坏/护甲伤害管线支持（按部位） |
| `buff_shield` | 护盾 (Shield) | Buff | 神圣 (Cleric) | 抵挡一次伤害（一次性） | `onTakeDamagePre` -> `damageTaken=0` + `REMOVE_SELF` |
| `buff_revive` | 光辉复苏 (Revive) | Buff | 神圣 (Cleric) | （本轮结论：回归阶段移除；主数据已移除） | - |
| `buff_shield_wall` | 盾墙 (Shield Wall) | Buff | 铁壁 (Guardian) | 护甲共享，AP提升 | 引擎逻辑: Shared Armor Pool, `statModifiers: { maxAp: +3 }` |

### 6.4 特殊机制类 (Special Mechanics)

| Buff ID | 名称 | 类型 | 来源技能/职业 | 效果描述 | 实现逻辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `buff_thorns` | 荆棘 (Thorns) | Buff | 铁壁 (Guardian) | 被攻击时反弹伤害 | `onDefendPost` -> `damage` (Attacker) |
| `buff_counter` | 反击姿态 (Counter) | Buff | 铁壁 (Guardian) | 闪避并反击必中 | `statModifiers: { dodge: +100% }, onDefendPost` -> `attack` |
| `buff_lifesteal` | 吸血 (Lifesteal) | Buff | 剑术 (Duelist), 装备 | 攻击造成伤害回复HP | `onAttackPost` -> `heal` (percent of dmg) |
| `buff_ap_regen` | 战术恢复 (AP Regen)| Buff | 游侠 (Ranger), 装备 | 行动力恢复/消耗减少 | `onTurnStart` -> `modifyAP: +1` 或 `statModifiers: { apCost: -1 }` |
| `buff_damage_absorb`| 圣盾 (Aegis) | Buff | 铁壁 (Guardian) | 受到的伤害转化为治疗（TBD） | `onTakeDamagePre` -> `absorbToHeal`（需要动作库支持） |

---

## 7. 装备系统衍生 Buff 列表 (Item System Derived Buffs)

(补充自 `item_design.md`)

*   **passive_heavy_armor**: 速度 -5 (来源: 锁子甲) -> `statModifiers: { speed: -5 }`
*   **passive_vampire**: 20% 吸血 (来源: 吸血鬼之牙) -> `onAttackPost` -> `heal` (20% dmg)
*   **passive_start_weak**: 首回合攻击力降低 (来源: 角斗士头盔) -> `onTurnStart` (Round 1) -> Apply `debuff_weak`
*   **passive_phoenix**: 每场战斗一次复活 (来源: 凤凰吊坠) -> `lifecycle: { triggerLimit: 1 }`, `onDeath` -> Revive.

## 8. 总结 (Conclusion)

通过上述抽象，我们将复杂的战斗技能逻辑转化为了约 30 个基础 Buff 对象。在开发 `script/engine/BuffSystem.js` 时，应优先实现 `statModifiers` 和 `onTurnStart/End` 的处理逻辑，随后逐步实现 `EventBus` 中的 `onAttack/Defend` 钩子以支持高级 Buff。

## 10. 实现架构设计 (Implementation Architecture)

本章节描述如何实现一个低耦合、数据驱动的 Buff 系统，使其满足上述 JSON 配置需求。

### 10.1 架构核心 (Core Architecture)

整个系统由四个核心部分组成：
1.  **BuffManager**: 挂载在 Character 上的数据容器，负责 Buff 的增删改查和生命周期 Tick。
2.  **BuffSystem (Processor)**: 独立的单例系统，订阅 `EventBus`，是实际执行 Buff 逻辑的大脑。
3.  **ActionLibrary (Registry)**: 原子操作库，将 JSON 中的字符串 action 映射为具体的 JS 函数。
4.  **ConditionLibrary (Registry)**: 条件判断库，用于检查 effects 中的 triggers 是否满足执行条件。

### 10.2 数据流向 (Data Flow)

1.  **事件触发**: 战斗系统 (CombatSystem) 发布事件 (e.g. `EVENT.ATTACK_HIT`).
2.  **系统响应**: `BuffSystem` 监听到事件，遍历所有参与者的 `BuffManager`。
3.  **匹配 Trigger**: 对于每个 Buff，检查其 `effects` 列表中的 `trigger` 字段是否匹配当前事件名。
4.  **执行逻辑**: 如果匹配，调用 `ActionLibrary` 执行对应的原子函数。

### 10.3 动作库设计 (ActionLibrary - The "Code in JSON")

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

### 10.3.1 案例分析：配置“攻击吸血” (Example: Configuring Life Steal)

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

### 10.3.2 案例分析：配置“破甲意图” (Example: Configuring Armor Penetration)

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

### 10.4 参数体系深度解析 (Deep Dive into Parameters)

针对 `params` 中的核心字段 `stat`, `value`, `type`，本设计明确了哪些是**可直接扩展的**（无需改代码），哪些是**枚举类型**（需引擎支持）。

#### 10.4.1 stat (属性键名) - 可扩展 (Extensible)
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

#### 10.4.2 type (计算策略) - 枚举值 (Enumeration)
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

#### 10.4.3 value (数值载荷) - 高度动态 (Dynamic)
*   **定义**: 实际作用的数值大小。
*   **类型**: **多态 (Number | String Expression)**。
*   **扩展策略**:
    *   通过支持解析字符串公式，实现无限的扩展能力。
*   **数据形式**:
    *   **Number**: 静态常量 (e.g., `100`, `0.5`).
    *   **String**: 动态公式 (e.g., `"{source.atk} * 0.5 + 10"`).
*   **引擎实现**:
    *   利用 `Context` 上下文对象，解析字符串中的占位符（如 `{source.atk}`），替换为实际运行时数值后计算。

### 10.5 低耦合优势 (Decoupling Benefits)

*   **无需修改战斗代码**: 新增一个"攻击时吸血"的 Buff，只需要在 JSON 里配置 `trigger: onAttackPost`, `action: HEAL`, `target: self`。不需要去改动 CombatSystem 的攻击函数。
*   **统一入口**: 所有修改属性、造成伤害的来源都被统一管理，方便通过 `console.log` 追踪战斗日志。
*   **易于扩展**: 如果需要新机制（例如“偷取金币”），只需在 `ActionLibrary` 注册 `STEAL_GOLD` 函数，无需改动整个架构。

## 11. 核心引擎集成与问题分析 (Core Integration & Analysis)

针对易伤 (Vulnerable) 和 破甲 (Armor Pen) 等高级机制在简易模拟器中失效的问题，本章节明确了核心引擎必须具备的架构模块。

### 9.1 测试失效原因深度解析 (Root Cause Analysis)

在 `buff_editor_v2.html` 的模拟测试中，发现部分技能效果未生效，其根源在于**模拟代码过于线性**，缺乏“中间件”机制：

1.  **易伤失效 (Vulnerable Failure)**:
    *   **现象**: 伤害数值未增加。
    *   **原因**: 易伤通常通过 `statModifiers: { damageTakenMult: 0.2 }` (受伤增加20%) 实现。模拟代码直接执行 `hp -= damage`，完全忽略了对 `damageTakenMult` 属性的检查和乘算。
    *   **缺失**: 缺少一个**统一属性计算层 (Stat Calculator)** 来聚合所有 Buff 的被动属性修正。

2.  **破甲失效 (Armor Pen Failure)**:
    *   **现象**: 护甲减免数值未变。
    *   **原因**: 破甲依赖 `onAttackPre` 时机触发，目的是在“护甲结算阶段”临时修改 `armorMitigationMult`。模拟代码中，事件触发 (`onAttackPre`) 和 护甲结算 是分离的，事件触发仅仅打印了日志，并没有将修改后的参数传递给护甲结算步骤。
    *   **缺失**: 缺少**可变上下文 (Mutable Context)** 的传递机制。

### 9.2 内核模块需求 (Module Requirements)

为了解决上述问题，Core Engine 必须包含以下两个核心子模块（或功能集）：

#### A. BuffSystem (逻辑处理器)
这是一个常驻的单例系统，负责：
1.  **生命周期管理**: 回合开始/结束时更新所有实体的 Buff (Tick)。
2.  **事件响应**: 监听 `EventBus`，根据 Buff 配置的 Triggers 执行 Actions。

#### B. StatCalculator (动态属性层)
这是一个静态工具类或服务，负责取代简单的 `obj.stats.atk` 访问方式。
*   **职责**: `getEffectiveStat(entity, statName)`
*   **逻辑**: Base Value + Equipment Modifiers + **Buff Modifiers (Iterate & Sum)**.

### 9.3 战斗流程集成方案 (Pipeline Integration Scheme)

要实现破甲和动态伤害，战斗流程必须改造为**管道模式 (Pipeline Pattern)**。

```javascript
// 伪代码：战斗行为执行流
async function executeCombatAction(attacker, target, actionData) {

    // 1. 创建作战上下文 (Combat Context)
    // 这个对象将在整个流程中传递，并允许被 Buff 修改
    const context = {
        attacker: attacker,
        target: target,
        rawDamage: actionData.baseDamage,
        armorMitigationMult: 1.0, // 护甲减免系数乘区 (初值 1.0)
        damageMultiplier: 1.0,    // 伤害乘区 (初值 1.0)
        resultLog: []
    };

    // 2. 触发阶段: 攻击前 (Attack Pre)
    // BuffSystem 监听到此事件，若 attacker 有“破甲意图”Buff：
    // -> 触发 ACTION: "MODIFY_CONTEXT" -> context.armorMitigationMult *= 1.3
    await EventBus.emit('BATTLE_ATTACK_PRE', context);

    // 3. 计算阶段: 动态属性获取
    // 这里不再用 def 做“护甲”，护甲按部位参与减免：
    // finalDamage = rawDamage * f(armorValue) * context.armorMitigationMult
    // （f(armorValue) 为护甲系统定义的减免函数/系数）
    let finalDamage = context.rawDamage;

    // 5. 触发阶段: 受击前 (Take Damage Pre / Defense Pre)
    // BuffSystem 监听到此事件，若 target 有“易伤”Buff：
    // -> Buff属性中自带 statModifiers.damageTakenMult
    // 或者是动态触发的效果
    let takenMult = StatCalculator.get(target, 'damageTakenMult') || 1.0;
    finalDamage *= takenMult;

    // 6. 结算应用
    target.stats.hp -= finalDamage;

    // 7. 触发阶段: 攻击后 (Attack Post)
    // 处理吸血等逻辑
    await EventBus.emit('BATTLE_ATTACK_POST', context);
}
```

### 9.4 结论 (Conclusion)

是的，需要在内核引擎中增加独立的 **BuffSystem** 模块。单纯在 `CoreEngine.js` 中写死逻辑无法满足需求。

*   **下一步计划**:
    1.  创建 `script/engine/BuffSystem.js`。
    2.  创建 `script/engine/StatCalculator.js`。
    3.  在 `CoreEngine` 初始化时启动 BuffSystem。
    4.  重构战斗逻辑，使用上述 Context Pipeline 模式。

