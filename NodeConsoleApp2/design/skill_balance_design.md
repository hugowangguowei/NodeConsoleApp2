# 技能平衡设计文档（`skill_balance_design.md`）

> 目标：解决“如何制作出一套合理技能”的方法论问题。
>
> 本文不直接给出所有技能清单，而是提供：设计原则、可量化的平衡维度、标签体系（可作为 `skills.json` / skill editor 的元数据字段），以及落地流程。

---

## 1. 技能的设计原则

### 1.1 与核心玩法一致

本项目战斗的核心约束（决定了技能设计的“地形”）：

1. **回合制 + 行动点（AP）预算**：玩家每回合能做的事情有限，技能之间天然存在“机会成本”。
2. **1v1 对战**：技能不需要处理复杂的群体单位生态；所谓 AOE 更接近“对一个目标的多个部位生效”。
3. **部位护甲（分散）+ HP（整体）**：护甲先承伤，护甲破坏后才扣 HP，技能在“破甲/穿透/补甲/恢复”上可做出明确策略分化。
4. **速度决定行动顺序**：技能不只是“做什么”，还包含“什么时候做”，速度是技能强度的重要维度。
5. **技能序列（组合/连携）**：单个技能强不强并不是唯一维度，组合之后是否过强/过弱更关键。

设计原则：

- **每个技能都必须回答一个战术问题**：
  - “我想更快出手？”
  - “我需要破某个部位护甲？”
  - “我需要保命/续航？”
  - “我需要在下回合爆发？”
- **让玩家在多种有效策略间做选择**（可行策略 > 最优解）。
- **尽量避免单技能无脑通吃**：如果一个技能在多数局面都是最优，它就需要被削弱，或增加条件/成本。

### 1.2 可读性优先于复杂度

- 技能描述必须能在 UI 上被解释清楚：伤害、buff、持续时间、目标、部位、触发条件。
- 技能效果尽量由 **可复用的 buff/effect 组件**组合而成（避免每个技能写定制逻辑）。

### 1.3 平衡目标：让“强度差”来自代价与条件

- 强力效果不一定不能存在，但必须付出代价：
  - 更高 AP
  - 更慢的 speed
  - 更严格的目标限制/前置条件
  - 更长的冷却/每回合次数限制（当前设定：同技能每回合只能用一次，可视为“硬冷却”）

### 1.4 强度要可度量、可回归

- 每个技能应当能映射到一套“可比较”的数值维度（见第2章），否则很难系统调参。

---

## 2. 技能的作用属性（Effects & Stats）

> 目的：建立一个“技能能改变什么”的统一词表，供设计与实现共用。

### 2.1 基础作用属性（建议引擎层支持）

1. **伤害类（Damage）**
   - `damage.hp`: 对整体 HP 造成伤害（通常通过护甲系统折算后落到 HP）
   - `damage.armor`: 对某部位护甲造成伤害（破甲/削甲）
   - `damage.ignoreArmor`: 护甲忽略/穿透（按比例或按固定值）

2. **防护类（Defense / Armor）**
   - `armor.add`: 给指定部位增加护甲值
   - `armor.repair`: 修复护甲（从 0 恢复到一定值，或提高当前值）
   - `armor.max`: 增加护甲上限（可选，若系统存在上限）

3. **生命类（HP / Sustain）**
   - `hp.heal`: 回复 HP
   - `hp.max`: 增加最大 HP（通常是长期 buff）

4. **行动类（Action / Tempo）**
   - `ap.cost`: 技能自身 AP 成本（配置项）
   - `ap.gain`: 返还/获得 AP（例如“专注”类技能）
   - `speed.delta`: 改变行动速度（加速/减速）
   - `turn.extra`: 额外行动/插队（若实现难度高，可作为高阶效果受限使用）

5. **状态类（Buff / Debuff）**
   - `buff.apply`: 给目标施加 buff/debuff（通过 `buffRefs`）
   - `buff.remove`: 驱散/净化（通过 `buffRefs.remove`）

6. **机制类（Mechanics / Rule-Breakers）**
   > 机制类指“跳出/规避基础规则”的效果。它们通常不是简单的数值加减，而是改变结算路径或行动规则。
   > 由于容易破坏系统平衡，建议作为高稀有度/高代价/强条件的能力，并且尽量通过 buff/trigger 进行显式表达与可反制。

   - `mechanic.bypassArmorToHp`: 直接绕过护甲，结算为对 HP 的伤害（或将一部分伤害按比例转为直伤 HP）
   - `mechanic.ignoreArmorReduction`: 忽略护甲的减伤计算（与“穿透”不同：穿透可能只是降低护甲值，此项是改变减伤规则）
   - `mechanic.skipTurn`: 使目标跳过其下一次行动/回合（硬控类，风险极高）
   - `mechanic.extraAction`: 获得一次额外行动/插队（改变行动经济，风险极高）
   - `mechanic.preventAction`: 禁止使用某类技能/禁止攻击/禁止防御（可视为软控，通常需要可驱散）
   - `mechanic.immunity`: 对某类效果免疫（例如免疫破甲/免疫控制），通常为短时 buff

### 2.2 作用目标维度（Targeting）

- 目标阵营：`SELF` / `ENEMY`
- 目标粒度：
  - `SINGLE_PART`：指定部位
  - `ALL_PARTS`：目标全部部位（1v1 下的“AOE”等价物）
  - `RANDOM_PART`：随机部位
  - `SELF_PARTS`：对自身多个部位生效

### 2.3 强度衡量的推荐维度（用于平衡）

为了比较不同技能强度，建议为每个技能建立一个“评估面板”（无需写进引擎，但建议写进设计/调参表）：

- **AP 效率**：单位 AP 能带来多少净收益（伤害/护甲/治疗/控制）
- **时序价值**：速度带来的“先手优势”折算
- **确定性**：是否有随机性（命中率/触发概率/随机部位）
- **可反制性**：是否能被驱散、是否需要前置、是否容易被针对
- **成长性**：随着回合数/叠层是否指数变强（需要重点防止滚雪球）

---

## 3. 技能的分类标签（Skill Tags / Taxonomy）

> 目的：让每个技能都能被一致地描述、检索、统计与平衡。

本章标签建议作为技能的元数据字段（例如 `tags: []`），但即便暂时不写入数据文件，也应在设计表中维护。

### 3.1 按作用属性维度（What it changes）

- `DMG_HP`：以 HP 伤害为主
- `DMG_ARMOR`：以护甲伤害/破甲为主
- `PIERCE`：穿透/忽略护甲
- `HEAL`：治疗
- `ARMOR_ADD`：加护甲/补护甲
- `AP_GAIN`：获得/返还 AP
- `SPEED`：加速/减速/插队（若有）
- `BUFF_APPLY`：施加 buff
- `BUFF_REMOVE`：移除 buff

### 3.2 按数值类型（Absolute vs Relative）

- `ABS`：修改绝对值（+10 HP、-5 Armor）
- `PCT_MAX`：按最大值比例（最大 HP 的 10%）
- `PCT_CURRENT`：按当前值比例（当前护甲的 30%）
- `SCALING`：按来源属性缩放（例如 atk * 1.2；若系统支持）

### 3.3 按生效时间点（Immediate vs Delayed）

- `INSTANT`：即时生效（释放时立刻结算）
- `DELAYED`：延时生效（下回合/若干回合后触发）
- `ON_EVENT`：事件触发（如受击时、回合开始/结束时）

> 注：`DELAYED` 与 `ON_EVENT` 通常通过 buff/trigger 来实现。

### 3.4 按持续周期（Duration / Lifetime）

- `ONE_SHOT`：单次生效（典型伤害技能）
- `ONE_TURN`：单回合持续（例如“本回合 +护甲”）
- `MULTI_TURN`：多回合持续（例如 3 回合中毒）
- `BATTLE`：单战斗持续（直到战斗结束）
- `PERMANENT`：永久持续（Roguelike 成长向，通常来自装备/天赋）

### 3.5 按条件（Conditionality）

- `UNCONDITIONAL`：无条件
- `CONDITIONAL`：有条件（需要额外描述条件）

条件的推荐细分（可选）：
- `COND_TARGET_ARMOR_BROKEN`：目标某部位护甲为 0
- `COND_SELF_HP_LT_X`：自身 HP 低于阈值
- `COND_STACK_GE_X`：某 buff 层数达到阈值
- `COND_PREV_SKILL_USED`：依赖上一技能/连携

### 3.6 部位维度（Part / Zone）

护甲是“按部位”的关键设计，因此建议对与部位强相关的技能打标签：

- `PART_TARGETED`：需要指定部位
- `PART_ALL`：对全部部位生效（1v1 下的 AOE）
- `PART_RANDOM`：随机部位
- `PART_SELF`：对自身部位生效（修甲/加护甲）

### 3.7 风格与流派维度（Build / Archetype）

用于“设计一套技能体系”的全局组织：

- 流派（示例）：`ARCH_HEAVY`（重装）、`ARCH_WALL`（铁壁）、`ARCH_SWORD`（剑术）、`ARCH_RANGER`（游侠）、`ARCH_SNIPER`（狙击）、`ARCH_ELEMENT`（元素）、`ARCH_HOLY`（神圣）
- 距离（可选）：`MELEE` / `RANGED` / `MAGIC`

---

## 4. 技能标签体系（可落地的 Schema 方案）

### 4.1 标签字段建议

建议在 `skills.json` 的每个技能对象中增加（或由编辑器额外维护）以下字段：

- `tags: string[]`：基础标签（枚举集合，便于过滤与统计）
- `tagMeta?: object`：标签的参数化信息（用于条件类、部位类等）

示例：

```json
{
  "id": "skill_crush_armor",
  "name": "破甲打击",
  "cost": 3,
  "speed": -1,
  "targetType": "SINGLE_PART",
  "requiredPart": "chest",
  "tags": ["DMG_ARMOR", "ABS", "INSTANT", "ONE_SHOT", "UNCONDITIONAL", "PART_TARGETED", "MELEE", "ARCH_SWORD"],
  "tagMeta": {
    "parts": ["chest"],
    "notes": "专门对胸甲造成高额护甲伤害"
  }
}
```

### 4.2 标签枚举设计建议（稳定枚举 vs 可扩展）

- **稳定枚举**（建议写死到文档/编辑器下拉）：
  - 作用属性类（`DMG_HP` 等）
  - 数值类型类（`ABS`/`PCT_MAX`/`PCT_CURRENT`/`SCALING`）
  - 生效时间点（`INSTANT`/`DELAYED`/`ON_EVENT`）
  - 持续周期（`ONE_SHOT`/`ONE_TURN`/`MULTI_TURN`/`BATTLE`/`PERMANENT`）
  - 部位维度（`PART_*`）
  - 距离/流派（`MELEE`/`RANGED`/`MAGIC` + `ARCH_*`）

- **可扩展标签**（允许自由新增，但要有约束与校验）：
  - 条件类（`COND_*`）
  - 玩法类（例如 `COMBO`/`FINISHER`/`SETUP`）

> 原则：枚举越稳定，越适合用于 UI 的过滤与统计；扩展标签用于快速迭代，但应逐步“收敛入枚举”。

### 4.3 设计流程：用标签驱动技能产出

推荐“先标签、后数值”的设计流程：

1. 先确定技能的 **战术定位**：输出/破甲/续航/节奏/控制/辅助。
2. 选择标签组合（至少覆盖）：
   - 作用属性（What）
   - 数值类型（How）
   - 时间点（When）
   - 周期（How long）
   - 条件（If）
   - 部位（Where）
3. 再确定 AP 与 speed（成本维度）。
4. 最后确定具体数值（伤害/护甲/持续时间/概率）。
5. 通过“对照组”测试：
   - 同 AP、同 speed 的技能应当强度接近，但玩法不同
   - 更强效果必须对应更高代价或更苛刻条件

---

## 5. 平衡落地建议（不写代码也能执行）

### 5.1 建立技能对照表（Design Sheet）

建议维护一个表格（可以是 Markdown 表格或 Excel），列包括：

- `id` / `name` / `rarity` / `arch` / `tags`
- `AP cost` / `speed`
- `targetType` / `requiredPart`
- `buffRefs` 摘要（施加了哪些 buff）
- 预期定位（输出/破甲/续航/节奏）
- 评估指标（AP 效率、确定性、反制性、组合风险）

### 5.2 重点关注的“失衡风险”清单

- **滚雪球**：叠层 buff 导致指数成长（例如“每层提高伤害并更容易叠层”）
- **先手锁死**：速度+控制让对方几乎无法行动
- **低成本破甲**：便宜且稳定的破甲使护甲体系失去意义
- **无代价续航**：治疗/上护甲过于便宜导致战斗无限拖长

### 5.3 与编辑器的结合点（建议）

- 在 skill editor 的属性面板中增加 `tags`（多选）与 `tagMeta`（只读/弱编辑）。
- 允许按 `tags` 过滤技能库、以及导出时进行标签完整性校验（至少每类选一个）。

---

## 6. 附录：最小标签集合（MVP）

若要快速落地，建议先实现如下 MVP 标签：

- 作用属性：`DMG_HP` / `DMG_ARMOR` / `HEAL` / `ARMOR_ADD` / `BUFF_APPLY` / `BUFF_REMOVE`
- 数值类型：`ABS` / `PCT_MAX` / `PCT_CURRENT`
- 时间点：`INSTANT` / `ON_EVENT`
- 周期：`ONE_SHOT` / `ONE_TURN` / `MULTI_TURN`
- 部位：`PART_TARGETED` / `PART_ALL` / `PART_RANDOM`
- 流派：`ARCH_*`（至少一个）
