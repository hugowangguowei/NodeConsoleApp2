# TODO List（按优先级）

> 目标：推进`skills/buffs`数据规范与编辑器（`skill_editor` / `buff_editor`）落地，减少冗余配置，提高可维护性，并为2-3人协作拆分清晰任务。

## P0（必须先做，阻塞后续）

### P0-1 修复`skill_editor_test_v3.html`加载新版本`buffs_v2_3.json`解析错误
- [ ] 对齐`buff_design.md`与`buffs_v2_3.json`结构差异，梳理当前解析失败的字段/枚举（如`effect.action`、`action`参数结构等）。
- [ ] 修改`loadBuffs`/buff解析逻辑，兼容`buffs_v2_3.json`（不考虑旧版兼容则直接按新版重构）。
- [ ] 增加基本校验与错误提示（缺字段、枚举不合法时给出位置）。
- [ ] 增加最小化回归用例：加载`buffs_v2_1.json`、`buffs_v2_2.json`、`buffs_v2_3.json`各一次（如不需要兼容旧版则只保留新版）。

### P0-2 完成`editState`在技能数据与UI中的闭环
- [ ] 在`skills_melee_v4_3.json`中补充`editorMeta.editState`字段（默认`"done"`）。
- [ ] 在技能json开头枚举列表（如果存在meta/enums段）中增加`editState`枚举：`editing`/`done`/`deprecated`。
- [ ] 修改`skill_editor` UI：
  - [ ] `skill-node`整体背景色随`editState`变化：
    - `editing`浅蓝
    - `done`浅绿
    - `deprecated`浅灰
  - [ ] 提供交互：下拉选择/快捷切换编辑状态。
  - [ ] 列表/筛选：按状态筛选或高亮当前非`done`。

### P0-3 规范并落地Effect中`action`枚举的定义与编辑器呈现
- [ ] 在`buff_design.md`明确`effect.action`枚举：每个值含义、参数结构、适用范围。
- [ ] `buff_design.md` 5.4.2 action：覆盖
  - [ ] `damage_hp`（伤血）
  - [ ] `damage_armor`（伤甲）
  - [ ] `heal_armor`（回甲）
  - [ ] `heal_hp`（回血）
  - [ ] `skip_turn`（跳过回合）
  - [ ] `prevent_damage`（新增：免伤/阻断伤害，定义触发条件与作用域）
- [ ] 移除/下线当前阶段不需要的动作：`SET_DAMAGE_TAKEN`、`MULTIPLY_DAMAGE_TAKEN`、`MODIFY_STAT_TEMP`（如果确认移除）。
- [ ] 同步到数据：修订`buffs_v2_2.json` / 生成`buffs_v2_3+`（按你当前版本命名策略）。
- [ ] 修改`buff_editor_v4.html` UI：根据选择的`action`动态展示参数面板。

## P1（重要优化，提升效率/体验）

### P1-1 `buff_editor_v4.html`移除冗余`status`概念并简化界面
- [ ] 清理UI中`status`相关字段/显示。
- [ ] 统一“生命周期/耗散机制”由持续时间/触发次数等字段表达，而非通过动作如`REMOVE_SELF`表达。

### P1-2 `buffId`改为从`buffs.json`/buff数据文件读取并以`name`作为交互标识
- [ ] 在`skill_editor`/`action-editor`中，buff选择控件优先使用`buff.name`展示与检索。
- [ ] 内部保存仍可用`id`（如存在），但交互不暴露难选的`id`输入。
- [ ] 增加搜索/过滤（按名称、tag、动作类型）。

### P1-3 `loadProjectData`只加载`buffs.json`，技能由用户手动导入
- [ ] 调整项目加载流程：默认只加载buff库。
- [ ] 技能导入提供按钮：`ImportSkills`（已有则复用），并记录最后导入文件路径（可选）。

### P1-4 清理`action-editor`中Target显式绑定时的冗余选项
- [ ] 当`target.binding.mode = explicit`时，在`action-editor`隐藏：
  - `target.spec.selection.mode`
  - `target.spec.selection.selectCount`
  - `target.spec.selection.selectCandidateParts`
- [ ] 逻辑：因为在技能/动作界面行为确定，选择部位后由系统推导单选/多选/数量。

## P2（文档与规范化，降低维护成本）

### P2-1 升级`buff_design.md`（以`skill_design.md`的规范为参考）
- [ ] 补齐`meta/enums`段落与字段定义表。
- [ ] 明确：buff数据版本策略、兼容策略（本轮可不兼容旧版）。
- [ ] 统一命名：`camelCase`/`snake_case`、枚举大小写风格。
- [ ] 提供示例：常见buff模板（增伤、dot、护盾、禁疗、跳过回合等）。

### P2-2 解释与整理：`buff_editor_v3`中`statModifiers`含义
- [ ] 在`buff_editor_design.md`或`buff_design.md`中给出定义、字段结构、示例。

### P2-3 整理buff列表冗余与缺失（基于`skills_melee_v4_2.json`）
- [ ] 统计当前buff被引用情况：未引用/重复语义/可合并。
- [ ] 分析缺失buff：常用控制类/增益减益类/防护类/状态免疫类。
- [ ] 输出建议：
  - [ ] buff分类（tag/领域：伤害、治疗、防御、控制、资源、位移等）
  - [ ] 统一字段与动作组合方式

## P3（体验改良/非阻塞）

### P3-1 `buff_editor_v4.html`字段英文后增加中文注释
- [ ] 所有字段label：`English（中文）`。
- [ ] 对复杂字段提供tooltip（可选）。

### P3-2 调整“原始JSON(当前Buff)”区域高度自适应
- [ ] 让JSON文本框高度随内容增长（编辑区已有滚动条，内部不需要滚动）。

## 团队分工建议（2-3人）

### 角色A：数据规范与文档（偏设计/数据）
- P0-3（定义/收敛`effect.action`枚举与参数结构）
- P2-1（升级`buff_design.md`并与数据对齐）
- P2-3（buff冗余/缺失分析与整理建议）

### 角色B：技能编辑器（偏前端/编辑器）
- P0-2（`editState`数据补齐与`skill-node`整卡片背景色渲染与交互）
- P1-3（只加载buff库 + 手动导入技能）
- P1-4（Target显式绑定下隐藏冗余字段）

### 角色C：Buff编辑器（偏前端/编辑器）
- P0-1（修复解析`buffs_v2_3.json`，重构load/validate）
- P1-1（移除`status`概念与简化生命周期UI）
- P3-1 / P3-2（中文注释与JSON区域体验优化）

---

## 里程碑建议
- M1（1-2天）：P0全部完成，确保新版buff可被加载、技能状态可视化可用。
- M2（2-4天）：P1完成，编辑器交互顺畅，减少手动输入与冗余字段。
- M3（持续）：P2/P3完成，文档稳定、数据结构可长期迭代。
