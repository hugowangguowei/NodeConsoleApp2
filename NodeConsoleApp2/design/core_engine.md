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

## 6. 数据管理设计 (Data Management)

### 6.1 数据存储 (Persistence)
*   **用户存档**: 使用 `localStorage` 或 `IndexedDB` 存储用户的进度、背包、角色状态。
*   **格式**: JSON 字符串序列化。
*   **自动保存**: 在 `BATTLE_SETTLEMENT` 和关键状态切换时触发。

### 6.2 静态数据加载 (Asset Loader)
*   **配置表**: 技能、物品、敌人数据存储在 JSON 文件中。
*   **加载策略**: 游戏启动 (`INIT` 状态) 时预加载核心配置，关卡资源在进入关卡前按需加载。

### 6.3 运行时缓存 (Runtime Cache)
*   **DataManager**: 维护当前活跃的游戏对象实例，避免频繁反序列化。

## 7. 游戏流程详述

### 7.1 登录阶段
1.  **输入**: 用户名/密码 (或点击“开始游戏”)。
2.  **处理**: 检查本地存档，若无则创建新存档 (New Game)，若有则读取 (Load Game)。
3.  **输出**: 玩家基础数据对象，跳转至 `MAIN_MENU`。

### 7.2 关卡选择
1.  **输入**: 玩家点击关卡节点 ID。
2.  **处理**: 校验前置关卡是否通关，校验体力/消耗品。
3.  **输出**: 关卡配置数据，跳转至 `BATTLE_PREPARE`。

### 7.3 战斗场景 (核心循环)
1.  **初始化**: 加载场景资源，实例化玩家与敌人对象。
2.  **回合开始**:
    *   计算双方速度，生成 `ActionQueue` (行动队列)。
    *   恢复 AP，结算持续性效果 (DOT/HOT)。
3.  **玩家行动**:
    *   **输入**: 技能ID + 目标ID + 攻击部位。
    *   **处理**: 扣除 AP，计算命中/暴击/伤害/护甲损耗。
    *   **输出**: `BATTLE_LOG` 事件 (包含伤害数值、状态变更)。
4.  **敌人行动**: AI 根据策略选择技能与目标，输出同上。
5.  **回合结束**: 检查胜负条件。若未分胜负，循环至“回合开始”。

### 7.4 结算阶段
1.  **胜利**: 发放经验、金币、掉落物，更新存档进度。
2.  **失败**: 显示重试或返回菜单选项。
3.  **输出**: 结算清单数据，跳转至 `LEVEL_SELECT` 或 `MAIN_MENU`。

## 8. 引擎输入输出接口规范 (I/O Interface)

引擎不直接操作 DOM，而是通过标准接口与 UI 层交互。

### 8.1 输入接口 (Input)
UI 层调用引擎暴露的方法：
*   `Engine.input.login(username)`
*   `Engine.input.selectLevel(levelId)`
*   `Engine.input.castSkill(skillId, targetId, bodyPart)`
*   `Engine.input.endTurn()`

### 8.2 输出接口 (Output)
UI 层监听引擎发布的事件：
*   `Engine.on('STATE_CHANGE', (state) => { ... })`
*   `Engine.on('BATTLE_LOG', (log) => { console.log(log.text); renderEffect(log); })`
*   `Engine.on('DATA_UPDATE', (data) => { updateUI(data); })`
