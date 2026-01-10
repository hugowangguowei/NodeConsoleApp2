# Buff/Debuff 系统设计文档 (Buff/Debuff System Design)

## 1. 设计综述 (Overview)

Buff (增益) 和 Debuff (减益) 系统是本游戏战斗逻辑的核心底层机制。它不仅负责处理临时的状态异常（如中毒、眩晕），还承担着装备属性加成、被动技能效果、环境光环等所有“非基础属性”的逻辑实现。

*   **设计目标**:
    1.  **统一性 (Unification)**: 将装备属性、技能特效、临时状态统一为一种数据结构处理。
    2.  **可扩展性 (Extensibility)**: 新增一种效果只需配置新的 Buff ID 和参数，无需修改战斗核心代码。
    3.  **数据驱动 (Data-Driven)**: 所有 Buff 行为通过 JSON 定义，支持热更和编辑器配置。

---

## 2. 核心架构与实现细节 (Core Architecture)

### 2.1 数据结构 (Data Structure)
一个标准的 Buff 对象应包含以下核心字段：

```json
{
  "id": "buff_bleed_01",
  "name": "流血 I",
  "type": "DEBUFF",            // 类型: BUFF, DEBUFF, HIDDEN
  "tags": ["physical", "dot"], // 标签，用于净化或免疫判断
  "duration": 3,               // 持续回合数 (-1 代表永久，如装备属性)
  "maxStacks": 5,              // 最大堆叠层数
  "effects": [                 // 包含的一个或多个具体效果
    {
      "trigger": "ON_TURN_END", // 触发时机
      "action": "DAMAGE",       // 行为类型
      "value": 5,               // 数值
      "valueType": "FLAT"       // 数值类型: FLAT(固定值), PERCENT(百分比)
    }
  ],
  "sourceId": "player_01"      // 施加者 ID (用于伤害归属计算)
}
```

### 2.2 生命周期管理 (Lifecycle)
1.  **施加 (Application)**: 检查抗性 -> 检查堆叠规则 (刷新时间/增加层数) -> 触发 `OnApply` 钩子。
2.  **生效 (Tick)**: 在游戏的主循环（通常是回合开始或结束）遍历所有活跃 Buff，检查 Trigger 条件并执行 Effect。
3.  **衰减 (Decay)**: 每回合结束时 duration - 1。若 duration 为 0，进入移除流程。
4.  **移除 (Removal)**: 触发 `OnRemove` 钩子 -> 从列表中剔除 -> 重新计算角色属性 (Dirty Flag模式)。

---

## 3. Buff/Debuff 类型 (Types)

根据作用方式，Buff 分为三大类：

### 3.1 属性修正型 (Stat Modifiers)
直接改变角色的面板属性。通常用于装备被动和长期 Buff。
*   **机制**: 并没有“每回合执行”逻辑，而是在属性计算公式中介入。
*   **计算公式**: `FinalValue = (Base + FlatMod) * (1 + PercentMod)`
*   *示例*: 
    *   `stat_atk_up`: 攻击力 +10 (装备: 铁剑)
    *   `stat_armor_percent`: 护甲值 +20% (技能: 坚盾)

### 3.2 状态异常型 (Status Effects)
经典的战斗状态，通常带有持续时间。
*   **DoT (Damage over Time)**: 中毒 (Poison), 流血 (Bleed), 燃烧 (Burn)。
*   **HoT (Heal over Time)**: 再生 (Regen)。
*   **控制类 (Crowd Control)**: 
    *   `STUN`: 跳过当前回合。
    *   `FREEZE`: 无法行动，但护甲可能提升。
    *   `CONFUSION`: 攻击目标随机化。

### 3.3 触发器型 (Trigger/Reactive)
处于潜伏状态，只在特定战斗事件发生时生效。
*   **反击 (Counter)**: 被攻击时对来源造成伤害。
*   **吸血 (Life Steal)**: 造成伤害时回复 HP。
*   **护盾 (Shield/Barrier)**: 受到伤害时优先扣除层数/护盾值。

---

## 4. 触发机制 (Trigger Mechanisms)

Buff 系统通过监听战斗系统的 **事件钩子 (Event Hooks)** 来运作。
设计文档 `skill_design.md` 和 `item_design.md` 中的复杂效果均依赖于此。

| 触发器代码 (Trigger) | 描述 | 典型应用 |
| :--- | :--- | :--- |
| `ON_TURN_START` | 回合开始时 | DoT 伤害结算，冷却缩减，AP恢复 |
| `ON_TURN_END` | 回合结束时 | Buff 持续时间扣除，HoT 治疗结算 |
| `ON_ATTACK_PRE` | 攻击动作发生前 | 检查是否 `STUN`，消耗 AP |
| `ON_HIT` | 攻击命中时 | 附加 `Poison`，触发 `Life Steal`，暴击判定 |
| `ON_DAMAGE_DEALT` | 造成伤害后 | 处决效果 (斩杀低血量) |
| `ON_DEFEND` | 防御动作生效时 | 增加临时护甲 |
| `ON_TAKE_DAMAGE` | 受伤时 | 触发 `Thorns` (荆棘反伤)，解除 `Sleep` 状态 |
| `ON_DEATH` | 死亡时 | 复活 (Phoenix)，亡语效果 (自爆) |

---

## 5. Buff 效果详解与示例 (Complexity & Examples)

### 示例 1: 复杂 DoT - 剧毒 (Deadly Posion)
*   **描述**: 每回合扣除 5% 最大生命值，且治疗效果降低 50%。
*   **复杂实现**:
    1.  **Effect 1**: Trigger `ON_TURN_START` -> Action `DAMAGE` -> Value `0.05 * Target.MaxHP`.
    2.  **Effect 2**: StatMod `Heal_Received_Rate` -> Value `-0.5`.

### 示例 2: 装备被动 - 荆棘甲 (Thornmail)
*   **描述**: 受到近战攻击时，回敬攻击者 10 点无视护甲伤害。
*   **复杂实现**:
    1.  **Trigger**: `ON_TAKE_DAMAGE`
    2.  **Condition**: `AttackType == MELEE`
    3.  **Action**: `DAMAGE_SOURCE` (反向伤害) -> Value `10` -> Type `TRUE_DAMAGE`.

### 示例 3: 技能 - 弱点标记 (Weakness Mark)
*   **描述**: 下一次受到的伤害增加 50%，受击后消耗掉该标记。
*   **复杂实现**:
    1.  **Trigger**: `ON_TAKE_DAMAGE_PRE` (计算伤害前)
    2.  **Action**: `MODIFY_INCOMING_DAMAGE` -> Value `+50%`.
    3.  **Self-Action**: `REMOVE_SELF` (触发一次后自毁).

---

## 6. 实现复杂度分析 (Implementation Complexity)

### 6.1 依赖与顺序 (Dependency & Order)
*   **问题**: 多个 Buff 同时修改属性时，加法和乘法的顺序至关重要。
*   **方案**: 采用分层计算 (Layered Calculation)。
    *   Layer 1: 基础值 (Base)
    *   Layer 2: 固定值加成 (Flat Add) -> `ATK + 10`
    *   Layer 3: 增加百分比 (Percent Add) -> `ATK + 10%`
    *   Layer 4: 独立乘区 (Multiplier) -> `Final Damage * 1.5`

### 6.2 状态同步与 UI (UI Sync)
*   **挑战**: 玩家需要知道 Buff 的来源、剩余回合、具体数值。
*   **方案**:
    *   服务端/逻辑层仅发送 Buff ID 和 Stack 层数。
    *   前端维护 `BuffLibrary` (文本描述库)，将 `buff_str_up` 翻译为 "力量增强 (3回合)"。
    *   对于动态数值 Buff（如“吸收了 50 点伤害”），需要 `metaData` 字段同步给 UI。

### 6.3 脏数据标记 (Dirty Flag)
*   **优化**: 为避免每帧重算属性，并在 Buff 列表变动（添加/移除/层数改变）时，将角色的 `isStatsDirty` 标记为 `true`。
*   **查询**: 下次获取 `GetAttack()` 时，若 Dirty 为 true，则执行重算流程并缓存结果，否则直接返回缓存值。
