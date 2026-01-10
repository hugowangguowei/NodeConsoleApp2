# 项目开发计划 (Project Plan)

## 一、 当前项目状态总结 (Project Status Summary)

### 1. 核心引擎 (Core Engine)
- **设计完成**: 包含了帧循环、游戏状态机 (FSM)、事件总线 (EventBus) 的完整设计。
- **已实现**:
  - `CoreEngine.js`: 游戏主循环控制。
  - `GameFSM.js`: 管理游戏状态 (Login, LevelSelect, Battle, Victory, Defeat)。
  - `EventBus.js`: 实现了发布-订阅模式的事件系统。
  - `DataManagerV2.js`: 支持 JSON 配置加载及本地存储回退的数据管理模块。

### 2. 数据系统 (Data System)
- **设计完成**: 确立了基于 JSON 的数据驱动模式，涵盖玩家、敌人、技能、关卡、物品。
- **已实现**:
  - `assets/data/`: 包含 `player.json`, `enemies.json`, `skills.json`, `levels.json`, `items.json`。
  - 数据结构已初步统一，但在具体字段（如 Enemies 配置）上仍需与 UI/逻辑层对齐。

### 3. UI 系统 (UI System)
- **设计完成**: 确立了模块化 UI 设计规范，分离了各个功能组件。
- **已实现**:
  - `mock_ui_v11.html`: 集成了最新的 UI 组件与布局。
  - 组件化代码: `UI_BattleRow.js`, `UI_SkillPanel.js`, `UI_TurnPanel.js`, `UI_SystemModal.js`。
  - 能够动态渲染角色状态、技能面板及模态窗口。

### 4. 战斗系统 (Battle System)
- **设计完成**: 回合制核心逻辑、部位护甲机制、速度行动顺、技能队列输入机制。
- **已实现**:
  - 基础的回合流转逻辑。
  - 身体部位 (Body Parts) 与 护甲 (Armor) 的显示逻辑（待修复显示 Bug）。

---

## 二、 下一步开发计划 (Development Roadmap)

### 阶段一：数据与显示修复 (Data & Display Fixes)
**目标**: 解决当前测试中发现的数据不一致和显示错误，确保 "所见即所得"。

1.  **修复护甲显示问题**:
    - [ ] 修正玩家 UI 中护甲描述与目标选择框不匹配的问题 (Head/Body vs Head/Body/Chest)。
    - [ ] 解决 `[Object Object]` 显示错误，确保渲染文本正确。
2.  **统一数据结构**:
    - [ ] 对齐 `enemies.json` 与代码中使用的字段结构。
    - [ ] 完善 `player.json` 中关于 bodyParts 的定义，使其驱动 UI 生成。
3.  **完善 DataManager**:
    - [ ] 验证 `DataManager` 的 JSON 优先 + localStorage 回退机制，并确保日志清晰。

### 阶段二：UI与引擎深度集成 (Deep Integration)
**目标**: 让 UI 完全由引擎事件驱动，移除 Mock 数据依赖。

1.  **事件驱动绑定**:
    - [ ] 确保 `UI_SkillPanel` 正确响应 `battle_turn_start` 事件。
    - [ ] 确保 `UI_BattleRow` 实时更新 HP/Armor 变化事件。
    - [ ] 实现 `UI_SystemModal` 自动响应 FSM 状态变化 (Login -> LevelSelect)。
2.  **技能释放流程**:
    - [ ] 实现 "技能选择" -> "放入待执行队列" -> "配置完成" 的完整交互逻辑。
    - [ ] 实现 敌我双方技能队列的结算动画/日志展示。

### 阶段三：游戏核心循环闭环 (Loop Completion)
**目标**: 实现从开始游戏到战斗结束的完整闭环。

1.  **胜负判定**:
    - [ ] 在引擎中实现角色死亡 (HP <= 0) 检测。
    - [ ] 触发 Victory/Defeat 状态，并弹出对应结算界面。
2.  **关卡流程**:
    - [ ] 实现 关卡选择 -> 初始化战斗 -> 结算 -> 返回关卡选择 的流程。

### 阶段四：内容扩充 (Content Expansion)
**目标**: 丰富游戏可玩性。

1.  **Buff/Debuff 系统**:
    - [ ] 实现基于 Buff 的装备/状态系统 (设计已提及，需落地代码)。
2.  **数据填充**:
    - [ ] 编写更多技能 (攻击、防御、治疗、Buff)。
    - [ ] 设计多个不同难度的敌人配置。

---

## 三、 待办事项清单 (Action Items)

- [ ] **Data Design**: 检查并更新 `data_design.md`，明确 Buff/Debuff 数据结构。
- [ ] **Bug Fix**: 排查 `engine_test_v2.html` 中的护甲显示代码。
- [ ] **Code**: 修改 `DataManager` 添加详细加载日志。
- [ ] **Code**: 更新 `GameFSM` 确保状态切换事件携带必要数据供 UI 渲染。
