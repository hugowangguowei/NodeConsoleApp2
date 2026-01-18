# Buff Editor v3 测试日志（规范版）

> 本文档用于记录 `test/buff_editor_v3.html` 的功能验证结果，作为后续回归测试/缺陷追踪依据。

测试时间：2026-01-18-14:20 

## 1. 测试信息

- 测试工具：`test/buff_editor_v3.html`
- 测试数据：
  - Buff：`assets/data/buffs.json`
  - Enemy：`assets/data/enemies.json`
  - Player：`assets/data/player.json`
- 测试重点：

## 2. 统一问题（General Issues）
01 模拟调试区-Enemies数据，执行reload后，无法添加buff了。
02 TryAction 按钮按下没有反应，在日志区域没有响应，浏览器也没有相应日志。
03 对于已经通过测试的buff，我希望能够做一个标记，记录在buffs.json里，方便下次回归测试。也就是说当前版本的buffs.json还要记录被测信息。

### 2.x 原因分析（Root Cause Analysis）

> 说明：此处是基于当前架构/代码习惯给出的“高概率原因清单”，用于指导定位与回归用例补强；在修复落地后应把“现象 -> 根因 -> 修复点(文件/函数)”补全成唯一结论。

#### GI-01 Enemies reload 后无法添加 buff

- **现象复述**：右侧模拟调试区重新加载 `enemies.json`（或 reload 相关数据）后，点击“施加 Buff / Apply Buff”不再生效。
- **高概率原因**（按优先级）：
  1) **reload 后运行时对象被重建，但 UI 仍引用旧的 `BuffManager`/actor**：例如重新创建了 enemy actor，但按钮点击仍在对旧实例调用 `add`。
  2) **`BuffSystem.registerManager(...)` 未对新建的 `BuffManager` 重新注册**：导致事件总线虽在 emit，但新的 manager 没被系统监听。
  3) **`BuffRegistry`/definitions 被替换，但 `BuffManager` 仍持有旧 registry**：`add(buffId)` 时 resolve 失败或拿到空定义。
  4) **EventBus 被重建，导致日志订阅/系统订阅丢失**：reload 后新的 EventBus 上没有挂载 `BuffSystem` 或日志监听。
- **定位建议**：
  - 在 reload 后打印并比对：`enemy.id`、`enemy.buffs === currentSelectedEnemy.buffs`、`buffSystem.managers.size`（或等价结构）、`registry` 实例引用。
  - 在 `BuffManager.add` 内部/外部加一条临时 log，确认按钮确实触发到调用点并拿到正确 `buffId`。

- **已确认根因（v3 已修复）**：
  1) `buff_editor_v3.html` 的 `applyEnemyTemplate()` 会重建 `simEnemy`，但旧实现没有为新 enemy 实例重新创建 `BuffManager`，导致 `simEnemy.buffs` 为空或未注册。
  2) `initRuntime()` 可被多次调用，但未 stop/unsubscribe，导致旧 `BuffSystem`/旧 `BuffManager` 累积，最终表现为“reload 后按钮看起来失效/日志不可信”。
- **修复点（文件/函数）**：
  - `test/buff_editor_v3.html`：`applyEnemyTemplate()`：重建 enemy 后立即 `new BuffManager(...)` 并 `buffSystem.registerManager(...)`。
  - `test/buff_editor_v3.html`：`initRuntime()`：stop 旧系统、释放旧日志订阅、使用独立 `eventBus` 防止全局订阅叠加。

#### GI-02 TryAction 无响应

- **现象复述**：点击 `[Try Action]`/`[Enemy Try Action]`/`[Player Try Action]` 后，日志区无输出，浏览器控制台也无。
- **高概率原因**（按优先级）：
  1) **按钮未正确绑定事件**：DOM id/selector 不一致、元素被重绘后监听丢失、或函数未暴露到全局作用域。
  2) **事件名未对齐引擎订阅**：例如 UI emit `BATTLE_ACTION_INTENT`，但 `BuffSystem` 只订阅 `TURN_*` / `BATTLE_*ATTACK*` / `BATTLE_*TAKE_DAMAGE*`。
  3) **emit payload 缺关键字段**：`actor`/`actionType` 为空导致逻辑短路。
  4) **日志面板只监听特定 event(channel)**：TryAction 发出的事件未被日志订阅捕获。
- **定位建议**：
  - 在按钮 click handler 的第一行直接 `console.log('[UI] TryAction clicked', ...)`，先确认是否触发。
  - 在 `EventBus.emit` 增加临时 hook：打印 eventName 与 payload 概要，确认事件确实被 emit。

- **已确认根因（v3 已修复）**：
  1) `test/buff_editor_v3.html` 中 UI 绑定了 `@click="tryAction"`，但旧版本 `methods` 内缺失 `tryAction()`，导致点击直接抛错并且无任何日志输出。
  2) 事件总线混用：UI emit 若发往与 `BuffSystem` 不同的 EventBus，会表现为“点击有日志但 buff 不生效/或点了没反应”。
- **修复点（文件/函数）**：
  - `test/buff_editor_v3.html`：新增 `tryAction()`：构造 `{ actor, actionType, target, bodyPart, cancelled, cancelReason }` 并 `emit('BATTLE_ACTION_PRE', context)`，将 `skipTurn` 映射为 `cancelled=true` 并输出日志。
  - `test/buff_editor_v3.html`：`initRuntime()`：统一使用局部 `eventBus`，并保证 tryAction/castAttack 都 emit 到同一条总线。

#### GI-03 buffs.json 需要记录“已测信息”

- **需求复述**：希望把某个 buff 在某次回归中的 PASS/FAIL、备注等信息写回数据文件，方便下次回归。
- **约束/风险**：
  1) **生产数据与测试元数据耦合**：引擎运行时加载 `buffs.json` 时如果严格校验 schema，新增字段可能导致解析失败。
  2) **aliasOf 复用导致标记语义不清**：标记应落在“源 buff”还是“alias buff”上。
  3) **多人协作/PR**：频繁改动 `buffs.json` 会产生大量无意义 diff。
- **建议方向**（二选一，回归方案需覆盖）：
  - A) 在 `buffs.json` 内增加 `__test`/`meta` 之类字段（引擎加载需要忽略未知字段）。
  - B) 新增单独的测试元数据文件（推荐）：例如 `assets/data/buffs.testmeta.json`，由编辑器读取/写入，避免污染主数据。

## 3. 具体 Buff 测试记录（Per-Buff）

> 说明：以下条目以“现象”为准，buffId 以 `buffs.json` 内实际 id 为准。
01 中毒，测试通过；
02 晕眩，没有进行测试；
03.力量增强， 测试没有通过，实际效果没有增加力量属性；
04.护甲增强，测试没有通过，护盾应该是抵挡一次伤害，跟数值没有关系；
05.流血，测试通过；
06.燃烧，我认为“燃烧”与“流血”效果非常类似，请分析燃烧buff的必要性；
07.冻结，buff对象是效果的原子对象，不应该包含多个效果，复合效果是技能来完成的。所以将冻结降低为减速，如果已经有减速，则移除。
08.减速，目前没有直接测试方法。
09.虚弱，测试失败，并没有降低力量属性；
10.易伤，测试失败，并没有增加受到的伤害；
11.部位封印，暂时无法进行测试；
12.狂暴，不属于原子对象，可以移除；
13.专注，当前并没有命中率的概念，建议移除命中率相关的逻辑。
14.魔力涌动，魔法伤害、物理伤害的概念没有明确，建议移除；
15.剧毒涂层，与中毒效果重复，建议移除；
16.鹰眼，无法进行测试；
17.破甲，为与易伤做区分，建议明确效果模式，即提高护甲脆弱系数；不需要两个效果组合了；
17.祝福，因为没有命中率，闪避率的概念（只有必中，全闪两个概念），建议移除，替换为闪避buff；
18.钢铁意志，尚未明确增加防御的概念是什么；
19.格挡，建议改名为减伤，而且经测试当前buff并未生效。
20.痛苦压制，与减伤重复，建议移除；
21.残影，没有闪避率概念，建议替换为n层全闪避；
22.天使守护，感觉实现效果比较麻烦，进行分析可行性；
23.绝对防御，尚未实现；
24.神愿复苏，尚未实现；
25.盾墙，建议移除；
26.荆棘，测试发现没有效果，而且相关的反馈不在日志区域弹出；
27.反伤，测试发现没有效果，建议分析荆棘与反伤的关系；
28.吸血，尚未实现；
29.战斗回复，尚未实现；
30.圣盾，建议移除；
31.重甲负重，建议移除,因为这不是原子buff，建议直接替换为减速；
32.吸血（装备），装备相关的buff建议先做移除处理。
33.骑士精神，建议移除；
34.角斗士之心，建议移除；
35.龙鳞，建议移除；
36.凤凰涅槃，建议移除；
37.急速，建议移除；
38.雷击，建议移除；
39.诅咒，建议移除；

### 3.x 问题原因分析与解决方案（Per-Buff Analysis & Fix Plan）

> 说明：本节基于当前 `assets/data/buffs.json` + `script/engine/buff/*` + `test/buff_editor_v3.html` 的实现现状给出：
> - **失败的根因**：是“buff 数据字段不对”还是“引擎未消费该字段/事件”还是“模拟器未覆盖管线”。
> - **解决方案**：给出“数据修正 / 引擎修正 / 模拟器补强”三类路径，优先选择最小改动以支持回归。

#### 01 中毒 `buff_poison`（PASS）

- **结论**：DoT + duration tick 通路已跑通。
- **回归用例挂钩**：R-04。

#### 02 晕眩 `buff_stun`（未测，但当前可测）

- **可测性现状**：在 v3 中通过 `Try Action` + `BATTLE_ACTION_PRE` 已具备可观测入口。
- **建议测试方法**：对 actor 施加 `buff_stun` 后点击 TryAction，应输出 cancelled/skipTurn。
- **回归用例挂钩**：R-02。

#### 03 力量增强 `buff_strength`（FAIL：未观察到 atk 增加）

- **根因**：`buff_strength` 使用 `statModifiers.atk`，而 v3 模拟器当前 UI 只展示 `hp/ap/speed/bodyParts`，并没有展示/使用 `atk` 做伤害计算；因此“看起来不生效”。
- **解决方案（推荐）**：
  1) **模拟器补强**：在 v3 右侧 inspector 增加 `atk/def/...` 的展示，并在 `castAttack()` 的 rawDamage 计算中引入 `attacker.buffs.getEffectiveStat('atk', attacker.stats.atk)`（或简单加成模式）。
  2) **测试口径修正**：如果暂不引入属性参与计算，则至少在 UI 上展示 `getEffectiveStat('atk')` 的结果作为验证口径。

#### 04 护盾 `buff_shield`（FAIL：你期望“抵挡一次”而非数值护盾）

- **根因（数据/设计不一致）**：当前 `buff_shield` 明确定义为 `absorbDamage` + `value:20`，语义是“数值护盾池”，不是“一次性免疫”。
- **两种可选方案**：
  - A) **保持当前数值护盾语义（更通用）**：
    - 回归口径按 R-06：先消耗 `shieldPool`，再扣 hp。
    - 文案/命名调整：把描述从“抵挡一次”统一为“吸收 X 点”。
  - B) **改为“抵挡一次伤害”语义（你当前偏好）**：
    - 新增动作或约定：例如 `absorbHitOnce`，在 `onTakeDamagePre` 将 `context.damageTaken = 0` 并 `REMOVE_SELF`。
    - 或复用现有机制：把 `absorbDamage` 改为在 `onTakeDamagePre` 写入一个超大 `shieldPool`，并在一次命中后 `REMOVE_SELF`（但需要能知道一次命中边界）。
-结论：使用方案B

#### 05 流血 `buff_bleed`（PASS）

- **结论**：DoT flat 伤害已通。
- **回归建议**：与 `buff_burn` 做差异化或合并策略评审。

#### 06 燃烧 `buff_burn`（必要性评审）

- **根因**：现状与 `buff_bleed` 的唯一差异是数值与 tag（fire vs physical），在当前引擎未引入元素/抗性体系时确实高度重叠。
- **解决方案**：
  - 若近期不做元素体系：建议合并为“DoT 模板”，用 tag 区分来源即可，避免重复 buff。
  - 若计划做元素体系：保留燃烧，用于后续“火焰增伤/火抗/触发燃烧扩散”等联动。
-结论：删除燃烧

#### 07 冻结 `buff_freeze`（原子性问题：控制 + 防御混合）

- **根因**：`buff_freeze` 同时包含 `skipTurn` + `statModifiers.def`，属于复合效果。
- **解决方案（按你提出的原则）**：
  - 把冻结降级为单一效果（例如仅 `skipTurn` 或仅 `speed_down`），把“防御加成”交给技能/装备/另一个 buff。
  - 若保留控制：建议与 `buff_stun` 合并/区分（例如 freeze=skipTurn+额外规则，stun=纯 skipTurn）。
  - v3 可测性：同 `buff_stun`，走 TryAction。
-结论：降级为单一效果 减速，并与减速合并。
#### 08 减速 `buff_slow`（当前缺测试方法）

- **根因**：同 `buff_strength`，模拟器没有展示有效 speed，也没有用 speed 驱动先后手/回合序。
- **解决方案**：
  1) UI 增加 `effectiveSpeed = buffs.getEffectiveStat('speed', baseSpeed)` 显示。
  2) 若要更贴近引擎：在模拟器里用 effectiveSpeed 决定 turn order（可后续迭代）。

#### 09 虚弱 `debuff_weak`（FAIL：你观察的是“力量下降”，但数据是 damageDealtMult）

- **根因（测试口径与数据字段不一致）**：`debuff_weak` 当前定义为 `statModifiers.damageDealtMult = -0.2`。
  - v3 的伤害管线目前只用 `rawDamage`，没有读取 attacker 的 `damageDealtMult` 去缩放伤害，因此在模拟攻击时不会体现。
- **解决方案**：二选一明确语义。
  - A) **虚弱 = 降低 atk**（匹配你观察口径）：把定义改为 `statModifiers.atk`（flat/percent）。
  - B) **虚弱 = 伤害倍率降低**（保留现定义）：在 `castAttack()` 增加一步：读取 attacker 的 `damageDealtMult` 进入 `context` 或直接缩放 `rawDamage`。
-结论：选择方案A

#### 10 易伤 `buff_vulnerable`（FAIL：伤害未增加）

- **根因**：`buff_vulnerable` 使用 `statModifiers.damageTakenMult`（percent），但 v3 的结算是 `context.damageTakenMult`（由 action `modifyDamageTaken` 写入），并不会自动读取 target 的 statModifiers。
- **解决方案**：
  - A) **数据改造**（最小改动以匹配当前 pipeline）：把易伤改成 effect：`onTakeDamagePre` + `modifyDamageTaken`（value=1.2），并可叠层。
  - B) **引擎/模拟器改造**（更通用）：在 `castAttack()` 的 takeDamagePre 后，将 `target.buffs.getEffectiveStat('damageTakenMult', 1)` 应用于 `context.damageTakenMult`。
  - 建议优先 B：这样 `buff_block`/`buff_pain_sup`/`passive_dragon` 等所有以 `damageTakenMult` 表达的 buff 都能统一生效。
-结论：选择方案B

#### 11 部位封印 `buff_silence_limb`（无法测）

- **根因**：该 buff 只有 `tbd`，无可执行字段；且 v3 模拟器尚无“技能选择/部位可用性”管线。
- **解决方案**：先明确它影响对象：
  - A) 禁用目标部位（不可选中 bodyPart）
  - B) 禁用使用部位技能（影响技能列表）
  - 需要新增：在 `BATTLE_ACTION_PRE` 或 `BATTLE_ATTACK_PRE` 阶段读取并取消/改写 `bodyPart`。
-结论：删除buff

#### 12 狂暴 `buff_berserk`（建议移除/拆分）

- **根因**：包含 `atk%` + `hitRate`，而 hitRate 体系目前无落地；同时属于复合增益。
- **解决方案**：
  - 若未实现命中/闪避：移除 hitRate 字段，或将其移到 tbd。
  - 若坚持原子性：拆分为 `atk_up` 与 `accuracy_down` 两个 buff。
-结论：删除buff

#### 13 专注 `buff_focus`（命中率体系缺失）

- **根因**：`hitRate` 在引擎/模拟器均未消费。
- **解决方案**：同上：移除/标记 tbd，或者先实现最小命中判定管线（不建议在 buff 回归阶段引入）。

#### 14 魔力涌动 `buff_magic_surge`（魔法/物理体系缺失）

- **根因**：`magicDmg` 未被消费。
- **解决方案**：短期移除；或先明确伤害类型字段（physical/magic）并在伤害管线中使用。

#### 15 剧毒涂层 `buff_poison_coat`（与中毒可叠加，但语义重复）

- **引擎可执行性**：该 buff 使用 `onAttackPost` + `applyBuff`，v3 的 `castAttack()` 会触发 `BATTLE_ATTACK_POST`，因此**理论上可测**。
- **可能出现“测不到”的原因**：
  - enemy/player 的 `buffs` 未正确注册（GI-01已修复）
  - 或 target 选择与 `castTarget` 不一致导致 target 不是预期对象
- **解决方案**：
  - 若认为重复：移除。
  - 若保留：建议新增回归用例：施加涂层 -> castAttack -> 观察 target 获得 `buff_poison`（可写 R-08）。
-结论：删除buff

#### 16 鹰眼 `buff_eagle_eye`（无法测）

- **根因**：只有 tbd，且当前无命中/闪避判定。
- **解决方案**：同命中体系：暂移除或维持 tbd 并不纳入回归。
-结论：删除buff

#### 17 破甲 `buff_armor_pen`（已具备可测链路）

- **现状**：使用 `MODIFY_STAT_TEMP` 写入 `context.tempModifiers.armorMitigationMult`，v3 的 armor phase 已读取该字段并应用。
- **回归用例挂钩**：R-05。
- **建议**：保持“提高护甲脆弱系数”单一语义，避免与易伤重复（易伤处理 hp 伤害倍率）。

#### 18 钢铁意志 `buff_iron_will`（“def 增加”语义未落地）

- **根因**：`def` 目前不参与 v3 伤害管线（护甲来自 bodyParts），因此即使 `statModifiers.def` 生效也无法体现。
- **解决方案**：
  - A) 删除/暂存：如果系统没有“防御值”概念。
  - B) 明确 def 的作用点：例如影响 `damageTakenMult` 或影响“护甲减免系数”，并在结算中消费
-结论：删除buff。

#### 19 格挡 `buff_block`（你观测为未生效）

- **根因候选（需要按当前实现确认）**：
  1) `buff_block` 的 effect 触发点是 `onTakeDamagePre`，而 v3 在计算护甲后 emit 了 `BATTLE_TAKE_DAMAGE_PRE`，理论可生效。
  2) 但 `BuffSystem._act_modifyDamageTaken` 当前实现是 `context.damageTakenMult = (context.damageTakenMult||1) * mult`；而 v3 后续只在 `if (context.damageTakenMult) damageTaken *= damageTakenMult` 生效。
  3) 若你仍观测无效，优先检查：buff 是否挂在 **受击者**（target/self）上且触发对象匹配（BuffSystem 只 dispatch 给 attacker/target）。
- **解决方案**：
  - 确认 buff 施加在受击者（castTarget）上。
  - 如仍失败：在 v3 日志中增加 `[Context after TAKE_DAMAGE_PRE]` 里 `damageTakenMult` 的打印（当前已有）。
-结论：重新测试

#### 20 痛苦压制 `buff_pain_sup`（与减伤重复）

- **根因**：用 `statModifiers.damageTakenMult` 表达，但当前 v3 不消费该 statModifier（同易伤问题）。
- **解决方案**：采取“统一倍率入口”的方案（见易伤 10-B），否则该 buff 永远测不出。

#### 21 残影 `buff_evasion`（闪避体系缺失）

- **根因**：`dodgeRate` 未被消费。
- **解决方案**：要么实现闪避判定，要么按你建议改为“n 层全闪避”并落到 `BATTLE_TAKE_DAMAGE_PRE` 直接 cancel 或 shield。
结论：改为“n 层全闪避

#### 22 天使守护 `buff_immortality_hp`（TBD）

- **根因**：需要“伤害应用阶段 clamp hp min”钩子，目前 BuffSystem 无此 action。
- **解决方案**：
  - 新增 action：`clampHpMin`（在 `BATTLE_TAKE_DAMAGE_PRE` 或伤害应用前执行），并在模拟器/引擎阶段读取。
-结论：移除

#### 23 绝对防御 `buff_immortality_armor`（TBD）

- **根因**：需要“护甲破坏”管线钩子。
- **解决方案**：在 v3 的 armor phase 增加一个 `preventArmorBreak` 开关（来自 context 或 stat），并让破甲时不置 `BROKEN`。

#### 24 神愿复苏 `buff_revive`（未实现）

- **根因**：BuffSystem 未订阅 `onDeath`（目前仅订阅 TURN/ATTACK/TAKE_DAMAGE/DEFEND/ACTION_PRE），模拟器也未 emit death。
- **解决方案**：
  - BuffSystem 增加 `DEATH` 事件订阅并映射到 `onDeath` trigger。
  - v3 增加“置 hp=0 + emit DEATH”的按钮。
-结论：移除

#### 25 盾墙 `buff_shield_wall`（maxAp 概念未消费）

- **根因**：v3 仅展示 `ap/maxAp`，但没有对 maxAp 的来源进行合成；并且 `BuffManager.getEffectiveStat` 可算但 UI 未展示。
- **解决方案**：补 UI 展示 `effectiveMaxAp`，或移除该 buff。
-结论：补 UI 展示 `effectiveMaxAp`

#### 26 荆棘 `buff_thorns`（FAIL：无效果/日志无反馈）

- **根因**：该 buff trigger 是 `onDefendPost`，但 v3 的 `castAttack()` 流程没有 emit `BATTLE_DEFEND_POST` / `BATTLE_TAKE_DAMAGE`；因此永远不会触发。
- **解决方案**：
  - v3 补齐事件：在伤害应用后 emit `BATTLE_TAKE_DAMAGE` 与 `BATTLE_DEFEND_POST`（payload 复用 context）。
  - 同时在日志中打印“反伤对 attacker 的伤害”。

#### 27 反伤/反击 `buff_counter`（你称“反伤”，数据是反击姿态）

- **关系澄清**：
  - `buff_thorns` 是“反伤（damage）”，需要 `onDefendPost`。
  - `buff_counter` 是“反击（attack action）”，BuffSystem 当前 `attack` action 是占位，不会生效。
- **解决方案**：
  - 反伤：按 26 补事件即可。
  - 反击：需要 CombatSystem 支持或在模拟器中最小实现一个“反击=再调用一次 castAttack(低伤害/同 bodyPart)”的桥接。

#### 28 吸血 `buff_lifesteal` / `passive_vampire`（以前写未实现，但当前应可测）

- **现状核对**：`buff_lifesteal` aliasOf `passive_vampire`，后者是 `onAttackPost` + `heal`（基于 `damageDealt`）；v3 的 `castAttack()` 会在结算后 emit `BATTLE_ATTACK_POST` 并写入 `damageDealt`。
- **解决方案**：
  - 直接按 R-07 回归。
  - 若仍“未生效”：优先检查 `damageDealt` 是否非 0（护甲全吸收时会为 0，从而 heal=0）。

#### 29 战斗回复 `buff_ap_regen`（以前写未实现，但当前应可测）

- **现状**：`onTurnStart` + `modifyAP`，v3 有 `TURN_START` emit。
- **注意**：player 的 `stats.ap` 初始值可能已满，导致增长不可见。
- **解决方案**：
  - 在测试前把 `simPlayer.stats.ap` 调低（或提供 UI 输入）。
  - 或在日志中打印 `ap` 变化。

#### 30 圣盾 `buff_damage_absorb`（absorbToHeal 未实现）

- **根因**：`BuffSystem._act_absorbToHeal` 为空实现。
- **解决方案**：若不做这套机制，建议移除；若要做，需定义“吸收本次伤害并转为治疗”的具体公式与时序。
- 结论：移除

#### 31 重甲负重 `passive_heavy_armor`（建议替换为减速）

- **现状**：数据是 speed -5，等价于 `buff_slow` 的一种来源。
- **解决方案**：保留为装备被动但在 UI 上按 tag 过滤；或合并复用同一条定义（aliasOf）。
- 结论：移除

#### 32 吸血（装备）`passive_vampire`（建议先移除）

- **现状**：与 28 相同，可作为“装备被动”样例保留。
- **建议**：若 buff 回归阶段只关注战斗内临时 buff，可临时在编辑器中过滤 `tags.includes('equipment')`。

#### 33-39 装备被动类（建议移除/延后）

- **根因**：
  - 多数依赖未实现的 pipe（onDeath/attack action/命中闪避/伤害类型）。
  - 或属于装备系统范围，不应阻塞 buff 核心回归。
- **解决方案**：
  - 回归范围收敛：仅覆盖 5.4 的五大核心（alias/DoT/破甲/护盾/吸血）。
  - 其余条目标记为 tbd 或迁移到装备系统测试文档。

## 4. 本轮回归方案（基于结论）

> 目标：把本轮测试中“结论”固化为回归用例，后续每次修改 `buffs.json` / `BuffSystem` / `buff_editor_v3.html` 后都可以重复执行，快速确认没有回归。


### 4.1 回归前置条件（Setup）

- 使用同一份测试数据：
  - `assets/data/buffs.json`
  - `assets/data/player.json`
  - `assets/data/enemies.json`
- 进入页面后先执行一次初始化确认：
  - 左侧 buff 列表可加载、可搜索
  - 右侧模拟区 player/enemy 都已创建并显示基础属性
  - 日志区能收到至少一条“初始化/加载完成”类输出（若无，至少能收到任意一次按钮点击的输出）

### 4.2 回归用例清单（可执行）

> 说明：用例编号用于在 4.3 记录格式里直接填写 PASS/FAIL。

- **R-01：Enemies reload 不破坏 Add Buff**（对应 GI-01）
  1) 选择任意 enemy 模板
  2) 对 enemy 应用一个已知可见 buff（例如 `buff_poison`）
  3) 执行 Enemies reload（或相同功能按钮）
  4) 再次对 enemy 应用同一个 buff
  - 预期：第二次 add 依然成功；buff 列表变化/日志提示成功；若 buff 可叠层则 stacks 正确。

- **R-02：TryAction 必有日志与取消可观测**（对应 GI-02，覆盖控制类 Buff）
  1) 给 actor（player 或 enemy）施加 `skipTurn` 类 buff（例如 `buff_stun`）
  2) 点击该 actor 的 TryAction
  - 预期：日志区必须出现一条 Action 流水（至少包含 actionType、actor、cancelled 字段）；若被控制，应显示 `cancelled=true` 且 `cancelReason` 含 `control:skipTurn`。

- **R-03：aliasOf 展开一致性**（需求 5.4-1）
  1) 选择一个 alias buff（例如 `buff_lifesteal`）
  2) 查看“展开定义视图”（或等价 UI 文案）
  - 预期：展开后的定义与被 alias 的源 buff（例如 `passive_vampire`）在 effects 上一致（字段级别允许 editor 层补默认值）。

- **R-04：DoT + tick duration**（需求 5.4-2）
  1) 对 target 施加 `buff_poison`
  2) 点击 `[End Turn]`
  - 预期：HP 扣减；duration 递减；到期自动移除；日志显示触发链路（trigger->action->result）。

- **R-05：护甲系数/破甲链路可观测**（需求 5.4-3）
  1) 对攻击者施加 `buff_armor_pen`（或等效 buff）
  2) 选择目标 bodyPart（护甲>0），设置 rawDamage>0，模拟一次攻击
  - 预期：日志打印 `armorMitigationMult`（或等价字段）变化，并且护甲扣减/最终伤害与无 buff 情况有可解释差异。

- **R-06：护盾吸收**（需求 5.4-4）
  1) 对受击者施加 `buff_shield`
  2) 模拟一次 rawDamage>0 攻击
  - 预期：日志与状态展示中，先消耗 `shieldPool` 再扣 hp；shield 归零后下一次伤害开始扣 hp。

- **R-07：吸血（基于 damageDealt）**（需求 5.4-5）
  1) 对攻击者施加 `buff_lifesteal` 或 `passive_vampire`
  2) 模拟一次攻击
  - 预期：`BATTLE_ATTACK_POST` 后触发 heal；hp 不超过 maxHp；日志展示基于 `damageDealt` 的计算。

### 4.3 回归结果记录格式（建议）

### 4.3 回归结果记录格式（建议）

- 测试时间：
- 测试页面版本：
- 数据版本：`assets/data/buffs.json`（记录主要改动点即可）
- 回归结果：
  - R-01: PASS
  - R-02: PASS
  - R-03: PASS/FAIL
  - R-04: PASS/FAIL
  - R-05: PASS/FAIL

### 4.4 回归结果写回方案（补充 GI-03 的落地）

> 目标：做到“可追溯 + 不污染主数据 + diff 友好”。

#### 方案 B（推荐）：独立测试元数据文件

- 新增：`assets/data/buffs.testmeta.json`（或放到 `test/` 下）
- 结构建议：
  - 以 buffId 为 key，例如：`{ "buff_poison": { "lastResult": "PASS", "lastTestAt": "2026-01-18", "notes": "DoT OK" } }`
- buff_editor_v3 的行为：
  - 加载 buffs 时同时加载 testmeta
  - UI 提供“标记 PASS/FAIL + 备注”
  - 导出/保存 testmeta（不改动 `buffs.json`）

#### 方案 A：写回 `buffs.json`（需要引擎容错）

- 给每个 buff 增加可忽略字段：`__test` 或 `meta`
- 前置要求：`BuffRegistry` 加载时必须忽略未知字段（当前若已是“透传对象”则无需改；若有 schema 校验则需要放行）
- 注意：建议只写回最小字段，避免产生大量 diff：例如 `__test.lastResult/__test.lastTestAt/__test.notes`
