# Buff/Debuff 系统设计文档 (Buff/Debuff System Design)

## 1. 系统综述 (System Overview)

Buff (增益) 与 Debuff (减益) 系统是本游戏战斗逻辑的核心底层机制。它不仅用于处理战斗中的临时状态（如眩晕、中毒），也作为装备属性、被动技能、场地效果的统载体。本设计文档基于 `skill_design.md` 和 `item_design.md` 中定义的技能与装备，抽象出核心的 Buff 对象库。

*   **核心目标**:
    1.  **统一性 (Unification)**: 将装备静态属性、技能持续效果、临时状态统一为“Buff对象”进行管理。
    2.  **解耦 (Decoupling)**: 技能和装备只负责“施加”Buff，而Buff的具体效果逻辑由Buff系统独立处理。
    3.  **数据驱动 (Data-Driven)**: 所有Buff通过JSON配置定义，支持热更新和编辑器扩展。

---

## 1.2 基于测试结论的改动决策（Test-driven Change Decisions）

> 来源：`test/test_doc/buff_editor_test_doc_v2.md` 第三章（Per-Buff）的“结论”条目。
> 目标：把“本轮测试达成的取舍”固化为 Buff 体系的设计约束，避免后续数据继续沿用不可测/未落地的字段与语义。

### 1.2.1 原子性原则（Atomic Buff）

- Buff 是“效果原子对象”，Buff 内部尽量只表达**单一机制**。
- 若需要复合作用（例如“冻结=硬控+减速”），优先由技能/装备在施加阶段组合多个 Buff，而不是一个 Buff 内塞多个 effect/stat。

### 1.2.2 本轮测试后的明确决策（Decisions）

1) **删除：燃烧 `buff_burn`**
   - 原因：在当前未引入元素/抗性体系时，燃烧与流血都属于 DoT（触发点+伤害类型差异不足以支撑独立 Buff）。
   - 处理：从 `assets/data/buffs.json` 移除（或迁移到“元素体系”分支/未来版本）。

2) **冻结 `buff_freeze`：降级为“减速”，并与 `buff_slow` 合并**
   - 原因：`buff_freeze` 当前属于复合效果（硬控+防御加成），不符合“原子性”原则。
   - 处理：冻结仅保留“减速”机制；落地方式可以是：
     - 方案 A：删除 `buff_freeze`，只保留 `buff_slow`
     - 方案 B：`buff_freeze` 改为 `aliasOf: buff_slow`（保留语义入口但复用实现）

3) **护盾 `buff_shield`：采用方案 B（抵挡一次伤害）**
   - 原则：护盾不是“护甲数值”，也不是“护盾池数值”，而是一次性保护。
   - 规范：
     - Trigger：`onTakeDamagePre`
     - Behavior：将本次 `context.damageTaken = 0`（或将伤害倍率变为 0）
     - Consume：同一次受击后立即 `REMOVE_SELF`

4) **虚弱 `debuff_weak`：采用方案 A（降低 atk），不使用 `damageDealtMult`**
   - 原因：当前测试关注点是“力量下降/攻击变弱”。
   - 规范：`debuff_weak` 使用 `statModifiers.atk`（flat 或 percent），不再用 `statModifiers.damageDealtMult`。

5) **删除：部位封印 `buff_silence_limb`**
   - 原因：仅有描述/tbd，无可执行字段；且目前缺少“技能可用性/目标部位可选性”的统一判定管线。
   - 处理：从主数据移除，待技能系统判定管线明确后再引入。

6) **删除：依赖未落地体系的 Buff（回归阶段收敛）**
   - 包括但不限于：`buff_berserk`（hitRate）、`buff_focus`（hitRate/critRate）、`buff_magic_surge`（magicDmg）、`buff_poison_coat`（与中毒重复）、`buff_eagle_eye`（命中/闪避判定缺失）、`buff_iron_will`（def 概念未落地）。
   - 处理：移除或迁移到未来版本。

7) **`buff_block`：保留并重新测试**
   - 原因：属于可测机制（`onTakeDamagePre` 伤害倍率修改）。

8) **`buff_evasion`：改为“n 层全闪避”语义（不依赖 dodgeRate）**
   - 原因：目前无闪避率判定体系。
   - 规范：以“有限次数免疫伤害”表达，而非概率闪避。

9) **删除：`buff_immortality_hp` / `buff_revive`（回归阶段移除）**
   - 原因：需要 death 事件与死亡流程钩子；当前回归阶段不引入该复杂度。

10) **`buff_shield_wall`：保留，但验收口径调整为 `effectiveMaxAp`**
   - 原因：当前模拟器与 UI 未展示可验证口径。
   - 规范：需要在“状态监视区”能观察到 `maxAp` 的被动提升结果。


## 1.1 设计改版说明：从“对象清单”转为“需求/类型驱动”

当前版本的 `buff_design.md` 已经罗列了很多 Buff 对象，并且建立了追溯表。但从可维护性与后续实现（尤其是数据驱动实现）角度，现有结构存在一个痛点：

* Buff 的组织方式偏“从技能/装备推导出来的列表”，而不是“从引擎需要解决的问题（需求域）”出发。
* 这样会导致：
  1) 同一类需求（例如伤害修正）在文档中被分散、命名不统一（如 `debuff_weak` 与 `buff_weakness`）。
  2) 当实现 BuffSystem 时，难以直接映射到“伤害结算管线/回合钩子/技能可用性判定”等关键结算点。

因此本文档在不推翻既有 Buff 设计与数据结构基础上，补充一套**按 Buff 需求与类型（效果域）**的分类体系，并将所有已有 Buff 放入该分类体系中。

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
- 推荐实现方式：在 `onTakeDamagePre` 阶段将 `context.damageTaken = 0`（或等价字段），并在同一次受击后 `REMOVE_SELF`。
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

## 5. 现有 Buff 的“需求域归类表”（对照 `assets/data/buffs.json`）

本表用于把当前 `assets/data/buffs.json` 里**已经存在**的 Buff 快速归类到新体系。

| Buff ID | 需求域类型 | 说明 |
| :--- | :--- | :--- |
| `buff_poison` | B1 DoT | `onTurnEnd` 结算，按 `maxHp * 0.05` |
| `buff_bleed` | B1 DoT | `onTurnStart` 固定伤害 |
| `buff_burn` | - | 已从 `assets/data/buffs.json` 移除（本轮结论：删除） |
| `buff_stun` | C1 硬控 | `skipTurn` |
| `buff_freeze` | - | 已从 `assets/data/buffs.json` 移除（本轮结论：降级并与 `buff_slow` 合并/alias） |
| `buff_slow` | C2 软控（速度） | `speed -5` |
| `buff_weakness` | A1 输出修正 | `damageDealtMult -0.15`（与上语义重叠） |
| `buff_vulnerable` | A2 承伤修正 | `damageTakenMult +0.2` |
| `buff_strength` | D 属性修正 | `atk +5` |
| `buff_silence_limb` | - | 已从 `assets/data/buffs.json` 移除（本轮结论：删除） |

> 破甲/护甲交互类 Buff 在 `buffs.json` 里还未出现（或命名不明显）。后续补充破甲 Buff 时请使用 4.1.3 的“改护甲减免系数”语义。

---

## 5.1 冗余与缺口分析（对现有 Buff 体系的修正建议）

本节以当前文档与 `assets/data/buffs.json` 为基准，回答两个问题：

1) **哪些 Buff/类型是冗余的**（语义重复、命名冲突、结构重复）
2) **哪些 Buff/类型是缺失的**（无法覆盖技能/装备设计中已出现的需求）

> 本节优先做“设计修正”，不强制立即修改 JSON 文件。你后续实现 BuffSystem 时，可以依据这些建议做兼容处理。

### 5.1.1 冗余项（建议合并/统一语义）

#### R1. `debuff_weak` 与 `buff_weakness` 的语义重复

* 现状（历史）：两者都被用于表达“造成伤害变弱”。
* 对齐本轮结论：`debuff_weak` 已改为 **降低 `atk`**，而 `buff_weakness`（若保留）则代表 **输出乘区 `damageDealtMult`**。
* 风险：
  * UI/编辑器层很难解释两者差别；
  * 实现层会遇到“同类 Debuff 是否互斥/覆盖/叠加”的决策压力。
* 修正建议（文档层面）：
  1. 统一为一个系列：建议保留 `debuff_weak` 作为通用“虚弱”。
  2. 若确实需要两者并存，则必须明确：
     * 命名规范（例如都用 `debuff_weakness_*`）；
     * 互斥/覆盖策略（例如：同 tag `weakness` 的 debuff 只保留强度最高者）。

#### R2. `buff_shield` 在分类中存在“跨域重复描述”

* 现状：护盾既属于 E 类防御机制（功能域），又发生在 A 类伤害结算管线中（触发点）。
* 结论：这不是逻辑重复，但文档表述上容易让人误解为“两个不同系统”。
* 修正建议：在文档中明确：
  * `buff_shield` 的**归属类型**是 E 类；
  * A4 章节只负责解释“它会介入 onTakeDamage”，不再重复列举具体 Buff。

#### R3. 文档章节编号/层级存在冲突（影响维护）

* 现状：`## 3. Buff 效果类型与触发机制` 出现在 `## 4. Buff 类型体系` 之后；
  另外 `## 6. 技能系统衍生Buff列表` 内部子标题仍在使用 `4.1/4.2/4.3`。
* 修正建议：后续整理时建议：
  1) 将“触发机制”章节提前（更符合从基础到分类的阅读顺序）；
  2) 把技能衍生 Buff 列表的小节编号改为 `6.1/6.2/6.3...`，避免与第 4 章冲突。

---

#### R4. `buff_lifesteal` 与 `passive_vampire` 完全同构（仅类型不同）

* 现状：两者的 `effects` 完全一致（`onAttackPost` -> `heal`，公式 `damageDealt * 0.2`），差异仅在 `type= buff/hidden` 以及语义来源（技能 vs 装备）。
* 风险：
  * 维护时会出现“两处改动要同时改”的同步负担（例如数值调整、触发时机调整、上下文变量名调整）。
  * 编辑器/追溯表会出现重复条目，难以判断是否同一机制。
* 修正建议（文档层面，兼容现有 JSON）：
  1) 将“吸血”定义为一个**机制 Buff 模板**（例如 `mechanic_lifesteal_20`），并允许装备/技能通过不同的 ID 引用同一模板。
  2) 或者保留两者 ID，但明确规则：`passive_*` 只是“来源标识”，效果应当与对应的 `buff_*` 共享实现与测试用例。

#### R5. `skipTurn` 型控制（`buff_stun` / `buff_freeze`）存在重叠，但属于“可控冗余”

* 现状（历史）：两者都通过 `skipTurn` 达成硬控。
* 结论：这不算必须合并的冗余，因为“控制来源/标签/抗性”可能不同。
* 修正建议：
  * 在类型体系中明确：`skipTurn` 属于 C1 机制；`freeze` 只是“额外附带属性/标签”的变体。
  * 统一写法：C1 的硬控都用 `effects: [{ trigger: onTurnStart, action: skipTurn }]`，差异体现在 `tags` 与附加 `statModifiers`。

> 对齐本轮结论：`buff_freeze` 已移出主数据，不再作为现有 Buff 的冗余讨论对象；若未来重新引入，应按“原子性”拆分为多个 Buff。

#### R6. “命中必定命中”类（`buff_eagle_eye`）当前只有 description，等同于半成品 Buff

* 现状（历史）：只有 `description`，无 `effects/statModifiers`，属于“文档/数据冗余占位”。
* 修正建议：
  * 要么补齐可执行字段（见 M2/M6），要么标注为 `tbd` 并从“已完成 Buff 清单”移出。

> 对齐本轮结论：`buff_eagle_eye` 已从 `assets/data/buffs.json` 移除。

#### R7. “定义口径重复”：同一概念同时用 `def` 与 `armor` 表达（破甲相关）

* 现状（历史）：A3 已明确“护甲按部位”，但旧数据曾用 `def` 做破甲。
* 风险：导致实现时把“护甲系统”退化为“防御力系统”，与项目核心差异化设定冲突。
* 修正建议：本次文档需要统一口径（见 5.1.3 / 8.3.2 修正）。

### 5.1.2 缺口项（建议补充的 Buff 类型/字段）

这些缺口会影响“用 JSON 表达技能/装备效果”的能力。即使你暂时不新增 Buff，也建议先把字段/动作定义补齐。

#### M1. A3 护甲交互字段需要纳入“标准属性”

你已明确 A3 采用“改护甲减免系数”的语义，但目前：

* `3.1 支持属性` 未包含 `armorMitigationMult`；
* `8.4 参数体系` 的 `stat` 示例也未覆盖该字段。

修正建议：

* 在 `3.1 支持属性` 中加入以下通用统计项：
  * `damageDealtMult`（输出乘区）
  * `damageTakenMult`（承伤乘区）
  * `armorMitigationMult`（护甲减免系数乘区）

#### M2. 命中/闪避/暴击链路类 Buff 的字段体系

技能文档中已经出现：命中提升、闪避提升、暴击提升（如 `buff_focus`、`buff_bless`），但目前缺少统一字段规范。

建议补充以下通用属性键（按你现有风格，优先使用 `statModifiers`）：

* `hitRate` / `hitRateMult`
* `dodgeRate` / `dodgeRateMult`
* `critRate`
* `critDmgMult`

#### M3. 净化/驱散/免疫（Cleanse/Dispel/Immunity）

技能设计中存在“移除 Debuff / 驱散 DoT / 清洁控制”的需求，但目前缺少统一 action/配置方式。

建议补充可数据驱动的 action：

* `removeBuffById`
* `removeBuffByTag`
* `removeBuffByType`（只移除 debuff）
* `grantImmunity`（例如对 `control` 免疫 1 回合）

#### M4. 护甲值本体的“修复/破损”动作（按部位）

护甲按部位独立且可被破坏，这是战斗系统核心；仅靠“减免系数乘区”无法表达“修复护甲/打碎护甲”的数值变化。

建议补充 action：

* `damageArmor`（对目标部位护甲造成伤害）
* `repairArmor`（对目标部位护甲修复/回复）

> 与 A3 的关系：A3 是改“减免系数”，这里是改“护甲值本身”，两个维度建议并存。

#### M5. 一次性消耗型 Buff 的统一生命周期表达

例如 `buff_block`、`buff_armor_pen` 这类“触发一次后消失”的 Buff，在 JSON 中建议有统一表达。

建议在 `lifecycle` 中加入（可选其一）：

* `triggerLimit`（最大触发次数，例如 1）
* `consumeOnTrigger`（命中触发点后自动移除）

---

#### M6. “命中判定/必定命中/无视闪避”的数据化表达

`buff_eagle_eye` 这类 Buff 当前无法落地，是因为缺少一个通用的“命中判定管线参数”。

建议增加（选择其一即可，建议从简单开始）：

* 方案 A（推荐，最小增量）：
  * `statModifiers.ignoreDodge`：`true/false`（布尔）
  * `statModifiers.hitRateMult`：命中乘区（对最终命中率乘算）

这样 `buff_eagle_eye` 才能真正成为“可执行 Buff”，而不是只有 description 的占位符。

#### M7. “部位/目标选择限制”需要一个明确的判定接口

`buff_silence_limb` 的语义如果要数据驱动，需要定义它影响哪个判定点：

* 判定点 1：技能可用性（Skill Availability）。
  * 规则：禁用具有某些 `skill.tags` 的技能，例如 `tags: ['limb']`。
  * 需要 action/字段：`disableSkillByTag` / `disabledSkillTags`。
* 判定点 2：目标部位可选性（Target Part Availability）。
  * 规则：禁用选择某些部位，例如 `head/body/arms/...`。
  * 需要 action/字段：`disableTargetParts: ['arm_left', 'arm_right']`。

推荐先落地“判定点 2”，因为它更贴合你当前 UI 的“选择攻击部位”交互。

#### M8. “Buff 可叠加但只取最大值/只取最新值”的通用策略

现在 lifecycle 里有 `maxStacks/stackStrategy`，但 `stackStrategy` 目前混用了：`refresh/replace/stack`（并且文档 2.1 示例里没有 `stack`）。

建议在文档里把 `stackStrategy` 枚举统一为：

* `refresh`：刷新持续时间（强度不变或以“最新覆盖强度”为准）
* `extend`：延长持续时间
* `add`：叠层（同一个 Buff 多层累计强度）
* `max`：同一 tag 只保留强度最大的一个（解决 R1 冗余的“虚弱系”互斥问题）
* `replace`：完全覆盖（移除旧实例，写入新实例）

这能显著减少“同义 Buff”带来的实现歧义。

### 5.1.3 本次文档立即修正点（与 A3 方案一致）

* `buff_armor_pen`（破甲意图）的实现描述，后续应基于 `armorMitigationMult`（改护甲减免系数）而不是改 `def`。
* 本文档后文的 `8.3.2` 示例会据此调整（当你要求实现代码前，建议先把示例统一）。

补充：`assets/data/buffs.json` 的 `buff_armor_pen` 已对齐为 `MODIFY_STAT_TEMP` + `armorMitigationMult`。

* 文档以“护甲按部位”为第一原则，破甲应当影响 `armorMitigationMult`（或上下文中的 `armorMitigationMult`），而不是 `def`。
* 现阶段允许 JSON 暂不改，但需要在实现 BuffSystem 时提供一个兼容层：
  * 若遇到旧数据仍使用 `stat=def` 表达破甲：在日志中提示“旧字段口径（def）将迁移到 armorMitigationMult”。

---

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

## 9. 追踪相关性 (Traceability)

为了确保设计的一致性，本章节列出了所有 Buff 与 技能/装备 的对应关系。

| Buff ID | 关联技能 (skills) | 关联装备 (items) |
| :--- | :--- | :--- |
| `buff_bleed` | 血管切割 (Artery Slice), 千刃风暴 (Thousand Cuts), 血腥收割 (Bloody Harvest - 消耗), 猩红终结 (Crimson Finale - 移除) | - |
| `buff_burn` | 火球术 (Fireball), 燃油投掷 (Oil Slick - 延长) | - （本轮结论：已删除/移出回归范围） |
| `buff_poison` | 毒液涂层 (Poison Coating - 施加者) | - |
| `buff_stun` | 盾牌猛击 (Shield Bash), 蛮牛头槌 (Headbutt), 大地震击 (Earthquake) | - |
| `buff_freeze` | 冰锥术 (Ice Lance), 暴风雪 (Blizzard) | - （本轮结论：降级并与 `buff_slow` 合并/alias；主数据已移除原 freeze 机制） |
| `buff_slow` | 震荡波 (Shockwave), 膝盖射击 (Knee Shot), 冰霜新星 (Frost Nova - 类似) | `passive_heavy_armor` (类似效果) |
| `debuff_weak` | - | `helm_gladiator` (类似效果) |
| `buff_weakness` | 挑衅 (Taunt), 远程拆解 (Disarm) | - |
| `buff_vulnerable` | 弱点标记 (Mark Target), 感电 (Elementalist feature) | - |
| `buff_silence_limb`| 致残射击 (Crippling Shot) | - （本轮结论：已删除/移出回归范围） |
| `buff_berserk` | 狂暴姿态 (Berserk) | - （本轮结论：已删除/移出回归范围） |
| `buff_focus` | 稳固瞄准 (Steady Aim) | - （本轮结论：已删除/移出回归范围） |
| `buff_magic_surge` | 过载 (Overload) | - （本轮结论：已删除/移出回归范围） |
| `buff_poison_coat` | 毒液涂层 (Poison Coating) | - （本轮结论：已删除/移出回归范围） |
| `buff_eagle_eye` | 鹰眼 (Eagle Eye) | - （本轮结论：已删除/移出回归范围） |
| `buff_armor_pen` | 佯攻 (Feint) | - |
| `buff_bless` | 祝福 (Bless) | - |
| `buff_iron_will` | 钢铁意志 (Iron Will) | - （本轮结论：已删除/移出回归范围） |
| `buff_block` | 格挡 (Block) | - |
| `buff_pain_sup` | 痛苦压制 (Pain Suppression) | - |
| `buff_evasion` | 战术翻滚 (Tactical Roll), 残影 (Afterimage) | - |
| `buff_immortality_hp` | 天使守护 (Guardian Angel) | - （本轮结论：回归阶段移除） |
| `buff_immortality_armor` | 不朽壁垒 (Immortal Bastion) | - |
| `buff_shield` | 信仰之盾 (Shield of Faith) | - |
| `buff_revive` | 光辉复苏 (Radiant Revitalize) | `acc_pendant_phoenix`（本轮结论：回归阶段移除） |
| `buff_shield_wall` | 盾墙 (Shield Wall) | - |
| `buff_thorns` | 尖刺防御 (Spiked Shell) | - |
| `buff_counter` | 反击姿态 (Counter Stance) | - |
| `buff_lifesteal` | 鲜血渴望 (Bloodthirst - 回复), 神圣震击 (Holy Shock - 治疗) | `wp_vampire_fang` |
| `buff_ap_regen` | 肾上腺素 (Adrenaline), 战术恢复 (Tactical Roll - 减耗) | `acc_amulet_focus` |
| `buff_damage_absorb`| 绝对防御 (Aegis) | - |
| `passive_knight` | - | `wp_knight_sword` (+Dmg) |
| `passive_heavy_armor`| - | `body_chainmail` (-Speed) |
| `passive_gladiator` | - | `helm_gladiator` (-Attacker Dmg) |
| `passive_dragon` | - | `body_dragon_scale` (-Dmg Taken) |
| `passive_phoenix` | - | `acc_pendant_phoenix` (Revive) |
| `passive_speed_boost`| - | `acc_boots_speed` |
| `passive_thunder_strike`| - | `wp_thunder_hammer` |
| `passive_cursed_self_dmg`| - | `wp_cursed_blade` |

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

