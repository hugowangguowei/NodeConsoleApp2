# 核心引擎设计说明书 (Core Engine Design)

## 1. 概述
本引擎旨在构建一个轻量级、数据驱动的网页游戏核心逻辑层。引擎完全基于 JavaScript (ES6+) 开发，负责管理游戏的主循环、状态流转、数据处理及事件分发。引擎与视图层（渲染）解耦，通过标准化的文本/JSON 接口进行交互。

## 2. 帧循环设计 (Game Loop)

虽然本游戏核心玩法为回合制，不依赖高频的物理模拟，但为了处理动画时序、UI更新及异步逻辑，仍采用标准的帧循环架构。

### 2.1 循环机制
采用 `requestAnimationFrame` 作为主驱动，辅以 `Delta Time` 计算以保证逻辑在不同帧率下的统一性。

```javascript
class GameLoop {
    constructor() {
        this.lastTime = 0;
        this.isRunning = false;
    }

    start() {
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop.bind(this));
    }

    loop(currentTime) {
        if (!this.isRunning) return;

        const deltaTime = (currentTime - this.lastTime) / 1000; // 秒为单位
        this.lastTime = currentTime;

        this.update(deltaTime);
        // render() 由视图层订阅 update 事件自行处理，引擎不直接调用渲染
        
        requestAnimationFrame(this.loop.bind(this));
    }

    update(dt) {
        // 更新全局状态机
        // 更新定时器/动画补间系统
        // 触发 'tick' 事件
    }
}
```

## 3. 游戏流程设计 (Finite State Machine)

游戏全局流程由一个有限状态机 (FSM) 管理，确保游戏在任意时刻处于单一且明确的状态。

### 3.1 核心状态定义

| 状态名称 | 描述 | 允许流转至 |
| :--- | :--- | :--- |
| **INIT** | 引擎初始化，加载核心配置 | LOGIN |
| **LOGIN** | 玩家登录/注册界面 | MAIN_MENU |
| **MAIN_MENU** | 主菜单（查看状态、背包、设置） | LEVEL_SELECT, LOGIN |
| **LEVEL_SELECT** | 关卡选择界面 | BATTLE_PREPARE, MAIN_MENU |
| **BATTLE_PREPARE** | 战斗前准备（调整装备/技能） | BATTLE_LOOP, LEVEL_SELECT |
| **BATTLE_LOOP** | 核心战斗循环（回合制逻辑） | BATTLE_SETTLEMENT |
| **BATTLE_SETTLEMENT** | 战斗结算（胜利/失败/掉落） | LEVEL_SELECT, MAIN_MENU |

### 3.2 状态机接口
```javascript
class GameFSM {
    changeState(newState, params = {}) {
        // 1. 触发当前状态的 onExit()
        // 2. 更新 currentState
        // 3. 触发新状态的 onEnter(params)
        // 4. 发布 STATE_CHANGED 事件
    }
}
```

## 4. 事件系统设计 (Event System)

采用 **发布-订阅 (Publish-Subscribe)** 模式作为模块间通信的核心，实现逻辑层与视图层的彻底解耦。

### 4.1 核心机制
*   **EventBus**: 全局单例，负责事件的注册、注销与分发。
*   **事件命名规范**: `MODULE:ACTION` (例如 `BATTLE:ATTACK_START`, `UI:BUTTON_CLICK`)。

### 4.2 接口定义
```javascript
class EventBus {
    on(event, callback, context) { ... }
    off(event, callback) { ... }
    emit(event, payload) { ... }
}
```

## 5. 数据对象设计 (Data Schema)

所有游戏实体均为纯数据对象 (POJO)，逻辑方法分离在对应的 System/Manager 中。

### 5.1 角色对象 (Character)
```json
{
  "id": "char_001",
  "name": "王国骑士",
  "type": "PLAYER", // 或 ENEMY
  "stats": {
    "hp": 150,
    "maxHp": 150,
    "ap": 4,        // 行动力
    "maxAp": 6,
    "speed": 12     // 决定出手顺序
  },
  "equipment": {
    "weapon": "wp_sword_01",
    "armor": {
      "head": { "id": "helm_01", "durability": 30, "defense": 5 },
      "chest": { "id": "plate_01", "durability": 60, "defense": 15 }
    }
  },
  "skills": ["skill_slash", "skill_defend"],
  "buffs": []
}
```

### 5.2 物品对象 (Item)
```json
{
  "id": "wp_sword_01",
  "type": "WEAPON",
  "name": "铁剑",
  "effects": [
    { "type": "DAMAGE_PHYSICAL", "value": 20 }
  ]
}
```

### 5.3 场景/关卡对象 (Scene/Level)
```json
{
  "id": "level_1_1",
  "name": "幽暗森林边缘",
  "backgroundId": "bg_forest_01",
  "enemies": [
    { "enemyId": "goblin_01", "position": 1 }
  ],
  "rewards": {
    "exp": 100,
    "gold": 50,
    "dropTable": "drop_forest_easy"
  }
}
```

## 6. 数据配置设计 (Data Configuration Design)

为了实现游戏状态的实时保存与加载（Save/Load），我们需要定义一个统一的数据结构 `DataConfig`。该结构包含游戏运行时的所有动态数据。

### 6.1 数据结构总览
`DataConfig` 分为三个主要部分：
1.  **GlobalData**: 全局持久化数据（玩家属性、背包、进度）。
2.  **RuntimeData**: 运行时临时数据（当前战斗状态、场景状态）。
3.  **Settings**: 系统设置（音量、按键）。

```json
{
  "version": "1.0.0",
  "timestamp": 1703856000000,
  "global": { ... },
  "runtime": { ... },
  "settings": { ... }
}
```

### 6.2 GlobalData (全局存档数据)
这部分数据在游戏整个生命周期中持续存在，是存档的核心。

```json
{
  "player": {
    "id": "player_001",
    "name": "Hero",
    "stats": { "hp": 100, "maxHp": 100, "ap": 4, "maxAp": 6, "speed": 10 },
    "equipment": { "weapon": "sword_01", "armor": { "head": "helm_01" } },
    "skills": ["skill_slash", "skill_heal"],
    "inventory": [
      { "itemId": "potion_hp", "count": 5 },
      { "itemId": "material_iron", "count": 2 }
    ]
  },
  "progress": {
    "unlockedLevels": ["level_1", "level_2"],
    "completedQuests": ["quest_001"],
    "flags": { "has_met_guide": true }
  }
}
```

### 6.3 RuntimeData (运行时状态)
这部分数据用于记录“当前正在发生的事情”。为了支持战斗中断后的完美恢复（Resume），我们需要记录战斗的初始配置、当前动态状态以及历史回溯信息。

```json
{
  "currentScene": "BATTLE_LOOP", // 或 "MAIN_MENU", "LEVEL_SELECT"
  "battleState": {
    "levelId": "level_1_1",
    "turnCount": 3,
    "phase": "PLANNING", // PLANNING (配置阶段) 或 EXECUTION (执行阶段)
    
    // 1. 初始状态快照 (Initial State Snapshot)
    // 用于重置战斗或计算某些基于初始值的百分比
    "initialState": {
      "enemies": [
        { "instanceId": "enemy_1", "templateId": "goblin", "maxHp": 50, "stats": { ... } }
      ]
    },

    // 2. 当前动态状态 (Current Dynamic State)
    // 记录战斗中实时变化的数值
    "enemies": [
      { 
        "instanceId": "enemy_1", 
        "templateId": "goblin", 
        "hp": 20, 
        "maxHp": 50, 
        "position": 1, 
        "buffs": [
           { "id": "buff_burn", "duration": 2, "sourceId": "player_001" }
        ],
        // 护甲/部位状态 (支持部位破坏)
        "bodyParts": {
           "head": { "hp": 0, "maxHp": 20, "armor": 0, "status": "BROKEN" },
           "body": { "hp": 30, "maxHp": 50, "armor": 5, "status": "NORMAL" }
        }
      }
    ],
    
    // 玩家在战斗中的临时状态 (如临时Buff，非永久属性变更)
    "playerTempState": {
        "buffs": [],
        "tempStatModifiers": { "speed": 2 }
    },

    // 3. 行动队列 (Action Queues)
    // 记录当前回合双方已配置但未执行的技能
    "queues": {
        "player": [
            { "skillId": "skill_slash", "targetId": "enemy_1", "bodyPart": "body", "cost": 2 }
        ],
        "enemy": [
            // 在 EXECUTION 阶段前生成
        ]
    },

    // 4. 历史记录 (History)
    // 记录过去回合的完整行为与结果，用于战斗回放、逻辑校验或撤销操作
    "history": [
        {
            "turn": 1,
            "timestamp": 1703856000000,
            "seed": "rng_seed_x8s7", // 用于复现随机结果
            
            // [新增] 回合开始时的简要状态快照，用于快速恢复/回放定位
            "snapshot": {
                "player": { "hp": 100, "ap": 4 },
                "enemies": [
                    { "id": "enemy_1", "hp": 50, "pos": 1 }
                ]
            },

            // [新增] 回合开始/结束时的系统结算（非角色主动行为）
            "systemEvents": [
                { "type": "BUFF_TICK", "targetId": "enemy_1", "buffId": "poison", "value": -5 },
                { "type": "BUFF_EXPIRE", "targetId": "player_001", "buffId": "shield" }
            ],

            "actions": [
                {
                    "order": 1,
                    "sourceId": "player_001",
                    "skillId": "skill_slash",
                    "targetId": "enemy_1",
                    "bodyPart": "body",
                    "result": {
                        "isHit": true,
                        "isCrit": false,
                        "damage": 15,
                        "targetHpRemaining": 35,
                        "armorDamage": 5,
                        "addedBuffs": []
                    }
                },
                {
                    "order": 2,
                    "sourceId": "enemy_1",
                    "skillId": "skill_bite",
                    "targetId": "player_001",
                    "result": {
                        "isHit": true,
                        "damage": 5,
                        "targetHpRemaining": 95
                    }
                }
            ]
        }
    ]
  }
}
```

### 6.4 Settings (系统设置)
```json
{
  "audio": { "bgmVolume": 0.8, "sfxVolume": 1.0 },
  "display": { "showDamageNumbers": true }
}
```

## 7. 数据管理设计 (Data Management)

### 7.1 数据存储 (Persistence)
*   **用户存档**: 使用 `localStorage` 或 `IndexedDB` 存储用户的进度、背包、角色状态。
*   **格式**: JSON 字符串序列化 `DataConfig` 对象。
*   **自动保存**: 在 `BATTLE_SETTLEMENT` 和关键状态切换时触发。

### 7.2 静态数据加载 (Asset Loader)
*   **配置表**: 技能、物品、敌人数据存储在 JSON 文件中。
*   **加载策略**: 游戏启动 (`INIT` 状态) 时预加载核心配置，关卡资源在进入关卡前按需加载。

### 7.3 运行时缓存 (Runtime Cache)
*   **DataManager**: 维护当前活跃的游戏对象实例，避免频繁反序列化。

## 8. 游戏流程详述

### 8.1 登录阶段
1.  **输入**: 用户名/密码 (或点击“开始游戏”)。
2.  **处理**: 检查本地存档，若无则创建新存档 (New Game)，若有则读取 (Load Game)。
3.  **输出**: 玩家基础数据对象，跳转至 `MAIN_MENU`。

### 8.2 关卡选择
1.  **输入**: 玩家点击关卡节点 ID。
2.  **处理**: 校验前置关卡是否通关，校验体力/消耗品。
3.  **输出**: 关卡配置数据，跳转至 `BATTLE_PREPARE`。

### 8.3 战斗场景 (核心循环)
1.  **初始化**: 加载场景资源，实例化玩家与敌人对象。
2.  **回合开始**:
    *   恢复 AP，结算持续性效果 (DOT/HOT)。
    *   进入 **技能配置阶段 (Planning Phase)**。
3.  **技能配置阶段**:
    *   **玩家输入**:
        *   `addSkillToQueue`: 将技能加入待释放队列 (检查 AP 是否足够)。
        *   `removeSkillFromQueue`: 从队列中移除技能 (返还占用 AP)。
        *   `commitTurn`: 确认技能配置完成，锁定玩家输入。
    *   **敌人AI**: 在玩家确认后，AI 根据策略生成技能队列。
    *   **状态流转**: 双方确认后，进入 **技能释放阶段 (Execution Phase)**。
4.  **技能释放阶段**:
    *   **排序**: 将双方队列中的所有技能合并，根据角色速度 + 技能速度修正值进行排序，生成本回合的 `ActionTimeline`。
    *   **执行循环**:
        *   按顺序取出下一个技能行动。
        *   **处理**: 执行技能逻辑，计算命中/暴击/伤害/护甲损耗。
        *   **状态检查**: 每次造成伤害后立即调用 `checkBattleStatus()`。若战斗结束，中断循环。
        *   **输出**: `BATTLE_LOG` 事件 (包含伤害数值、状态变更)。
        *   **延迟**: 每个技能之间预留时间间隙供前端播放动画。
5.  **回合结束**: 所有技能执行完毕后，循环至“回合开始”。

### 8.4 结算阶段
当 `checkBattleStatus()` 检测到满足结束条件时触发：
1.  **判定条件**:
    *   **胜利**: 所有敌人 HP <= 0。
    *   **失败**: 玩家 HP <= 0。
2.  **处理逻辑**:
    *   **胜利**: 发放经验、金币、掉落物，更新存档进度。
    *   **失败**: 显示重试或返回菜单选项。
3.  **输出**: 
    *   发布 `BATTLE_END` 事件 (包含 `{ victory: boolean }`)。
    *   跳转至 `LEVEL_SELECT` 或 `MAIN_MENU`。

## 9. 引擎输入输出接口规范 (I/O Interface)

引擎不直接操作 DOM，而是通过标准接口与 UI 层交互。

### 9.1 输入接口 (Input)
UI 层调用引擎暴露的方法：
*   `Engine.input.login(username)`
*   `Engine.input.selectLevel(levelId)`
*   `Engine.input.addSkillToQueue(skillId, targetId, bodyPart)`
*   `Engine.input.removeSkillFromQueue(index)`
*   `Engine.input.commitTurn()`

### 9.2 输出接口 (Output)
UI 层监听引擎发布的事件：
*   `Engine.on('STATE_CHANGED', (state) => { ... })`
*   `Engine.on('BATTLE_LOG', (log) => { console.log(log.text); renderEffect(log); })`
*   `Engine.on('DATA_UPDATE', (data) => { updateUI(data); })`
*   `Engine.on('BATTLE_UPDATE', (data) => { updateBattleUI(data); })`
*   `Engine.on('BATTLE_END', (result) => { showResult(result.victory); })`
