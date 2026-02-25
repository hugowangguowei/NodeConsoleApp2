# UI 设计文档 (UI_design.md)

本文档基于 `mock_ui_v5.html` 及 `mock_ui_v5.css` 编写，详细描述了网页回合制战斗系统的界面设计、视觉风格、交互逻辑及与游戏引擎的接口定义。

## 1. 界面布局设计

界面采用 **1920x1080** 分辨率的固定布局（`.app-shell`），整体采用 Grid 和 Flexbox 混合布局。

### 1.1 整体结构
主界面 (`main`) 位于屏幕中央，分为上下三个主要区域（Grid 布局）：

#### 1.1.1 上部：战斗场景与状态区 (Scene Wrapper)
*   **高度**: 546px
*   **容器样式**: 深蓝背景 (`#252b45`)，圆角边框，带阴影。
*   **布局**: 包含顶部的时间轴和下方的战斗主体行。

**(1) 时间轴 (.timeline)**
*   **位置**: 顶部区域。
*   **功能**: 横向排列显示当前回合的行动顺序。
*   **组件细节**:
    *   **Timeline Item**: 每个单位的行动卡片，包含单位名称、行动类型及速度值。
    *   **连接线**: 贯穿所有 Item 的水平线条，指示时间流向。

**(2) 战斗主体行 (.battle-row)**
*   **布局**: Grid 布局，分为三列：左侧玩家状态、中间战斗场景、右侧敌人状态。

*   **左侧：玩家状态面板 (.player-hud)**
    *   **宽度**: 420px。
    *   **基础属性**: 包含 HP 条（红渐变）、AP 条（青渐变），显示当前值/最大值。
    *   **状态栏 (.status-row)**: 分为 BUFF 和 DEBUFF 两行，显示状态图标 (`.status-icon`)，悬停显示详情。
    *   **护甲列表 (.armor-list-wrapper)**: 垂直列表，显示各部位（头、胸、腹、四肢）的护甲值及损耗进度条。

*   **中间：战斗场景可视区 (.battle-scene)**
    *   **宽度**: 自适应 (1fr)。
    *   **层级结构**:
        *   **背景层 (.stage-background)**: 显示场景图片（如森林）。
        *   **角色层 (.fighters-layer)**: 包含玩家和敌人的立绘容器 (`.fighter`)。
            *   **立绘容器**: 支持多层叠加（素体、装备、武器）。
            *   **阴影**: 角色脚底的圆形阴影。
            *   **特效挂载点 (.effect-anchor)**: 用于播放受击、施法特效。
        *   **特效层 (.fx-layer)**: 最上层，用于显示全屏特效或伤害数字。

*   **右侧：敌人状态面板 (.enemy-hud)**
    *   **宽度**: 420px。
    *   **布局**: 与玩家面板对称（右对齐），内容结构一致。

#### 1.1.2 中部：操作与信息区 (Action Panel)
*   **高度**: 286px
*   **容器样式**: 深色背景 (`#2c3350`)，带青色边框 (`#7cf5d9`)。
*   **布局**: Flex 布局，分为左右两部分。

**(1) 技能面板 (.skill-panel)**
*   **占比**: Flex 9。
*   **布局**: 采用 **三栏式布局 (.skill-deck-layout)**，建议比例 `5:3:2`，从左至右分别为：

*   **左栏：技能库 (Skill Pool)**
    *   **技能网格 (.skill-grid-view)**: 自动填充的 Grid 布局，显示所有可用技能图标 (`.skill-icon-button`)。
    *   **排序栏 (.skill-sort-bar)**: 底部工具栏，包含“默认”、“AP消耗”、“目标类型”等排序按钮。

*   **中栏：待执行队列 (Action Matrix)**
    *   **功能**: 可视化显示本回合预设的技能序列，支持区分敌我目标。
    *   **组件**:
        *   **Self Zone**: 针对玩家自身的技能卡槽（用于治疗/Buff）。
        *   **Enemy Zone**: 针对敌人的攻击技能卡槽（分部位）。
        *   **Placeholders**: 空置卡槽，选中技能时高亮提示插入位置。

    *   **槽位容量来源（重要）**:
        *   行动槽位是战斗机制核心约束，其数量不由静态 HTML 写死。
        *   UI 在进入战斗后根据引擎运行态快照 `runtime.battleRules.slotLayout` 动态生成 `.matrix-row` 与 `.slot-placeholder`。
        *   槽位规则由 `assets/data/slot_layouts.json` 定义，并由 `levels.json -> battleRules.slotLayoutId`（优先）或 `config.json -> battleRules.slotLayoutId`（默认）选择。

    *   **排版规则（标签对齐）**:
        *   Action Matrix 每一行使用三列布局：`self-zone | part label | enemy-zone`。
        *   为避免由于 `self` 槽位数量不一致导致标签列横向漂移：
            *   标签列（part label）宽度固定。
            *   `self-zone` 列宽固定为“当前布局中 self 最大槽位数”对应的宽度。
            *   UI 在渲染矩阵时计算 `maxSelfSlots` / `maxEnemySlots` 并写入容器 CSS 变量（如 `--matrix-self-max`），由 CSS 计算列宽。

*   **右栏：动态详情 (Detail & Context)**
    *   **宽度**: 较窄，仅用于展示关键信息。
    *   **功能**: 显示选中技能的详情或待执行指令的预测结果。
    *   **组件**: 技能名称、消耗、效果描述、战术提示等。

**(2) 回合控制面板 (.turn-panel)**
*   **占比**: Flex 1。
*   **功能**: 包含回合流程控制按钮。
*   **组件**: 垂直排列的按钮组 (`.turn-buttons`)，建议配置以下功能按钮：
    *   **执行/开始 (Execute)**: 提交当前行动队列，进入执行阶段 (`EXECUTION`)。状态为 `PLANNING` 且队列非空时高亮。
    *   **重置 (Reset)**: 一键清空当前玩家的所有预设行动，返还所有 AP。用于快速重新规划。
    *   **撤销 (Undo)** (可选): 撤销上一步操作。
    *   **设置 (Settings)** (可选，若右上角已有系统入口则可忽略): 呼出系统菜单。
    *   *(旧版设计中的“上一回合”在无时间回溯机制下不适用，已移除；“暂停”功能归并至系统菜单)*。

#### 1.1.3 下部区域
(预留区域，当前版本 CSS 定义了第三行 186px，但 HTML 中暂未填充内容，Footer 位于 Main 之外)。

### 1.2 模态窗口 (System Modal)
*   **定位**: 绝对定位覆盖全屏，居中显示。
*   **尺寸**: 宽度 600px，最大高度 85vh。
*   **用途**: 用于系统菜单、关卡选择、存档/读档等非战斗操作。
*   **组件结构**:
    *   **标题栏 (.modal-header)**: 显示模态框标题，包含关闭按钮。
    *   **内容区 (.modal-content)**: 根据不同视图渲染不同内容。
    *   **底部操作区 (.modal-footer)**: 显示确认/取消按钮。

## 2. 颜色与字体设计

界面风格偏向 **深色科幻/魔幻风格**，使用冷色调为主，高亮色为辅。

### 2.1 颜色板
*   **背景色**:
    *   全局背景: 深蓝渐变 (`#1f2440` 到 `#151a2b`)。
    *   容器背景: 半透明深蓝 (`rgba(32,38,63,0.94)`), 面板背景 (`#252b45`, `#2f3551`, `#2c3350`)。
*   **文字颜色**:
    *   主要文字: 亮白/淡蓝 (`#f4f6ff`, `#e5eaff`)。
    *   次要文字: 灰蓝 (`#cbd6ff`, `#8fa3bf`)。
    *   标签文字: 强调色 (`#81a5ff`, `#7cf5d9`, `#c08bff`)。
*   **功能色**:
    *   **玩家/友方**: 亮蓝/青色 (`#57c2ff`, `#7cf5d9`)。
    *   **敌人/敌对**: 红色/粉红 (`#ff5f5f`, `#ff9dbb`)。
    *   **中立/系统**: 紫色 (`#c08bff`), 金色 (`#ffd266`).
    *   **HP 条**: 红渐变 (`#ff8e8e` -> `#ff5f5f`)。
    *   **AP 条**: 青渐变 (`#7bffcf` -> `#4ff3a0`)。

### 2.2 字体与排版
*   **字体**: 默认系统无衬线字体，强调数字和标题的清晰度。
*   **字号**:
    *   标题: 1.1rem - 1.2rem。
    *   正文: 0.8rem - 0.9rem。
    *   标签/小字: 0.6rem - 0.75rem。
*   **装饰**: 大量使用边框 (`border`), 阴影 (`box-shadow`), 圆角 (`border-radius`) 和 渐变 (`linear-gradient`) 来营造质感。

## 3. 交互设计

### 3.1 技能选择
*   **操作**: 点击 `.skill-icon-button`。
*   **反馈**:
    *   **Hover**: 边框变金 (`#ffd700`)，图标放大，层级提升。
    *   **Active (选中)**: 边框变青 (`#7cf5d9`)，添加发光阴影。
    *   **联动**: 点击技能后，右侧 `.skill-detail` 面板会实时更新显示该技能的名称、消耗、效果、目标等信息。

### 3.2 技能排序
*   **操作**: 点击 `.skill-sort-bar` 中的排序按钮（默认、AP消耗、目标类型）。
*   **反馈**: 按钮高亮，下方的技能列表根据对应规则重新排列。

### 3.3 回合控制
*   **操作**: 点击 `.turn-button` (上一回合、暂停、开始)。
*   **反馈**: 按钮有按压效果 (`transform: translateY`) 和 阴影变化。

### 3.4 系统菜单
*   **入口**: 点击右上角悬浮按钮 (`.system-menu-btn`)。
*   **交互**: 弹出模态窗口，背景模糊。点击菜单项可跳转不同子视图（关卡选择、存档列表）。
*   **关闭**: 点击关闭按钮 (`×`) 或遮罩层（如果实现）关闭窗口。

### 3.5 状态提示 (Tooltip)
*   **操作**: 鼠标悬停在状态图标 (`.status-icon`) 上。
*   **反馈**: 显示 CSS 实现的 Tooltip，展示 Buff/Debuff 名称及描述。

## 4. 接口设计 (UI <-> Engine)

为了实现 UI 与游戏引程的解耦，建议采用 **数据驱动** 的方式。UI 模块不直接持有游戏逻辑，而是通过监听事件或绑定数据对象来更新视图。

### 4.1 接收数据 (Engine -> UI)

UI 需要监听以下数据变化或事件来更新显示：

| UI 模块 | 数据源 / 事件 | 数据结构示例 | 更新内容 |
| :--- | :--- | :--- | :--- |
| **Timeline** | `TurnOrderUpdated` | `[{ name: "玩家", action: "重斩", speed: 14, isPlayer: true }, ...]` | 更新顶部行动顺序条的图标和文字。 |
| **Player HUD** | `PlayerStatsUpdated` | `{ hp: 120, maxHp: 150, ap: 4, maxAp: 6, armor: { head: 30, ... }, buffs: [...] }` | 更新 HP/AP 进度条、数值、护甲条、状态图标。 |
| **Enemy HUD** | `EnemyStatsUpdated` | `{ name: "暗影刺客", hp: 80, maxHp: 120, ap: 3, ... }` | 更新敌人名称、HP/AP、护甲、状态图标。 |
| **Skill List** | `PlayerSkillsUpdated` | `[{ id: "s1", name: "重斩", cost: 2, type: "physical", ... }]` | 重新渲染技能网格列表。 |
| **Battle Scene** | `SceneStateUpdated` | `{ playerSprite: "url...", enemySprite: "url...", background: "url..." }` | 更新角色立绘、背景图片。 |
| **Battle Log** | `CombatLogEmitted` | `{ source: "玩家", target: "敌人", action: "攻击", value: 50 }` | (如有日志面板) 显示战斗文本。 |

### 4.2 发送指令 (UI -> Engine)

UI 通过调用引擎提供的 API 或发送事件来传达用户操作：

| 交互操作 | 触发事件 / 调用方法 | 参数示例 | 说明 |
| :--- | :--- | :--- | :--- |
| **选择技能** | `UI_SelectSkill` | `{ skillId: "skill_01" }` | 玩家点击了某个技能，引擎需记录待释放技能。 |
| **取消技能** | `UI_DeselectSkill` | `{ skillId: "skill_01" }` | (如果支持多选) 玩家取消了已选技能。 |
| **开始回合** | `UI_StartTurn` | `null` | 玩家点击“开始”按钮，引擎开始结算回合。 |
| **暂停/继续** | `UI_TogglePause` | `null` | 玩家点击暂停/继续按钮。 |
| **加载关卡** | `UI_LoadLevel` | `{ levelId: "1-1" }` | 在系统菜单中选择了关卡。 |
| **保存游戏** | `UI_SaveGame` | `{ slotId: 1 }` | 在存档菜单中点击保存。 |
| **读取游戏** | `UI_LoadGame` | `{ slotId: 1 }` | 在读档菜单中点击读取。 |

### 4.3 视图状态管理
*   **Skill Detail**: 纯前端逻辑。点击技能图标时，UI 层直接根据 DOM 数据 (`data-*` 属性) 或缓存的技能数据更新详情面板，无需请求引擎（除非数据是动态变化的）。
*   **Sorting**: 纯前端逻辑。UI 层根据当前的技能列表 DOM 元素进行排序，不影响引擎内部数据。

### 4.4 模态窗口接口详解 (System Modal Interface)

模态框作为游戏中的“元操作”界面（登录、菜单、存档、选关），是游戏非战斗状态下的主要交互载体。

#### 4.4.1 监听事件 (Engine -> Modal)

模态框主要监听以下事件来决定显示内容或更新列表：

| 事件名称 | 触发时机 | 数据结构示例 | 模态框处置逻辑 |
| :--- | :--- | :--- | :--- |
| `STATE_CHANGED` | 引擎状态机发生流转时 | `{ from: "INIT", to: "LOGIN" }` | 根据 `to` 的状态值切换模态框的根视图（如登录页、主菜单）。 |
| `DATA_UPDATE` | 存档数据或全局配置更新时 | `{ type: "SAVE_LIST", data: [...] }` | 若当前处于“存档/读档”视图，根据 `data` 刷新存档槽位列表。 |
| `UI:OPEN_MODAL` | UI 逻辑请求打开模态框（如点击设置按钮） | `{ view: "SETTINGS" }` | 打开模态框并渲染“设置”视图。 |

#### 4.4.2 状态处置与视图渲染 (State & View Routing)

模态框内部维护一个视图路由 (`currentView`)，根据引擎状态 (`fsm.currentState`) 或用户操作切换显示内容。

**核心交互流程**:
1.  **App Start** -> `LOGIN` 状态 -> 显示 **登录视图**。
2.  **Login Success** -> `MAIN_MENU` 状态 -> 显示 **主菜单视图**。
3.  **Select Level** -> `BATTLE_PREPARE` 状态 -> **关闭模态框** (进入战斗界面)。
4.  **In Battle** -> 用户点击暂停 -> 显示 **暂停/菜单视图**。

**详细视图定义**:

1.  **Login (登录/欢迎页)**
    *   **触发**: `STATE_CHANGED` -> `LOGIN`.
    *   **内容**:
        *   游戏标题 (Logo).
        *   用户输入框 (`input`): 输入玩家名称。
        *   确认按钮 ("开始冒险"): 点击触发 `Engine.input.login(username)`.
    *   **约束**: 此时不可关闭模态框。

2.  **Main Menu (主菜单)**
    *   **触发**: `STATE_CHANGED` -> `MAIN_MENU` 或 用户点击“系统菜单”按钮。
    *   **内容**:
        *   "继续游戏": 仅当从暂停进入或有中断的战斗存档时显示。
        *   "关卡选择": 切换至 Level Select 视图。
        *   "存档 / 读档": 切换至 Save/Load 视图。
        *   "设置": 切换至 Settings 视图。
        *   "注销": 调用 `backToTitle` 返回登录页。

3.  **Level Select (关卡选择)**
    *   **触发**: 从主菜单进入。
    *   **数据源**: `DataManager.getLevels()`.
    *   **渲染**: 关卡卡片列表。
    *   **交互**: 点击卡片 -> 调用 `Engine.input.selectLevel(id)`。
    *   **注意**: 引擎接收指令后会切换状态至 `BATTLE_PREPARE`，模态框监听到状态变化后应自动隐藏。

4.  **Save/Load (存档/读档)**
    *   **触发**: 从主菜单进入。
    *   **数据源**: `DataManager.getSaveList()`.
    *   **渲染**: 显示存档槽位。每个槽位包含“保存”和“读取”按钮。

#### 4.4.3 发送指令 (Modal -> Engine)

模态框内的操作通常对应引擎的全局方法：

| 接口名称 | 参数结构 | 说明 |
| :--- | :--- | :--- |
| `Engine.input.login(username)` | `username: string` | 玩家在登录页点击开始。引擎加载用户数据并切换至 `MAIN_MENU`。 |
| `Engine.input.selectLevel(levelId)` | `levelId: string` | 玩家点击关卡卡片。引擎加载关卡并切换至 `BATTLE_PREPARE`。 |
| `Engine.input.saveGame(slotId)` | `slotId: number` | 玩家点击“保存”。 |
| `Engine.input.loadGame(slotId)` | `slotId: number` | 玩家点击“读取”。 |
| `Engine.input.resumeGame()` | `null` | 玩家点击“继续游戏”或关闭模态框。 |
| `Engine.input.backToTitle()` | `null` | 玩家点击“注销”。引擎切换状态至 `LOGIN`。 |

#### 4.4.4 技能树界面 (Skill Tree View)

技能树界面用于在主流程中让玩家：
1) 查看“已学习技能/可学习技能/未解锁技能”；
2) 在满足条件时学习技能；
3) 将学习结果写入存档（角色对象的 `player.skills.learned` 与 `player.skills.skillPoints`）。

> **实现策略（方案 B）**：技能树界面不复用 `System Modal`。改为独立的 **Overlay 大窗**（居中大窗），以避免 `System Modal` 的固定尺寸（如 600px 宽度）限制，保证技能树画布的可视面积与交互体验。

##### 4.4.4.0 视图载体：SkillTree Overlay（独立大窗）

*   **定位**：全屏遮罩覆盖（Overlay），中间显示一个“居中大窗”面板。
*   **与 System Modal 的关系**：
    *   `System Modal` 继续用于：登录、主菜单、关卡选择、存档/读档等“系统级小窗”。
    *   技能树使用独立 Overlay，用于“战斗内/角色成长”的“功能型大界面”。
*   **推荐尺寸**（可响应式）：
    *   面板宽度：`min(1400px, 92vw)`
    *   面板高度：`min(900px, 88vh)`
    *   面板内部为三分区：Header / Body / Footer。
*   **关闭方式**：
    *   右上角关闭按钮 `×`。
    *   点击遮罩层关闭（可选，若担心误触可关闭此能力）。
    *   `Esc` 关闭（可选）。
*   **输入屏蔽**：Overlay 打开期间，屏蔽底层战斗界面交互（避免误操作）。

##### 4.4.4.1 触发入口
*   **入口 1**：在战斗准备/战斗界面点击 “打开技能树” 按钮（例如 `mock_ui_v11.html` 的 `btnOpenSkillTree`）。
*   **入口 2**（可选）：`MAIN_MENU` 中增加“技能树”入口。

*   **打开事件**：推荐统一事件 `UI:OPEN_SKILL_TREE`（携带可选参数，如 `focusSkillId`、`returnTo`）。
*   **关闭事件**：推荐 `UI:CLOSE_SKILL_TREE`。

##### 4.4.4.2 数据源与依赖
*   **静态技能定义**：`assets/data/skills_melee_v4_5.json`
    *   `skills[].id/name/description`
    *   `skills[].prerequisites`
    *   `skills[].unlock.cost.kp`
    *   `skills[].unlock.exclusives`（预留互斥）
    *   `skills[].editorMeta.x/y/group`（用于画布布局与分组过滤）
*   **玩家技能进度（动态）**：角色对象（存档）的：
    *   `player.skills.skillPoints`
    *   `player.skills.learned: string[]`

##### 4.4.4.3 界面布局 (Layout)
建议使用三分区布局（Overlay 面板的“标题/内容/底部操作”结构）：

1.  **Header（顶部信息栏）**
    *   标题：技能树
    *   KP 显示：`可用 KP: {player.skills.skillPoints}`
    *   关闭按钮：关闭技能树并返回调用方界面

2.  **Body（主内容区）**
    *   **左侧/中部：技能树画布 (Canvas)**
        *   节点以卡片/圆点呈现，位置由 `skills[].editorMeta.x/y` 决定（若缺失则按默认布局自动排布）。
        *   节点连线：根据 `prerequisites` 绘制从前置 -> 当前的连线。
        *   支持滚动/拖动画布（可选）。
    *   **右侧：详情与操作边栏 (Detail Panel)**
        *   显示当前选中技能：名称、描述、KP 消耗、前置列表、互斥列表（若有）、以及“学习”按钮区域。

3.  **Footer（底部操作区）**
    *   主要按钮：关闭（或“返回”）
    *   次要按钮（可选）：筛选（按 `editorMeta.group`）、重置视图（回到原点）

##### 4.4.4.4 节点状态与视觉规范 (Node States)
技能树节点的状态不直接存储在存档中，而是由 `learned + prerequisites + skillPoints` 推导。

*   **LEARNED（已学习）**
    *   判定：`player.skills.learned` 包含该 `skillId`
    *   视觉：高亮边框/发光；节点角标“已学”。
*   **LEARNABLE（可学习）**
    *   判定：未学习 && 前置全部在 `learned` 中 && `skillPoints >= unlock.cost.kp` && 不触发互斥
    *   视觉：正常亮度 + 可交互提示；详情区显示“学习”按钮。
*   **LOCKED（未解锁）**
    *   判定：未学习 && 前置不满足
    *   视觉：置灰；详情区显示锁定原因（缺少哪些前置）。
*   **INSUFFICIENT_KP（KP 不足）**
    *   判定：前置满足但 `skillPoints < unlock.cost.kp`
    *   视觉：弱高亮/警告色；按钮置灰并提示“KP 不足”。
*   **EXCLUSIVE_LOCK（互斥锁定，预留）**
    *   判定：该技能的 `unlock.exclusives` 中任意技能已学习
    *   视觉：置灰+互斥标记；提示互斥来源。

##### 4.4.4.5 交互流程 (Interaction Flow)

1.  **打开技能树**
    *   UI：显示 SkillTree Overlay（居中大窗）。
    *   数据：读取静态技能表 + 玩家进度，计算节点状态并渲染。

2.  **查看技能**
    *   操作：点击任意节点。
    *   UI：右侧详情区刷新。

3.  **学习技能**
    *   前提：节点状态为 `LEARNABLE`。
    *   操作：点击详情区“学习”。（可选：弹二次确认“消耗 X KP 学习 Y？”）
    *   引擎：调用 `Engine.input.learnSkill(skillId)`（建议新增）。
    *   引擎校验：
        *   `skillId` 存在
        *   未学习
        *   前置满足
        *   KP 足够
        *   互斥满足（若启用）
    *   引擎更新：
        *   `player.skills.skillPoints -= unlock.cost.kp`
        *   `player.skills.learned.push(skillId)`
        *   触发 `DATA_UPDATE`（或新增 `PLAYER_SKILLS_UPDATED`）
        *   触发保存（落地到存档/`localStorage`）
    *   UI 更新：
        *   Header KP 数值刷新
        *   当前节点切换为 `LEARNED`
        *   受影响的后续节点重新计算状态
        *   主界面技能池（Skill Pool）收到 `DATA_UPDATE` 后立即刷新

4.  **关闭技能树**
    *   操作：点击关闭按钮。
    *   UI：关闭 SkillTree Overlay。
    *   联动：战斗界面的技能列表（Skill Pool）应刷新，使新学技能在可用技能池中可见。

##### 4.4.4.6 与引擎的接口约定 (UI <-> Engine)

*   **UI -> Engine**
    *   `Engine.input.learnSkill(skillId)`：学习技能（新增接口）。
*   **Engine -> UI**
    *   `DATA_UPDATE`：当玩家技能点或 learned 列表变化时触发（或单独事件 `PLAYER_SKILLS_UPDATED`）。

##### 4.4.4.7 UI 模块建议 (Code Architecture)

为保持高内聚、低耦合，建议实现为独立 UI 组件，例如：

*   `UI_SkillTreeOverlay`（推荐命名）：
    *   管理 Overlay 容器的创建/显示/销毁。
    *   挂载技能树画布与详情面板。
    *   只依赖 `engine.eventBus`、`engine.input`、`engine.data`。
*   `UI_SystemModal`：不再承载技能树 UI，仅保留系统类小窗。

##### 4.4.4.8 状态管理结构与事件流建议

**状态结构（SkillTree Session State，推荐：会话暂存 / staging）**

为避免 `DATA_UPDATE` 导致 UI 被“重挂载”而丢失会话选择，本界面将状态分为 **持久数据**（Engine 数据）与 **会话暂存**（Overlay 内部）。

*   **持久数据（Engine / Save）**
    *   `player.skills.skillPoints`：当前可用 KP（已提交）
    *   `player.skills.learned: string[]`：已学习技能（已提交）
*   **会话基线（Session Snapshot，打开时创建一次）**
    *   `baseSkillPoints`：打开时的 KP
    *   `baseLearned`：打开时的 learned（深拷贝）
    *   `baseSelectedSkillId`：打开时默认选中（可空）
*   **会话暂存（Session Staging）**
    *   `stagedLearned: Set<string>`：本次打开期间“学习(暂存)”的技能集合（未提交）
    *   `stagedCostKp: number`：本次暂存消耗 KP 合计（派生值，或缓存）
    *   `selectedSkillId`：当前选中技能（仅 UI）
    *   `isDirty`：是否存在未提交更改（例如 `stagedLearned.size > 0` 或 `selectedSkillId !== baseSelectedSkillId`）

**关键交互事件流（两阶段：学习 / 提交并关闭）**

1.  **打开技能树**：
    *   创建 `Session Snapshot`（baseKP/baseLearned/baseSelectedSkillId），并初始化 `stagedLearned = ?`。
2.  **选择节点**：
    *   仅更新 `selectedSkillId`（不会改动 Engine 数据）。
3.  **学习（会话内）**：
    *   点击详情区“学习”按钮，将技能加入 `stagedLearned`。
    *   UI 立刻以 `baseLearned + stagedLearned` 推导节点状态（增加 `PENDING` 状态，表示“已暂存待提交”）。
    *   KP 显示为 **剩余 KP（基线 KP - stagedCostKp）**。
4.  **撤销本次未提交更改（原“重置本次选择”）**：
    *   清空 `stagedLearned`，`selectedSkillId` 恢复为 `baseSelectedSkillId`，`isDirty=false`。
    *   不触发 `DATA_UPDATE`，因为未提交更改不应影响全局。
5.  **提交并关闭（新增按钮）**：
    *   对 `stagedLearned` 做最终校验（前置、互斥、KP）。
    *   写入 Engine 持久数据：
        *   `player.skills.learned = unique(baseLearned ∪ stagedLearned)`
        *   `player.skills.skillPoints = baseSkillPoints - stagedCostKp`
    *   触发 `DATA_UPDATE(type=PLAYER_SKILLS)`，并持久化保存。
    *   关闭 Overlay。
6.  **重置所有技能**：
    *   清空 `player.skills.learned` 并返还全部 KP，触发 `DATA_UPDATE` 与保存。
    *   若技能树 Overlay 正在打开：重置 `Session Snapshot` 与 `stagedLearned`，并刷新 UI。

**按钮启用/禁用建议（两阶段模型）**

*   “撤销本次未提交更改”：`stagedLearned.size === 0 && selectedSkillId === baseSelectedSkillId` 时置灰。
*   “学习”：当前选中技能状态为 `LEARNABLE` 且剩余 KP 足够时可用。
*   “提交并关闭”：`stagedLearned.size > 0` 时可用；若最终校验失败则提示原因。
*   “重置所有技能”：已学习为空时置灰。

**节点状态补充（新增 PENDING）**

*   `PENDING`（已暂存待提交）
    *   判定：技能不在 `baseLearned`，但在 `stagedLearned`
    *   视觉：区别于 `LEARNED`（例如虚线边框/不同高亮），并在详情区标注“待提交”



### 4.5 战斗主体行接口详解 (Battle Row Interface)

战斗主体行 (`.battle-row`) 是战斗画面的核心区域，包含玩家状态 (`PlayerHUD`)、战斗场景 (`BattleScene`) 和敌人状态 (`EnemyHUD`)。

#### 4.5.1 监听事件 (Engine -> Battle Row)

该模块主要监听战斗循环中的状态更新事件：

| 事件名称 | 触发时机 | 数据结构示例 | 处置逻辑 |
| :--- | :--- | :--- | :--- |
| `BATTLE_START` | 战斗初始化时 | `{ player: {...}, level: {...} }` | 初始化玩家和敌人的 HUD，加载场景背景和角色立绘。 |
| `BATTLE_UPDATE` | 任何战斗数据变更时 | `{ player: {...}, enemies: [...], turn: 1, phase: "PLANNING" }` | 全量或增量更新 HP/AP 条、护甲状态、Buff 图标。 |
| `TURN_START` | 回合开始时 | `{ turn: 2 }` | (可选) 显示回合开始特效，重置临时状态显示。 |
| `BATTLE_LOG` | 发生战斗行为时 | `{ text: "...", action: {...}, result: {...} }` | 在角色头顶显示飘字 (Damage Text) 或播放受击特效。 |

#### 4.5.2 状态处置与视图渲染

战斗主体行通常由三个子组件协同工作，它们共享上述事件数据，但关注点不同。

1.  **Player HUD (玩家状态)**
    *   **数据源**: `data.player`.
    *   **渲染**:
        *   **HP/AP Bar**: 根据 `current / max` 计算百分比宽度。
        *   **Armor List**: 遍历 `bodyParts` 或 `equipment`，渲染各部位护甲值。若护甲为 0，添加 `.broken` 样式。
        *   **Buffs**: 渲染状态图标列表。

2.  **Enemy HUD (敌人状态)**
    *   **数据源**: `data.enemies` (通常取第一个或当前选中的敌人).
    *   **渲染**: 与 Player HUD 类似。若有多个敌人，需根据 `SelectedTarget` 切换显示或显示列表。

3.  **Battle Scene (战斗场景)**
    *   **数据源**: `data.player` & `data.enemies`.
    *   **渲染**:
        *   **立绘**: 根据 ID 加载对应图片。
        *   **状态反馈**: 若单位死亡 (`hp <= 0`)，添加灰度或淡出效果。
        *   **特效**: 监听 `BATTLE_LOG` 中的 `action` 和 `result`，在对应位置播放动画（如攻击动作、受击闪烁）。

#### 4.5.3 发送指令 (Battle Row -> Engine)

目前设计中，战斗主体行主要作为 **纯展示模块 (View-Only)**，不直接向引擎发送指令。
所有的交互操作（如选择技能、切换目标）均由 **技能面板 (.skill-panel)** 或其他控制模块处理。

### 4.6 技能面板交互与深度设计 (Skill Panel Deep Dive)

本章节基于核心引擎 `CoreEngine.md` 中定义的 "Planning Phase"（策略规划阶段）逻辑，详细阐述技能面板的功能区划与交互流程。

#### 4.6.1 设计目标
1.  **明确的规划感**: 玩家需要清晰地看到本回合“打算做什么”，即**待执行队列 (Action Queue)** 的可视化。
2.  **部位打击支持**: 交互必须支持从“选技能”到“选目标”再到“选部位”的多级流程。
3.  **AP 资源敏感**: 实时显示剩余 AP，动态禁用无法释放的技能。

#### 4.6.2 功能区重构 (Functional Layout)
在 UI 布局上，`skill-panel` 需重构为 **从左至右的三栏式布局** (`.skill-deck-layout`)。建议各栏宽度比例为 `50% : 30% : 20%`。

1.  **技能库 (Skill Pool)** (`Left Column`)
    *   **展示**: 网格化显示所有可用技能。
    *   **状态**:
        *   **Normal**: AP 足够，未进入冷却。
        *   **Disabled**: AP 不足（图标变灰，显示红字消耗）或 冷却中（显示遮罩）。
        *   **Selected**: 玩家点击了技能，技能处于选中态，等待玩家点击中间栏的**待执行队列**中的目标位置进行确认。

2.  **待执行队列 (Action Matrix)** (`Center Column`)
    *   **功能**: 可视化显示本回合预设的技能序列，支持区分敌我目标。
    *   **组件**:
        *   **Self Zone**: 针对玩家自身的技能卡槽（用于治疗/Buff）。
        *   **Enemy Zone**: 针对敌人的攻击技能卡槽（分部位）。
        *   **Placeholders**: 空置卡槽，选中技能时高亮提示插入位置。
    *   **区域 A: 玩家/友方队列 (Self-Target Zone)**
        *   **位置**: 矩阵左侧。
        *   **结构**: `N (部位数，默认最大 8) × 1` 的网格。与玩家状态区的护甲部位数量保持一致。
        *   **用途**: 用于放置对自己或友方释放的技能（如治疗、护甲修复、自我增益）。由于通常一回合对同一部位的增益较少，每行仅保留 1 个槽位。
    *   **区域 B: 敌方/进攻队列 (Enemy-Target Zone)**
        *   **位置**: 矩阵右侧。
        *   **结构**: `M (部位数，默认最大 8) × 3` 的网格。与玩家状态区的护甲部位数量保持一致。
        *   **用途**: 用于放置攻击敌人的技能。每行提供 3 个槽位，支持对同一部位进行多次打击（如三连击）。
    *   **行定义 (Row Definitions)**: 两个区域共享行标（或垂直对齐），行代表 **作用部位**（如 Header, Torso, Limbs）。
    *   **占位符 (Placeholders)**: 平时显示为空槽 (`.slot-placeholder`)。当选中技能时，根据技能的目标类型（敌/我）及允许部位，仅高亮对应区域的对应行空槽。建议**缩小占位符尺寸**（例如从 48px 减小至 32px-40px），使界面更加紧凑。

3.  **动态详情 (Context Detail)** (`Right Column`)
    *   **宽度**: 紧凑设计。
    *   **展示**: 
        *   默认显示选中的技能详情。
        *   当鼠标悬停在待执行队列的某个技能上时，显示该次行动的预测结果（如：命中率修正、是否会破坏护甲）。

#### 4.6.3 交互逻辑详解 (Interaction Flow)

采用 **"技能 -> 槽位 (Skill to Slot)"** 的配置模式，减少 UI 模块与场景 (`BattleScene`) 的直接耦合。

**流程 A: 技能入列 (Enqueue)**
1.  **Select Skill**: 玩家点击左侧栏 **技能库** 中的技能 `S`。
    *   UI 反馈: 技能 `S` 变更为 Selected 状态。
    *   **Slot Highlight**: 系统判断技能 `S` 的目标倾向（Self/Enemy）及可用部位。
        *   **若为进攻技能**: 中间栏 **敌方队列 zone** 中对应部位行的空槽高亮闪烁。
        *   **若为增益技能**: 中间栏 **玩家队列 zone** 中对应部位行的空槽高亮闪烁。
2.  **Confirm Target**: 玩家点击中间栏高亮的某个 **占位符** `P`。
    *   数据更新（slotKey-based planning）:
        *   UI 为占位符构造 `slotKey = "{side}:{part}:{index}"`（例如 `enemy:head:0`）。
        *   调用 `Engine.input.assignSkillToSlot({ slotKey, skillId: S, targetId, bodyPart, replaceIfAlreadyPlaced: true })`。
    *   UI 更新: 技能 `S` 的图标填入该占位符。AP 条扣除对应消耗。

**流程 B: 撤销指令 (Dequeue)**
1.  玩家点击 **待执行队列** 中已填入技能的卡槽。
2.  数据更新: 调用 `Engine.input.unassignSlot(slotKey)`。
3.  UI 更新: 卡槽变回空的占位符，AP 返还。

> 规则说明（由引擎 Planning 模块统一保证）：
> - **替换（单选技能）**：保持技能选中，点击另一个可用槽位，若该技能允许的最大放置数 `maxSlots=1`，则替换旧绑定。
> - **取消**：点击已占用槽位即取消该槽位。
> - **不允许覆盖**：槽位已被其它动作占用时，引擎拒绝放置。
> - **多选上限**：由 `skill.placement.maxSlots` 控制，达到上限后拒绝继续放置。

**流程 C: 回合结束 (Commit)**
1.  玩家点击 **回合控制面板** 的 "开始 (Start)" 按钮。
2.  引擎校验队列合法性，发送 `commitTurn` 指令。

#### 4.6.4 交互细节：技能库 (Skill Pool Logic)

*   **数据驱动 (Data Source)**:
    *   `player.skills`: 基础技能数据（图标、名称、消耗、适用部位）。
    *   `battle.ap`: 当前剩余行动力，用于判定技能是否可用。
    *   `skill.cooldown`: 技能冷却状态。
*   **交互操作 (Interaction)**:
    *   **左键单击**: 选中一个技能。
        *   若该技能已选中，则取消选中。
        *   若 AP 不足或 CD 中，点击无效并反馈（如震动或提示音）。
*   **区域联动 (Linkage)**:
    *   **-> 待执行队列**: 选中技能后，通知队列区域进入“待填入模式”。根据技能的 `validParts`（可用部位）和 `targetType`（敌/我），队列区域高亮对应的有效插槽（Placeholders）。
    *   **-> 动态详情区**: 选中或悬停技能时，详情区显示该技能的静态属性（基础伤害、消耗、描述）。
*   **引擎交互 (Engine Interface)**:
    *   此区域的操作主要为纯前端状态切换 (`currentSelection`)，暂不直接向引擎发送指令，直到玩家在队列区域进行确认。

#### 4.6.5 交互细节：待执行队列 (Action Matrix Logic)

*   **数据驱动 (Data Source)**:
    *   `turn.plannedActions`: 引擎中记录的当前回合已预设的行动列表。
    *   `ui.selectedSkill`: 前端记录的当前选中技能（来自技能库）。
    *   `entity.bodyParts`: 玩家和当前敌人的有效部位列表（用于判定部位是否存在）。
*   **状态显示 (State Display)**:
    *   **缺失部位处理 (Missing Parts)**: 若某一方（玩家或敌人）不存在特定部位（例如类似史莱姆的敌人没有“头部”或“四肢”，或者特定人形怪没有“腹部”定义），则矩阵中对应的 **行 (Row)** 应被标记为 **不可用 (N/A)**。
        *   **视觉表现**: 该行对应的区域背景色变深（如使用深灰色掩码），以区别于普通的“未选中”状态。
        *   **交互限制**: 即使选择了适用该部位的技能，该行的槽位也不会高亮，且无法点击。
*   **交互操作 (Interaction)**:
    *   **点击空槽 (Placeholder Click)**:
        *   **条件**: 必须已有 `selectedSkill`，且该槽位高亮（符合部位/目标限制）。
        *   **结果**: 将技能填入该槽位，前端预扣除 AP。
        *   **指令**: `Engine.input.assignSkillToSlot({ slotKey, skillId, targetId, bodyPart })`。
    *   **点击已占槽 (Filled Slot Click)**:
        *   **结果**: 移除该行动，返还 AP。
        *   **指令**: `Engine.input.unassignSlot(slotKey)`。
*   **区域联动 (Linkage)**:
    *   **-> 技能库**: 当 AP 变化时，通知技能库刷新可用状态（如 AP 从 2 降为 0，消耗 1 AP 的技能变灰）。
    *   **-> 动态详情区**: 鼠标悬停在已填充的行动块上时，详情区显示该行动的上下文信息（例如：预计对该部位造成的最终伤害区间、命中率修正）。
*   **引擎交互 (Engine Interface)**:
    *   `assignSkillToSlot`: 验证 slotKey/容量/AP/上限/覆盖规则后更新 planning。
    *   `unassignSlot`: 移除 planning 中对应的动作。

#### 4.6.6 交互细节：动态详情区 (Context Detail Logic)

*   **数据驱动 (Data Source)**:
    *   `ui.hoverItem`: 当前鼠标悬停的对象（技能库图标 OR 队列中的行动块）。
    *   `ui.selectedSkill`: 当前选中的技能。
*   **交互操作 (Interaction)**:
    *   本区域主要为被动展示区，无直接交互。
    *   支持简单的 Tooltip（如鼠标悬停在关键词“燃烧”上显示状态说明）。
*   **区域联动 (Linkage)**:
    *   **<- 技能库/待执行队列**: 监听这两者的 Hover/Select 事件来决定显示内容。
    *   优化体验：若无选中也无悬停，显示默认提示（如“请选择技能”）。
*   **引擎交互 (Engine Interface)**:
    *   无直接交互。

#### 4.6.7 交互方式分析：为什么选择“技能 -> 槽位”？ (Why "Skill to Slot"?)

针对本游戏的**精确部位打击**特性，**点选模式更优**：

1.  **精度问题**: 拖拽要求玩家将图标准确拖到一个很小的区域（例如敌人的头部）。在 Web 端（尤其是触摸板或高分辨率屏幕）这容易导致误操作（想打头却判定为打身体）。
2.  **遮挡问题**: 拖拽过程中，手指或鼠标指针可能遮挡目标状态（如当前的护甲值）。
3.  **多级选择**: 某些技能可能需要二次确认（如选择 buff 施加给谁）。点选流程天然支持分步操作，而拖拽通常意味着“释放即生效”，难以插入中间步骤（除非设计复杂的悬停菜单）。
4.  **稳定性**: HTML5 Drag API 在不同浏览器（及移动端 WebView）的表现差异较大，而 Click 事件是最稳定可靠的。

#### 4.6.8 接口定义补充

除了通用的 `BATTLE_UPDATE`，建议增加专门针对 **Planning Phase** 的轻量级接口：

## 4.7 回合控制面板与战术流程 (Turn Control & Tactical Flow)

本章节基于 `CoreEngine` 的 `PLANNING` -> `EXECUTION` 状态流转，定义回合控制面板的交互逻辑。

#### 4.7.1 功能分析与按钮设计
当前游戏为**预设指令式**回合制（玩家先规划所有 AP，再统一结算），因此控制面板的核心并非控制“播放/暂停”，而是控制“规划状态”。

*   **不再需要 "上一回合"**: 游戏核心逻辑不支持时间回溯 (Time Rewind)。若玩家对上回合结果不满，通常通过 "读档 (Load Game)" 解决，而非战斗内按钮。
*   **不再强调 "暂停"**: 回合制游戏的 Planning 阶段本身就是静止的。Execution 阶段如果是动画播放，通常由系统自动进行，若需中断（如跳过动画），可设计点击屏幕任意位置跳过，或独立的 "Skip" 按钮，而非 "Pause"。
*   **新增 "重置 (Reset)"**: 玩家在规划过程中可能填满了 6 点 AP，但突然想换个思路。逐个点击矩阵中的技能取消太慢，需要一键清空队列 (`Clear Queue`)。

#### 4.7.2 按钮逻辑详解

| 按钮名称 | 对应指令 / 逻辑 | 视觉状态 (State) | 触发条件 |
| :--- | :--- | :--- | :--- |
| **执行 (Execute)** | `Engine.input.commitTurn()` | **Disabled**: 队列为空 或 AP 未用完(视设计而定,当前允许留存AP)<br>**Active (Primary)**: 队列中有至少一个有效行动。 | 玩家完成规划，准备看结果。 |
| **重置 (Reset)** | `playerSkillQueue = []`<br>`Engine.emitBattleUpdate()` | **Disabled**: 队列为空。<br>**Active (Secondary)**: 队列中有行动。 | 玩家想重新规划本回合。 |
| **系统 (Menu)** | `UI:OPEN_MODAL` | **Active (Neutral)**: 随时可用。 | 呼出系统菜单（存读档、投降、设置）。 |

#### 4.7.3 交互反馈
*   **点击 "执行"**:
    1.  面板锁定 (`pointer-events: none`)，防止重复提交。
    2.  播放简单的“指令发送”音效或动画。
    3.  引擎状态切换至 `EXECUTION`，UI 进入“观战模式” (Spectator Mode)，隐藏技能选择高亮，专注于场景区的动画表现。
*   **点击 "重置"**:
    1.  清空 Action Matrix 中的所有图标。
    2.  Action Matrix 下方的详细槽位恢复为 Empty 状态。
    3.  AP 条瞬间回满（视觉上）。
    4.  技能库中因 AP 不足变灰的技能重新变亮。

## 5. 代码设计规范

为了保证 UI 系统的可维护性与扩展性，所有 UI 模块的开发需遵循以下规范：

### 5.1 模块化设计
*   **独立性**: 每个 UI 模块（如 `PlayerHUD`, `SkillPanel`, `SystemModal`）应设计为独立的组件类或闭包。
*   **可测试性**: 组件应具备独立的初始化与销毁方法，能够在不依赖完整游戏环境的情况下进行单元测试或 Storybook 式的视觉测试。

### 5.2 注释与文档
*   **接口说明**: 所有公共方法（Public Methods）和事件监听器必须包含详细的 JSDoc 注释，说明参数结构、返回值及副作用。
*   **逻辑注释**: 复杂的交互逻辑（如拖拽排序、状态映射）需在代码块前添加简要说明。

### 5.3 文件命名规范
*   **统一前缀**: 所有 UI 组件文件应存放在 `script/ui/` 目录下，并统一以 `UI_` 开头，例如：
    *   `UI_PlayerHUD.js`
    *   `UI_SkillPanel.js`
    *   `UI_SystemModal.js`
    *   `UI_BattleScene.js`
*   **样式分离**: 若组件有私有样式，建议使用同名 CSS 文件或在统一的 CSS 文件中使用 BEM 命名法（如 `.ui-player-hud__bar`）。

### 5.4 驱动代码分离 (Decoupling)
*   **逻辑分离**: UI 组件只负责 **“显示数据”** 和 **“捕获输入”**。
    *   **禁止**: 在 UI 代码中直接修改引擎的核心数据（如直接修改 `player.hp`）。
    *   **推荐**: 通过 `Engine.input` 接口发送指令，等待引擎处理后通过事件更新视图。
*   **避免耦合**: UI 组件不应持有 `Engine` 的完整实例引用，仅持有必要的 `EventBus` 或 `InputProxy` 引用。

### 5.5 组件间通信
*   **禁止直接通信**: 不同 UI 组件之间（例如 `SkillPanel` 和 `PlayerHUD`）严禁直接调用对方的方法或修改对方的 DOM。
*   **统一管理**:
    *   若需联动（如选择技能时高亮目标），应通过 **引擎事件** 中转。
    *   或者由一个父级控制器（`UIManager`）统一协调子组件的状态。

