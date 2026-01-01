此文件解释 Visual Studio 如何创建项目。

以下为生成此项目的步骤:
- 创建项目文件 (`NodeConsoleApp2.esproj`)。
- 创建 `launch.json` 以启用调试。
- 安装 npm 包: `npm init && npm i --save-dev eslint`。
- 创建 `app.js`。
- 更新 `package.json` 入口点。
- 创建 `eslint.config.js` 以启用 Lint 分析。
- 向解决方案添加项目。
- 写入此文件。

# 引擎更新日志

## [未发布] - 2025-12-30

### 新增
- **高级战斗持久化**: 实现了一个健壮的系统来保存和恢复战斗的精确状态。
    - **运行时数据结构**: 扩展了 `DataConfig.runtime` 以包含：
        - `initialState`: 战斗开始时敌人的快照。
        - `history`: 每一回合的详细日志，包括状态快照、系统事件和详细的行动结果。
        - `queues`: 持久化当前回合玩家和敌人计划的行动。
        - `playerTempState`: 存储临时的战斗特定玩家属性和增益。
    - **历史记录追踪**: 现在每一回合都会记录一个包含时间戳、种子和状态快照的完整历史条目。
    - **行动记录**: 战斗行动现在是历史日志中的结构化对象，包含详细结果（伤害、命中/未命中等），而不仅仅是文本字符串。

### 变更
- **DataManager**:
    - 更新了 `saveGame` 以同步新的复杂运行时数据结构。
    - 更新了模拟关卡配置，为敌人包含 `bodyParts`，以支持新的伤害系统设计。
- **CoreEngine**:
    - `startBattle`: 现在初始化全面的运行时状态（历史记录、队列、快照）。
    - `startTurn`: 为历史日志捕获状态快照。
    - `executeTurn`: 将结构化的行动结果记录到历史日志中。
    - `saveGame`: 现在在保存到存储之前正确同步战斗状态（包括队列和历史记录）。
    - `resumeBattle`: 从保存的运行时数据恢复行动队列和战斗状态。
    - `endBattle`: 清理所有临时战斗运行时数据以保持存档文件整洁。

### 修复
- 修复了在战斗中重新加载游戏会丢失当前回合进度和敌人状态的问题。
- 修复了重新加载游戏后，技能按钮可能保持禁用状态的问题（通过调整 `DATA_UPDATE` 和 `BATTLE_UPDATE` 的触发顺序）。

### 变更 (2025-12-31)
- **数据驱动配置**:
    - 引入了 JSON 配置文件系统，位于 `assets/data/` 目录下 (`skills.json`, `items.json`, `enemies.json`, `levels.json`)。
    - `DataManager` 现在尝试从这些 JSON 文件加载游戏配置，如果加载失败（如本地文件协议限制），则回退到内置的模拟数据。
    - 实现了 `instantiateLevel` 方法，支持从 `levels.json` 定义的波次和 `enemies.json` 定义的模板动态生成战斗关卡和敌人实例。
- **CoreEngine**:
    - 更新了 `selectLevel` 方法，使用 `instantiateLevel` 来生成关卡数据，确保每次进入关卡都是全新的状态。

### 变更 (2026-01-01)
- **战斗系统重构 (Armor & Body Parts)**:
    - **伤害模型更新**: 实现了“整体血量 + 部位独立护甲”的伤害机制。
        - 攻击现在针对特定的身体部位（如头部、躯干）。
        - 伤害首先扣除部位护甲，护甲耗尽后剩余伤害扣除整体 HP。
        - 引入了部位弱点系数（Weakness），在计算护甲扣除前应用。
    - **玩家状态映射**:
        - 在 `RuntimeData` 中新增 `playerBattleState`，包含 `bodyParts` 结构。
        - 玩家的部位护甲直接映射自装备的耐久度（Head -> Head Armor, Body -> Chest Armor）。
        - 战斗中造成的护甲损耗会实时同步回装备的耐久度。
    - **敌人配置更新**:
        - 更新了 `enemies.json` 和模拟数据，敌人的部位现在使用 `maxArmor` 定义护甲上限，不再分担 HP。
- **CoreEngine**:
    - `startBattle`: 初始化 `playerBattleState`，将玩家装备转换为战斗用的部位数据。
    - `executePlayerSkill`: 更新了伤害计算逻辑，支持部位判定和护甲/HP 溢出伤害。
    - `executeEnemySkill`: 更新了针对玩家的伤害计算，支持护甲损耗同步。
- **DataManager**:
    - `instantiateLevel`: 修复了敌人实例化的逻辑，正确初始化部位护甲（`armor` = `maxArmor`）。
