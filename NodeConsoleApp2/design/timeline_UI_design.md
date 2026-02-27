# Timeline UI 设计方案（ATB 风格技能节点）

> 本文仅描述 `timeline labeled-block` 的 UI/交互与渲染数据需求。
> Timeline 的运算/执行内核见：`design/timeline_design.md`。

---

## 1. 目标与对标

参考《仙剑奇侠传4》等 ATB 行动条的“直线时间轴 + 节点顺序”的可视化方式。

与传统 ATB（节点代表角色）不同：
- **节点代表技能（skill/action entry）**
- 展示的是“本回合行动序列”的先后顺序

用户价值：玩家在提交规划后即可直观看到“将按什么顺序放哪些技能”，并在推演阶段看到节点逐个被消费。

---

## 2. 整体布局

`timeline labeled-block` 建议结构分为三层：

1) **Header（信息 + 控制）**
- 回合号、阶段（READY/PLAYING/PAUSED/FINISHED/ERROR）
- 播放控制：开始 / 暂停 / 单步 / 倍速（1x/2x/4x）

2) **Bar（时间轴轨道 + 节点）**
- 一条横向轨道（track）
- 节点（skill bubbles）按顺序排列在轨道上

3) **Footer（日志/提示，可选）**
- 最近 N 条执行摘要（用于调试与验证）

> 注：如果后续要实现更接近 ATB 的“进度推进”，可以把节点放在轨道上动态移动；但 MVP 建议只做**顺序静态排布 + 当前高亮**。

---

## 3. 节点（Skill Bubble）视觉规范

每个节点表示一个 `TimelineEntry`。

### 3.1 外观
- 形状：**方形圆角气泡**（rounded square）
- 内容：
  - 第一行：阵营标识（玩家/敌人）+ 技能名（短）
  - 第二行：可选数据，例如 `速度/状态`
- 图标：
  - 可选在左上角放一个小 icon（若未来有 `iconKey`）

### 3.2 状态色
- `PENDING`：中性紫/蓝边框
- `RUNNING`（当前执行）：高亮（金色描边/发光）
- `DONE`：偏绿色（完成态）
- `ERROR`：红色（失败态）

### 3.3 交互
- Hover：显示 tooltip（技能名/目标/部位等摘要）
- Click：
  - 高亮选中
  - 在 Footer 或侧栏输出该 entry 的详细信息（MVP 可先输出 console + battle log）

---

## 4. 轨道（Track）与节点布局规则

### 4.1 MVP（推荐）：离散序列布局
- 节点按 index 线性排列：`0..n-1`
- 节点之间固定间距
- 对于节点过多：
  - 方案 A：横向滚动（track 容器 `overflow-x: auto`）
  - 方案 B：自动换行（不太像 ATB，但实现简单）

### 4.2 后续增强：基于 `time` 的相对位置
如果未来需要“更像时间轴”：
- 节点 x 坐标由 `time` 的归一化映射决定
- tie-break 仍由排序决定

但注意：当前项目已明确“离散步进 0.3s/action”，MVP 阶段 **不需要**严格按 time 计算距离。

---

## 5. UI 与引擎的数据契约

UI 不直接读取 Engine 可变结构；只消费快照：
- `TimelineSnapshot.phase`
- `TimelineSnapshot.roundId`
- `TimelineSnapshot.currentIndex`
- `TimelineSnapshot.entries[]`（用于渲染节点）

建议 `entries` 里 UI 需要的字段：
- `entryId`
- `side`
- `skillId`
- `meta.label`（展示用标题）
- `meta.speed`（可选展示）
- `executionState`

事件驱动刷新：
- `TIMELINE_SNAPSHOT`
- `TIMELINE_ENTRY_START/END`
- `TIMELINE_READY/START/PAUSE/FINISHED/ERROR`

---

## 6. 与当前实现的对齐建议（工程侧）

当前已有：
- `script/ui/UI_TimelineBlock.js`：订阅事件并渲染列表

为了达到 ATB 风格，需要把渲染从“卡片列表”升级为：
- `timeline-list` 作为轨道容器
- `timeline-item` 按“气泡节点”风格渲染（正方形圆角）
- current/done/error 状态对应样式

实现建议：
- 保持 `UI_TimelineBlock` 的事件绑定不变
- 只改其 DOM 结构与 CSS（不影响 TimelineManager 内核）

---

## 7. 开放项

- 是否在节点上显示“目标部位/目标对象”？（信息密度 vs 清晰度）
- 节点过多时采用滚动还是压缩（缩小节点/折叠）
- 是否允许点击节点跳转播放指针（需要 Timeline 支持 seek）

