# 战斗场景模块 (Battle Scene Module) 设计方案

## 1. 场景模块构建目标
构建一个高沉浸感、动态反馈丰富的网页回合制战斗场景。该模块旨在将抽象的战斗数据（如伤害数值、状态变化）转化为直观的视觉表现（如攻击动作、受击反馈、护甲破碎），并支持灵活的角色换装（纸娃娃系统）和场景切换，为玩家提供类似横版格斗游戏（如《拳皇》）的视觉体验。

## 2. 场景模块设计理念
本模块遵循 **“视图（View）与逻辑（Model/Controller）分离”** 的设计原则，作为一个松耦合的独立模块存在。

*   **被动表现层**：场景模块不负责计算伤害、判定命中或管理游戏回合，它仅负责“渲染”和“表演”。
*   **订阅者模式 (Subscriber Pattern)**：场景模块作为订阅者，监听游戏主流程（Game Loop）发布的事件。
*   **数据驱动**：场景的初始化（背景、角色外观）和动态更新（动作、特效）完全依赖于上层传递的数据对象。

## 3. 场景模块界面设计

### 3.1 技术栈选择
鉴于项目为网页游戏且追求轻量化与高兼容性，采用以下技术栈：
*   **HTML5 DOM**: 利用 DOM 节点的层级结构管理场景分层（背景、角色、特效）。
*   **CSS3**: 核心渲染引擎。
    *   利用 `transform` (translate, scale, rotate) 实现位移和透视。
    *   利用 `@keyframes` 实现呼吸、攻击、受击等帧动画。
    *   利用 `z-index` 管理遮挡关系。
*   **Vanilla JavaScript**: 用于控制 DOM 操作、类名切换及事件监听，不引入重型图形库（如 Three.js 或 Pixi.js），保持项目轻量。

### 3.2 人物角色实现：纸娃娃系统 (Paper Doll System)
为了支持“护甲可破坏”及“武器更换”的需求，角色渲染采用 **分层叠加 (Layered Composition)** 方案：

*   **容器结构**：每个角色是一个 `.fighter` 容器。
*   **图层堆叠**：容器内包含多个绝对定位的 `.sprite-layer` `div`，按顺序叠加：
    1.  **Body (素体)**: 角色的基础皮肤/身体。
    2.  **Armor (护甲)**: 覆盖在身体上的装备（如胸甲、头盔）。支持通过更换 CSS `background-image` 实现换装；支持通过 CSS `filter` (如 `grayscale`, `opacity`) 或更换破碎素材来表现“护甲破坏”。
    3.  **Weapon (武器)**: 手持的武器层。
    4.  **FX Anchor (特效挂点)**: 用于定位打击特效（如刀光、血迹）。
*   **动作同步**：所有图层共享相同的 CSS 动画类（如 `.anim-attack`），确保角色运动时，装备紧贴身体移动。

### 3.3 界面模块拆分
界面在垂直方向上（Z轴）拆分为三个核心层级：

1.  **背景层 (Stage Background)**
    *   **组成**: 包含 `Stage Sky` (天空/远景) 和 `Stage Floor` (地面/近景)。
    *   **功能**: 提供战斗氛围。支持视差滚动（Parallax）以增强立体感。
2.  **角色层 (Fighters Layer)**
    *   **组成**: 包含 `Player Character` (左侧) 和 `Enemy Character` (右侧)。
    *   **布局**: 使用 Flexbox 布局，通过 `gap` 控制双方对峙距离。
3.  **特效层 (FX Layer)**
    *   **组成**: 一个覆盖全屏的透明层，用于追加临时的 DOM 节点。
    *   **功能**: 播放非绑定角色的全局特效（如全屏魔法、天气效果）或浮动的伤害数字（Floating Text）。

### 3.4 布局样式
*   **视角**: 2.5D 侧视视角（模拟透视）。
*   **对峙站位**:
    *   玩家位于左侧 20%-30% 区域，面向右。
    *   敌人位于右侧 20%-30% 区域，面向左（通过 `transform: scaleX(-1)` 或专用素材实现）。
*   **响应式**: 容器使用相对单位（% 或 vh/vw），确保在不同分辨率下保持构图比例。

## 4. 场景模块接口设计

### 4.1 核心接口理念
场景模块暴露一个统一的 API 实例（如 `BattleScene`），该实例不直接修改游戏数据，而是提供方法供游戏主控调用，或自动监听绑定的游戏事件总线。

### 4.2 事件监听与数据结构
场景模块需要监听以下核心事件，频率通常为“按需触发”（非每帧轮询）：

#### 4.2.1 场景初始化 (SCENE_INIT)
*   **触发时机**: 战斗开始加载时。
*   **数据结构**:
    ```json
    {
      "backgroundId": "forest_01",
      "player": {
        "baseId": "knight_male",
        "equipment": { "armor": "plate_t1", "weapon": "sword_steel" }
      },
      "enemy": {
        "baseId": "orc_warrior",
        "equipment": { "armor": "leather_t2", "weapon": "axe_rusty" }
      }
    }
    ```
*   **响应**: 加载对应图片资源，创建 DOM 结构，设置初始站位。

#### 4.2.2 角色行动 (ACTION_PERFORM)
*   **触发时机**: 角色开始执行技能/攻击时。
*   **数据结构**:
    ```json
    {
      "actorId": "player",
      "targetId": "enemy",
      "actionType": "attack_melee", // 或 "cast_spell", "defend"
      "skillId": "heavy_slash"
    }
    ```
*   **响应**: 播放攻击者的攻击动画（添加 CSS 类），可能伴随位移（冲刺到敌人面前）。

#### 4.2.3 结算反馈 (RESULT_FEEDBACK)
*   **触发时机**: 攻击命中或产生效果时。
*   **数据结构**:
    ```json
    {
      "targetId": "enemy",
      "damage": 120,
      "isCritical": true,
      "hitPart": "chest",
      "armorBroken": true, // 护甲是否被破坏
      "currentHp": 80,
      "maxHp": 200
    }
    ```
*   **响应**:
    1.  播放受击者的受击动画（Shake/Flash）。
    2.  在特效层生成伤害数字（暴击时放大/变色）。
    3.  若 `armorBroken` 为 true，切换目标 Armor 层的素材为“破碎状态”。

#### 4.2.4 角色死亡 (CHARACTER_DEATH)
*   **触发时机**: HP 归零时。
*   **数据结构**: `{ "targetId": "enemy" }`
*   **响应**: 播放死亡倒地动画，并保持倒地状态或淡出消失。

## 5. 系统模态窗口 (System Modal) 设计方案

### 5.1 设计定位
模态窗口（Modal）是独立于战斗场景（Battle Scene）之上的高层级 UI 交互层。它主要承担 `core_engine.md` 中定义的非战斗状态（如 `MAIN_MENU`, `LEVEL_SELECT`）的视觉表现，以及系统级功能（存档、读档、设置）的承载。

### 5.2 界面架构 (UI Architecture)
模态窗口采用 **Overlay (遮罩) + Panel (面板)** 的经典结构，`z-index` 必须高于战斗场景的特效层。

*   **遮罩层 (Backdrop)**:
    *   全屏半透明黑色 (`rgba(0, 0, 0, 0.8)`).
    *   功能：视觉上聚焦中心内容，逻辑上阻断对底层战斗场景的点击操作。
*   **主面板 (Main Panel)**:
    *   居中显示的容器，风格需与游戏整体 UI 统一（如像素风或复古边框）。
    *   **Header**: 标题栏（如 "Select Level", "System Menu"）及关闭按钮。
    *   **Body**: 动态内容区域（根据功能挂载不同的子视图）。
    *   **Footer**: 操作栏（确认、取消、应用）。

### 5.3 功能模块与状态映射
模态窗口的内容根据 `GameFSM` 的状态或特定 UI 事件进行动态切换。

#### 5.3.1 关卡选择 (Level Selection)
*   **对应状态**: `LEVEL_SELECT`
*   **触发**: 游戏启动后或战斗结算完成后。
*   **内容设计**:
    *   **章节列表**: 左侧导航栏切换章节（Forest, Dungeon, Castle）。
    *   **关卡节点**: 右侧显示具体关卡（1-1, 1-2）。
    *   **信息预览**: 点击关卡显示敌方阵容缩略图、推荐等级、潜在掉落。
*   **交互**: 点击“Start Battle” -> 触发事件 `UI:LEVEL_START` -> 引擎切换至 `BATTLE_PREPARE` 或 `BATTLE_LOOP`。

#### 5.3.2 游戏菜单 (Game Menu)
*   **对应状态**: `MAIN_MENU` (或战斗内暂停)
*   **触发**: 点击界面右上角“齿轮”图标或按 `ESC` 键。
*   **内容设计**:
    *   **Resume**: 继续游戏（仅暂停时出现）。
    *   **Save/Load**: 进入存读档子界面。
    *   **Settings**: 音量、显示设置。
    *   **Quit**: 返回标题画面。

#### 5.3.3 存档/读档管理 (Save/Load Manager)
*   **功能**: 实现数据的持久化。
*   **内容设计**:
    *   **槽位列表 (Slots)**: 显示 3-5 个存档槽位。
    *   **槽位信息**: 显示截图（可选）、存档时间、当前关卡、玩家 HP/等级。
    *   **操作**: 覆盖 (Overwrite)、读取 (Load)、删除 (Delete)。
*   **数据流**:
    *   **保存**: 触发 `UI:GAME_SAVE` -> 引擎序列化 `DataManager` 数据 -> 写入 LocalStorage。
    *   **读取**: 触发 `UI:GAME_LOAD` -> 引擎反序列化数据 -> 刷新 `GameFSM` 状态和场景。

### 5.4 交互逻辑与事件流 (Interaction Flow)

模态窗口作为视图层的一部分，同样遵循 **发布-订阅** 模式，不直接修改游戏数据。

1.  **监听状态变更 (Listening)**:
    *   模态管理器监听 `GameFSM` 的 `STATE_CHANGED` 事件。
    *   `IF state == 'LEVEL_SELECT' THEN OpenModal('LevelSelectView')`
    *   `IF state == 'BATTLE_LOOP' THEN CloseAllModals()`

2.  **用户操作反馈 (Feedback)**:
    *   用户在模态窗中的操作（如选择关卡）仅产生 UI 变化（高亮选中项）。
    *   用户点击“确认”时，发布业务事件（如 `UI:SELECT_LEVEL`）。

3.  **数据驱动更新 (Update)**:
    *   例如：存档成功后，引擎发布 `SYSTEM:SAVE_SUCCESS`，模态窗收到后弹出“保存成功”的 Toast 提示，并刷新槽位显示。
