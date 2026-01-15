# Buff/Debuff 系统设计文档 (Buff/Debuff System Design)

## 1. 系统综述 (System Overview)

Buff (增益) 与 Debuff (减益) 系统是本游戏战斗逻辑的核心底层机制。它不仅用于处理战斗中的临时状态（如眩晕、中毒），也作为装备属性、被动技能、场地效果的统载体。本设计文档基于 `skill_design.md` 和 `item_design.md` 中定义的技能与装备，抽象出核心的 Buff 对象库。

*   **核心目标**:
    1.  **统一性 (Unification)**: 将装备静态属性、技能持续效果、临时状态统一为“Buff对象”进行管理。
    2.  **解耦 (Decoupling)**: 技能和装备只负责“施加”Buff，而Buff的具体效果逻辑由Buff系统独立处理。
    3.  **数据驱动 (Data-Driven)**: 所有Buff通过JSON配置定义，支持热更新和编辑器扩展。

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
*   **支持属性**: `maxHp`, `atk`, `def`, `speed`, `critRate`, `hitRate`, `dodgeRate`, `actionPoints` (上限).
*   **计算方式**: `Final = (Base + Flat_Sum) * (1 + Percent_Sum)`

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

### 3.3 补充触发时机 (Missing Triggers Analysis)

为了支持高级机制（如护盾、复活、免伤），需要在引擎中插桩以下关键触发器：

#### 1. 伤害判定阶段 (Damage Resolution)
*   **`onTakeDamage` (受击时/扣血前)**
    *   **时机**: 伤害公式计算完毕（攻击-防御-穿透），但在实际扣除 HP 之前。
    *   **作用**: 实现护盾（优先扣盾）、伤害吸收（转治疗）、无敌（伤害置0）。
    *   **关键机制**: 此事件需要支持修改传入的 damage 数值（Context Modification）。

#### 2. 生命状态阶段 (Health State)
*   **`onDeath` (死亡判定)**
    *   **时机**: 单位 HP 降至 0 或以下时触发。
    *   **作用**: 实现复活（取消死亡，回复 HP）、免死金牌（保留 1 HP）。
    *   **关键机制**: 此事件需要支持 Cancel 标志位，若 Buff 阻止了死亡，引擎应终止后续死亡流程。
*   **`onKill` (击杀判定)**
    *   **时机**: 攻击者成功导致目标死亡后触发。
    *   **作用**: 击杀回血、击杀刷新 CD。

#### 3. 动作前置阶段 (Pre-Action)
*   **`onAttackPre` (攻击前)**
    *   **时机**: 获取基础伤害、计算命中率之前。
    *   **作用**: 必定暴击、必定命中、临时提升攻击力。
*   **`onDefendPre` (防御前)**
    *   **时机**: 被攻击者计算防御减免之前。
    *   **作用**: 必定闪避、完全格挡。

#### 4. 治疗与恢复 (Recovery)
*   **`onHeal` (受到治疗)**
    *   **时机**: 治疗生效前。
    *   **作用**: 禁疗（治疗转伤害或无效）、治疗增效。

#### 5. Buff 生命周期 (Lifecycle)
*   **`onBuffApply`**: Buff 挂载瞬间触发（瞬时伤害）。
*   **`onBuffRemove`**: Buff 移除瞬间触发（亡语炸弹）。

---

## 4. 技能系统衍生Buff列表 (Skill System Derived Buffs)

基于 `skill_design.md` 第三章的技能设计，整理出如下 Buff 对象需求。这些对象将作为 JSON 数据配置的基础。

### 4.1 持续伤害与状态异常类 (DoT & Status Effects)

| Buff ID | 名称 | 类型 | 来源技能/职业 | 效果描述 | 实现逻辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `buff_bleed` | 流血 (Bleed) | Debuff | 剑术 (Duelist) | 每回合受到物理伤害 | `onTurnStart` -> `damage` (flat value) |
| `buff_burn` | 燃烧 (Burn) | Debuff | 元素 (Elementalist) | 每回合受到火焰伤害 | `onTurnStart` -> `damage` (flat value) |
| `buff_poison` | 中毒 (Poison) | Debuff | 游侠 (Ranger), 涂毒 | 每回合受到最大HP百分比伤害 | `onTurnEnd` -> `damage` (percent maxHP) |
| `buff_stun` | 眩晕 (Stun) | Debuff | 重装 (Juggernaut), 道具 | 跳过当前回合 | 引擎状态检查 `canAct = false`, `onTurnStart` -> decrease duration |
| `buff_freeze` | 冻结 (Freeze) | Debuff | 元素 (Elementalist) | 跳过当前回合，可能增加护甲 | 同 Stun, 但附加 `statModifiers: { def: +value }` |
| `buff_slow` | 减速 (Slow) | Debuff | 狙击 (Sniper) | 速度显著降低 | `statModifiers: { speed: -value }` |
| `buff_weakness` | 虚弱 (Weakness) | Debuff | 铁壁 (Guardian), 狙击 | 造成的伤害降低 | `statModifiers: { damageDealtMult: -percent }` |
| `buff_vulnerable` | 易伤 (Vulnerable)| Debuff | 狙击 (Sniper) | 受到的伤害增加 | `statModifiers: { damageTakenMult: +percent }` |
| `buff_silence_limb`| 致残 (Crippled) | Debuff | 狙击 (Sniper) | 特定部位生成的技能不可用 | 引擎特殊逻辑: 禁止特定Tag技能 |

### 4.2 战斗增益类 (Combat Buffs - Offensive)

| Buff ID | 名称 | 类型 | 来源技能/职业 | 效果描述 | 实现逻辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `buff_berserk` | 狂暴 (Berserk) | Buff | 重装 (Juggernaut) | 伤害大幅增加，命中降低 | `statModifiers: { atk: +50%, hitRate: -20% }` |
| `buff_focus` | 专注 (Focus) | Buff | 狙击 (Sniper) | 暴击率与命中率提升 | `statModifiers: { critRate: +20%, hitRate: +10% }` |
| `buff_magic_surge`| 魔力过载 (Surge) | Buff | 元素 (Elementalist) | 下回合魔力伤害提升 | `statModifiers: { magicDmg: +50% }` (Duration: 1) |
| `buff_poison_coat`| 毒素涂层 (Coating)| Buff | 游侠 (Ranger) | 攻击时施加中毒效果 | `onAttackPost` -> `applyBuff: buff_poison` |
| `buff_eagle_eye` | 鹰眼 (Eagle Eye) | Buff | 狙击 (Sniper) | 减少距离惩罚(针对后排) | 引擎特殊逻辑: Ignore Range Penalty |
| `buff_armor_pen` | 破甲意图 (Feint) | Buff | 剑术 (Duelist) | 下次攻击无视部分护甲 | `onAttackPre` -> Modify Target Armor (Temp) |
| `buff_bless` | 祝福 (Bless) | Buff | 神圣 (Cleric) | 命中率与闪避率提升 | `statModifiers: { hitRate: +20%, dodgeRate: +10% }` |

### 4.3 防御与生存类 (Combat Buffs - Defensive)

| Buff ID | 名称 | 类型 | 来源技能/职业 | 效果描述 | 实现逻辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `buff_iron_will` | 钢铁意志 (Iron Will)| Buff | 铁壁 (Guardian) | 护甲/防御提升 | `statModifiers: { def: +value }` |
| `buff_block` | 格挡 (Block) | Buff | 铁壁 (Guardian) | 下次受到的伤害减半 | `onTakeDamage` (Pre) -> Modify Incoming Dmg * 0.5 |
| `buff_pain_sup` | 痛苦压制 (Suppression)| Buff | 神圣 (Cleric) | 受到的伤害减少30% | `statModifiers: { damageTakenMult: -30% }` |
| `buff_evasion` | 残影 (Evasion) | Buff | 游侠 (Ranger) | 闪避率大幅提升 | `statModifiers: { dodgeRate: +60% }` |
| `buff_immortality_hp`| 天使守护 (Immortal HP) | Buff | 神圣 (Cleric) | HP无法降至1以下 | `onTakeDamage` -> ensure HP >= 1 |
| `buff_immortality_armor`| 不朽壁垒 (Immortal Armor) | Buff | 铁壁 (Guardian) | 护甲无法被破坏 | `onTakeDamage` -> ensure Armor >= 1 |
| `buff_shield` | 护盾 (Shield) | Buff | 神圣 (Cleric) | 抵扣伤害 | 特殊类型 `shield`: 拥有 `value` 属性，`onTakeDamage` 优先扣除 |
| `buff_revive` | 光辉复苏 (Revive) | Buff | 神圣 (Cleric) | 复活 | `onDeath` -> Cancel Death, Heal |
| `buff_shield_wall` | 盾墙 (Shield Wall) | Buff | 铁壁 (Guardian) | 护甲共享，AP提升 | 引擎逻辑: Shared Armor Pool, `statModifiers: { maxAp: +3 }` |

### 4.4 特殊机制类 (Special Mechanics)

| Buff ID | 名称 | 类型 | 来源技能/职业 | 效果描述 | 实现逻辑 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `buff_thorns` | 荆棘 (Thorns) | Buff | 铁壁 (Guardian) | 被攻击时反弹伤害 | `onDefendPost` -> `damage` (Attacker) |
| `buff_counter` | 反击姿态 (Counter) | Buff | 铁壁 (Guardian) | 闪避并反击必中 | `statModifiers: { dodge: +100% }, onDefendPost` -> `attack` |
| `buff_lifesteal` | 吸血 (Lifesteal) | Buff | 剑术 (Duelist), 装备 | 攻击造成伤害回复HP | `onAttackPost` -> `heal` (percent of dmg) |
| `buff_ap_regen` | 战术恢复 (AP Regen)| Buff | 游侠 (Ranger), 装备 | 行动力恢复/消耗减少 | `onTurnStart` -> `modifyAP: +1` 或 `statModifiers: { apCost: -1 }` |
| `buff_damage_absorb`| 圣盾 (Aegis) | Buff | 铁壁 (Guardian) | 受到的伤害转化为治疗 | `onTakeDamage` -> `heal` (value=dmg), `cancelDmg: true` |

---

## 5. 装备系统衍生Buff列表 (Item System Derived Buffs)

(补充自 `item_design.md`)

*   **passive_heavy_armor**: 速度 -5 (来源: 锁子甲) -> `statModifiers: { speed: -5 }`
*   **passive_vampire**: 20% 吸血 (来源: 吸血鬼之牙) -> `onAttackPost` -> `heal` (20% dmg)
*   **passive_start_weak**: 首回合攻击力降低 (来源: 角斗士头盔) -> `onTurnStart` (Round 1) -> Apply `debuff_weak`
*   **passive_phoenix**: 每场战斗一次复活 (来源: 凤凰吊坠) -> `lifecycle: { triggerLimit: 1 }`, `onDeath` -> Revive.

## 6. 总结 (Conclusion)

通过上述抽象，我们将复杂的战斗技能逻辑转化为了约 30 个基础 Buff 对象。在开发 `script/engine/BuffSystem.js` 时，应优先实现 `statModifiers` 和 `onTurnStart/End` 的处理逻辑，随后逐步实现 `EventBus` 中的 `onAttack/Defend` 钩子以支持高级 Buff。

## 7. 追踪相关性 (Traceability)

为了确保设计的一致性，本章节列出了所有 Buff 与 技能/装备 的对应关系。

| Buff ID | 关联技能 (skills) | 关联装备 (items) |
| :--- | :--- | :--- |
| `buff_bleed` | 血管切割 (Artery Slice), 千刃风暴 (Thousand Cuts), 血腥收割 (Bloody Harvest - 消耗), 猩红终结 (Crimson Finale - 移除) | - |
| `buff_burn` | 火球术 (Fireball), 燃油投掷 (Oil Slick - 延长) | - |
| `buff_poison` | 毒液涂层 (Poison Coating - 施加者) | - |
| `buff_stun` | 盾牌猛击 (Shield Bash), 蛮牛头槌 (Headbutt), 大地震击 (Earthquake) | - |
| `buff_freeze` | 冰锥术 (Ice Lance), 暴风雪 (Blizzard) | - |
| `buff_slow` | 震荡波 (Shockwave), 膝盖射击 (Knee Shot), 冰霜新星 (Frost Nova - 类似) | `passive_heavy_armor` (类似效果) |
| `debuff_weak` | - | `helm_gladiator` (类似效果) |
| `buff_weakness` | 挑衅 (Taunt), 远程拆解 (Disarm) | - |
| `buff_vulnerable` | 弱点标记 (Mark Target), 感电 (Elementalist feature) | - |
| `buff_silence_limb`| 致残射击 (Crippling Shot) | - |
| `buff_berserk` | 狂暴姿态 (Berserk) | - |
| `buff_focus` | 稳固瞄准 (Steady Aim) | - |
| `buff_magic_surge` | 过载 (Overload) | - |
| `buff_poison_coat` | 毒液涂层 (Poison Coating) | - |
| `buff_eagle_eye` | 鹰眼 (Eagle Eye) | - |
| `buff_armor_pen` | 佯攻 (Feint) | - |
| `buff_bless` | 祝福 (Bless) | - |
| `buff_iron_will` | 钢铁意志 (Iron Will) | - |
| `buff_block` | 格挡 (Block) | - |
| `buff_pain_sup` | 痛苦压制 (Pain Suppression) | - |
| `buff_evasion` | 战术翻滚 (Tactical Roll), 残影 (Afterimage) | - |
| `buff_immortality_hp` | 天使守护 (Guardian Angel) | - |
| `buff_immortality_armor` | 不朽壁垒 (Immortal Bastion) | - |
| `buff_shield` | 信仰之盾 (Shield of Faith) | - |
| `buff_revive` | 光辉复苏 (Radiant Revitalize) | `acc_pendant_phoenix` |
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

## 8. 实现架构设计 (Implementation Architecture)

本章节描述如何实现一个低耦合、数据驱动的 Buff 系统，使其满足上述 JSON 配置需求。

### 8.1 架构核心 (Core Architecture)

整个系统由四个核心部分组成：
1.  **BuffManager**: 挂载在 Character 上的数据容器，负责 Buff 的增删改查和生命周期 Tick。
2.  **BuffSystem (Processor)**: 独立的单例系统，订阅 `EventBus`，是实际执行 Buff 逻辑的大脑。
3.  **ActionLibrary (Registry)**: 原子操作库，将 JSON 中的字符串 action 映射为具体的 JS 函数。
4.  **ConditionLibrary (Registry)**: 条件判断库，用于检查 effects 中的 triggers 是否满足执行条件。

### 8.2 数据流向 (Data Flow)

1.  **事件触发**: 战斗系统 (CombatSystem) 发布事件 (e.g. `EVENT.ATTACK_HIT`).
2.  **系统响应**: `BuffSystem` 监听到事件，遍历所有参与者的 `BuffManager`。
3.  **匹配 Trigger**: 对于每个 Buff，检查其 `effects` 列表中的 `trigger` 字段是否匹配当前事件名。
4.  **执行逻辑**: 如果匹配，调用 `ActionLibrary` 执行对应的原子函数。

### 8.3 动作库设计 (ActionLibrary - The "Code in JSON")

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

### 8.3.1 案例分析：配置“攻击吸血” (Example: Configuring Life Steal)

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

### 8.3.2 案例分析：配置“破甲意图” (Example: Configuring Armor Penetration)

目标是实现 **“下次攻击无视目标 30% 护甲，生效一次后消失”**。这是一个典型的 **耗散型 (Consumable) Buff**，需要组合两个 Effect 来实现。

**1. JSON 配置**:
```json
{
  "id": "buff_armor_pen",
  "effects": [
    {
      // 步骤 A: 临时削弱目标护甲 (仅本次计算有效)
      "trigger": "onAttackPre",
      "action": "MODIFY_STAT_TEMP", // 这是一个假设的原子操作，修改本次计算上下文中的属性
      "target": "target",           // 作用于防御者
      "params": {
        "stat": "def",
        "value": "-0.3",            // 减少 30%
        "type": "percent_current"   // 基于当前值乘算
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
2.  **执行修正**: `ActionLibrary.MODIFY_STAT_TEMP` 介入，读取目标的 `def` (例如 100)，将其在**本次计算上下文**中临时标记为 `70` (100 * (1-0.3))。注意这不会永久修改敌人的面板属性，只影响当次伤害公式。
3.  **计算伤害**: 战斗系统使用修正后的 `70` 进行伤害计算。
4.  **后置钩子 (`onAttackPost`)**: 伤害结算完毕。
5.  **自我消耗**: 触发 `REMOVE_SELF`，Buff 从列表中移除，确保效果只生效一次。

### 8.4 参数体系深度解析 (Deep Dive into Parameters)

针对 `params` 中的核心字段 `stat`, `value`, `type`，本设计明确了哪些是**可直接扩展的**（无需改代码），哪些是**枚举类型**（需引擎支持）。

#### 8.4.1 stat (属性键名) - 可扩展 (Extensible)
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

#### 8.4.2 type (计算策略) - 枚举值 (Enumeration)
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

#### 8.4.3 value (数值载荷) - 高度动态 (Dynamic)
*   **定义**: 实际作用的数值大小。
*   **类型**: **多态 (Number | String Expression)**。
*   **扩展策略**:
    *   通过支持解析字符串公式，实现无限的扩展能力。
*   **数据形式**:
    *   **Number**: 静态常量 (e.g., `100`, `0.5`).
    *   **String**: 动态公式 (e.g., `"{source.atk} * 0.5 + 10"`).
*   **引擎实现**:
    *   利用 `Context` 上下文对象，解析字符串中的占位符（如 `{source.atk}`），替换为实际运行时数值后计算。

### 8.5 低耦合优势 (Decoupling Benefits)

*   **无需修改战斗代码**: 新增一个"攻击时吸血"的 Buff，只需要在 JSON 里配置 `trigger: onAttackPost`, `action: HEAL`, `target: self`。不需要去改动 CombatSystem 的攻击函数。
*   **统一入口**: 所有修改属性、造成伤害的来源都被统一管理，方便通过 `console.log` 追踪战斗日志。
*   **易于扩展**: 如果需要新机制（例如“偷取金币”），只需在 `ActionLibrary` 注册 `STEAL_GOLD` 函数，无需改动整个架构。

## 9. 核心引擎集成与问题分析 (Core Integration & Analysis)

针对易伤 (Vulnerable) 和 破甲 (Armor Pen) 等高级机制在简易模拟器中失效的问题，本章节明确了核心引擎必须具备的架构模块。

### 9.1 测试失效原因深度解析 (Root Cause Analysis)

在 `buff_editor_v2.html` 的模拟测试中，发现部分技能效果未生效，其根源在于**模拟代码过于线性**，缺乏“中间件”机制：

1.  **易伤失效 (Vulnerable Failure)**:
    *   **现象**: 伤害数值未增加。
    *   **原因**: 易伤通常通过 `statModifiers: { damageTakenMult: 0.2 }` (受伤增加20%) 实现。模拟代码直接执行 `hp -= damage`，完全忽略了对 `damageTakenMult` 属性的检查和乘算。
    *   **缺失**: 缺少一个**统一属性计算层 (Stat Calculator)** 来聚合所有 Buff 的被动属性修正。

2.  **破甲失效 (Armor Pen Failure)**:
    *   **现象**: 护甲减免数值未变。
    *   **原因**: 破甲依赖 `onAttackPre` 时机触发，目的是在“伤害计算公式执行前”临时修改参数。模拟代码中，事件触发 (`onAttackPre`) 和 伤害计算 (`damage - armor`) 是分离的，事件触发仅仅打印了日志，并没有将修改后的参数传递给伤害计算步骤。
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
        armorPenetration: 0,      // 破甲 (初值0)
        damageMultiplier: 1.0,    // 伤害乘区 (初值1.0)
        resultLog: []
    };

    // 2. 触发阶段: 攻击前 (Attack Pre)
    // BuffSystem 监听到此事件，若 attacker 有“破甲意图”Buff：
    // -> 触发 ACTION: "MODIFY_CONTEXT" -> context.armorPenetration = 0.3
    await EventBus.emit('BATTLE_ATTACK_PRE', context);

    // 3. 计算阶段: 动态属性获取
    // 获取目标防御力 (这里会计算目标的 被动Buff 修正，如“钢铁意志”)
    let targetDef = StatCalculator.get(target, 'def'); 

    // 应用上下文中的破甲修正
    let effectiveDef = targetDef * (1 - context.armorPenetration);

    // 4. 计算阶段: 基础伤害
    let finalDamage = Math.max(1, context.rawDamage - effectiveDef);

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

