# 敌人行为设计文档 (Enemy Behavior Design)

## 1. 文档目标

本文档用于定义敌人在战斗中的**目标选择、技能选择、部位攻击、行为模式与行为数据结构**。

本文档只讨论敌人“如何行动”，不讨论敌人的种族、职业、模板数值与静态配置结构；这些内容由：

- `design/enemy_design.md`

负责。

---

## 2. 设计结论

### 2.1 当前问题判断

当前敌人攻击行为不应视为完成态，主要问题有：

1. 敌人技能选择过于简化，接近“取第一个技能直接执行”。
2. 敌人攻击目标部位缺少独立规则。
3. 普通敌人缺少“随机攻击一个玩家部位”的标准行为层。
4. 当前实现更像临时逻辑，而不是稳定的敌人行为系统。

### 2.2 推荐方向

普通敌人的默认攻击行为应为：

- 优先使用 `DMG_ARMOR` 类型的普通攻击技能
- 随机选择玩家一个有效部位
- 对该部位发起普通攻击

这意味着：

- 普通敌人的默认攻击不应是 `DMG_HP`
- 普通敌人的默认攻击应以“随机打护甲部位”为核心模型

---

## 3. 敌人行为的核心原则

### 3.1 普通攻击默认走部位护甲系统

普通敌人的基础攻击应优先建模为：

- `DMG_ARMOR`
- `SCOPE_PART`

从而与当前玩家战斗规则保持一致。

### 3.2 敌人必须显式选择部位

若技能目标为 `SCOPE_PART`，敌人在执行前必须显式解析出：

- `targetId`
- `bodyPart`

不允许依赖隐式默认部位。

### 3.3 技能层与行为层解耦

- 技能负责定义“能做什么”
- 行为负责定义“何时做、对谁做、打哪里”

### 3.4 不做隐式兜底

若：

- 敌人没有可用于其行为模式的技能
- `SCOPE_PART` 技能无法解析目标部位
- 行为配置缺失关键字段

则应直接报错，而不是静默回退到任意技能或默认 chest。

---

## 4. 行为模式枚举

## 4.1 `random_part_attacker`

适用于：

- 普通小怪
- 杂兵
- 基础近战敌人

行为特点：

- 从普通攻击技能池中选择技能
- 从玩家有效部位中等概率随机选择 1 个部位
- 发动普通攻击

这是普通敌人的**默认推荐行为模型**。

## 4.2 `armor_breaker`

适用于：

- 重击敌人
- 破甲敌人
- 针对护甲体系设计的敌人

行为特点：

- 优先选择玩家当前仍有护甲的部位
- 优先找更容易打穿的部位
- 若所有部位护甲都为 0，再退化为普通攻击逻辑

## 4.3 `finisher`

适用于：

- 刺客
- 收割者
- 高爆发敌人

行为特点：

- 若玩家存在 `current = 0` 的部位，优先攻击这些部位
- 若玩家 HP 低于阈值，可优先选择终结技能
- 否则退回普通攻击逻辑

## 4.4 `defensive`

适用于：

- 盾卫
- 防御型敌人
- 坦克型敌人

行为特点：

- 当自身关键部位护甲过低时，优先使用防御/补甲技能
- 否则使用普通攻击

## 4.5 `tactical`

适用于：

- 精英怪
- Boss
- 多技能组合敌人

行为特点：

按优先级判断：

1. 是否需要自保
2. 是否能收割
3. 是否需要施加状态
4. 否则使用普通攻击

---

## 5. 目标部位选择规则

## 5.1 玩家有效部位集合

敌人选择玩家部位时，只能从以下集合中选：

- `head`
- `chest`
- `abdomen`
- `arm`
- `leg`

且该部位必须满足：

- `max > 0`

## 5.2 `random_part_attacker` 的规则

1. 收集所有 `max > 0` 的玩家部位
2. 从中随机选择 1 个
3. 作为当前技能的 `bodyPart`

默认使用**等概率随机**。

## 5.3 可选扩展：加权随机

未来若需要更细化，可扩展权重，例如：

- `head`: 1
- `chest`: 3
- `abdomen`: 2
- `arm`: 2
- `leg`: 2

但 MVP 阶段不建议启用，避免过度设计。

## 5.4 固定部位技能

若技能本身已固定目标部位：

- 行为系统不再额外随机
- 直接使用技能所声明的部位

---

## 6. 技能选择规则

## 6.1 技能分类建议

建议在行为层将敌人技能分组为：

- `basicAttack`
- `breaker`
- `finisher`
- `defense`
- `utility`

## 6.2 普通敌人的选择规则

对于 `random_part_attacker`：

1. 从 `basicAttack` 技能池中选择技能
2. 若多个技能都可用：
   - 可随机选择
   - 或按简单固定顺序选择
3. 若无可用普通攻击技能：
   - 直接报错

## 6.3 防御型敌人的规则

对于 `defensive`：

1. 若自身关键部位护甲低于阈值，优先 `defense`
2. 否则 `basicAttack`
3. 若都缺失，报错

## 6.4 收割型敌人的规则

对于 `finisher`：

1. 若玩家存在护甲为 0 的部位，优先使用 `finisher`
2. 否则使用 `basicAttack`
3. 若都缺失，报错

---

## 7. 行为数据结构

建议在敌人模板中增加：

```json
{
  "ai": {
    "behaviorId": "random_part_attacker",
    "skillGroups": {
      "basicAttack": ["skill_heavy_swing"],
      "breaker": [],
      "defense": [],
      "finisher": [],
      "utility": []
    }
  }
}
```

### 字段语义

- `ai.behaviorId`
  - 行为模式 ID
- `ai.skillGroups.basicAttack`
  - 普通攻击技能池
- `ai.skillGroups.breaker`
  - 破甲技能池
- `ai.skillGroups.defense`
  - 防御技能池
- `ai.skillGroups.finisher`
  - 收割技能池
- `ai.skillGroups.utility`
  - 状态或功能技能池

---

## 8. MVP 实施建议

### 8.1 第一阶段

建议先只实现：

- `random_part_attacker`
- 从 `basicAttack` 中选择技能
- 对玩家有效部位做等概率随机选择

### 8.2 第一阶段不做

暂不实现：

- Boss 行为树
- 多阶段策略切换
- 权重随机表
- 条件组合器
- 自适应博弈 AI

### 8.3 第一阶段预期行为

普通敌人应表现为：

- 拥有普通攻击技能
- 每回合随机攻击玩家某个部位
- 先伤护甲，再将溢出结算到 HP

---

## 9. 示例

### 9.1 哥布林战士

```json
{
  "id": "goblin_01",
  "ai": {
    "behaviorId": "random_part_attacker",
    "skillGroups": {
      "basicAttack": ["skill_heavy_swing"],
      "breaker": [],
      "defense": [],
      "finisher": [],
      "utility": []
    }
  }
}
```

行为表现：

- 每回合从 `basicAttack` 中选 `skill_heavy_swing`
- 在玩家有效部位中随机选 1 个
- 对该部位造成 `DMG_ARMOR`

### 9.2 兽人破甲者

```json
{
  "id": "orc_breaker_01",
  "ai": {
    "behaviorId": "armor_breaker",
    "skillGroups": {
      "basicAttack": ["skill_heavy_swing"],
      "breaker": ["skill_skull_cracker"],
      "defense": [],
      "finisher": [],
      "utility": []
    }
  }
}
```

---

## 10. 结论

敌人行为应独立于敌人模板文档维护。

推荐结论：

1. 普通敌人的默认行为模型为 `random_part_attacker`
2. 普通敌人的默认攻击应随机选择玩家有效部位
3. 普通敌人的默认攻击技能应优先走 `DMG_ARMOR`
4. 行为层采用 `behaviorId + skillGroups` 结构化建模

本文件作为后续实现敌人 AI 的正式设计依据。
